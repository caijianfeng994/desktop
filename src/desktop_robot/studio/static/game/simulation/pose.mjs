/**
 * 平移优先世界位姿（与 editorScene.worldPosesFromBlueprint / blueprints.world_poses 对齐）。
 * 旋转字段保留但不参与平移合成；完整旋转将在后续阶段接入。
 */

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

function pointsFor(partId, defs) {
  return defs.get(partId)?.connection_points || [];
}

function pointPose(partId, pointId, defs) {
  for (const p of pointsFor(partId, defs)) {
    if (p.id === pointId) return {...zeroPose(), ...p.pose};
  }
  return zeroPose();
}

/**
 * @param {object} bp
 * @param {Map|Record<string, object>|object[]|null} partDefs
 * @returns {Record<string, {x:number,y:number,z:number,rx:number,ry:number,rz:number}>}
 */
export function worldPosesFromBlueprint(bp, partDefs = null) {
  const defs = indexPartDefs(partDefs);
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
    for (const conn of children.get(parentId) || []) {
      const child = byId[conn.child_instance_id];
      if (!child) continue;
      const parentPt = pointPose(parentInst.part_id, conn.parent_point_id, defs);
      const childPt = pointPose(child.part_id, conn.child_point_id, defs);
      const local = {...zeroPose(), ...child.local_pose};
      poses[child.instance_id] = {
        x: parentPose.x + parentPt.x - childPt.x + local.x,
        y: parentPose.y + parentPt.y - childPt.y + local.y,
        z: parentPose.z + parentPt.z - childPt.z + local.z,
        rx: local.rx,
        ry: local.ry,
        rz: local.rz,
      };
      stack.push(child.instance_id);
    }
  }
  return poses;
}
