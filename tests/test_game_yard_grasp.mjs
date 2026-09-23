import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tryGrasp} from '../src/desktop_robot/studio/static/game/simulation/grasp.mjs';
import {createYardWorld} from '../src/desktop_robot/studio/static/game/simulation/world.mjs';

test('createYardWorld exposes narrow door ~0.25m and one practice block', () => {
  const world = createYardWorld();
  assert.ok(Math.abs(world.narrowDoor.width - 0.25) < 1e-6);
  assert.equal(world.blocks.length, 1);
  assert.ok(world.walls.length >= 4);
  assert.ok(world.spawn);
  const before = {...world.blocks[0]};
  world.blocks[0].x += 1;
  world.reset();
  assert.equal(world.blocks[0].x, before.x);
});

test('tryGrasp fails when tool is far and succeeds when near', () => {
  const sim = {reach: 0.4};
  const robot = {x: 0, z: 0, yaw: 0};
  const block = {x: 0, y: 0.04, z: 0.2, size: [0.08, 0.08, 0.08], mass: 0.3};

  const far = tryGrasp(sim, robot, {x: 0, y: 0.1, z: -1, yaw: 0}, block);
  assert.equal(far.success, false);
  assert.ok(far.reason.includes('远') || far.reason.includes('距离'));

  const near = tryGrasp(sim, robot, {x: 0, y: 0.1, z: 0.15, yaw: 0}, block);
  assert.equal(near.success, true);
  assert.ok(near.reason);
});
