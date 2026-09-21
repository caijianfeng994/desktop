import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planStarterLoadout} from '../src/desktop_robot/studio/static/game/loadout.mjs';

test('unequips display when camera and arm would exceed 12W', () => {
  const plan = planStarterLoadout({
    owned: ['wheels', 'display', 'camera', 'arm'],
    equipped: ['wheels', 'display'],
    capacity: 12,
    basePower: 2,
    partPower: {wheels: 2, display: 2, camera: 3, arm: 5},
  });
  assert.deepEqual(plan.unequip, ['display']);
  assert.ok(plan.equip.includes('camera'));
  assert.ok(plan.equip.includes('arm'));
});

test('reports missing owned parts without planning equip', () => {
  const plan = planStarterLoadout({
    owned: ['wheels', 'display'],
    equipped: ['wheels', 'display'],
    capacity: 12,
    basePower: 2,
    partPower: {wheels: 2, display: 2, camera: 3, arm: 5},
  });
  assert.ok(plan.missing.includes('camera'));
  assert.ok(plan.missing.includes('arm'));
  assert.deepEqual(plan.equip, []);
  assert.deepEqual(plan.unequip, []);
  assert.match(plan.note, /请先解锁/);
});

test('keeps display when power fits', () => {
  const plan = planStarterLoadout({
    owned: ['wheels', 'display', 'camera', 'arm', 'battery'],
    equipped: ['wheels', 'display', 'battery'],
    capacity: 18,
    basePower: 2,
    partPower: {wheels: 2, display: 2, camera: 3, arm: 5, battery: 0},
  });
  assert.deepEqual(plan.unequip, []);
  assert.ok(plan.equip.includes('camera'));
  assert.ok(plan.equip.includes('arm'));
  assert.equal(plan.finalPower, 2 + 2 + 2 + 3 + 5);
});
