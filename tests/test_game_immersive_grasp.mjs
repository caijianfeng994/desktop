import {test} from 'node:test';
import assert from 'node:assert/strict';
import {graspPhase, tryGrasp} from '../src/desktop_robot/studio/static/game/simulation/grasp.mjs';

test('graspPhase reports too_far open ready', () => {
  const sim = {reach: 0.4, gripperOpen: 1};
  const block = {x: 0, y: 0.04, z: 0.15};
  assert.equal(graspPhase(sim, {x: 0, y: 0.1, z: -1, yaw: 0}, block), 'too_far');
  assert.equal(graspPhase(sim, {x: 0, y: 0.1, z: 0.15, yaw: 0}, block), 'open');
  const closed = {reach: 0.4, gripperOpen: 0};
  assert.equal(graspPhase(closed, {x: 0, y: 0.1, z: 0.15, yaw: 0}, block), 'ready');
});

test('tryGrasp still succeeds when closed and aligned', () => {
  const sim = {reach: 0.4, gripperOpen: 0};
  const r = tryGrasp(sim, {yaw: 0}, {x: 0, y: 0.1, z: 0.15, yaw: 0}, {x: 0, y: 0.04, z: 0.15});
  assert.equal(r.success, true);
});
