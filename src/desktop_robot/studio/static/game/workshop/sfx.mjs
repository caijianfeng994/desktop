/**
 * 试验场 / 装配轻量音效：Web Audio 合成 + 静音 + 碰撞节流。
 */

const THROTTLE_MS = {
  collision: 180,
  motor: 120,
  roll: 90,
  install: 80,
  limit: 200,
  grasp: 100,
  release: 100,
};

/**
 * @param {{
 *   muted?: boolean,
 *   now?: () => number,
 *   playTone?: (event: string) => void,
 * }} [opts]
 */
export function createSfx(opts = {}) {
  let muted = !!opts.muted;
  const nowFn = opts.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const last = new Map();
  let ctx = null;

  function ensureCtx() {
    if (opts.playTone) return null;
    if (typeof window === 'undefined' || !window.AudioContext && !window.webkitAudioContext) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    return ctx;
  }

  function beep(freq, dur, type = 'square', gain = 0.04) {
    if (opts.playTone) return;
    const ac = ensureCtx();
    if (!ac) return;
    const t0 = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(ac.destination);
    o.start(t0);
    o.stop(t0 + dur);
  }

  function synthesize(event) {
    switch (event) {
      case 'motor':
        beep(90, 0.05, 'sawtooth', 0.025);
        break;
      case 'roll':
        beep(55, 0.04, 'triangle', 0.02);
        break;
      case 'collision':
        beep(140, 0.08, 'square', 0.05);
        break;
      case 'install':
        beep(520, 0.06, 'triangle', 0.04);
        break;
      case 'limit':
        beep(220, 0.07, 'square', 0.035);
        break;
      case 'grasp':
        beep(360, 0.07, 'sine', 0.045);
        break;
      case 'release':
        beep(280, 0.05, 'sine', 0.03);
        break;
      default:
        beep(200, 0.05, 'sine', 0.02);
    }
  }

  return {
    setMuted(v) {
      muted = !!v;
    },
    get muted() {
      return muted;
    },
    /**
     * @param {string} event
     * @param {{force?: boolean}} [extra]
     */
    play(event, extra = {}) {
      if (muted) return false;
      const t = nowFn();
      const gap = THROTTLE_MS[event] ?? 80;
      const prev = last.get(event) ?? -Infinity;
      if (!extra.force && t - prev < gap) return false;
      last.set(event, t);
      if (opts.playTone) opts.playTone(event);
      else synthesize(event);
      return true;
    },
  };
}
