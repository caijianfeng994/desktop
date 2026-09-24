import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyBoundAxis, autoBindings, diagnoseControls, setBinding} from '../src/desktop_robot/studio/static/game/editor/bindings.mjs';
import {extractComponent, instantiateComponent} from '../src/desktop_robot/studio/static/game/editor/components.mjs';
import {buildEmptyCoreTemplate, buildQuadChassisArmTemplate} from '../src/desktop_robot/studio/static/game/editor/templates.mjs';
import {attachPart} from '../src/desktop_robot/studio/static/game/editor/assemble.mjs';
import {buildSimFromBlueprint} from '../src/desktop_robot/studio/static/game/simulation/body.mjs';
import {checkTip} from '../src/desktop_robot/studio/static/game/simulation/tip.mjs';
import {createYardWorld, DESK_GAP_BLOCK_ID} from '../src/desktop_robot/studio/static/game/simulation/world.mjs';
import {worldPosesWithJoints} from '../src/desktop_robot/studio/static/game/simulation/pose.mjs';

const PART_DEFS = [
  {id: 'core', size_m: [0.08, 0.08, 0.08], mass_kg: 0.45, behaviors: [], connection_points: [
    {id: 'mount_front', pose: {z: 0.04}, kinds: ['structure']},
    {id: 'mount_top', pose: {y: 0.04}, kinds: ['structure']},
  ]},
  {id: 'revolute_joint', size_m: [0.04, 0.04, 0.04], mass_kg: 0.1, behaviors: ['pivot'], connection_points: [
    {id: 'in', pose: {z: -0.02}, kinds: ['joint', 'structure']},
    {id: 'out', pose: {z: 0.02}, kinds: ['joint', 'structure']},
  ]},
  {id: 'prism_joint', size_m: [0.04, 0.04, 0.08], mass_kg: 0.12, behaviors: ['extend'], connection_points: [
    {id: 'in', pose: {z: -0.04}, kinds: ['joint', 'structure']},
    {id: 'out', pose: {z: 0.04}, kinds: ['joint', 'structure']},
  ]},
  {id: 'gripper', size_m: [0.04, 0.04, 0.06], mass_kg: 0.1, behaviors: ['grasp'], connection_points: [
    {id: 'mount', pose: {z: -0.03}, kinds: ['tool', 'structure']},
  ]},
  {id: 'beam', size_m: [0.02, 0.02, 0.12], mass_kg: 0.05, behaviors: [], connection_points: [
    {id: 'end_a', pose: {z: 0.06}, kinds: ['structure', 'joint']},
    {id: 'end_b', pose: {z: -0.06}, kinds: ['structure', 'joint']},
  ]},
];

test('quad template ships default lift/grasp bindings', () => {
  const bp = buildQuadChassisArmTemplate();
  assert.deepEqual(bp.bindings.lift, ['joint-1', 'joint-2']);
  assert.deepEqual(bp.bindings.grasp, ['gripper-1']);
});

test('applyBoundAxis lifts only bound joints and clamps', () => {
  const bp = buildQuadChassisArmTemplate();
  const sim = buildSimFromBlueprint(bp, PART_DEFS);
  const once = applyBoundAxis(bp, 'lift', 0.2, {sim, jointAngles: {}});
  assert.ok(once.jointAngles['joint-1'] > 0);
  assert.ok(once.jointAngles['joint-2'] > 0);
  const only = setBinding(bp, 'lift', ['joint-1']);
  const second = applyBoundAxis(only, 'lift', 0.2, {sim, jointAngles: {}});
  assert.ok(second.jointAngles['joint-1'] > 0);
  assert.equal(second.jointAngles['joint-2'], undefined);
});

test('grasp binding closes gripper aperture', () => {
  const bp = buildQuadChassisArmTemplate();
  const sim = buildSimFromBlueprint(bp, PART_DEFS);
  const closed = applyBoundAxis(bp, 'grasp', -1, {sim, gripperOpen: 1});
  assert.ok(closed.gripperOpen < 1);
  assert.equal(closed.applied, true);
});

test('prismatic slide moves child pose along axis', () => {
  let bp = buildEmptyCoreTemplate();
  bp = attachPart(bp, {
    partId: 'prism_joint',
    parentInstanceId: 'core-1',
    parentPointId: 'mount_front',
    childPointId: 'in',
    instanceId: 'prism-1',
  });
  const zero = worldPosesWithJoints(bp, PART_DEFS, {}, {});
  const slid = worldPosesWithJoints(bp, PART_DEFS, {}, {'prism-1': 0.1});
  assert.ok(slid['prism-1'].z > zero['prism-1'].z);
});

test('diagnoseControls flags missing tool', () => {
  const bp = buildEmptyCoreTemplate();
  const sim = buildSimFromBlueprint(bp, PART_DEFS);
  const d = diagnoseControls(bp, sim);
  assert.ok(d.issues.some((i) => i.code === 'no_tool'));
});

test('narrow tip reason suggests widening', () => {
  const tip = checkTip({com: {x: 0.2}, mass: 1, width: 0.1, heldMass: 0.5, heldOffset: {x: 0.3}});
  assert.equal(tip.tipped, true);
  assert.match(tip.reason, /底盘|手臂|配重/);
});

test('desk-gap world exposes elevated rescue block and gap', () => {
  const world = createYardWorld();
  world.setChallengeMode(true, 'desk-gap-rescue');
  assert.equal(world.blocks[0].id, DESK_GAP_BLOCK_ID);
  assert.ok(world.blocks[0].y > 0.1);
  assert.equal(world.inDeskGap(0, 0), true);
  assert.equal(world.inDeskGap(0, -1.2), false);
});

test('extract and instantiate component remaps ids', () => {
  const bp = buildQuadChassisArmTemplate();
  const comp = extractComponent(bp, 'joint-1', {name: '我的臂'});
  assert.ok(comp.instances.length >= 2);
  let host = buildEmptyCoreTemplate({id: 'host'});
  const {blueprint, rootInstanceId} = instantiateComponent(host, comp, {
    parentInstanceId: 'core-1',
    parentPointId: 'mount_front',
  });
  assert.ok(blueprint.instances.length > 1);
  assert.ok(rootInstanceId.includes('__'));
  assert.ok((blueprint.bindings.lift || []).length >= 1);
});

test('autoBindings fills empty bindings from part types', () => {
  const bp = buildQuadChassisArmTemplate();
  bp.bindings = {};
  const auto = autoBindings(bp);
  assert.ok(auto.lift.includes('joint-1'));
  assert.ok(auto.grasp.includes('gripper-1'));
});
