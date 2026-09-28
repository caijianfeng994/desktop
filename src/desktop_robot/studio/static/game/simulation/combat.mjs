/**
 * 远程武器：热量、弹药、弹道与命中（纯数据，无 Three 依赖）。
 */

/**
 * @param {{maxAmmo?:number, maxHeat?:number, heatPerShot?:number, coolPerSec?:number, muzzleSpeed?:number, damage?:number, range?:number}} [opts]
 */
export function createCombatState(opts = {}) {
  const maxAmmo = Math.max(0, opts.maxAmmo ?? 30);
  return {
    ammo: maxAmmo,
    maxAmmo,
    heat: 0,
    maxHeat: Math.max(1, opts.maxHeat ?? 100),
    heatPerShot: Math.max(0, opts.heatPerShot ?? 12),
    coolPerSec: Math.max(0, opts.coolPerSec ?? 18),
    muzzleSpeed: Math.max(1, opts.muzzleSpeed ?? 14),
    damage: Math.max(0, opts.damage ?? 25),
    range: Math.max(1, opts.range ?? 8),
    projectiles: [],
    overheated: false,
    lastFireAt: -Infinity,
    fireCooldown: Math.max(0, opts.fireCooldown ?? 0.22),
  };
}

/**
 * @param {object} combat
 * @param {{x:number,y:number,z:number}} origin
 * @param {{x:number,y:number,z:number}} dir 单位方向近似即可
 * @param {number} nowSec
 * @returns {{ok:boolean, reason?:string, projectile?:object}}
 */
export function tryFire(combat, origin, dir, nowSec = 0) {
  if (!combat) return {ok: false, reason: '无战斗状态'};
  if ((combat.ammo || 0) <= 0) return {ok: false, reason: '弹药耗尽'};
  if (combat.overheated || combat.heat >= combat.maxHeat) {
    combat.overheated = true;
    return {ok: false, reason: '热量过高'};
  }
  if (nowSec - combat.lastFireAt < combat.fireCooldown) {
    return {ok: false, reason: '射速限制'};
  }
  const len = Math.hypot(dir.x || 0, dir.y || 0, dir.z || 0) || 1;
  const ux = (dir.x || 0) / len;
  const uy = (dir.y || 0) / len;
  const uz = (dir.z || 0) / len;
  const projectile = {
    id: `p-${Math.random().toString(36).slice(2, 9)}`,
    x: origin.x,
    y: origin.y,
    z: origin.z,
    vx: ux * combat.muzzleSpeed,
    vy: uy * combat.muzzleSpeed,
    vz: uz * combat.muzzleSpeed,
    life: combat.range / combat.muzzleSpeed,
    damage: combat.damage,
    radius: 0.08,
  };
  combat.projectiles.push(projectile);
  combat.ammo -= 1;
  combat.heat = Math.min(combat.maxHeat, combat.heat + combat.heatPerShot);
  combat.lastFireAt = nowSec;
  if (combat.heat >= combat.maxHeat) combat.overheated = true;
  return {ok: true, projectile};
}

/**
 * @param {object} combat
 * @param {number} dt
 * @param {{id:string,x:number,y:number,z:number,radius?:number,hp?:number}[]} targets
 * @returns {{hits:{projectileId:string,targetId:string,damage:number}[], expired:string[]}}
 */
export function stepProjectiles(combat, dt, targets = []) {
  const hits = [];
  const expired = [];
  if (!combat?.projectiles?.length) {
    if (combat) {
      combat.heat = Math.max(0, combat.heat - (combat.coolPerSec || 0) * dt);
      if (combat.heat < combat.maxHeat * 0.6) combat.overheated = false;
    }
    return {hits, expired};
  }
  const next = [];
  for (const p of combat.projectiles) {
    const start = {x:p.x, y:p.y, z:p.z};
    const travel = Math.min(dt, Math.max(0, p.life));
    p.x += p.vx * travel;
    p.y += p.vy * travel;
    p.z += p.vz * travel;
    p.life -= dt;
    let hit = null;
    let nearest = Infinity;
    for (const t of targets) {
      if ((t.hp ?? 1) <= 0) continue;
      const r = (t.radius || 0.25) + (p.radius || 0.08);
      const dx=p.x-start.x, dy=p.y-start.y, dz=p.z-start.z;
      const ox=start.x-t.x, oy=start.y-(t.y||0), oz=start.z-t.z;
      const a=dx*dx+dy*dy+dz*dz, b=ox*dx+oy*dy+oz*dz;
      const c=ox*ox+oy*oy+oz*oz-r*r;
      const discriminant=b*b-a*c;
      const entry=c<=0 ? 0 : a>0 && discriminant>=0 ? (-b-Math.sqrt(discriminant))/a : Infinity;
      if (entry >= 0 && entry <= 1 && entry < nearest) {
        hit = t;
        nearest = entry;
      }
    }
    if (hit) {
      hits.push({projectileId: p.id, targetId: hit.id, damage: p.damage});
      expired.push(p.id);
      continue;
    }
    if (p.life <= 0) {
      expired.push(p.id);
      continue;
    }
    next.push(p);
  }
  combat.projectiles = next;
  combat.heat = Math.max(0, combat.heat - (combat.coolPerSec || 0) * dt);
  if (combat.heat < combat.maxHeat * 0.6) combat.overheated = false;
  return {hits, expired};
}

/**
 * @param {{hp:number, maxHp?:number}} target
 * @param {number} damage
 */
export function applyHit(target, damage) {
  if (!target) return {destroyed: false, hp: 0};
  target.hp = Math.max(0, (target.hp || 0) - Math.max(0, damage));
  return {destroyed: target.hp <= 0, hp: target.hp};
}

export function reloadAmmo(combat, amount = null) {
  if (!combat) return;
  combat.ammo = amount == null ? combat.maxAmmo : Math.min(combat.maxAmmo, Math.max(0, amount));
}
