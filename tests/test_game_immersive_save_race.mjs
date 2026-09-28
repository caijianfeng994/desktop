import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shouldApplySaveResponse} from '../src/desktop_robot/studio/static/game/buildDraft.mjs';

test('save response must not clobber draft edited during in-flight save', () => {
  assert.equal(shouldApplySaveResponse({dirtyDuringSave: true}), false);
  assert.equal(shouldApplySaveResponse({dirtyDuringSave: false}), true);
});
