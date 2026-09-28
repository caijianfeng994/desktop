import {test} from 'node:test';
import assert from 'node:assert/strict';

/** 与 placePartVisual 同位姿公式（避免在 Node 里加载 three） */
function placePose(pose, scale, halfH) {
  const s = Number(scale) > 0 ? Number(scale) : 1;
  return {
    scale: s,
    x: pose.x * s,
    y: pose.y * s + halfH * s,
    z: pose.z * s,
  };
}

test('visual world SCALE keeps geometry and pose in sync', () => {
  const p = placePose({x: 0.1, y: 0, z: 0}, 12, 0.04);
  assert.equal(p.scale, 12);
  assert.ok(Math.abs(p.x - 1.2) < 1e-9);
  assert.ok(Math.abs(p.y - 0.48) < 1e-9);
  // 未缩放时网格 0.08m，缩放后世界高度约 0.96 —— 与位姿同量级
  const worldH = 0.08 * p.scale;
  assert.ok(worldH > 0.5);
  assert.ok(worldH < p.x * 2);
});
