/**
 * 简化倾覆判定：有效质心横向偏移相对支撑半宽。
 */

/**
 * @param {{
 *   com: {x:number,y?:number,z?:number},
 *   mass: number,
 *   width?: number,
 *   supportPolygon?: {x:number,z?:number}[],
 *   heldMass?: number,
 *   heldOffset?: {x?:number,z?:number},
 *   tipFactor?: number,
 * }} args
 * @returns {{tipped: boolean, reason: string, code?: string, margin?: number}}
 */
export function checkTip({
  com,
  mass,
  width,
  supportPolygon,
  heldMass = 0,
  heldOffset = {x: 0, z: 0},
  tipFactor = 1,
} = {}) {
  let half = typeof width === 'number' ? width / 2 : 0;
  if (supportPolygon?.length) {
    const xs = supportPolygon.map((p) => Math.abs(p.x || 0));
    half = Math.max(half, ...xs);
  }
  if (!(half > 0) || !(mass > 0)) {
    return {tipped: false, reason: '', code: '', margin: 0};
  }

  const hm = Number(heldMass) || 0;
  const ox = heldOffset?.x ?? 0;
  const total = mass + hm;
  const effX = total > 0 ? ((com?.x ?? 0) * mass + ox * hm) / total : (com?.x ?? 0);
  const limit = half * tipFactor;
  const margin = limit - Math.abs(effX);

  if (Math.abs(effX) > limit) {
    const narrow = half < 0.08;
    return {
      tipped: true,
      code: narrow ? 'narrow_base' : 'com_outside_support',
      reason: narrow
        ? '底盘过窄，重心超出支撑范围——可加宽轮距或缩短手臂'
        : '重心超出支撑面——可缩短手臂、加宽底盘或把电池移到后方配重',
      margin,
    };
  }
  return {tipped: false, reason: '', code: '', margin};
}
