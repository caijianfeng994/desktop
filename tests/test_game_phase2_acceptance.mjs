/**
 * 阶段二至四验收：臂长 reach、宽底盘 vs 窄门、三种挑战机制。
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildQuadChassisArmTemplate} from '../src/desktop_robot/studio/static/game/editor/templates.mjs';
import {buildSimFromBlueprint} from '../src/desktop_robot/studio/static/game/simulation/body.mjs';
import {tryDrag, tryGrasp, tryPush} from '../src/desktop_robot/studio/static/game/simulation/grasp.mjs';
import {
  DRAWER_BLOCK_ID,
  createYardWorld,
} from '../src/desktop_robot/studio/static/game/simulation/world.mjs';

/** 与 parts.py / test_game_sim_body 对齐的最小 partDefs */
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
  out.instances.push({
    instance_id: 'beam-2',
    part_id: 'beam',
    local_pose: {x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0},
    params: {},
  });
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

function drawerBlock(world) {
  return world.blocks.find((b) => b.id === DRAWER_BLOCK_ID);
}

test('acceptance: longer arm reach exceeds shorter via buildSimFromBlueprint', () => {
  const short = buildSimFromBlueprint(buildQuadChassisArmTemplate(), PART_DEFS);
  const long = buildSimFromBlueprint(withLongerArm(buildQuadChassisArmTemplate()), PART_DEFS);
  assert.ok(long.reach > short.reach, `expected ${long.reach} > ${short.reach}`);
});

test('acceptance: wider chassis may fail narrow door (width > door vs <)', () => {
  const world = createYardWorld();
  const door = world.narrowDoor;
  assert.ok(door && door.width > 0);

  const narrow = buildSimFromBlueprint(buildQuadChassisArmTemplate(), PART_DEFS);
  const wide = buildSimFromBlueprint(withWiderWheels(buildQuadChassisArmTemplate()), PART_DEFS);

  assert.ok(narrow.width < door.width, `narrow ${narrow.width} should fit door ${door.width}`);
  assert.ok(wide.width > door.width, `wide ${wide.width} should fail door ${door.width}`);
});

test('acceptance: grasp / push / drag each report success', () => {
  const world = createYardWorld();
  world.setChallengeMode(true);
  const block = drawerBlock(world);
  assert.ok(block, 'drawer cube present');

  const sim = {reach: 0.5};
  const grasp = tryGrasp(
    sim,
    {x: block.x, z: block.z - 0.2, yaw: 0},
    {x: block.x, y: block.y, z: block.z - 0.05, yaw: 0},
    block,
  );
  assert.equal(grasp.success, true, grasp.reason);

  const yaw = Math.PI;
  const push = tryPush(
    sim,
    {x: block.x, z: block.z + 0.2, yaw},
    {x: block.x, y: block.y, z: block.z + 0.08, yaw},
    block,
    0.12,
  );
  assert.equal(push.success, true, push.reason);

  const drag = tryDrag(
    sim,
    {x: block.x, z: block.z - 0.15, yaw: 0},
    {x: block.x, y: block.y, z: block.z - 0.08, yaw: 0},
    block,
  );
  assert.equal(drag.success, true, drag.reason);
});
