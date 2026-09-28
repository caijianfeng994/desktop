/**
 * 抓取过程状态机：接近 → 对准 → 闭合 → 接触 → 抬升 → 持有 / 释放。
 */

import {graspPhase, tryGrasp} from '../simulation/grasp.mjs';

const PHASE_ORDER = ['idle', 'approach', 'align', 'close', 'contact', 'lift', 'holding', 'release'];

/**
 * @param {{
 *   sim: object,
 *   toolWorld: object,
 *   block: object,
 *   gripperOpen: number,
 *   holding?: boolean,
 * }} ctx
 * @param {number} dt
 * @param {{
 *   phase?: string,
 *   t?: number,
 *   autoAssist?: boolean,
 * }} state
 */
export function stepGraspSequence(ctx, dt, state = {}) {
  let phase = state.phase || 'idle';
  let t = Number(state.t) || 0;
  const autoAssist = state.autoAssist !== false;
  const sim = {...ctx.sim, gripperOpen: ctx.gripperOpen};
  const natural = graspPhase(sim, ctx.toolWorld, ctx.block, {holding: !!ctx.holding});

  if (ctx.holding && phase !== 'release') {
    return {phase: 'holding', t: 0, success: true, reason: '持有中', natural, progress: 1};
  }

  // 外部触发：从 idle 进入序列（由 tryInteract / Space 启动）
  if (phase === 'idle') {
    return {phase: 'idle', t: 0, success: false, reason: '', natural, progress: 0};
  }

  t += dt;
  const durations = {
    approach: 0.28,
    align: 0.22,
    close: 0.35,
    contact: 0.18,
    lift: 0.32,
    release: 0.25,
  };

  if (phase === 'approach') {
    if (natural === 'too_far' && !autoAssist) {
      return {phase: 'idle', t: 0, success: false, reason: '夹爪还没靠近目标——先对准再闭合', natural, progress: 0};
    }
    if (t >= durations.approach || natural !== 'too_far') {
      return {phase: 'align', t: 0, success: false, reason: '正在对准…', natural, progress: 0.2};
    }
    return {phase, t, success: false, reason: '接近目标…', natural, progress: 0.1 * (t / durations.approach)};
  }

  if (phase === 'align') {
    if (natural === 'misaligned' && !autoAssist) {
      return {phase: 'idle', t: 0, success: false, reason: '夹爪朝向不对，请转向方块再抓', natural, progress: 0.2};
    }
    if (t >= durations.align) {
      return {phase: 'close', t: 0, success: false, reason: '闭合夹爪…', natural, progress: 0.4, forceClose: true};
    }
    return {phase, t, success: false, reason: '对准中…', natural, progress: 0.25};
  }

  if (phase === 'close') {
    if (t >= durations.close) {
      return {phase: 'contact', t: 0, success: false, reason: '接触目标…', natural, progress: 0.6, gripperOpen: 0};
    }
    const open = Math.max(0, 1 - t / durations.close);
    return {phase, t, success: false, reason: '闭合夹爪…', natural, progress: 0.4 + 0.2 * (t / durations.close), gripperOpen: open};
  }

  if (phase === 'contact') {
    const closedSim = {...sim, gripperOpen: 0};
    const attempt = tryGrasp(closedSim, null, ctx.toolWorld, ctx.block);
    if (!attempt.success && !autoAssist) {
      return {phase: 'idle', t: 0, success: false, reason: attempt.reason, natural, progress: 0.6};
    }
    if (t >= durations.contact) {
      return {phase: 'lift', t: 0, success: false, reason: '抬升中…', natural, progress: 0.75, gripperOpen: 0};
    }
    return {phase, t, success: false, reason: '建立接触…', natural, progress: 0.65, gripperOpen: 0};
  }

  if (phase === 'lift') {
    if (t >= durations.lift) {
      return {
        phase: 'holding',
        t: 0,
        success: true,
        reason: '已夹住方块',
        natural: 'holding',
        progress: 1,
        gripperOpen: 0,
        attach: true,
      };
    }
    return {
      phase,
      t,
      success: false,
      reason: '抬升中…',
      natural,
      progress: 0.75 + 0.25 * (t / durations.lift),
      gripperOpen: 0,
      liftOffset: 0.04 * (t / durations.lift),
    };
  }

  if (phase === 'release') {
    if (t >= durations.release) {
      return {phase: 'idle', t: 0, success: true, reason: '已放下方块', natural: 'ready', progress: 0, detach: true, gripperOpen: 0.8};
    }
    return {
      phase,
      t,
      success: false,
      reason: '释放中…',
      natural,
      progress: 1 - t / durations.release,
      gripperOpen: Math.min(1, t / durations.release),
    };
  }

  return {phase: 'idle', t: 0, success: false, reason: '', natural, progress: 0};
}

export function startGraspSequence() {
  return {phase: 'approach', t: 0, autoAssist: true};
}

export function startReleaseSequence() {
  return {phase: 'release', t: 0, autoAssist: true};
}

export function graspSequencePhases() {
  return [...PHASE_ORDER];
}
