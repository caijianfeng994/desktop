import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aabbOverlap, checkAttachCollision, previewPoseAtPoint} from '../src/desktop_robot/studio/static/game/editor/attachPreview.mjs';
import {startGraspSequence, startReleaseSequence, stepGraspSequence} from '../src/desktop_robot/studio/static/game/simulation/graspSequence.mjs';
import {
  compareStructures,
  liveStructureHint,
} from '../src/desktop_robot/studio/static/game/simulation/structureContrast.mjs';
import {
  contrastPartDefs,
  longArmBlueprint,
  shortArmBlueprint,
} from '../src/desktop_robot/studio/static/game/editor/contrastBlueprints.mjs';

test('aabbOverlap detects intersecting parts', () => {
  assert.equal(aabbOverlap({x: 0, y: 0, z: 0}, [0.1, 0.1, 0.1], {x: 0.05, y: 0, z: 0}, [0.1, 0.1, 0.1]), true);
  assert.equal(aabbOverlap({x: 0, y: 0, z: 0}, [0.1, 0.1, 0.1], {x: 1, y: 0, z: 0}, [0.1, 0.1, 0.1]), false);
});

test('checkAttachCollision rejects overlapping preview', () => {
  const bp = {instances: [{instance_id: 'a', part_id: 'core'}]};
  const poses = {a: {x: 0, y: 0, z: 0}};
  const sizes = new Map([['a', [0.1, 0.1, 0.1]]]);
  const bad = checkAttachCollision(bp, poses, sizes, {x: 0.02, y: 0.05, z: 0}, [0.08, 0.08, 0.08]);
  assert.equal(bad.ok, false);
  const good = checkAttachCollision(bp, poses, sizes, {x: 0.5, y: 0.05, z: 0}, [0.08, 0.08, 0.08]);
  assert.equal(good.ok, true);
});

test('previewPoseAtPoint offsets by parent yaw', () => {
  const p = previewPoseAtPoint({x: 0, y: 0, z: 0, ry: Math.PI / 2}, {x: 0.1, y: 0, z: 0}, [0.05, 0.05, 0.05]);
  assert.ok(Math.abs(p.z + 0.1) < 1e-6 || Math.abs(p.x) < 0.2);
});

test('grasp sequence reaches holding through phases with assist', () => {
  let st = startGraspSequence();
  const block = {x: 0, y: 0.04, z: 0.12};
  const tool = {x: 0, y: 0.1, z: 0.12, yaw: 0};
  const sim = {reach: 0.5, gripperOpen: 1};
  let last = null;
  for (let i = 0; i < 40; i++) {
    last = stepGraspSequence({sim, toolWorld: tool, block, gripperOpen: last?.gripperOpen ?? 1, holding: false}, 0.05, st);
    st = {phase: last.phase, t: last.t, autoAssist: true};
    if (last.phase === 'holding' && last.attach) break;
  }
  assert.equal(last.phase, 'holding');
  assert.equal(last.success, true);
});

test('grasp release sequence detaches after open', () => {
  let st = startReleaseSequence();
  let last = null;
  for (let i = 0; i < 20; i++) {
    last = stepGraspSequence(
      {sim: {reach: 0.5, gripperOpen: 0}, toolWorld: {x: 0, y: 0.1, z: 0}, block: {x: 0, y: 0.04, z: 0}, gripperOpen: last?.gripperOpen ?? 0, holding: true},
      0.05,
      st,
    );
    st = {phase: last.phase, t: last.t, autoAssist: true};
    if (last.detach) break;
  }
  assert.equal(last.detach, true);
  assert.equal(last.phase, 'idle');
});

test('structure contrast: short misses target, long reaches and tips under load', () => {
  const report = compareStructures(shortArmBlueprint(), longArmBlueprint(), contrastPartDefs(), {
    targetDist: 0.18,
    heldMass: 0.6,
  });
  assert.ok(report.reachDelta > 0.05);
  assert.equal(report.shortMisses, true);
  assert.equal(report.longReaches, true);
  assert.equal(report.longTipper, true);
  assert.match(report.summary, /短臂|加长|倾覆|前倾/);
});

test('liveStructureHint reports reach shortfall', () => {
  const text = liveStructureHint({reach: 0.12, toolDist: 0.3, tipRisk: false, heldMass: 0});
  assert.match(text, /加长臂/);
});
