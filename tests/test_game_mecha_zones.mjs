import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildEngineerMechaTemplate} from '../src/desktop_robot/studio/static/game/editor/templates.mjs';
import {cockpitViewHint, groupInstancesByZone, zoneForPart} from '../src/desktop_robot/studio/static/game/workshop/mechaZones.mjs';

test('engineer mecha covers head torso shoulders backpack chassis weapon', () => {
  const bp = buildEngineerMechaTemplate();
  const g = groupInstancesByZone(bp);
  assert.ok(g.head.length >= 1);
  assert.ok(g.torso.length >= 1);
  assert.ok(g.shoulder_l.length + g.shoulder_r.length >= 2);
  assert.ok(g.backpack.length >= 1);
  assert.ok(g.chassis.length >= 1);
  assert.ok(g.weapon.length >= 1);
  assert.ok(g.arm.length >= 1);
});

test('zoneForPart uses slot when provided', () => {
  assert.equal(zoneForPart('armor_shoulder', 'slot_shoulder_r'), 'shoulder_r');
  assert.equal(zoneForPart('mecha_head'), 'head');
});

test('cockpitViewHint warns on heavy stack', () => {
  const hint = cockpitViewHint({
    instances: [{part_id: 'heavy_plate'}, {part_id: 'armor_torso'}],
  });
  assert.equal(hint.ok, false);
});
