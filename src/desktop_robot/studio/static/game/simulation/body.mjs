/**
 * 由蓝图构建简化刚体度量：质心、轮距、宽度、可达距离。
 */
import {sizeFromParams} from '../editor/params.mjs';
import {indexPartDefs, worldPosesFromBlueprint, worldPosesWithJoints} from './pose.mjs';

const ROLL_TRACK = new Set(['roll', 'track']);
const TOOL = new Set(['grasp', 'drag', 'push']);

function hasBehavior(behaviors, set) {
  if (!behaviors) return false;
  const list = behaviors instanceof Set || Array.isArray(behaviors)
    ? behaviors
    : [...behaviors];
  for (const b of list) {
    if (set.has(b)) return true;
  }
  return false;
}

function aabbFromPose(pose, size) {
  const [sx = 0.05, sy = 0.05, sz = 0.05] = size || [];
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  return {
    min: {x: pose.x - hx, y: pose.y - hy, z: pose.z - hz},
    max: {x: pose.x + hx, y: pose.y + hy, z: pose.z + hz},
  };
}

function limitsFor(inst, joint) {
  const p = inst?.params || {};
  if (joint === 'revolute') {
    return {
      min: Number.isFinite(Number(p.limit_min)) ? Number(p.limit_min) : -Math.PI / 2,
      max: Number.isFinite(Number(p.limit_max)) ? Number(p.limit_max) : Math.PI / 2,
    };
  }
  if (joint === 'prismatic') {
    return {
      min: Number.isFinite(Number(p.limit_min)) ? Number(p.limit_min) : 0,
      max: Number.isFinite(Number(p.limit_max)) ? Number(p.limit_max) : 0.12,
    };
  }
  return null;
}

/**
 * @param {object} bp
 * @param {Map|Record<string, object>|object[]|null} partDefs
 * @param {{jointAngles?: Record<string, number>, jointSlides?: Record<string, number>}|null} [poseState]
 */
export function buildSimFromBlueprint(bp, partDefs, poseState = null) {
  const defs = indexPartDefs(partDefs);
  const poses = poseState
    ? worldPosesWithJoints(bp, defs, poseState.jointAngles || {}, poseState.jointSlides || {})
    : worldPosesFromBlueprint(bp, defs);
  const parentConn = new Map();
  for (const c of bp.connections || []) {
    parentConn.set(c.child_instance_id, c);
  }

  const links = [];
  const rollX = [];
  const rollXZ = [];
  const supportPoints = [];
  let mass = 0;
  let mx = 0;
  let my = 0;
  let mz = 0;
  let reach = 0;

  const rootId = bp.root_instance_id;
  const rootPose = poses[rootId] || {x: 0, y: 0, z: 0};

  for (const inst of bp.instances || []) {
    const def = defs.get(inst.part_id) || {};
    const pose = poses[inst.instance_id] || {x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0};
    const m = Number(def.mass_kg) || 0.01;
    const size = sizeFromParams(inst.part_id, def.size_m || [0.05, 0.05, 0.05], inst.params);
    const behaviors = def.behaviors || [];
    const conn = parentConn.get(inst.instance_id);
    const joint = conn?.joint || 'fixed';

    links.push({
      id: inst.instance_id,
      partId: inst.part_id,
      mass: m,
      pose: {...pose},
      aabb: aabbFromPose(pose, size),
      size_m: [...size],
      behaviors: Array.isArray(behaviors) ? [...behaviors] : [...behaviors],
      joint: {
        type: joint,
        parentId: conn?.parent_instance_id || null,
        axis: joint === 'revolute' ? 'y' : joint === 'prismatic' ? 'z' : null,
        limits: limitsFor(inst, joint),
      },
    });

    mass += m;
    mx += m * pose.x;
    my += m * pose.y;
    mz += m * pose.z;

    if (hasBehavior(behaviors, ROLL_TRACK)) {
      rollX.push(pose.x);
      rollXZ.push([pose.x, pose.z]);
      supportPoints.push({x: pose.x, z: pose.z});
    }
    if (hasBehavior(behaviors, TOOL)) {
      const r = Math.hypot(pose.x - rootPose.x, pose.z - rootPose.z);
      if (r > reach) reach = r;
    }
  }

  let width = 0;
  if (rollX.length) {
    width = Math.max(...rollX.map(Math.abs)) * 2;
    const span = Math.max(...rollX) - Math.min(...rollX);
    if (span > width) width = span;
  }

  let wheelbase = 0;
  for (let i = 0; i < rollXZ.length; i++) {
    const [x1, z1] = rollXZ[i];
    for (let j = i + 1; j < rollXZ.length; j++) {
      const [x2, z2] = rollXZ[j];
      wheelbase = Math.max(wheelbase, Math.hypot(x1 - x2, z1 - z2));
    }
  }

  const inv = mass > 0 ? 1 / mass : 0;
  return {
    links,
    rootId,
    wheelbase,
    width,
    reach,
    com: {x: mx * inv, y: my * inv, z: mz * inv},
    mass,
    supportPolygon: supportPoints,
  };
}

export function toolLink(sim) {
  const TOOL_SET = new Set(['grasp', 'drag', 'push']);
  for (const link of sim?.links || []) {
    const behaviors = link.behaviors || [];
    if (behaviors.some((b) => TOOL_SET.has(b))) return link;
  }
  return null;
}
