import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {planStarterLoadout} from '../src/desktop_robot/studio/static/game/loadout.mjs';

const gameJs = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/desktop_robot/studio/static/game/game.js'),
  'utf8',
);

test('missing parts: owned without camera reports camera and no executable equip', () => {
  const plan = planStarterLoadout({
    owned: ['wheels', 'arm'],
    equipped: ['wheels'],
    capacity: 12,
    basePower: 2,
    partPower: {wheels: 2, camera: 3, arm: 5},
  });
  assert.ok(plan.missing.includes('camera'));
  assert.deepEqual(plan.equip, []);
  assert.deepEqual(plan.unequip, []);
  assert.equal(plan.ok, false);
  assert.match(plan.note, /请先解锁/);
});

test('power insufficient: tracks only without wheels or battery disables apply', () => {
  const plan = planStarterLoadout({
    owned: ['tracks', 'camera', 'arm'],
    equipped: ['tracks'],
    capacity: 12,
    basePower: 2,
    partPower: {tracks: 4, camera: 3, arm: 5},
  });
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.equip, []);
  assert.deepEqual(plan.unequip, []);
  assert.ok(plan.finalPower > plan.finalCapacity || plan.missing.length);
});

test('needs unequip: display+wheels yields unequip display and equip camera+arm', () => {
  const plan = planStarterLoadout({
    owned: ['wheels', 'display', 'camera', 'arm'],
    equipped: ['wheels', 'display'],
    capacity: 12,
    basePower: 2,
    partPower: {wheels: 2, display: 2, camera: 3, arm: 5},
  });
  assert.ok(plan.ok);
  assert.deepEqual(plan.unequip, ['display']);
  assert.ok(plan.equip.includes('camera'));
  assert.ok(plan.equip.includes('arm'));
});

test('already satisfied: empty equip/unequip with ready note', () => {
  const plan = planStarterLoadout({
    owned: ['wheels', 'camera', 'arm'],
    equipped: ['wheels', 'camera', 'arm'],
    capacity: 12,
    basePower: 2,
    partPower: {wheels: 2, camera: 3, arm: 5},
  });
  assert.ok(plan.ok);
  assert.deepEqual(plan.equip, []);
  assert.deepEqual(plan.unequip, []);
  assert.deepEqual(plan.missing, []);
  assert.equal(plan.note, '当前装配已满足首关推荐。');
});

test('UI modal: already-satisfied shows close-only without confirm act', () => {
  const handler = gameJs.split("$('#apply-starter-loadout')")[1].split("$('#scan')")[0];
  assert.match(handler, /plan\.equip\.length===0\s*&&\s*plan\.unequip\.length===0\s*&&\s*!plan\.missing\.length/);
  assert.match(handler, /已满足/);
  assert.match(handler, /close-loadout-ready/);
  const readyBranch = handler.split('close-loadout-ready')[0].split('plan.equip.length===0')[1];
  assert.ok(readyBranch);
  assert.doesNotMatch(readyBranch, /confirm-loadout/);
  assert.doesNotMatch(readyBranch, /act\(/);
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
