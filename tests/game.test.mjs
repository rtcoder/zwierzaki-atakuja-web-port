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
test('fine aiming survives into the actual projectile without snapping to old steps', () => {
  const g=new Game(1);
  g.aim(-6.25,-18.75);
  assert.equal(g.aimStep,-6.25);
  assert.equal(g.powerIndex,-18.75);
  assert.equal(g.fire(),true);
  assert.ok(Math.abs(g.projectile.angle+.490873875)<1e-6);
  assert.ok(Math.abs(Math.hypot(g.projectile.vx,g.projectile.vy)-412.5)<1e-6);
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

for(const [lives,state] of [[3,'aiming'],[1,'lost']]) {
  test(`a cannon impact finishes animating in ${state} without another launch`, () => {
    const g=new Game(30);
    g.launcherLives=lives;
    Object.assign(g.bossProjectile,{x:g.level.launcher.x,y:g.level.launcher.y,vx:0,vy:0,age:.5});
    g.update();
    assert.equal(g.state,state);
    assert.equal(g.launcherLives,lives-1);
    assert.equal(g.effects.length,1);
    const effect=g.effects[0];
    assert.equal(effect.type,'explosion');
    const bodies=structuredClone(g.world.bodies),time=g.time,ammo=g.ammoRemaining;
    g.paused=true;g.update(.2);
    assert.equal(effect.age,0,'explicit pause still freezes the effect');
    g.paused=false;g.update(.2);
    assert.equal(effect.age,.2,'the effect advances while waiting for input');
    g.update(.5);
    assert.equal(g.effects.length,0,'the completed effect is removed');
    assert.equal(g.state,state);
    assert.equal(g.ammoRemaining,ammo);
    assert.equal(g.shotsFired,0);
    assert.equal(g.time,time);
    assert.deepEqual(g.world.bodies,bodies,'effect updates must not resume physics');
  });
}

test('remaining destruction effects finish after victory without changing the result', () => {
  const g=new Game(1);
  for(const target of [...g.targets])g.destroy(target);
  g.finishShot();
  assert.equal(g.state,'won');
  assert.ok(g.effects.length>0);
  const result={...g.result},score=g.score;
  g.update(1);
  assert.equal(g.effects.length,0);
  assert.equal(g.state,'won');
  assert.equal(g.score,score);
  assert.deepEqual(g.result,result);
});
