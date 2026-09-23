import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findNavControl} from '../src/desktop_robot/studio/static/game/nav.mjs';
import {
  shouldSyncFromServer,
  blueprintHasTool,
  formatBuildStatus,
} from '../src/desktop_robot/studio/static/game/buildDraft.mjs';
import {buildQuadChassisArmTemplate} from '../src/desktop_robot/studio/static/game/editor/templates.mjs';
import {buildSimFromBlueprint} from '../src/desktop_robot/studio/static/game/simulation/body.mjs';

/** 最小 closest 模拟：祖先链上找 button/a[data-view] */
function el(tag, attrs = {}, parent = null) {
  const node = {
    tagName: tag.toUpperCase(),
    dataset: {...(attrs.dataset || {})},
    parentElement: parent,
    closest(sel) {
      let cur = this;
      while (cur) {
        const parts = sel.split(',').map((s) => s.trim());
        for (const part of parts) {
          if (part === 'button[data-view]' && cur.tagName === 'BUTTON' && cur.dataset.view) return cur;
          if (part === 'a[data-view]' && cur.tagName === 'A' && cur.dataset.view) return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    },
  };
  return node;
}

test('findNavControl ignores body data-view and only matches explicit controls', () => {
  const body = el('body', {dataset: {view: 'build'}});
  const save = el('button', {}, body);
  const goHome = el('button', {dataset: {view: 'home'}}, body);
  const goMissions = el('a', {dataset: {view: 'missions'}}, body);
  const navBuild = el('button', {dataset: {view: 'build'}}, body);

  assert.equal(findNavControl(save), null);
  assert.equal(findNavControl(body), null);
  assert.equal(findNavControl(goHome)?.dataset.view, 'home');
  assert.equal(findNavControl(goMissions)?.dataset.view, 'missions');
  assert.equal(findNavControl(navBuild)?.dataset.view, 'build');
});
test('dirty draft is not overwritten by silent server sync', () => {
  assert.equal(shouldSyncFromServer({dirty: true, force: false}), false);
  assert.equal(shouldSyncFromServer({dirty: true, force: true}), true);
  assert.equal(shouldSyncFromServer({dirty: false, force: false}), true);
});

test('quad template + part_defs exposes grasp tool in sim', () => {
  const bp = buildQuadChassisArmTemplate();
  assert.equal(bp.instances.length, 10);
  assert.equal(bp.connections.length, 9);
  assert.ok(bp.instances.some((i) => i.instance_id === 'gripper-1'));

  const partDefs = [
    {id: 'core', size_m: [0.12, 0.08, 0.12], mass_kg: 1, behaviors: []},
    {id: 'wheel', size_m: [0.04, 0.04, 0.02], mass_kg: 0.2, behaviors: ['roll']},
    {id: 'plate', size_m: [0.1, 0.02, 0.1], mass_kg: 0.3, behaviors: []},
    {id: 'beam', size_m: [0.02, 0.02, 0.12], mass_kg: 0.15, behaviors: []},
    {id: 'revolute_joint', size_m: [0.04, 0.04, 0.04], mass_kg: 0.1, behaviors: ['pivot']},
    {id: 'gripper', size_m: [0.05, 0.04, 0.06], mass_kg: 0.2, behaviors: ['grasp']},
  ];
  assert.equal(blueprintHasTool(bp, partDefs), true);
  const sim = buildSimFromBlueprint(bp, partDefs);
  const gripper = sim.links.find((l) => l.id === 'gripper-1');
  assert.ok(gripper);
  assert.ok(gripper.behaviors.includes('grasp'));
});

test('formatBuildStatus covers dirty saving failed', () => {
  assert.match(formatBuildStatus({name: '机架', instanceCount: 10, dirty: true}), /未保存/);
  assert.match(formatBuildStatus({saving: true, instanceCount: 3}), /保存中/);
  assert.match(formatBuildStatus({failed: true, instanceCount: 3}), /失败/);
  assert.match(formatBuildStatus({dirty: false, instanceCount: 10, name: '四轮'}), /已保存/);
});
