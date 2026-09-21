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

test('switches tracks to wheels when starter set exceeds 12W', () => {
  const plan = planStarterLoadout({
    owned: ['tracks', 'wheels', 'display', 'camera', 'arm'],
    equipped: ['tracks', 'display'],
    capacity: 12,
    basePower: 2,
    partPower: {tracks: 4, wheels: 2, display: 2, camera: 3, arm: 5},
  });
  assert.ok(plan.ok);
  assert.ok(plan.unequip.includes('tracks'));
  assert.ok(plan.unequip.includes('display'));
  assert.ok(plan.equip.includes('wheels'));
  assert.ok(plan.equip.includes('camera'));
  assert.ok(plan.equip.includes('arm'));
  assert.ok(plan.finalPower <= 12);
  assert.ok(!plan.note.includes('供电预算内'));
});
