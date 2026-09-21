import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findPath, followPath} from '../src/desktop_robot/studio/static/game/pathfinding.mjs';

test('finds open path excluding start', () => {
  const path = findPath([1, 1], [3, 1], new Set(), 9);
  assert.deepEqual(path, [[2, 1], [3, 1]]);
});

test('routes around blocked cells', () => {
  const blocked = new Set(['2,1']);
  const path = findPath([1, 1], [3, 1], blocked, 9);
  assert.ok(path);
  assert.ok(path.every(p => `${p[0]},${p[1]}` !== '2,1'));
  assert.deepEqual(path.at(-1), [3, 1]);
});

test('returns null when unreachable', () => {
  const blocked = new Set(['1,2', '2,1', '0,1', '1,0']);
  assert.equal(findPath([1, 1], [3, 3], blocked, 9), null);
});

test('followPath cancels when version changes mid-route', async () => {
  let version = 1;
  const visited = [];
  const result = await followPath({
    path: [[1, 0], [2, 0], [3, 0]],
    version: 1,
    getVersion: () => version,
    move: async (pos) => {
      visited.push(pos);
      if (visited.length === 1) version = 2;
      return true;
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cancelled');
  assert.deepEqual(visited, [[1, 0]]);
});

test('followPath returns move_failed when move returns false', async () => {
  const result = await followPath({
    path: [[1, 0], [2, 0]],
    version: 1,
    getVersion: () => 1,
    move: async () => false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'move_failed');
});

test('followPath completes full path when version stable', async () => {
  const visited = [];
  const result = await followPath({
    path: [[1, 0], [2, 0]],
    version: 1,
    getVersion: () => 1,
    move: async (pos) => {
      visited.push(pos);
      return true;
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(visited, [[1, 0], [2, 0]]);
});
