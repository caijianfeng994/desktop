/**
 * 平面驱动：惯性加减速、负载顶速、墙体 AABB 防穿透、轮角速度。
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

function loadFactor(state) {
  const base = Math.max(0.05, Number(state.baseMass) || 1);
  const held = Math.max(0, Number(state.heldMass) || 0);
  // 载重越多顶速与加速越低，最低约 45%
  return Math.max(0.45, base / (base + held * 0.85));
}

/**
 * @param {object} state  含 x,z,yaw；可选 speed,turnSpeed,width,walls,forwardSpeed,baseMass,heldMass,wheelRadius
 * @param {{forward?:number, turn?:number}} input  forward/turn ∈ [-1,1]
 * @param {number} dt
 * @returns {object}
 */
export function stepDrive(state, {forward = 0, turn = 0} = {}, dt = 0) {
  const maxSpeed = (state.speed ?? 0.6) * loadFactor(state);
  const turnSpeed = (state.turnSpeed ?? 2.2) * (0.55 + 0.45 * loadFactor(state));
  const walls = state.walls || [];
  const half = Math.max(0.02, (state.width ?? 0.1) / 2);
  const accel = (state.accel ?? 2.4) * loadFactor(state);
  const brake = state.brake ?? 3.2;
  let v = Number.isFinite(state.forwardSpeed) ? state.forwardSpeed : 0;
  const target = Math.max(-1, Math.min(1, forward)) * maxSpeed;
  if (Math.abs(target) < 1e-6) {
    if (v > 0) v = Math.max(0, v - brake * dt);
    else if (v < 0) v = Math.min(0, v + brake * dt);
  } else if (target > v) {
    v = Math.min(target, v + accel * dt);
  } else {
    v = Math.max(target, v - accel * dt);
  }
  state.forwardSpeed = v;

  const yaw = (state.yaw ?? 0) + turn * turnSpeed * dt;
  const dx = Math.sin(yaw) * v * dt;
  const dz = Math.cos(yaw) * v * dt;

  const ox = state.x ?? 0;
  const oz = state.z ?? 0;
  let x = ox + dx;
  let z = oz + dz;

  const hits = (nx, nz) => walls.some((w) => overlapsAabb(w, nx, nz, half));
  let collided = false;

  if (hits(x, z)) {
    collided = true;
    if (!hits(ox + dx, oz)) {
      x = ox + dx;
      z = oz;
    } else if (!hits(ox, oz + dz)) {
      x = ox;
      z = oz + dz;
    } else {
      x = ox;
      z = oz;
      state.forwardSpeed = 0;
      v = 0;
    }
  }

  state.x = x;
  state.z = z;
  state.yaw = yaw;
  const wheelR = Math.max(0.015, Number(state.wheelRadius) || 0.03);
  state.wheelOmega = v / wheelR;
  state.collided = collided;
  return state;
}
