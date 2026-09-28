import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hangarMetrics, formatHangarMetricsHtml} from '../src/desktop_robot/studio/static/game/editor/hangarMetrics.mjs';
import {buildQuadChassisArmTemplate} from '../src/desktop_robot/studio/static/game/editor/templates.mjs';
import {contrastPartDefs} from '../src/desktop_robot/studio/static/game/editor/contrastBlueprints.mjs';

test('hangarMetrics empty blueprint', () => {
  const m = hangarMetrics({name: '空', instances: []}, []);
  assert.equal(m.parts, 0);
  assert.match(m.loadHint, /装上零件/);
});

test('hangarMetrics reports mass reach width for quad template', () => {
  // 模板零件 defs 用 contrast 子集不够；用空 defs 走默认尺寸仍能出 reach
  const bp = buildQuadChassisArmTemplate();
  const defs = contrastPartDefs();
  // 补充 plate
  defs.push({
    id: 'plate',
    size_m: [0.12, 0.02, 0.12],
    mass_kg: 0.12,
    behaviors: [],
    connection_points: [
      {id: 'face_a', pose: {x: 0, y: 0.01, z: 0}, kinds: ['structure']},
      {id: 'face_c', pose: {x: 0, y: 0, z: 0.06}, kinds: ['structure']},
      {id: 'face_d', pose: {x: 0, y: 0, z: -0.06}, kinds: ['structure']},
    ],
  });
  const m = hangarMetrics(bp, defs);
  assert.ok(m.parts >= 8);
  assert.ok(m.mass > 0.5);
  assert.ok(m.reach > 0.1);
  assert.ok(formatHangarMetricsHtml(m).includes('质量'));
});
