import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  applyHit,
  createCombatState,
  stepProjectiles,
  tryFire,
} from '../src/desktop_robot/studio/static/game/simulation/combat.mjs';
import {applyEnemyHit, createEnemy, stepEnemy} from '../src/desktop_robot/studio/static/game/simulation/enemies.mjs';

test('first shot is immediate and overheating stays latched until recovery', () => {
  const c = createCombatState({heatPerShot:100, coolPerSec:10});
  const origin={x:0,y:0,z:0}, dir={x:0,y:0,z:1};
  assert.equal(tryFire(c,origin,dir,0).ok,true);
  stepProjectiles(c,1);
  assert.equal(tryFire(c,origin,dir,1).ok,false);
  stepProjectiles(c,4);
  assert.equal(tryFire(c,origin,dir,5).ok,true);
});

test('fast projectile hits nearest crossed target regardless of array order', () => {
  const c=createCombatState({muzzleSpeed:100,range:10});
  tryFire(c,{x:0,y:0,z:0},{x:0,y:0,z:1},0);
  const result=stepProjectiles(c,0.05,[
    {id:'far',x:0,y:0,z:4,radius:0.1},
    {id:'near',x:0,y:0,z:2,radius:0.1},
  ]);
  assert.equal(result.hits[0]?.targetId,'near');
});

test('projectile cannot hit beyond its remaining range during a long frame', () => {
  const c=createCombatState({muzzleSpeed:100,range:1});
  tryFire(c,{x:0,y:0,z:0},{x:0,y:0,z:1},0);
  assert.equal(stepProjectiles(c,1,[{id:'far',x:0,y:0,z:5,radius:0.1}]).hits.length,0);
  assert.equal(c.projectiles.length,0);
});

test('tryFire consumes ammo and raises heat', () => {
  const c = createCombatState({maxAmmo: 5, heatPerShot: 20, maxHeat: 100, fireCooldown: 0});
  const r = tryFire(c, {x: 0, y: 0.2, z: 0}, {x: 0, y: 0, z: 1}, 1);
  assert.equal(r.ok, true);
  assert.equal(c.ammo, 4);
  assert.ok(c.heat >= 20);
  assert.equal(c.projectiles.length, 1);
});

test('overheat blocks fire until cooled', () => {
  const c = createCombatState({
    maxAmmo: 10,
    heatPerShot: 60,
    maxHeat: 100,
    coolPerSec: 40,
    fireCooldown: 0,
  });
  assert.equal(tryFire(c, {x: 0, y: 0, z: 0}, {x: 0, y: 0, z: 1}, 0).ok, true);
  assert.equal(tryFire(c, {x: 0, y: 0, z: 0}, {x: 0, y: 0, z: 1}, 1).ok, true);
  assert.equal(tryFire(c, {x: 0, y: 0, z: 0}, {x: 0, y: 0, z: 1}, 2).ok, false);
  assert.equal(c.overheated, true);
  stepProjectiles(c, 3, []);
  assert.ok(c.heat < c.maxHeat * 0.6);
  assert.equal(c.overheated, false);
});

test('projectile hits target and applyHit destroys', () => {
  const c = createCombatState({muzzleSpeed: 5, damage: 40, fireCooldown: 0, heatPerShot: 1, range: 3});
  tryFire(c, {x: 0, y: 0.2, z: 0}, {x: 0, y: 0, z: 1}, 0);
  const target = {id: 'e1', x: 0, y: 0.2, z: 0.2, radius: 0.2, hp: 50};
  const {hits} = stepProjectiles(c, 0.05, [target]);
  assert.ok(hits.length >= 1, `expected hit, got ${hits.length}, projectiles=${c.projectiles.length}`);
  const res = applyHit(target, hits[0].damage);
  assert.equal(res.destroyed, false);
  applyHit(target, 40);
  assert.equal(target.hp, 0);
});

test('enemy warns then fires toward player', () => {
  const e = createEnemy({
    id: 'patrol-1',
    x: 0,
    z: 0,
    path: [{x: 0, z: 0}],
    fireRange: 3,
    warnTime: 0.2,
    fireCooldown: 0.1,
  });
  const player = {x: 0, z: 1.5};
  stepEnemy(e, 0.1, player);
  assert.equal(e.state, 'warn');
  let shots = [];
  for (let i = 0; i < 5; i++) {
    shots = shots.concat(stepEnemy(e, 0.15, player).shots);
  }
  assert.ok(shots.length >= 1);
  assert.equal(applyEnemyHit(e, 999).destroyed, true);
});
