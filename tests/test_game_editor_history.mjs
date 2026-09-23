import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHistory} from '../src/desktop_robot/studio/static/game/editor/commandHistory.mjs';
import {attachPart, detachSubtree, rotateInstance} from '../src/desktop_robot/studio/static/game/editor/assemble.mjs';
import {buildQuadChassisArmTemplate} from '../src/desktop_robot/studio/static/game/editor/templates.mjs';

function bareCore() {
  return {
    id: 'bp-1',
    name: '测试',
    root_instance_id: 'core-1',
    instances: [
      {
        instance_id: 'core-1',
        part_id: 'core',
        local_pose: {x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0},
        params: {},
      },
    ],
    connections: [],
    bindings: {},
  };
}

test('undo/redo restores instances after attach and detach', () => {
  const history = createHistory(50);
  let bp = bareCore();
  history.push(bp);

  bp = attachPart(bp, {
    partId: 'display',
    parentInstanceId: 'core-1',
    parentPointId: 'mount_front',
    childPointId: 'mount',
    instanceId: 'display-1',
  });
  history.push(bp);
  assert.equal(bp.instances.length, 2);
  assert.ok(history.canUndo);
  assert.equal(history.canRedo, false);

  const undone = history.undo();
  assert.equal(undone.instances.length, 1);
  assert.equal(undone.instances[0].instance_id, 'core-1');
  assert.ok(history.canRedo);

  const redone = history.redo();
  assert.equal(redone.instances.length, 2);
  assert.equal(redone.instances.find((i) => i.instance_id === 'display-1').part_id, 'display');

  bp = detachSubtree(redone, 'display-1');
  history.push(bp);
  assert.equal(bp.instances.length, 1);
  assert.equal(bp.connections.length, 0);

  const back = history.undo();
  assert.equal(back.instances.length, 2);
  assert.equal(back.connections.length, 1);
});

test('attachPart sets revolute for revolute_joint partId', () => {
  let bp = bareCore();
  bp = attachPart(bp, {
    partId: 'revolute_joint',
    parentInstanceId: 'core-1',
    parentPointId: 'mount_front',
    childPointId: 'in',
    instanceId: 'joint-1',
  });
  assert.equal(bp.connections[0].joint, 'revolute');

  bp = attachPart(bp, {
    partId: 'beam',
    parentInstanceId: 'joint-1',
    parentPointId: 'out',
    childPointId: 'end_b',
    instanceId: 'beam-1',
    joint: 'fixed',
  });
  assert.equal(bp.connections.find((c) => c.child_instance_id === 'beam-1').joint, 'fixed');
});

test('rotateInstance updates local_pose.ry', () => {
  let bp = buildQuadChassisArmTemplate();
  const before = bp.instances.find((i) => i.instance_id === 'beam-1').local_pose.ry;
  bp = rotateInstance(bp, 'beam-1', 0.5);
  const after = bp.instances.find((i) => i.instance_id === 'beam-1').local_pose.ry;
  assert.ok(Math.abs(after - (before + 0.5)) < 1e-9);
});
