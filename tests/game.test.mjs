import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/js/game.js';

test('a launch spends one original animal and repeated fire cannot spend another', () => {
  const g=new Game(1);
  assert.equal(g.state,'aiming'); assert.equal(g.targets.length,2);
  assert.equal(g.fire(),true); assert.equal(g.ammoRemaining,2);
  assert.equal(g.fire(),false); assert.equal(g.ammoRemaining,2);
  assert.equal(g.projectile.animalId,1); assert.equal(g.projectile.radius,10);
});
test('damage uses normal contact speed and each destroyed target scores once', () => {
  const g=new Game(1); const target=g.targets[0];
  g.applyImpact(target,50); assert.equal(target.damage,0);
  g.applyImpact(target,201); assert.equal(g.targets.length,1); assert.equal(g.score,40);
  g.applyImpact(target,250); assert.equal(g.score,40);
});
test('the final target leads to victory, spare-animal bonus and a durable result', () => {
  const g=new Game(1); g.fire();
  for(const target of [...g.targets]) g.applyImpact(target,220);
  for(let i=0;i<300 && g.state!=='won';i++)g.update();
  assert.equal(g.state,'won'); assert.ok(g.score>=100);
  assert.equal(g.result.bonus,20); assert.ok(g.result.stars>=1);
});
test('reset restores original bodies, ammo and damage after playing', () => {
  const g=new Game(1);g.fire();for(let i=0;i<60;i++)g.update();g.load(1);
  assert.equal(g.state,'aiming');assert.equal(g.ammoRemaining,3);assert.equal(g.score,0);
  assert.deepEqual(g.targets.map(b=>b.damage),[0,0]);
});
test('a paused game does not change simulation or consume a shot', () => {
  const g=new Game(1);g.paused=true;assert.equal(g.fire(),false);g.update();assert.equal(g.time,0);
  g.paused=false;g.fire();g.update();const x=g.projectile.x;g.paused=true;g.update();assert.equal(g.projectile.x,x);
});
test('a boss stage starts with the original incoming shot and three launcher lives', () => {
  const g=new Game(10);assert.equal(g.state,'boss');assert.equal(g.launcherLives,3);assert.ok(g.bossProjectile);
  assert.equal(g.fire(),false);
  for(let i=0;i<150;i++)g.update();
  assert.equal(g.state,'aiming');assert.ok(g.launcherLives>=2);
});
