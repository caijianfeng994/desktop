/**
 * 抽屉挑战三种机制（脚本化）：grasp / push / drag。
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tryDrag, tryGrasp, tryPush} from '../src/desktop_robot/studio/static/game/simulation/grasp.mjs';
import {
  DRAWER_BLOCK_ID,
  DRAWER_SLOT,
  RECEIVE_ZONE,
  createYardWorld,
} from '../src/desktop_robot/studio/static/game/simulation/world.mjs';

function drawerBlock(world) {
  return world.blocks.find((b) => b.id === DRAWER_BLOCK_ID);
}

test('challenge layout exposes drawer slot, receive zone, and drawer-cube', () => {
  const world = createYardWorld();
  world.setChallengeMode(true);
  assert.equal(world.challengeMode, true);
  assert.ok(world.drawerSlot);
  assert.ok(world.receiveZone);
  assert.equal(world.drawerSlot.minX, DRAWER_SLOT.minX);
  assert.equal(world.receiveZone.minZ, RECEIVE_ZONE.minZ);
  const block = drawerBlock(world);
  assert.ok(block);
  assert.equal(block.id, DRAWER_BLOCK_ID);
  assert.ok(block.x >= DRAWER_SLOT.minX && block.x <= DRAWER_SLOT.maxX);
  assert.ok(block.z >= DRAWER_SLOT.minZ && block.z <= DRAWER_SLOT.maxZ);
});

test('grasp path: tryGrasp succeeds when tool at block', () => {
  const world = createYardWorld();
  world.setChallengeMode(true);
  const block = drawerBlock(world);
  const sim = {reach: 0.5};
  const robot = {x: block.x, z: block.z - 0.2, yaw: 0};
  const tool = {x: block.x, y: block.y, z: block.z - 0.05, yaw: 0};
  const result = tryGrasp(sim, robot, tool, block);
  assert.equal(result.success, true, result.reason);
});

test('push path: tryPush moves block toward receive', () => {
  const world = createYardWorld();
  world.setChallengeMode(true);
  const block = drawerBlock(world);
  const receiveCenterZ = (RECEIVE_ZONE.minZ + RECEIVE_ZONE.maxZ) / 2;
  // 面向接收区（-Z）：yaw=π → sin=0, cos=-1
  const yaw = Math.PI;
  const sim = {reach: 0.4};
  const tool = {x: block.x, y: block.y, z: block.z + 0.08, yaw};
  const robot = {x: block.x, z: block.z + 0.2, yaw};
  const before = {x: block.x, z: block.z};
  const result = tryPush(sim, robot, tool, block, 0.12);
  assert.equal(result.success, true, result.reason);
  block.x += result.dx || 0;
  block.z += result.dz || 0;
  const closerToReceive =
    Math.abs(block.z - receiveCenterZ) < Math.abs(before.z - receiveCenterZ);
  assert.ok(closerToReceive, `z ${before.z} → ${block.z}, receive ${receiveCenterZ}`);
});

test('drag path: tryDrag attaches when hook near block', () => {
  const world = createYardWorld();
  world.setChallengeMode(true);
  const block = drawerBlock(world);
  const sim = {reach: 0.4};
  const robot = {x: block.x, z: block.z - 0.15, yaw: 0};
  const tool = {x: block.x, y: block.y, z: block.z - 0.08, yaw: 0};
  const result = tryDrag(sim, robot, tool, block);
  assert.equal(result.success, true, result.reason);
  assert.ok(/钩|拖/.test(result.reason));
});
