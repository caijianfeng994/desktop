import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildEmptyCoreTemplate, buildQuadChassisArmTemplate} from '../src/desktop_robot/studio/static/game/editor/templates.mjs';
import {classifyParentPoints} from '../src/desktop_robot/studio/static/game/editor/compatible.mjs';
import {sizeFromParams, pointsForInstance, clampParam, PARAM_SPECS} from '../src/desktop_robot/studio/static/game/editor/params.mjs';
import {attachPart, setInstanceParams} from '../src/desktop_robot/studio/static/game/editor/assemble.mjs';
import {worldPosesFromBlueprint} from '../src/desktop_robot/studio/static/game/simulation/pose.mjs';

const PART_DEFS = [
  {
    id: 'core',
    size_m: [0.08, 0.08, 0.08],
    connection_points: [
      {id: 'mount_front', pose: {x: 0, y: 0, z: 0.04}, kinds: ['structure']},
      {id: 'mount_top', pose: {x: 0, y: 0.04, z: 0}, kinds: ['structure']},
    ],
  },
  {
    id: 'beam',
    size_m: [0.02, 0.02, 0.12],
    connection_points: [
      {id: 'end_a', pose: {x: 0, y: 0, z: 0.06}, kinds: ['structure', 'joint']},
      {id: 'end_b', pose: {x: 0, y: 0, z: -0.06}, kinds: ['structure', 'joint']},
    ],
  },
  {
    id: 'revolute_joint',
    size_m: [0.04, 0.04, 0.04],
    connection_points: [
      {id: 'in', pose: {x: 0, y: 0, z: -0.02}, kinds: ['joint', 'structure']},
      {id: 'out', pose: {x: 0, y: 0, z: 0.02}, kinds: ['joint', 'structure']},
    ],
  },
  {
    id: 'gripper',
    size_m: [0.04, 0.04, 0.06],
    connection_points: [
      {id: 'mount', pose: {x: 0, y: 0, z: -0.03}, kinds: ['tool', 'structure']},
    ],
  },
];

test('empty core template has only core and no connections', () => {
  const bp = buildEmptyCoreTemplate();
  assert.equal(bp.instances.length, 1);
  assert.equal(bp.instances[0].part_id, 'core');
  assert.equal(bp.connections.length, 0);
  assert.notEqual(bp.id, buildQuadChassisArmTemplate().id);
});

test('classifyParentPoints marks occupied and compatible points', () => {
  let bp = buildEmptyCoreTemplate();
  bp = attachPart(bp, {
    partId: 'beam',
    parentInstanceId: 'core-1',
    parentPointId: 'mount_front',
    childPointId: 'end_b',
  });
  const after = classifyParentPoints(bp, 'core-1', 'beam', PART_DEFS);
  assert.ok(after.incompatible.some((r) => r.pointId === 'mount_front' && /占用/.test(r.reason)));
  assert.ok(after.compatible.some((c) => c.pointId === 'mount_top'));
});

test('beam length param scales end points and size', () => {
  const long = sizeFromParams('beam', [0.02, 0.02, 0.12], {length: 0.24});
  assert.equal(long[2], 0.24);
  const points = pointsForInstance(
    'beam',
    PART_DEFS.find((d) => d.id === 'beam').connection_points,
    {length: 0.24},
    [0.02, 0.02, 0.12],
  );
  const endA = points.find((p) => p.id === 'end_a');
  assert.ok(Math.abs(endA.pose.z - 0.12) < 1e-9);
  assert.equal(clampParam(0.5, PARAM_SPECS.beam.length), PARAM_SPECS.beam.length.max);
});

test('longer beam increases child reach in world poses', () => {
  let bp = buildEmptyCoreTemplate();
  bp = attachPart(bp, {
    partId: 'beam',
    parentInstanceId: 'core-1',
    parentPointId: 'mount_front',
    childPointId: 'end_b',
    instanceId: 'beam-1',
  });
  const shortPoses = worldPosesFromBlueprint(bp, PART_DEFS);
  bp = setInstanceParams(bp, 'beam-1', {length: 0.24});
  const longPoses = worldPosesFromBlueprint(bp, PART_DEFS);
  assert.ok(longPoses['beam-1'].z > shortPoses['beam-1'].z);
});
