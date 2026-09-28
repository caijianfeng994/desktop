import {test} from 'node:test';
import assert from 'node:assert/strict';
import {materialForPart} from '../src/desktop_robot/studio/static/game/workshop/materials.mjs';
import {createSfx} from '../src/desktop_robot/studio/static/game/workshop/sfx.mjs';

test('wheel rubber vs metal core vs plastic plate differ in metalness/roughness', () => {
  const wheel = materialForPart('wheel');
  const core = materialForPart('core');
  const plate = materialForPart('plate');
  assert.ok(wheel.roughness > core.roughness);
  assert.ok(core.metalness > plate.metalness);
  assert.ok(plate.roughness > 0.3);
});

test('sfx respects mute and throttles collision repeats', () => {
  const log = [];
  const sfx = createSfx({
    muted: false,
    now: () => 1000,
    playTone: (ev) => log.push(ev),
  });
  sfx.play('collision');
  sfx.play('collision');
  assert.equal(log.filter((e) => e === 'collision').length, 1);
  sfx.setMuted(true);
  sfx.play('motor');
  assert.ok(!log.includes('motor'));
  sfx.setMuted(false);
  sfx.play('grasp');
  assert.ok(log.includes('grasp'));
});
