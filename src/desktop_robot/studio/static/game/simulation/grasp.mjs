/**
 * 简化抓 / 推 / 拖：距离 + 朝向约束，返回 success 与中文 reason。
 */

function dist3(a, b) {
  const dx = (a?.x ?? 0) - (b?.x ?? 0);
  const dy = (a?.y ?? 0) - (b?.y ?? 0);
  const dz = (a?.z ?? 0) - (b?.z ?? 0);
  return Math.hypot(dx, dy, dz);
}

function yawOf(pose) {
  return pose?.yaw ?? pose?.ry ?? 0;
}

/** 工具局部 +Z 前向是否大致朝向方块（水平面） */
function facingBlock(toolWorld, block, maxAngle = Math.PI / 2) {
  const yaw = yawOf(toolWorld);
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const dx = (block?.x ?? 0) - (toolWorld?.x ?? 0);
  const dz = (block?.z ?? 0) - (toolWorld?.z ?? 0);
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return true;
  const dot = (fx * dx + fz * dz) / len;
  return Math.acos(Math.min(1, Math.max(-1, dot))) <= maxAngle;
}

function graspRange(sim) {
  const reach = Number(sim?.reach);
  if (Number.isFinite(reach) && reach > 0) return Math.max(0.1, reach * 0.35);
  return 0.12;
}

/**
 * 抓取接触阶段：靠近 → 对准 → 开合 → 可抓。
 * @returns {'too_far'|'misaligned'|'open'|'ready'|'holding'|'no_target'}
 */
export function graspPhase(sim, toolWorld, block, {holding = false} = {}) {
  if (holding) return 'holding';
  if (!toolWorld || !block) return 'no_target';
  const d = dist3(toolWorld, block);
  const maxD = graspRange(sim);
  if (d > maxD) return 'too_far';
  const dy = Math.abs((toolWorld?.y ?? 0) - (block?.y ?? 0));
  if (dy > 0.14) return 'too_far';
  if (!facingBlock(toolWorld, block)) return 'misaligned';
  const open = Number(sim?.gripperOpen);
  if (Number.isFinite(open) && open > 0.4) return 'open';
  return 'ready';
}

/**
 * @param {object} sim buildSimFromBlueprint 结果（可用 reach）
 * @param {object} robotPose {x,z,yaw}
 * @param {object} toolWorld {x,y,z,yaw?}
 * @param {object} block {x,y,z,size?,mass?}
 * @returns {{success:boolean, reason:string}}
 */
export function tryGrasp(sim, robotPose, toolWorld, block) {
  if (!toolWorld || !block) {
    return {success: false, reason: '没有可抓取的目标'};
  }
  const d = dist3(toolWorld, block);
  const maxD = graspRange(sim);
  if (d > maxD) {
    return {success: false, reason: `夹爪距离过远（${d.toFixed(2)}m > ${maxD.toFixed(2)}m）`};
  }
  const dy = Math.abs((toolWorld?.y ?? 0) - (block?.y ?? 0));
  if (dy > 0.14) {
    return {success: false, reason: `高度差过大（${dy.toFixed(2)}m），请抬臂或伸展接近`};
  }
  if (!facingBlock(toolWorld, block)) {
    return {success: false, reason: '夹爪朝向不对，请转向方块再抓'};
  }
  const open = Number(sim?.gripperOpen);
  if (Number.isFinite(open) && open > 0.4) {
    return {success: false, reason: '夹爪未闭合：先按 F 闭合，再按 Space 抓取'};
  }
  return {success: true, reason: '已夹住方块'};
}

/**
 * 推：工具与方块水平接触（略大于抓取距离），需朝向。
 * @returns {{success:boolean, reason:string, dx?:number, dz?:number}}
 */
export function tryPush(sim, robotPose, toolWorld, block, pushDist = 0.06) {
  if (!toolWorld || !block) {
    return {success: false, reason: '没有可推动的目标'};
  }
  const dx = (block.x ?? 0) - (toolWorld.x ?? 0);
  const dz = (block.z ?? 0) - (toolWorld.z ?? 0);
  const d = Math.hypot(dx, dz);
  const contact = Math.max(0.14, graspRange(sim) * 1.4);
  if (d > contact) {
    return {success: false, reason: '推板未接触方块'};
  }
  if (!facingBlock(toolWorld, block, Math.PI * 0.6)) {
    return {success: false, reason: '推板没有对准方块'};
  }
  const yaw = yawOf(robotPose) || yawOf(toolWorld);
  return {
    success: true,
    reason: '已推动方块',
    dx: Math.sin(yaw) * pushDist,
    dz: Math.cos(yaw) * pushDist,
  };
}

/**
 * 拖：钩子靠近方块即可建立拖拽（略宽于抓取）。
 * @returns {{success:boolean, reason:string}}
 */
export function tryDrag(sim, robotPose, toolWorld, block) {
  if (!toolWorld || !block) {
    return {success: false, reason: '没有可钩住的目标'};
  }
  const d = dist3(toolWorld, block);
  const maxD = Math.max(0.16, graspRange(sim) * 1.5);
  if (d > maxD) {
    return {success: false, reason: `钩子够不到方块（${d.toFixed(2)}m）`};
  }
  return {success: true, reason: '已钩住方块，可拖拽'};
}
