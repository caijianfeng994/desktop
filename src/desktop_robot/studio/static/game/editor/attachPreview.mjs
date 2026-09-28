/**
 * 装配预览：目标位姿、AABB 重叠碰撞检查。
 */

/**
 * @param {{x:number,y:number,z:number}} a
 * @param {number[]} sizeA
 * @param {{x:number,y:number,z:number}} b
 * @param {number[]} sizeB
 * @param {number} [margin]
 */
export function aabbOverlap(a, sizeA, b, sizeB, margin = 0.002) {
  const ax = sizeA[0] / 2;
  const ay = sizeA[1] / 2;
  const az = sizeA[2] / 2;
  const bx = sizeB[0] / 2;
  const by = sizeB[1] / 2;
  const bz = sizeB[2] / 2;
  return (
    Math.abs((a.x ?? 0) - (b.x ?? 0)) < ax + bx - margin &&
    Math.abs((a.y ?? 0) - (b.y ?? 0)) < ay + by - margin &&
    Math.abs((a.z ?? 0) - (b.z ?? 0)) < az + bz - margin
  );
}

/**
 * 用父连接点世界位姿估算子零件预览中心（简化：点位 + 子尺寸半高）。
 * @returns {{x:number,y:number,z:number,ry:number}}
 */
export function previewPoseAtPoint(parentWorldPose, pointLocal, childSize) {
  const yaw = parentWorldPose.ry || 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const lx = pointLocal?.x ?? 0;
  const ly = pointLocal?.y ?? 0;
  const lz = pointLocal?.z ?? 0;
  const wx = (parentWorldPose.x ?? 0) + lx * cos + lz * sin;
  const wz = (parentWorldPose.z ?? 0) - lx * sin + lz * cos;
  const wy = (parentWorldPose.y ?? 0) + ly + (childSize?.[1] ?? 0.05) * 0.5;
  return {x: wx, y: wy, z: wz, ry: yaw + (pointLocal?.ry || 0)};
}

/**
 * @param {object} bp
 * @param {Record<string,{x:number,y:number,z:number}>} worldPoses
 * @param {Map|object} sizeById instance_id -> size_m
 * @param {{x:number,y:number,z:number}} previewCenter
 * @param {number[]} previewSize
 * @param {string|null} ignoreInstanceId
 * @returns {{ok:boolean, reason:string, hits:string[]}}
 */
export function checkAttachCollision(bp, worldPoses, sizeById, previewCenter, previewSize, ignoreInstanceId = null) {
  const hits = [];
  for (const inst of bp?.instances || []) {
    if (inst.instance_id === ignoreInstanceId) continue;
    const pose = worldPoses[inst.instance_id];
    if (!pose) continue;
    const size = sizeById.get?.(inst.instance_id) || sizeById[inst.instance_id] || [0.05, 0.05, 0.05];
    const center = {
      x: pose.x,
      y: (pose.y ?? 0) + size[1] / 2,
      z: pose.z,
    };
    if (aabbOverlap(previewCenter, previewSize, center, size)) {
      hits.push(inst.instance_id);
    }
  }
  if (hits.length) {
    return {ok: false, reason: `与已有零件碰撞（${hits[0]}）`, hits};
  }
  return {ok: true, reason: '', hits};
}
