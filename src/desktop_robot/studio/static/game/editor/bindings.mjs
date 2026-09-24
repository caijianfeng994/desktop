/**
 * Blueprint.bindings：动作名 → 实例 id 列表。
 * 约定动作：drive | turn | lift | extend | grasp
 * 实例 params：drive_sign(±1)、drive_scale、limit_min、limit_max
 */

const ACTIONS = Object.freeze(['drive', 'turn', 'lift', 'extend', 'grasp']);

/**
 * @param {object|null|undefined} bp
 * @returns {Record<string, string[]>}
 */
export function normalizeBindings(bp) {
  const raw = bp?.bindings && typeof bp.bindings === 'object' ? bp.bindings : {};
  const out = {};
  for (const action of ACTIONS) {
    const list = raw[action];
    out[action] = Array.isArray(list) ? list.map(String).filter(Boolean) : [];
  }
  return out;
}

/**
 * 若 bindings 为空，按零件/关节自动推断。
 * @param {object} bp
 * @param {{links?: object[]}|null} [sim]
 */
export function autoBindings(bp, sim = null) {
  const current = normalizeBindings(bp);
  const hasAny = ACTIONS.some((a) => current[a].length);
  if (hasAny) return current;

  const byId = Object.fromEntries((bp?.instances || []).map((i) => [i.instance_id, i]));
  const lift = [];
  const extend = [];
  const grasp = [];
  for (const link of sim?.links || []) {
    if (link.joint?.type === 'revolute') lift.push(link.id);
    if (link.joint?.type === 'prismatic') extend.push(link.id);
    const behaviors = link.behaviors || [];
    if (behaviors.includes('grasp') || behaviors.includes('push') || behaviors.includes('drag')) {
      grasp.push(link.id);
    }
  }
  // 无 sim 时按 part_id 推断
  if (!sim) {
    for (const inst of bp?.instances || []) {
      if (inst.part_id === 'revolute_joint') lift.push(inst.instance_id);
      if (inst.part_id === 'prism_joint') extend.push(inst.instance_id);
      if (['gripper', 'pusher', 'hook'].includes(inst.part_id)) grasp.push(inst.instance_id);
    }
  }
  return {
    drive: [],
    turn: [],
    lift: [...new Set(lift)],
    extend: [...new Set(extend)],
    grasp: [...new Set(grasp)].filter((id) => byId[id]),
  };
}

/**
 * @param {object} bp
 * @param {string} instanceId
 */
export function instanceDriveMeta(bp, instanceId) {
  const inst = (bp?.instances || []).find((i) => i.instance_id === instanceId);
  const p = inst?.params || {};
  const sign = Number(p.drive_sign);
  const scale = Number(p.drive_scale);
  return {
    sign: Number.isFinite(sign) && sign !== 0 ? Math.sign(sign) : 1,
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
    limitMin: Number.isFinite(Number(p.limit_min)) ? Number(p.limit_min) : null,
    limitMax: Number.isFinite(Number(p.limit_max)) ? Number(p.limit_max) : null,
  };
}

/**
 * 对绑定关节施加增量；返回 {angles, slides, gripperOpen, hitLimit, messages}
 * @param {object} bp
 * @param {'lift'|'extend'|'grasp'} action
 * @param {number} delta  抬臂/伸缩增量；grasp 时 >0 张开、<0 闭合或切换
 * @param {{
 *   jointAngles?: Record<string, number>,
 *   jointSlides?: Record<string, number>,
 *   gripperOpen?: number,
 *   sim?: object,
 * }} state
 */
