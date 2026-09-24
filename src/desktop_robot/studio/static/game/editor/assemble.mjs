/**
 * 蓝图装配原语：在 plain object 副本上增删转，返回新蓝图。
 */
import {normalizeParams} from './params.mjs';

function cloneBp(bp) {
  return structuredClone(bp);
}

function zeroPose() {
  return {x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0};
}

function occupiedKeys(connections) {
  const keys = new Set();
  for (const c of connections) {
    keys.add(`${c.parent_instance_id}:${c.parent_point_id}`);
    keys.add(`${c.child_instance_id}:${c.child_point_id}`);
  }
  return keys;
}

/**
 * @param {{
 *   partId: string,
 *   joint?: string,
 *   behaviors?: string[]|Set<string>,
 *   kinds?: string[],
 * }} opts
 * @returns {string}
 */
function resolveJointType(opts) {
  if (opts.joint) return opts.joint;
  const partId = opts.partId || '';
  if (/revolute/i.test(partId)) return 'revolute';
  if (/prism/i.test(partId)) return 'prismatic';
  const behaviors = opts.behaviors instanceof Set
    ? [...opts.behaviors]
    : (opts.behaviors || []);
  const kinds = opts.kinds || [];
  const hints = [...behaviors, ...kinds].map((s) => String(s).toLowerCase());
  if (hints.some((h) => h === 'pivot' || h === 'revolute' || h.includes('revolute'))) {
    return 'revolute';
  }
  if (hints.some((h) => h === 'extend' || h === 'prismatic' || h.includes('prism'))) {
    return 'prismatic';
  }
  return 'fixed';
}

/**
 * @param {object} bp
 * @param {{
 *   partId: string,
 *   parentInstanceId: string,
 *   parentPointId: string,
 *   childPointId: string,
 *   instanceId?: string,
 *   joint?: string,
 *   behaviors?: string[]|Set<string>,
 *   kinds?: string[],
 * }} opts
 * @returns {object}
 */
export function attachPart(bp, opts) {
  const {
    partId,
    parentInstanceId,
    parentPointId,
    childPointId,
    instanceId,
  } = opts || {};
  if (!partId || !parentInstanceId || !parentPointId || !childPointId) {
    throw new Error('attachPart 需要 partId、parentInstanceId、parentPointId、childPointId');
  }

  const next = cloneBp(bp);
  const parent = next.instances.find((i) => i.instance_id === parentInstanceId);
  if (!parent) {
    throw new Error(`父实例不存在: ${parentInstanceId}`);
  }

  const iid = instanceId || `${partId}-${next.instances.length + 1}`;
  if (next.instances.some((i) => i.instance_id === iid)) {
    throw new Error(`实例 ID 已存在: ${iid}`);
  }

  const occ = occupiedKeys(next.connections);
  if (occ.has(`${parentInstanceId}:${parentPointId}`)) {
    throw new Error(`父连接点已被占用: ${parentInstanceId}.${parentPointId}`);
  }

  next.instances.push({
    instance_id: iid,
    part_id: partId,
    local_pose: zeroPose(),
    params: normalizeParams(partId, opts.params || {}),
  });
  next.connections.push({
    parent_instance_id: parentInstanceId,
    parent_point_id: parentPointId,
    child_instance_id: iid,
    child_point_id: childPointId,
    joint: resolveJointType(opts),
  });
  return next;
}

/**
 * 移除实例及其全部子孙与相关连接。
 * @param {object} bp
 * @param {string} instanceId
 * @returns {object}
 */
export function detachSubtree(bp, instanceId) {
  const next = cloneBp(bp);
  if (instanceId === next.root_instance_id) {
    throw new Error('不能拆卸根实例');
  }
  if (!next.instances.some((i) => i.instance_id === instanceId)) {
    throw new Error(`实例不存在: ${instanceId}`);
  }

  const children = new Map();
  for (const c of next.connections) {
    if (!children.has(c.parent_instance_id)) {
      children.set(c.parent_instance_id, []);
    }
    children.get(c.parent_instance_id).push(c.child_instance_id);
  }

  const remove = new Set();
  const stack = [instanceId];
  while (stack.length) {
    const id = stack.pop();
    if (remove.has(id)) continue;
    remove.add(id);
    for (const child of children.get(id) || []) {
      stack.push(child);
    }
  }

  next.instances = next.instances.filter((i) => !remove.has(i.instance_id));
  next.connections = next.connections.filter(
    (c) => !remove.has(c.parent_instance_id) && !remove.has(c.child_instance_id),
  );
  return next;
}

/**
 * @param {object} bp
 * @param {string} instanceId
 * @param {number} yawDeltaRad
 * @returns {object}
 */
export function rotateInstance(bp, instanceId, yawDeltaRad) {
  const next = cloneBp(bp);
  const inst = next.instances.find((i) => i.instance_id === instanceId);
  if (!inst) {
    throw new Error(`实例不存在: ${instanceId}`);
  }
  const pose = {...inst.local_pose};
  pose.ry = (pose.ry || 0) + yawDeltaRad;
  inst.local_pose = pose;
  return next;
}

/**
 * 更新实例参数（经 normalizeParams 限幅）。
 * @param {object} bp
 * @param {string} instanceId
 * @param {Record<string, number>} paramsPatch
 */
export function setInstanceParams(bp, instanceId, paramsPatch) {
  const next = cloneBp(bp);
  const inst = next.instances.find((i) => i.instance_id === instanceId);
  if (!inst) {
    throw new Error(`实例不存在: ${instanceId}`);
  }
  const merged = {...(inst.params || {}), ...(paramsPatch || {})};
  const normalized = normalizeParams(inst.part_id, merged);
  inst.params = Object.keys(normalized).length ? normalized : merged;
  return next;
}
