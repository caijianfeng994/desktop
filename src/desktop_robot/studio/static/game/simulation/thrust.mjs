/**
 * 短时推进：燃料与热量限制的冲刺/跃升。
 */

export function createThrustState(opts = {}) {
  return {
    fuel: Math.max(0, Number(opts.fuel) ?? 1),
    maxFuel: Math.max(0.1, Number(opts.maxFuel) || 1),
    burnPerSec: Math.max(0.05, Number(opts.burnPerSec) || 0.55),
    accel: Math.max(1, Number(opts.accel) || 7),
    lift: Math.max(1, Number(opts.lift) || 5.5),
    active: false,
    vy: 0,
    heatGain: Math.max(0, Number(opts.heatGain) || 25),
  };
}

/**
 * @param {object} thrust
 * @param {boolean} holding 玩家按住推进
 * @param {number} dt
 * @param {{yaw:number, onGround:boolean}} pose
 * @returns {{dx:number, dz:number, vy:number, heat:number}}
 */
export function stepThrust(thrust, holding, dt, pose = {}) {
  const out = {dx: 0, dz: 0, vy: 0, heat: 0};
  if (!thrust) return out;
  const want = holding && thrust.fuel > 0;
  thrust.active = want;
  if (!want) {
    // 空中下落由调用方处理；这里衰减升力速度
    thrust.vy = Math.max(-8, (thrust.vy || 0) - 12 * dt);
    out.vy = thrust.vy;
    return out;
  }
  thrust.fuel = Math.max(0, thrust.fuel - thrust.burnPerSec * dt);
  out.heat = thrust.heatGain * dt;
  const yaw = pose.yaw || 0;
  out.dx = Math.sin(yaw) * thrust.accel * dt;
  out.dz = Math.cos(yaw) * thrust.accel * dt;
  thrust.vy = Math.min(6, (thrust.vy || 0) + thrust.lift * dt);
  out.vy = thrust.vy;
  return out;
}

export function refillThrust(thrust, amount = null) {
  if (!thrust) return;
  thrust.fuel = amount == null ? thrust.maxFuel : Math.min(thrust.maxFuel, Math.max(0, amount));
  thrust.vy = 0;
  thrust.active = false;
}
