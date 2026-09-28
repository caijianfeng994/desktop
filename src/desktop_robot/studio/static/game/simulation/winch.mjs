/**
 * 绞盘：钩索牵引自身或目标。
 */

export function createWinchState(opts = {}) {
  return {
    maxRange: Math.max(1, Number(opts.maxRange) || 4.5),
    pullSpeed: Math.max(0.2, Number(opts.pullSpeed) || 2.2),
    attached: null, // {kind:'anchor'|'block', id, x, y, z}
    flying: null, // 飞钩
    cooldown: 0,
  };
}

/**
 * @returns {{ok:boolean, reason?:string}}
 */
export function tryCastWinch(winch, origin, dir, anchors = [], blocks = []) {
  if (!winch) return {ok: false, reason: '无绞盘'};
  if (winch.cooldown > 0) return {ok: false, reason: '冷却中'};
  if (winch.attached || winch.flying) return {ok: false, reason: '已在牵引'};
  const len = Math.hypot(dir.x || 0, dir.y || 0, dir.z || 0) || 1;
  const ux = (dir.x || 0) / len;
  const uy = (dir.y || 0) / len;
  const uz = (dir.z || 0) / len;
  winch.flying = {
    x: origin.x,
    y: origin.y,
    z: origin.z,
    vx: ux * 12,
    vy: uy * 12,
    vz: uz * 12,
    life: winch.maxRange / 12,
    origin: {...origin},
  };
  winch._anchors = anchors;
  winch._blocks = blocks;
  return {ok: true};
}

export function releaseWinch(winch) {
  if (!winch) return;
  winch.attached = null;
  winch.flying = null;
  winch.cooldown = 0.35;
}

/**
 * @returns {{pull:{dx:number,dz:number}|null, blockPull:{id:string,dx:number,dz:number}|null}}
 */
export function stepWinch(winch, dt, selfPos) {
  const out = {pull: null, blockPull: null};
  if (!winch) return out;
  if (winch.cooldown > 0) winch.cooldown = Math.max(0, winch.cooldown - dt);

  if (winch.flying) {
    const f = winch.flying;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.z += f.vz * dt;
    f.life -= dt;
    let hit = null;
    for (const a of winch._anchors || []) {
      if (Math.hypot(f.x - a.x, f.z - a.z) < (a.radius || 0.25)) {
        hit = {kind: 'anchor', id: a.id, x: a.x, y: a.y || 0.3, z: a.z};
        break;
      }
    }
    if (!hit) {
      for (const b of winch._blocks || []) {
        if (Math.hypot(f.x - b.x, f.z - b.z) < (b.radius || 0.2)) {
          hit = {kind: 'block', id: b.id, x: b.x, y: b.y || 0.2, z: b.z};
          break;
        }
      }
    }
    if (hit) {
      winch.attached = hit;
      winch.flying = null;
    } else if (f.life <= 0) {
      winch.flying = null;
      winch.cooldown = 0.4;
    }
  }

  if (winch.attached && selfPos) {
    const a = winch.attached;
    const dx = a.x - selfPos.x;
    const dz = a.z - selfPos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const step = Math.min(dist, winch.pullSpeed * dt);
    if (a.kind === 'anchor') {
      out.pull = {dx: (dx / dist) * step, dz: (dz / dist) * step};
    } else {
      out.blockPull = {
        id: a.id,
        dx: (-dx / dist) * step,
        dz: (-dz / dist) * step,
      };
      a.x += out.blockPull.dx;
      a.z += out.blockPull.dz;
    }
  }
  return out;
}
