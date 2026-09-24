/**
 * 连接点兼容性：与服务端 validate_blueprint kinds 交集规则对齐。
 */

function occupiedKeys(connections) {
  const keys = new Set();
  for (const c of connections || []) {
    keys.add(`${c.parent_instance_id}:${c.parent_point_id}`);
    keys.add(`${c.child_instance_id}:${c.child_point_id}`);
  }
  return keys;
}

function indexPartDefs(partDefs) {
  if (partDefs instanceof Map) return partDefs;
  const map = new Map();
  for (const d of partDefs || []) {
    if (d?.id) map.set(d.id, d);
  }
  return map;
}

function kindsOf(point) {
  return new Set(point?.kinds || []);
}

/**
 * 子零件默认连接点（与 game.js CHILD_POINT 对齐，可覆盖）。
 */
export const DEFAULT_CHILD_POINT = Object.freeze({
  wheel: 'hub',
  plate: 'face_a',
  beam: 'end_b',
  post: 'end_b',
  revolute_joint: 'in',
  gripper: 'mount',
  pusher: 'mount',
  hook: 'mount',
  battery: 'mount',
  camera: 'mount',
  display: 'mount',
});

/**
 * @param {object} bp
 * @param {string} parentInstanceId
 * @param {string} childPartId
 * @param {Map|object[]|null} partDefs
 * @param {{childPointId?: string}} [opts]
 * @returns {{
 *   compatible: {pointId:string, kinds:string[]}[],
 *   incompatible: {pointId:string, reason:string}[],
 * }}
 */
export function classifyParentPoints(bp, parentInstanceId, childPartId, partDefs, opts = {}) {
  const defs = indexPartDefs(partDefs);
  const parentInst = (bp?.instances || []).find((i) => i.instance_id === parentInstanceId);
  const compatible = [];
  const incompatible = [];
  if (!parentInst) {
    return {compatible, incompatible};
  }
  const parentDef = defs.get(parentInst.part_id);
  const childDef = defs.get(childPartId);
  if (!parentDef || !childDef) {
    return {compatible, incompatible};
  }
  const childPointId = opts.childPointId || DEFAULT_CHILD_POINT[childPartId];
  const childPoint = (childDef.connection_points || []).find((p) => p.id === childPointId);
  if (!childPoint) {
    return {
      compatible,
      incompatible: [{pointId: '*', reason: `零件 ${childPartId} 缺少连接点 ${childPointId || '?'}`}],
    };
  }
  const childKinds = kindsOf(childPoint);
  const occ = occupiedKeys(bp.connections);

  for (const point of parentDef.connection_points || []) {
    const key = `${parentInstanceId}:${point.id}`;
    if (occ.has(key)) {
      incompatible.push({pointId: point.id, reason: `连接点 ${point.id} 已被占用`});
      continue;
    }
    const parentKinds = kindsOf(point);
    let ok = false;
    for (const k of parentKinds) {
      if (childKinds.has(k)) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      incompatible.push({
        pointId: point.id,
        reason: `kinds 不兼容：父 ${[...parentKinds].join('|') || '∅'} ∩ 子 ${[...childKinds].join('|') || '∅'}`,
      });
      continue;
    }
    compatible.push({pointId: point.id, kinds: [...(point.kinds || [])]});
  }
  return {compatible, incompatible};
}

/**
 * @returns {string|null} 失败原因；成功返回 null
 */
export function explainAttachFailure(bp, parentInstanceId, parentPointId, childPartId, partDefs, opts = {}) {
  const {compatible, incompatible} = classifyParentPoints(
    bp, parentInstanceId, childPartId, partDefs, opts,
  );
  if (compatible.some((c) => c.pointId === parentPointId)) return null;
  const hit = incompatible.find((c) => c.pointId === parentPointId);
  return hit?.reason || `无法连接到 ${parentPointId}`;
}
