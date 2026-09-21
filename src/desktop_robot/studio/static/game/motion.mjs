// Robot faces local +Z. Turn on the spot, then move along the current grid edge.
export function angleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function advancePose(pose, target, dt, {speed = 3.8, turnSpeed = 7} = {}) {
  const dx = target.x - pose.x;
  const dz = target.z - pose.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.001) return {...pose, x: target.x, z: target.z, arrived: true};
  const heading = Math.atan2(dx, dz);
  const delta = angleDelta(pose.yaw, heading);
  const turnTime = Math.abs(delta) / turnSpeed;
  if (turnTime > dt) {
    return {...pose, yaw: pose.yaw + Math.sign(delta) * turnSpeed * dt, arrived: false};
  }
  // Only time remaining after finishing the turn contributes to forward travel.
  const travel = Math.min(distance, Math.max(0, dt - turnTime) * speed);
  return {x: pose.x + dx / distance * travel, z: pose.z + dz / distance * travel,
    yaw: pose.yaw + delta, arrived: distance - travel < 0.001};
}
