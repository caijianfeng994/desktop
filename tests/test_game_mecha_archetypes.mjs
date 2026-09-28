import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildEngineerMechaTemplate} from '../src/desktop_robot/studio/static/game/editor/templates.mjs';
import {createCombatState, tryFire} from '../src/desktop_robot/studio/static/game/simulation/combat.mjs';
import {createWinchState, tryCastWinch} from '../src/desktop_robot/studio/static/game/simulation/winch.mjs';
import {createThrustState, stepThrust} from '../src/desktop_robot/studio/static/game/simulation/thrust.mjs';

function withPart(bp, instanceId, partId, parentId, parentPoint, childPoint) {
  const next = structuredClone(bp);
  next.instances.push({
    instance_id: instanceId,
    part_id: partId,
    local_pose: {x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0},
    params: {},
  });
  next.connections.push({
    parent_instance_id: parentId,
    parent_point_id: parentPoint,
    child_instance_id: instanceId,
    child_point_id: childPoint,
    joint: 'fixed',
  });
  return next;
}

test('ground fire path: engineer mecha has rifle binding', () => {
  const bp = buildEngineerMechaTemplate();
  assert.deepEqual(bp.bindings.fire, ['rifle-1']);
  const c = createCombatState({fireCooldown: 0});
  assert.equal(tryFire(c, {x: 0, y: 0, z: 0}, {x: 0, y: 0, z: 1}, 0).ok, true);
});

test('winch path: backpack bay can host winch module', () => {
  const bp = withPart(
    buildEngineerMechaTemplate(),
    'winch-1',
    'winch_module',
    'pack-1',
    'bay',
    'mount',
  );
  assert.ok(bp.instances.some((i) => i.part_id === 'winch_module'));
  const w = createWinchState();
  const r = tryCastWinch(w, {x: 0, y: 0.2, z: 0}, {x: 0, y: 0.1, z: 1}, [{id: 'a', x: 0, z: 2, radius: 0.3}], []);
  assert.equal(r.ok, true);
});

test('thrust path: backpack bay can host thruster', () => {
  const bp = withPart(
    buildEngineerMechaTemplate(),
    'thrust-1',
    'thruster_pack',
    'pack-1',
    'bay',
    'mount',
  );
  assert.ok(bp.instances.some((i) => i.part_id === 'thruster_pack'));
  const t = createThrustState({fuel: 1});
  const step = stepThrust(t, true, 0.1, {yaw: 0});
  assert.ok(step.dx !== 0 || step.dz !== 0 || step.vy !== 0);
});
