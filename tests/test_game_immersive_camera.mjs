import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  standardViewOrbit,
  frameRadiusFromBounds,
  followCameraOffset,
  clipCameraAgainstWalls,
} from '../src/desktop_robot/studio/static/game/workshop/cameraRig.mjs';

test('standard views map to distinct orbit angles and elevations', () => {
  const front = standardViewOrbit('front');
  const side = standardViewOrbit('side');
  const top = standardViewOrbit('top');
  assert.notEqual(front.angle, side.angle);
  assert.ok(top.elevation > front.elevation);
});

test('frameRadius grows with span and stays clamped', () => {
  assert.ok(frameRadiusFromBounds({span: 0.1}) >= 1.5);
  assert.ok(frameRadiusFromBounds({span: 2}) > frameRadiusFromBounds({span: 0.2}));
  assert.ok(frameRadiusFromBounds({span: 99}) <= 8);
});

test('follow camera sits behind yaw facing forward', () => {
  const p = followCameraOffset({yaw: 0, radius: 4, height: 2});
  assert.ok(p.z < 0);
  assert.ok(Math.abs(p.x) < 1e-6);
});

test('clipCameraAgainstWalls pulls camera in front of wall AABB', () => {
  const look = {x: 0, y: 1, z: 0};
  const cam = {x: 0, y: 1, z: 5};
  const walls = [{minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: 2, maxZ: 2.2}];
  const out = clipCameraAgainstWalls(look, cam, walls, {pad: 0.1, minDist: 0.2});
  assert.equal(out.clipped, true);
  assert.ok(out.z < 2.2);
  assert.ok(out.z > look.z);
});

test('clipCameraAgainstWalls leaves clear line of sight alone', () => {
  const look = {x: 0, y: 1, z: 0};
  const cam = {x: 0, y: 1, z: 3};
  const walls = [{minX: 10, maxX: 11, minY: 0, maxY: 2, minZ: 0, maxZ: 1}];
  const out = clipCameraAgainstWalls(look, cam, walls);
  assert.equal(out.clipped, false);
  assert.equal(out.z, 3);
});
