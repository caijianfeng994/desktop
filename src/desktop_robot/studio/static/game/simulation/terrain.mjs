/**
 * 试验场高度场：坡道线性抬升；平面为 0。
 * 与 world.ramp AABB 对齐，视觉与物理共用同一几何。
 */

/**
 * @param {{ramp?: {minX:number,maxX:number,minY:number,maxY:number,minZ:number,maxZ:number}}} world
 * @param {number} x
 * @param {number} z
 */
export function heightAt(world, x, z) {
  const r = world?.ramp;
  if (!r) return 0;
  if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) return 0;
  const spanZ = Math.max(1e-6, r.maxZ - r.minZ);
  const t = (z - r.minZ) / spanZ; // 0 低端 → 1 高端
  const peak = r.maxY - (r.minY || 0);
  return (r.minY || 0) + peak * Math.max(0, Math.min(1, t));
}

/**
 * 坡面降低有效支撑系数，平地≈1。
 */
export function tipFactorAt(world, x, z) {
  const r = world?.ramp;
  if (!r) return 1;
  if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) return 1;
  const rise = (r.maxY || 0) - (r.minY || 0);
  const run = Math.max(1e-6, r.maxZ - r.minZ);
  const slope = rise / run;
  // 约 0.18m / 0.9m ≈ 0.2 → tipFactor ~ 0.82
  return Math.max(0.55, 1 - slope * 0.9);
}

export function sampleGroundY(world, x, z) {
  return heightAt(world, x, z);
}

/**
 * 方块落在地面上的 y（中心底面贴地）。
 */
export function settleBlockY(world, block) {
  const half = (Array.isArray(block?.size) ? block.size[1] : 0.08) / 2;
  const gy = heightAt(world, block.x ?? 0, block.z ?? 0);
  return gy + half;
}
