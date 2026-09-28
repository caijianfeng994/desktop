import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createYardWorld} from '../src/desktop_robot/studio/static/game/simulation/world.mjs';
import {heightAt, tipFactorAt, sampleGroundY} from '../src/desktop_robot/studio/static/game/simulation/terrain.mjs';

test('ramp peak height matches ramp.maxY and outside ramp is flat', () => {
  const world = createYardWorld();
  const r = world.ramp;
  const midX = (r.minX + r.maxX) / 2;
  const topZ = r.maxZ;
  const bottomZ = r.minZ;
  assert.ok(Math.abs(heightAt(world, midX, topZ) - r.maxY) < 1e-6);
  assert.ok(heightAt(world, midX, bottomZ) < 0.02);
  assert.equal(heightAt(world, 0, -1.2), 0);
  assert.equal(sampleGroundY(world, midX, topZ), heightAt(world, midX, topZ));
});

test('tipFactor is reduced on ramp slope and ~1 on flat ground', () => {
  const world = createYardWorld();
  const r = world.ramp;
  const midX = (r.minX + r.maxX) / 2;
  const midZ = (r.minZ + r.maxZ) / 2;
  assert.ok(tipFactorAt(world, 0, -1.2) >= 0.99);
  assert.ok(tipFactorAt(world, midX, midZ) < 0.95);
});
