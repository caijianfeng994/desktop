import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildQuadChassisArmTemplate} from '../src/desktop_robot/studio/static/game/editor/templates.mjs';
import {buildSimFromBlueprint} from '../src/desktop_robot/studio/static/game/simulation/body.mjs';
import {checkTip} from '../src/desktop_robot/studio/static/game/simulation/tip.mjs';
import {stepDrive} from '../src/desktop_robot/studio/static/game/simulation/drive.mjs';

/** 与 parts.py 对齐的最小 partDefs（对象 map） */
const PART_DEFS = {
  core: {
    id: 'core',
    size_m: [0.08, 0.08, 0.08],
    mass_kg: 0.45,
    behaviors: [],
    connection_points: [
      {id: 'root', pose: {x: 0, y: 0, z: 0}},
      {id: 'mount_top', pose: {x: 0, y: 0.04, z: 0}},
      {id: 'mount_front', pose: {x: 0, y: 0, z: 0.04}},
      {id: 'mount_back', pose: {x: 0, y: 0, z: -0.04}},
      {id: 'mount_left', pose: {x: -0.04, y: 0, z: 0}},
      {id: 'mount_right', pose: {x: 0.04, y: 0, z: 0}},
      {id: 'mount_bottom', pose: {x: 0, y: -0.04, z: 0}},
    ],
  },
  plate: {
    id: 'plate',
    size_m: [0.12, 0.02, 0.12],
    mass_kg: 0.12,
    behaviors: [],
    connection_points: [
      {id: 'face_a', pose: {x: 0, y: 0.01, z: 0}},
      {id: 'face_b', pose: {x: 0, y: -0.01, z: 0}},
      {id: 'face_c', pose: {x: 0, y: 0, z: 0.06}},
      {id: 'face_d', pose: {x: 0, y: 0, z: -0.06}},
    ],
  },
  beam: {
    id: 'beam',
    size_m: [0.02, 0.02, 0.12],
    mass_kg: 0.05,
    behaviors: [],
    connection_points: [
      {id: 'end_a', pose: {x: 0, y: 0, z: 0.06}},
      {id: 'end_b', pose: {x: 0, y: 0, z: -0.06}},
    ],
  },
  wheel: {
    id: 'wheel',
    size_m: [0.02, 0.06, 0.06],
    mass_kg: 0.08,
    behaviors: ['roll'],
    connection_points: [{id: 'hub', pose: {x: 0, y: 0, z: 0}}],
  },
  revolute_joint: {
    id: 'revolute_joint',
    size_m: [0.04, 0.04, 0.04],
    mass_kg: 0.1,
    behaviors: ['pivot'],
    connection_points: [
      {id: 'in', pose: {x: 0, y: 0, z: -0.02}},
      {id: 'out', pose: {x: 0, y: 0, z: 0.02}},
    ],
  },
  gripper: {
    id: 'gripper',
    size_m: [0.04, 0.04, 0.06],
    mass_kg: 0.1,
    behaviors: ['grasp'],
    connection_points: [{id: 'mount', pose: {x: 0, y: 0, z: -0.03}}],
  },
};

function cloneBp(bp) {
  return structuredClone(bp);
}

function withWiderWheels(bp) {
  const out = cloneBp(bp);
  for (const inst of out.instances) {
    if (inst.instance_id === 'wheel-left') {
      inst.local_pose = {...inst.local_pose, x: -0.1};
    }
    if (inst.instance_id === 'wheel-right') {
      inst.local_pose = {...inst.local_pose, x: 0.1};
    }
  }
  return out;
}

function withLongerArm(bp) {
  const out = cloneBp(bp);
  // 在 beam 后加一节额外 beam，把夹爪推得更远
  out.instances.push({
    instance_id: 'beam-2',
    part_id: 'beam',
    local_pose: {x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0},
    params: {},
  });
  // 原：beam-1 → joint-2 → gripper；改为 beam-1 → beam-2 → joint-2 → gripper
  out.connections = out.connections.filter(
    (c) => !(c.parent_instance_id === 'beam-1' && c.child_instance_id === 'joint-2'),
  );
  out.connections.push({
    parent_instance_id: 'beam-1',
    parent_point_id: 'end_a',
    child_instance_id: 'beam-2',
    child_point_id: 'end_b',
    joint: 'fixed',
  });
  out.connections.push({
    parent_instance_id: 'beam-2',
    parent_point_id: 'end_a',
    child_instance_id: 'joint-2',
    child_point_id: 'in',
    joint: 'fixed',
  });
  return out;
}

test('longer arm template has greater reach than short', () => {
  const short = buildSimFromBlueprint(buildQuadChassisArmTemplate(), PART_DEFS);
  const long = buildSimFromBlueprint(withLongerArm(buildQuadChassisArmTemplate()), PART_DEFS);
  assert.ok(long.reach > short.reach, `expected ${long.reach} > ${short.reach}`);
});

test('wider wheel placement yields larger width', () => {
  const narrow = buildSimFromBlueprint(buildQuadChassisArmTemplate(), PART_DEFS);
  const wide = buildSimFromBlueprint(withWiderWheels(buildQuadChassisArmTemplate()), PART_DEFS);
  assert.ok(wide.width > narrow.width, `expected ${wide.width} > ${narrow.width}`);
});

test('heavy held mass forward tips', () => {
  const sim = buildSimFromBlueprint(buildQuadChassisArmTemplate(), PART_DEFS);
  const ok = checkTip({com: sim.com, mass: sim.mass, width: sim.width, heldMass: 0});
  assert.equal(ok.tipped, false);

  const tipped = checkTip({
    com: sim.com,
    mass: sim.mass,
    width: sim.width,
    heldMass: 5,
    heldOffset: {x: sim.width, z: 0},
  });
  assert.equal(tipped.tipped, true);
  assert.ok(tipped.reason.includes('倾覆') || tipped.reason.includes('重心'));
});

test('stepDrive advances and clamps against walls', () => {
  const state = {
    x: 0,
    z: 0,
    yaw: 0,
    speed: 1,
    turnSpeed: 1,
    width: 0.1,
    walls: [{minX: -0.2, maxX: 0.2, minZ: 0.15, maxZ: 0.4}],
  };
  stepDrive(state, {forward: 1, turn: 0}, 0.05);
  assert.ok(state.z > 0);
  // 继续撞墙应被挡住
  for (let i = 0; i < 20; i++) stepDrive(state, {forward: 1, turn: 0}, 0.05);
  assert.ok(state.z < 0.2, `expected clamped z, got ${state.z}`);
});