export function applyBoundAxis(bp, action, delta, state = {}) {
  const bindings = autoBindings(bp, state.sim);
  const targets = bindings[action] || [];
  const jointAngles = {...(state.jointAngles || {})};
  const jointSlides = {...(state.jointSlides || {})};
  let gripperOpen = state.gripperOpen ?? 1;
  let hitLimit = false;
  const messages = [];

  if (!targets.length) {
    messages.push(`没有绑定「${action}」的驱动件，请到控制面板绑定`);
    return {jointAngles, jointSlides, gripperOpen, hitLimit, messages, applied: false};
  }

  if (action === 'grasp') {
    // 开合 0=闭合可抓，1=张开
    const step = delta === 0 ? 0 : delta > 0 ? 0.25 : -0.25;
    const next = Math.min(1, Math.max(0, gripperOpen + step));
    if (next === gripperOpen && step !== 0) {
      hitLimit = true;
      messages.push(gripperOpen <= 0 ? '夹爪已完全闭合' : '夹爪已完全张开');
    }
    gripperOpen = next;
    // 联动：带 drive_sign 的子指用 slide 模拟开合
    for (const id of targets) {
      const meta = instanceDriveMeta(bp, id);
      const limMin = meta.limitMin ?? 0;
      const limMax = meta.limitMax ?? 0.04;
      const span = limMax - limMin;
      jointSlides[id] = limMin + span * (meta.sign > 0 ? gripperOpen : 1 - gripperOpen);
    }
    return {jointAngles, jointSlides, gripperOpen, hitLimit, messages, applied: true};
  }

  const linkById = Object.fromEntries((state.sim?.links || []).map((l) => [l.id, l]));
  for (const id of targets) {
    const meta = instanceDriveMeta(bp, id);
    const link = linkById[id];
    const d = delta * meta.sign * meta.scale;
    if (action === 'lift' || link?.joint?.type === 'revolute') {
      const lim = link?.joint?.limits || {min: -Math.PI / 2, max: Math.PI / 2};
      const min = meta.limitMin ?? lim.min;
      const max = meta.limitMax ?? lim.max;
      const cur = jointAngles[id] || 0;
      const next = Math.min(max, Math.max(min, cur + d));
      if (next === cur && d !== 0) {
        hitLimit = true;
        messages.push(`关节 ${id} 到达限位`);
      }
      jointAngles[id] = next;
    } else if (action === 'extend' || link?.joint?.type === 'prismatic') {
      const lim = link?.joint?.limits || {min: 0, max: 0.12};
      const min = meta.limitMin ?? lim.min;
      const max = meta.limitMax ?? lim.max;
      const cur = jointSlides[id] || 0;
      const next = Math.min(max, Math.max(min, cur + d));
      if (next === cur && d !== 0) {
        hitLimit = true;
        messages.push(`伸缩 ${id} 到达限位`);
      }
      jointSlides[id] = next;
    }
  }
  return {jointAngles, jointSlides, gripperOpen, hitLimit, messages, applied: true};
}

/**
 * 试跑前控制诊断。
 * @param {object} bp
 * @param {object|null} sim
 */
export function diagnoseControls(bp, sim) {
  const bindings = autoBindings(bp, sim);
  const issues = [];
  const ids = new Set((bp?.instances || []).map((i) => i.instance_id));
  for (const [action, list] of Object.entries(bindings)) {
    for (const id of list) {
      if (!ids.has(id)) issues.push({code: 'missing_target', action, id, message: `${action} 绑定了不存在的实例 ${id}`});
    }
  }
  const revolute = (sim?.links || []).filter((l) => l.joint?.type === 'revolute');
  if (revolute.length && !bindings.lift.length) {
    issues.push({code: 'unbound_lift', message: '有转动关节但未绑定抬臂（lift）'});
  }
  const tools = (sim?.links || []).filter((l) => (l.behaviors || []).some((b) => ['grasp', 'push', 'drag'].includes(b)));
  if (tools.length && !bindings.grasp.length) {
    issues.push({code: 'unbound_grasp', message: '有工具但未绑定夹取（grasp）'});
  }
  if (!tools.length) {
    issues.push({code: 'no_tool', message: '蓝图没有夹爪/推板/钩子'});
  }
  return {ok: issues.filter((i) => i.code === 'no_tool').length === 0, issues, bindings};
}

/**
 * 设置某动作的绑定列表（纯函数）。
 */
export function setBinding(bp, action, instanceIds) {
  const next = structuredClone(bp);
  const bindings = normalizeBindings(next);
  if (!ACTIONS.includes(action)) throw new Error(`未知动作: ${action}`);
  bindings[action] = [...new Set((instanceIds || []).map(String))];
  next.bindings = bindings;
  return next;
}

export {ACTIONS};
