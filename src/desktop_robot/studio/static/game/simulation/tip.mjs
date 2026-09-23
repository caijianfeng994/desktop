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
 * @returns {{tipped: boolean, reason: string}}
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
    return {tipped: false, reason: ''};
  }

  const hm = Number(heldMass) || 0;
  const ox = heldOffset?.x ?? 0;
  const total = mass + hm;
  // com_x + held effect（载荷对质心的加权贡献）
  const effX = total > 0 ? ((com?.x ?? 0) * mass + ox * hm) / total : (com?.x ?? 0);
  const limit = half * tipFactor;

  if (Math.abs(effX) > limit) {
    return {
      tipped: true,
      reason: '重心超出支撑面，机器人倾覆',
    };
  }
  return {tipped: false, reason: ''};
}
