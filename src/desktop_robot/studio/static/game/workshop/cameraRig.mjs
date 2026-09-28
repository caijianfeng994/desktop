/**
 * 装配 / 驾驶共用的镜头参数计算（无 Three 依赖，便于单测）。
 */

/**
 * @param {'front'|'side'|'top'|'iso'} name
 * @returns {{angle:number, elevation:number, radiusScale:number}}
 */
export function standardViewOrbit(name) {
  switch (name) {
    case 'front':
      return {angle: 0, elevation: 0.9, radiusScale: 1};
    case 'side':
      return {angle: Math.PI / 2, elevation: 0.9, radiusScale: 1};
    case 'top':
      return {angle: 0.15, elevation: 2.6, radiusScale: 1.05};
    case 'iso':
    default:
      return {angle: 0.55, elevation: 1.2, radiusScale: 1};
  }
}

/**
 * @param {{span:number, min?:number, max?:number}} opts
 */
export function frameRadiusFromBounds({span, min = 1.6, max = 8} = {}) {
  const s = Math.max(0.05, Number(span) || 0.2);
  return Math.min(max, Math.max(min, s * 3.2 + 1.1));
}

/**
 * 第三人称跟随：相机相对机器人局部偏移（面朝 +Z）。
 * @param {{yaw:number, radius:number, height:number, back?:number}} opts
 */
export function followCameraOffset({yaw, radius, height, back = 1} = {}) {
  const r = (radius || 4) * 0.35 * back;
  return {
    x: Math.sin(yaw) * -r,
    y: height || 1.2,
    z: Math.cos(yaw) * -r,
  };
}

/**
 * 平滑插值角度（最短弧）。
 */
export function dampAngle(current, target, lambda, dt) {
  let d = ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const k = 1 - Math.exp(-(lambda || 8) * Math.max(0, dt));
  return current + d * k;
}

export function damp(current, target, lambda, dt) {
  const k = 1 - Math.exp(-(lambda || 8) * Math.max(0, dt));
  return current + (target - current) * k;
}

/**
 * 线段 look→cam 与轴对齐墙盒相交时，缩短相机距离避免穿墙。
 * @param {{x:number,y:number,z:number}} look
 * @param {{x:number,y:number,z:number}} cam
 * @param {{minX:number,maxX:number,minY?:number,maxY?:number,minZ:number,maxZ:number}[]} walls
 * @param {{pad?:number, minDist?:number}} [opts]
 * @returns {{x:number,y:number,z:number, clipped:boolean, distance:number}}
 */
export function clipCameraAgainstWalls(look, cam, walls, opts = {}) {
  const pad = opts.pad ?? 0.12;
  const minDist = opts.minDist ?? 0.35;
  const dx = cam.x - look.x;
  const dy = cam.y - look.y;
  const dz = cam.z - look.z;
  let dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) {
    return {x: cam.x, y: cam.y, z: cam.z, clipped: false, distance: 0};
  }
  const ux = dx / dist;
  const uy = dy / dist;
  const uz = dz / dist;
  let hitT = dist;
  for (const w of walls || []) {
    const minY = w.minY ?? -Infinity;
    const maxY = w.maxY ?? Infinity;
    const t = rayAabbT(look.x, look.y, look.z, ux, uy, uz, dist, {
      minX: w.minX,
      maxX: w.maxX,
      minY,
      maxY,
      minZ: w.minZ,
      maxZ: w.maxZ,
    });
    if (t != null && t < hitT) hitT = t;
  }
  if (hitT >= dist - 1e-4) {
    return {x: cam.x, y: cam.y, z: cam.z, clipped: false, distance: dist};
  }
  const d = Math.max(minDist, hitT - pad);
  return {
    x: look.x + ux * d,
    y: look.y + uy * d,
    z: look.z + uz * d,
    clipped: true,
    distance: d,
  };
}

/** @returns {number|null} 命中参数 t ∈ (0, maxT]，未命中 null */
function rayAabbT(ox, oy, oz, dx, dy, dz, maxT, box) {
  let tMin = 0;
  let tMax = maxT;
  const axes = [
    [ox, dx, box.minX, box.maxX],
    [oy, dy, box.minY, box.maxY],
    [oz, dz, box.minZ, box.maxZ],
  ];
  for (const [o, d, mn, mx] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < mn || o > mx) return null;
      continue;
    }
    let t1 = (mn - o) / d;
    let t2 = (mx - o) / d;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  if (tMin <= 0 || tMin > maxT) return null;
  return tMin;
}
