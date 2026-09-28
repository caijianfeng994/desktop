import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stepDrive} from '../src/desktop_robot/studio/static/game/simulation/drive.mjs';

test('drive builds forward speed with inertia instead of teleporting', () => {
  const state = {x: 0, z: 0, yaw: 0, speed: 0.8, turnSpeed: 2, width: 0.2, walls: []};
  stepDrive(state, {forward: 1, turn: 0}, 0.05);
  const v1 = state.forwardSpeed ?? 0;
  assert.ok(v1 > 0 && v1 < 0.8);
  stepDrive(state, {forward: 1, turn: 0}, 0.2);
  assert.ok((state.forwardSpeed ?? 0) > v1);
  assert.ok(Math.abs(state.wheelOmega ?? 0) > 0);
});

test('held load lowers top speed relative to unloaded', () => {
  const light = {x: 0, z: 0, yaw: 0, speed: 0.8, turnSpeed: 2, width: 0.2, walls: [], baseMass: 1, heldMass: 0};
  const heavy = {x: 0, z: 0, yaw: 0, speed: 0.8, turnSpeed: 2, width: 0.2, walls: [], baseMass: 1, heldMass: 2};
  for (let i = 0; i < 40; i++) {
    stepDrive(light, {forward: 1}, 0.05);
    stepDrive(heavy, {forward: 1}, 0.05);
  }
  assert.ok((light.forwardSpeed ?? 0) > (heavy.forwardSpeed ?? 0) + 0.05);
});

test('release of input decelerates instead of instantly stopping', () => {
  const state = {x: 0, z: 0, yaw: 0, speed: 0.8, walls: [], forwardSpeed: 0.6};
  stepDrive(state, {forward: 0}, 0.05);
  assert.ok((state.forwardSpeed ?? 0) > 0.2);
  assert.ok((state.forwardSpeed ?? 0) < 0.6);
});
