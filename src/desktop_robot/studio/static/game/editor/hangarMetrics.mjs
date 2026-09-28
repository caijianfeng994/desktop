/**
 * 机库右侧属性：由蓝图 metrics 生成可展示字段。
 */
import {buildSimFromBlueprint} from '../simulation/body.mjs';
import {checkTip} from '../simulation/tip.mjs';

/**
 * @param {object|null} blueprint
 * @param {object[]|Map|null} partDefs
 * @param {{heldMass?: number}} [opts]
 */
export function hangarMetrics(blueprint, partDefs, opts = {}) {
  if (!blueprint?.instances?.length) {
    return {
      name: blueprint?.name || '未命名',
      parts: 0,
      mass: 0,
      width: 0,
      wheelbase: 0,
      reach: 0,
      tipMargin: 0,
      tipRisk: false,
      loadHint: '装上零件后显示结构数据',
      tags: [],
    };
  }
  const sim = buildSimFromBlueprint(blueprint, partDefs);
  const heldMass = Number(opts.heldMass) || 0;
  const tip = checkTip({
    com: sim.com,
    mass: sim.mass,
    width: sim.width,
    supportPolygon: sim.supportPolygon,
    heldMass,
    heldOffset: {x: (sim.reach || 0) * 0.55, z: 0},
    tipFactor: 1,
  });
  const tipMargin = tip.margin ?? 0;
  const tipRisk = tipMargin < 0.02 || !!tip.tipped;
  const tags = [];
  if (sim.reach >= 0.22) tags.push('长臂');
  else if (sim.reach > 0) tags.push('短臂');
  if (sim.width >= 0.16) tags.push('宽底盘');
  else if (sim.width > 0) tags.push('窄底盘');
  if (sim.mass >= 1.2) tags.push('重载');
  else tags.push('轻量');
  if (tipRisk) tags.push('易倾覆');

  let loadHint = '空载稳定';
  if (heldMass > 0) {
    loadHint = tipRisk
      ? `夹持 ${heldMass.toFixed(2)}kg 时倾覆风险高`
      : `夹持 ${heldMass.toFixed(2)}kg 裕度 ${tipMargin.toFixed(3)}m`;
  } else if (tipRisk) {
    loadHint = '空载支撑偏窄，建议加宽轮距或配重';
  }

  return {
    name: blueprint.name || '未命名',
    parts: blueprint.instances.length,
    mass: sim.mass,
    width: sim.width,
    wheelbase: sim.wheelbase || 0,
    reach: sim.reach,
    tipMargin,
    tipRisk,
    loadHint,
    tags,
  };
}

/**
 * @param {ReturnType<typeof hangarMetrics>} m
 */
export function formatHangarMetricsHtml(m) {
  const bar = (label, value, max, unit) => {
    const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
    return `<div class="hangar-meter"><div class="hangar-meter-label"><span>${label}</span><b>${value.toFixed(2)}${unit}</b></div><div class="meter"><span style="width:${pct}%"></span></div></div>`;
  };
  const tags = (m.tags || []).map((t) => `<span class="hangar-tag">${t}</span>`).join('');
  return `
    <div class="hangar-stat-head">
      <h2>${escapeHtml(m.name)}</h2>
      <p class="tip">${m.parts} 个零件</p>
      <div class="hangar-tags">${tags || '<span class="hangar-tag">空机架</span>'}</div>
    </div>
    ${bar('质量', m.mass, 2.5, ' kg')}
    ${bar('轮距宽', m.width, 0.4, ' m')}
    ${bar('轴距', m.wheelbase, 0.5, ' m')}
    ${bar('可达', m.reach, 0.5, ' m')}
    <div class="hangar-meter">
      <div class="hangar-meter-label"><span>倾覆裕度</span><b class="${m.tipRisk ? 'is-warn' : ''}">${m.tipMargin.toFixed(3)} m</b></div>
      <p class="tip hangar-load-hint">${escapeHtml(m.loadHint)}</p>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]),
  );
}
