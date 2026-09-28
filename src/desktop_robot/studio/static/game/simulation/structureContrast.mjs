/**
 * 结构对比：短臂/长臂可达性与载重倾覆风险（由真实 metrics 产生，非文案模拟）。
 */
import {buildSimFromBlueprint} from './body.mjs';
import {checkTip} from './tip.mjs';

/**
 * @param {object} blueprint
 * @param {Map|object[]} partDefs
 * @param {{heldMass?: number, heldOffset?: {x:number,z:number}, tipFactor?: number}} [opts]
 */
export function structureSnapshot(blueprint, partDefs, opts = {}) {
  const sim = buildSimFromBlueprint(blueprint, partDefs);
  if (!sim) {
    return {reach: 0, width: 0, mass: 0, tipMargin: 0, tipRisk: false, canReach: false};
  }
  const heldMass = Number(opts.heldMass) || 0;
  const heldOffset = opts.heldOffset || {x: sim.reach * 0.55, z: 0};
  const tip = checkTip({
    com: sim.com,
    mass: sim.mass,
    width: sim.width,
    supportPolygon: sim.supportPolygon,
    heldMass,
    heldOffset,
    tipFactor: opts.tipFactor ?? 1,
  });
  const targetDist = Number(opts.targetDist);
  const canReach =
    Number.isFinite(targetDist) ? sim.reach + 0.02 >= targetDist : sim.reach > 0.15;
  return {
    reach: sim.reach,
    width: sim.width,
    mass: sim.mass,
    tipMargin: tip.margin,
    tipRisk: tip.margin != null && tip.margin < 0.02,
    tipped: !!tip.tipped,
    canReach,
    reason: tip.reason || '',
  };
}

/**
 * 对比两台蓝图在同一目标距离与载荷下的表现。
 * @returns {{
 *   short: ReturnType<typeof structureSnapshot>,
 *   long: ReturnType<typeof structureSnapshot>,
 *   reachDelta: number,
 *   shortMisses: boolean,
 *   longReaches: boolean,
 *   longTipper: boolean,
 *   summary: string,
 * }}
 */
export function compareStructures(shortBp, longBp, partDefs, opts = {}) {
  const targetDist = opts.targetDist ?? 0.28;
  const heldMass = opts.heldMass ?? 0.45;
  const short = structureSnapshot(shortBp, partDefs, {targetDist, heldMass: 0});
  const longEmpty = structureSnapshot(longBp, partDefs, {targetDist, heldMass: 0});
  const longLoaded = structureSnapshot(longBp, partDefs, {
    targetDist,
    heldMass,
    heldOffset: {x: longEmpty.reach * 0.6, z: 0},
    tipFactor: opts.tipFactor ?? 1,
  });
  const shortMisses = !short.canReach;
  const longReaches = longEmpty.canReach;
  const longTipper = longLoaded.tipRisk || longLoaded.tipped;
  const reachDelta = longEmpty.reach - short.reach;
  const parts = [];
  if (shortMisses && longReaches) {
    parts.push(`短臂可达 ${short.reach.toFixed(2)}m 够不到 ${targetDist.toFixed(2)}m 目标；加长后 ${longEmpty.reach.toFixed(2)}m 可及`);
  } else {
    parts.push(`可达差 ${(reachDelta).toFixed(2)}m（短 ${short.reach.toFixed(2)} / 长 ${longEmpty.reach.toFixed(2)}）`);
  }
  if (longTipper) {
    parts.push(`长臂夹 ${heldMass.toFixed(2)}kg 时倾覆裕度 ${(longLoaded.tipMargin ?? 0).toFixed(3)}m，易前倾`);
  } else {
    parts.push(`长臂载重裕度 ${(longLoaded.tipMargin ?? 0).toFixed(3)}m`);
  }
  return {
    short,
    long: longLoaded,
    longEmpty,
    reachDelta,
    shortMisses,
    longReaches,
    longTipper,
    summary: parts.join('。'),
  };
}

/**
 * 相对当前机器人与目标块的可达/倾覆感知文案。
 */
export function liveStructureHint({reach, toolDist, tipRisk, heldMass}) {
  const bits = [];
  if (Number.isFinite(toolDist) && Number.isFinite(reach)) {
    if (toolDist > reach + 0.02) bits.push(`目标距 ${toolDist.toFixed(2)}m > 可达 ${reach.toFixed(2)}m，需加长臂`);
    else bits.push(`目标距 ${toolDist.toFixed(2)}m · 可达 ${reach.toFixed(2)}m`);
  }
  if (heldMass > 0.05) {
    bits.push(tipRisk ? `夹持 ${heldMass.toFixed(2)}kg 接近倾覆` : `夹持 ${heldMass.toFixed(2)}kg`);
  }
  return bits.join(' · ');
}
