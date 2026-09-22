import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findPath, followPath} from '../src/desktop_robot/studio/static/game/pathfinding.mjs';
import {createMotionGate} from '../src/desktop_robot/studio/static/game/motionGate.mjs';

test('followPath walks every cell when move always succeeds', async () => {
  const path = findPath([1, 1], [4, 1], new Set(), 9);
  assert.equal(path.length, 3);
  const seen = [];
  let version = 1;
  const result = await followPath({
    path,
    version,
    getVersion: () => version,
    move: async (pos) => {
      seen.push(pos.join(','));
      return true;
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(seen, ['2,1', '3,1', '4,1']);
});

test('scene armMotion resolves only after finishMotion', async () => {
  const gate = createMotionGate();
  let done = false;
  const pending = gate.armMotion(false);
  pending.then(() => {
    done = true;
  });
  await Promise.resolve();
  assert.equal(done, false);
  assert.equal(gate.moving, true);
  gate.finishMotion();
  await pending;
  assert.equal(done, true);
  assert.equal(gate.moving, false);
});

test('armMotion alreadyThere resolves immediately without waiters', async () => {
  const gate = createMotionGate();
  await gate.armMotion(true);
  assert.equal(gate.moving, false);
  let late = false;
  gate.armMotion(false).then(() => {
    late = true;
  });
  assert.equal(late, false);
  gate.finishMotion();
  await Promise.resolve();
  assert.equal(late, true);
});

test('waitForMotion joins pending arm token', async () => {
  const gate = createMotionGate();
  const armed = gate.armMotion(false);
  const waited = gate.waitForMotion();
  let armedDone = false;
  let waitedDone = false;
  armed.then(() => {
    armedDone = true;
  });
  waited.then(() => {
    waitedDone = true;
  });
  await Promise.resolve();
  assert.equal(armedDone, false);
  assert.equal(waitedDone, false);
  gate.finishMotion();
  await Promise.all([armed, waited]);
  assert.equal(armedDone, true);
  assert.equal(waitedDone, true);
});
