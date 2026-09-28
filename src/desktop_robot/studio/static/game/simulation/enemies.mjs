/**
 * 巡逻敌机：路径巡逻、警戒预警后射击。
 */

/**
 * @param {{id:string,x:number,z:number,yaw?:number,hp?:number,path?:{x:number,z:number}[], alertRange?:number, fireRange?:number}} opts
 */
export function createEnemy(opts) {
  const path = opts.path?.length ? opts.path.map((p) => ({x: p.x, z: p.z})) : [{x: opts.x, z: opts.z}];
  return {
    id: opts.id,
    x: opts.x,
    y: opts.y ?? 0.2,
    z: opts.z,
    yaw: opts.yaw || 0,
    hp: opts.hp ?? 80,
    maxHp: opts.maxHp ?? opts.hp ?? 80,
    radius: opts.radius ?? 0.28,
    speed: opts.speed ?? 0.9,
    path,
    pathIndex: 0,
    alertRange: opts.alertRange ?? 3.2,
    fireRange: opts.fireRange ?? 2.4,
    warnTime: opts.warnTime ?? 0.55,
    fireCooldown: opts.fireCooldown ?? 1.1,
    state: 'patrol', // patrol | warn | attack | dead
    warnAcc: 0,
    fireAcc: 0,
    damage: opts.damage ?? 12,
  };
}

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.hypot(dx, dz);
}

/**
 * @param {object} enemy
 * @param {number} dt
 * @param {{x:number,z:number}} player
 * @returns {{shots:{x:number,y:number,z:number,vx:number,vy:number,vz:number,damage:number}[]}}
 */
export function stepEnemy(enemy, dt, player) {
  const shots = [];
  if (!enemy || enemy.hp <= 0) {
    if (enemy) enemy.state = 'dead';
    return {shots};
  }
  const dPlayer = dist2(enemy.x, enemy.z, player.x, player.z);
  if (dPlayer <= enemy.fireRange) {
    enemy.state = enemy.warnAcc >= enemy.warnTime ? 'attack' : 'warn';
  } else if (dPlayer <= enemy.alertRange) {
    enemy.state = 'warn';
  } else {
    enemy.state = 'patrol';
    enemy.warnAcc = 0;
  }

  if (enemy.state === 'patrol') {
    const target = enemy.path[enemy.pathIndex % enemy.path.length];
    const dx = target.x - enemy.x;
    const dz = target.z - enemy.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.12) {
      enemy.pathIndex = (enemy.pathIndex + 1) % enemy.path.length;
    } else {
      const step = Math.min(dist, enemy.speed * dt);
      enemy.x += (dx / dist) * step;
      enemy.z += (dz / dist) * step;
      enemy.yaw = Math.atan2(dx, dz);
    }
    return {shots};
  }

  // 面向玩家
  enemy.yaw = Math.atan2(player.x - enemy.x, player.z - enemy.z);
  if (enemy.state === 'warn') {
    enemy.warnAcc += dt;
    return {shots};
  }

  enemy.warnAcc = enemy.warnTime;
  enemy.fireAcc += dt;
  if (enemy.fireAcc >= enemy.fireCooldown) {
    enemy.fireAcc = 0;
    const len = Math.max(1e-6, dist2(enemy.x, enemy.z, player.x, player.z));
    const ux = (player.x - enemy.x) / len;
    const uz = (player.z - enemy.z) / len;
    shots.push({
      x: enemy.x,
      y: (enemy.y || 0.2) + 0.15,
      z: enemy.z,
      vx: ux * 10,
      vy: 0,
      vz: uz * 10,
      damage: enemy.damage,
      life: 1.2,
      from: enemy.id,
    });
  }
  return {shots};
}

export function applyEnemyHit(enemy, damage) {
  if (!enemy) return {destroyed: false};
  enemy.hp = Math.max(0, enemy.hp - Math.max(0, damage));
  if (enemy.hp <= 0) enemy.state = 'dead';
  return {destroyed: enemy.hp <= 0, hp: enemy.hp};
}
