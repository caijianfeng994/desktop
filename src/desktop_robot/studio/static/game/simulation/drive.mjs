/**
 * 平面驱动：前进/转向；与 AABB 墙体做简化防穿透。
 */

/**
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} box
 * @param {number} x
 * @param {number} z
 * @param {number} half
 */
function overlapsAabb(box, x, z, half) {
  return (
    x - half < box.maxX &&
    x + half > box.minX &&
    z - half < box.maxZ &&
    z + half > box.minZ
  );
}

/**
 * @param {object} state  含 x,z,yaw；可选 speed,turnSpeed,width,walls
 * @param {{forward?:number, turn?:number}} input  forward/turn ∈ [-1,1]
 * @param {number} dt
 * @returns {object}
 */
export function stepDrive(state, {forward = 0, turn = 0} = {}, dt = 0) {
  const speed = state.speed ?? 0.6;
  const turnSpeed = state.turnSpeed ?? 2.2;
  const walls = state.walls || [];
  const half = Math.max(0.02, (state.width ?? 0.1) / 2);

  const yaw = (state.yaw ?? 0) + turn * turnSpeed * dt;
  // 面朝 +Z；forward>0 前进
  const dx = Math.sin(yaw) * forward * speed * dt;
  const dz = Math.cos(yaw) * forward * speed * dt;

  const ox = state.x ?? 0;
  const oz = state.z ?? 0;
  let x = ox + dx;
  let z = oz + dz;

  const hits = (nx, nz) => walls.some((w) => overlapsAabb(w, nx, nz, half));

  if (hits(x, z)) {
    if (!hits(ox + dx, oz)) {
      x = ox + dx;
      z = oz;
    } else if (!hits(ox, oz + dz)) {
      x = ox;
      z = oz + dz;
    } else {
      x = ox;
      z = oz;
    }
  }

  state.x = x;
  state.z = z;
  state.yaw = yaw;
  return state;
}
