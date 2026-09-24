/**
 * 蓝图世界位姿：平移连接合成；revolute 关节按 jointAngles 绕父连接点 Y 轴旋转。
 */
import {pointsForInstance} from '../editor/params.mjs';

function zeroPose() {
  return {x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0};
}

/**
 * @param {Map|Record<string, object>|object[]|null} partDefs
 * @returns {Map<string, object>}
 */
export function indexPartDefs(partDefs) {
  if (partDefs instanceof Map) return partDefs;
  const map = new Map();
  if (!partDefs) return map;
  if (Array.isArray(partDefs)) {
    for (const d of partDefs) {
      if (d?.id) map.set(d.id, d);
    }
    return map;
  }
  for (const [id, d] of Object.entries(partDefs)) {
    map.set(id, d?.id ? d : {...d, id});
  }
  return map;
}

function pointPoseForInst(inst, pointId, defs) {
  const def = defs.get(inst?.part_id);
  const points = pointsForInstance(
    inst?.part_id,
    def?.connection_points,
    inst?.params,
    def?.size_m,
  );
  for (const p of points) {
    if (p.id === pointId) return {...zeroPose(), ...p.pose};
  }
  return zeroPose();
}

/** 与 yardScene 工具位姿一致的 Y 偏航：x' = x c + z s，z' = -x s + z c */
function rotateY(x, z, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {x: x * c + z * s, z: -x * s + z * c};
}

/**
 * @param {object} bp
 * @param {Map|Record<string, object>|object[]|null} partDefs
 * @param {Record<string, number>} [jointAngles] 子实例 id → 转角（rad）
 * @returns {Record<string, {x:number,y:number,z:number,rx:number,ry:number,rz:number}>}
 */
export function worldPosesWithJoints(bp, partDefs = null, jointAngles = {}) {
  const defs = indexPartDefs(partDefs);
  const angles = jointAngles || {};
  const byId = Object.fromEntries((bp.instances || []).map((i) => [i.instance_id, i]));
  const children = new Map();
  for (const c of bp.connections || []) {
    if (!children.has(c.parent_instance_id)) children.set(c.parent_instance_id, []);
    children.get(c.parent_instance_id).push(c);
  }
  const poses = {};
  const root = byId[bp.root_instance_id];
  if (!root) return poses;
  poses[root.instance_id] = {...zeroPose(), ...root.local_pose};

  const stack = [root.instance_id];
  while (stack.length) {
    const parentId = stack.pop();
    const parentPose = poses[parentId];
    const parentInst = byId[parentId];
    const parentRy = parentPose.ry || 0;
    for (const conn of children.get(parentId) || []) {
      const child = byId[conn.child_instance_id];
      if (!child) continue;
      const parentPt = pointPoseForInst(parentInst, conn.parent_point_id, defs);
      const childPt = pointPoseForInst(child, conn.child_point_id, defs);
      const local = {...zeroPose(), ...child.local_pose};

      let jointAngle = 0;
      if (conn.joint === 'revolute') {
        jointAngle = Number(angles[child.instance_id]) || 0;
      }

      // 父连接点 + 绕该点 Y 轴的关节角，再叠父级 yaw
      const cx = -childPt.x + local.x;
      const cy = -childPt.y + local.y;
      const cz = -childPt.z + local.z;
      const swung = rotateY(cx, cz, jointAngle);
      const lx = parentPt.x + swung.x;
      const ly = parentPt.y + cy;
      const lz = parentPt.z + swung.z;
      const world = rotateY(lx, lz, parentRy);

      poses[child.instance_id] = {
        x: parentPose.x + world.x,
        y: parentPose.y + ly,
        z: parentPose.z + world.z,
        rx: (parentPose.rx || 0) + (local.rx || 0),
        ry: parentRy + jointAngle + (local.ry || 0),
        rz: (parentPose.rz || 0) + (local.rz || 0),
      };
      stack.push(child.instance_id);
    }
  }
  return poses;
}

/**
 * @param {object} bp
 * @param {Map|Record<string, object>|object[]|null} partDefs
 * @returns {Record<string, {x:number,y:number,z:number,rx:number,ry:number,rz:number}>}
 */
export function worldPosesFromBlueprint(bp, partDefs = null) {
  return worldPosesWithJoints(bp, partDefs, {});
}
