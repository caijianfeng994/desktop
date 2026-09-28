import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  getTheme,
  listThemes,
  normalizeThemeId,
  themeForQuality,
  THEME_IDS,
} from '../src/desktop_robot/studio/static/game/workshop/visualTheme.mjs';
import {materialForPart} from '../src/desktop_robot/studio/static/game/workshop/materials.mjs';

test('normalizeThemeId falls back to warm', () => {
  assert.equal(normalizeThemeId('mecha'), 'mecha');
  assert.equal(normalizeThemeId('WASTELAND'), 'wasteland');
  assert.equal(normalizeThemeId('nope'), 'warm');
  assert.equal(normalizeThemeId(null), 'warm');
});

test('listThemes covers A/B/C plus warm', () => {
  const ids = listThemes().map((t) => t.id);
  assert.deepEqual(ids, [...THEME_IDS]);
});

test('theme materials differentiate mecha vs wasteland vs future vs warm', () => {
  const warm = materialForPart('beam', 'warm');
  const mecha = materialForPart('beam', 'mecha');
  const waste = materialForPart('beam', 'wasteland');
  const future = materialForPart('beam', 'future');
  assert.notEqual(warm.color, mecha.color);
  assert.notEqual(mecha.color, waste.color);
  assert.notEqual(waste.metalness, future.metalness);
  assert.ok(mecha.metalness >= warm.metalness);
  assert.ok(waste.roughness > mecha.roughness);
});

test('mecha accent has emissive glow', () => {
  const core = materialForPart('core', 'mecha');
  assert.ok((core.emissiveIntensity || 0) > 0.2);
  const warm = materialForPart('core', 'warm');
  assert.ok((warm.emissiveIntensity || 0) < 0.05);
});

test('themeForQuality weakens fog and emissive on low', () => {
  const full = getTheme('mecha');
  const low = themeForQuality(full, 'low');
  assert.ok(low.scene.fog.far > full.scene.fog.far);
  assert.ok(low.materials.accent.emissiveIntensity <= 0.08);
});
