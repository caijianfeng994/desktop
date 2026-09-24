/**
 * 零件实例参数：首批开放梁长 / 板宽，带上下限与派生尺寸、连接点偏移。
 */

export const PARAM_SPECS = Object.freeze({
  beam: {
    length: {min: 0.06, max: 0.3, default: 0.12, label: '梁长 (m)'},
  },
  plate: {
    width: {min: 0.06, max: 0.2, default: 0.12, label: '板宽 (m)'},
  },
  post: {
    height: {min: 0.06, max: 0.24, default: 0.12, label: '立柱高 (m)'},
  },
  revolute_joint: {
    limit_min: {min: -Math.PI, max: 0, default: -Math.PI / 2, label: '下限 (rad)'},
    limit_max: {min: 0, max: Math.PI, default: Math.PI / 2, label: '上限 (rad)'},
    drive_sign: {min: -1, max: 1, default: 1, label: '方向 (±1)'},
    drive_scale: {min: 0.25, max: 2, default: 1, label: '比例'},
  },
  prism_joint: {
    limit_min: {min: 0, max: 0.05, default: 0, label: '缩回 (m)'},
    limit_max: {min: 0.04, max: 0.2, default: 0.12, label: '伸出 (m)'},
    drive_sign: {min: -1, max: 1, default: 1, label: '方向 (±1)'},
    drive_scale: {min: 0.25, max: 2, default: 1, label: '比例'},
  },
});

const BASE_SIZE = Object.freeze({
  beam: [0.02, 0.02, 0.12],
  plate: [0.12, 0.02, 0.12],
  post: [0.03, 0.12, 0.03],
});

/**
 * @param {number} value
 * @param {{min:number,max:number,default:number}} spec
 */
export function clampParam(value, spec) {
  const n = Number(value);
  if (!Number.isFinite(n)) return spec.default;
  return Math.min(spec.max, Math.max(spec.min, n));
}

/**
 * @param {string} partId
 * @param {Record<string, number>|null|undefined} params
 * @returns {Record<string, number>}
 */
export function normalizeParams(partId, params = {}) {
  const specs = PARAM_SPECS[partId];
  if (!specs) return {};
  const out = {};
  for (const [key, spec] of Object.entries(specs)) {
    const raw = params?.[key];
    out[key] = clampParam(raw == null ? spec.default : raw, spec);
  }
  return out;
}

/**
 * @param {string} partId
 * @param {number[]|null|undefined} baseSize
 * @param {Record<string, number>|null|undefined} params
 * @returns {number[]}
 */
export function sizeFromParams(partId, baseSize, params = {}) {
  const base = baseSize?.length >= 3 ? [...baseSize] : [...(BASE_SIZE[partId] || [0.05, 0.05, 0.05])];
  const p = normalizeParams(partId, params);
  if (partId === 'beam' && p.length != null) {
    base[2] = p.length;
  } else if (partId === 'plate' && p.width != null) {
    base[0] = p.width;
    base[2] = p.width;
  } else if (partId === 'post' && p.height != null) {
    base[1] = p.height;
  }
  return base;
}

/**
 * 按尺寸缩放连接点局部位姿（相对默认 size）。
 * @param {object} point  {id, pose, kinds}
 * @param {string} partId
 * @param {number[]} size
 * @param {number[]|null} [baseSize]
 */
export function scalePointPose(point, partId, size, baseSize = null) {
  const base = baseSize?.length >= 3 ? baseSize : (BASE_SIZE[partId] || size);
  const pose = {...(point.pose || {})};
  const sx = base[0] > 1e-9 ? size[0] / base[0] : 1;
  const sy = base[1] > 1e-9 ? size[1] / base[1] : 1;
  const sz = base[2] > 1e-9 ? size[2] / base[2] : 1;
  return {
    ...point,
    pose: {
      x: (pose.x || 0) * sx,
      y: (pose.y || 0) * sy,
      z: (pose.z || 0) * sz,
      rx: pose.rx || 0,
      ry: pose.ry || 0,
      rz: pose.rz || 0,
    },
  };
}

/**
 * @param {string} partId
 * @param {object[]|null|undefined} connectionPoints 默认定义点
 * @param {Record<string, number>|null|undefined} params
 * @param {number[]|null|undefined} baseSize
 */
export function pointsForInstance(partId, connectionPoints, params, baseSize) {
  const size = sizeFromParams(partId, baseSize, params);
  return (connectionPoints || []).map((p) => scalePointPose(p, partId, size, baseSize));
}
