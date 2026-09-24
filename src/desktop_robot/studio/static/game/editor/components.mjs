/**
 * 自制组件：从蓝图提取连通子图，并实例化到父连接点。
 */

function clone(v) {
  return structuredClone(v);
}

function remapId(id, suffix) {
  return `${id}__${suffix}`;
}

/**
 * 收集以 rootId 为根的连通子孙（含 root）。
 * @param {object} bp
 * @param {string} rootId
 */
export function collectSubtreeIds(bp, rootId) {
  const children = new Map();
  for (const c of bp.connections || []) {
    if (!children.has(c.parent_instance_id)) children.set(c.parent_instance_id, []);
    children.get(c.parent_instance_id).push(c.child_instance_id);
  }
  const ids = new Set();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    if (ids.has(id)) continue;
    ids.add(id);
    for (const child of children.get(id) || []) stack.push(child);
  }
  return ids;
}

/**
 * @param {object} bp
 * @param {string} rootId 组件局部根（非蓝图 root 亦可）
 * @param {{name?: string, id?: string}} [opts]
 */
export function extractComponent(bp, rootId, opts = {}) {
  if (!rootId || rootId === bp.root_instance_id) {
    throw new Error('请选择非核心的连通子结构作为组件');
  }
  const ids = collectSubtreeIds(bp, rootId);
  if (ids.size < 1) throw new Error('没有可保存的子结构');

  const instances = (bp.instances || []).filter((i) => ids.has(i.instance_id)).map(clone);
  const connections = (bp.connections || [])
    .filter((c) => ids.has(c.parent_instance_id) && ids.has(c.child_instance_id))
    .map(clone);

  // 对外端口：进入子树的父连接（挂在外部的那条）
  const inbound = (bp.connections || []).find(
    (c) => c.child_instance_id === rootId && !ids.has(c.parent_instance_id),
  );
  const port = inbound
    ? {
        child_point_id: inbound.child_point_id,
        preferred_parent_kinds: ['structure', 'joint', 'tool'],
      }
    : {child_point_id: 'mount', preferred_parent_kinds: ['structure']};

  const control_entries = {};
  const bindings = bp.bindings || {};
  for (const [action, list] of Object.entries(bindings)) {
    const hit = (list || []).filter((id) => ids.has(id));
    if (hit.length) control_entries[action] = hit;
  }

  return {
    id: opts.id || `comp-${Date.now().toString(36)}`,
    name: opts.name || `组件-${rootId}`,
    root_instance_id: rootId,
    instances,
    connections,
    port,
    control_entries,
    created_at: Date.now(),
  };
}

/**
 * 将组件挂到蓝图父连接点。
 * @param {object} bp
 * @param {object} component
 * @param {{parentInstanceId: string, parentPointId: string, joint?: string}} mount
 */
export function instantiateComponent(bp, component, mount) {
  if (!component?.instances?.length) throw new Error('组件为空');
  const suffix = Math.random().toString(36).slice(2, 7);
  const idMap = new Map();
  for (const inst of component.instances) {
    idMap.set(inst.instance_id, remapId(inst.instance_id, suffix));
  }
  const next = clone(bp);
  for (const inst of component.instances) {
    next.instances.push({
      ...clone(inst),
      instance_id: idMap.get(inst.instance_id),
      params: {...(inst.params || {}), from_component_id: 0}, // float schema: skip string; use name tag in local only
    });
    // params must be dict[str,float] on server — strip non-float
    const last = next.instances[next.instances.length - 1];
    const clean = {};
    for (const [k, v] of Object.entries(last.params || {})) {
      if (typeof v === 'number' && Number.isFinite(v)) clean[k] = v;
    }
    last.params = clean;
  }
  for (const c of component.connections || []) {
    next.connections.push({
      ...clone(c),
      parent_instance_id: idMap.get(c.parent_instance_id),
      child_instance_id: idMap.get(c.child_instance_id),
    });
  }
  const childRoot = idMap.get(component.root_instance_id);
  const childPoint = component.port?.child_point_id || 'mount';
  next.connections.push({
    parent_instance_id: mount.parentInstanceId,
    parent_point_id: mount.parentPointId,
    child_instance_id: childRoot,
    child_point_id: childPoint,
    joint: mount.joint || 'fixed',
  });

  // 合并控制绑定
  const bindings = {...(next.bindings || {})};
  for (const [action, list] of Object.entries(component.control_entries || {})) {
    const mapped = list.map((id) => idMap.get(id)).filter(Boolean);
    bindings[action] = [...new Set([...(bindings[action] || []), ...mapped])];
  }
  next.bindings = bindings;
  return {blueprint: next, rootInstanceId: childRoot};
}
