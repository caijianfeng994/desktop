import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildQuadChassisArmTemplate} from '../src/desktop_robot/studio/static/game/editor/templates.mjs';

test('buildQuadChassisArmTemplate has core, 4 wheels, 2 joints, gripper', () => {
  const bp = buildQuadChassisArmTemplate();
  assert.equal(bp.root_instance_id, 'core-1');
  assert.equal(typeof bp.id, 'string');
  assert.ok(Array.isArray(bp.instances));
  assert.ok(Array.isArray(bp.connections));
  assert.deepEqual(bp.bindings, {
    drive: [],
    turn: [],
    lift: ['joint-1', 'joint-2'],
    extend: [],
    grasp: ['gripper-1'],
  });

  const count = (partId) => bp.instances.filter((i) => i.part_id === partId).length;
  assert.equal(count('core'), 1);
  assert.equal(count('wheel'), 4);
  assert.equal(count('revolute_joint'), 2);
  assert.equal(count('gripper'), 1);
  assert.equal(count('plate'), 1);
  assert.equal(count('beam'), 1);

  const revolute = bp.connections.filter((c) => c.joint === 'revolute');
  assert.equal(revolute.length, 2);

  const ids = bp.instances.map((i) => i.instance_id);
  assert.equal(new Set(ids).size, ids.length);
});
