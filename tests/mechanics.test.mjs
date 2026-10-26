import test from 'node:test';
import assert from 'node:assert/strict';
import { launchState, specialAbility, trajectory, coneBlastEffect } from '../dist/js/mechanics.js';

const near = (a,b) => assert.ok(Math.abs(a-b)<1e-5, `${a} != ${b}`);
test('source launch formula preserves default pull, offset, velocity and step angle', () => {
  const s = launchState({x:-800,y:-100}, 0, -10);
  near(s.x,-800); near(s.y,-108); near(s.vx,220); near(s.vy,0);
  const t = launchState({x:0,y:0}, -10, -20);
  near(t.angle,-0.7853982); near(Math.hypot(t.vx,t.vy),440);
  near(t.x, -20*Math.cos(t.angle)+8*Math.sin(t.angle));
  near(t.y, -20*Math.sin(t.angle)-8*Math.cos(t.angle));
});
test('the two upgraded stages use multiplier 12, with bounded power and angle', () => {
  const t=launchState({x:0,y:0},-99,-99,12);
  near(t.angle,-15*.07853982); near(Math.hypot(t.vx,t.vy),480);
});
test('fractional aim and power produce distinct angles and launch speeds', () => {
  const s=launchState({x:0,y:0},-6.25,-18.75);
  near(s.angle,-.490873875);
  near(s.pull,-37.5);
  near(Math.hypot(s.vx,s.vy),412.5);
  const finer=launchState({x:0,y:0},-6.26,-18.76);
  assert.ok(finer.angle<s.angle);
  assert.ok(Math.hypot(finer.vx,finer.vy)>Math.hypot(s.vx,s.vy));
});
test('turtle accelerates along its current heading; rabbit preserves speed toward a bear', () => {
  const a=specialAbility(2,{x:0,y:0,vx:3,vy:4},[]);
  near(a.velocity.vx,360); near(a.velocity.vy,480);
  const b=specialAbility(4,{x:0,y:0,vx:3,vy:4},[{x:0,y:-20},{x:100,y:0}]);
  near(b.velocity.vx,0); near(b.velocity.vy,-5);
});
test('squirrel and hedgehog preserve the source projectile count and impulses', () => {
  const s=specialAbility(0,{x:7,y:-50,vx:100,vy:20},[]);
  assert.equal(s.projectiles.length,1); near(s.projectiles[0].y,-33);
  assert.equal(s.projectiles[0].sensor,true);
  near(s.projectiles[0].vy,120); near(s.velocity.vy,-20);
  const h=specialAbility(3,{x:7,y:-50,vx:100,vy:20},[]);
  assert.equal(h.projectiles.length,10); assert.equal(h.frame,4);
  assert.ok(h.projectiles.every(p=>p.sensor && p.canRotate===false));
  near(h.projectiles[0].vx,100+140*Math.cos(3.2986724));
  near(h.projectiles[0].vy,20-140*Math.sin(3.2986724));
  assert.equal(specialAbility(1,{x:0,y:0,vx:100,vy:20},[]),null);
});
test('rabbit uses a positive spin when its target is directly above or below', () => {
  const a=specialAbility(4,{x:0,y:0,vx:30,vy:40},[{x:0,y:100}]);
  near(a.angularVelocity,10*Math.PI);
});
test('squirrel blast pushes to 200 units and damages only strictly inside 100', () => {
  const origin={x:0,y:0};
  const a=coneBlastEffect(origin,{x:50,y:0,material:4});
  near(a.dvx,110);near(a.dvy,0);near(a.damageSpeed,101);
  const b=coneBlastEffect(origin,{x:100,y:0,material:4});
  near(b.dvx,55);assert.equal(b.damageSpeed,0);
  const c=coneBlastEffect(origin,{x:200,y:0,material:0});
  near(c.dvx,27.5);assert.equal(c.damageSpeed,0);
  const d=coneBlastEffect(origin,{x:201,y:0,material:0});
  assert.deepEqual(d,{dvx:0,dvy:0,damageSpeed:0});
  const e=coneBlastEffect(origin,{x:50,y:0,material:1},{enhanced:true});
  near(e.damageSpeed,188.5);
  const fixed=coneBlastEffect(origin,{x:50,y:0,material:0,canTranslate:false,breakable:false});
  assert.deepEqual(fixed,{dvx:0,dvy:0,damageSpeed:0});
});
test('aim guide uses the same semi-implicit 0.05 simulation step', () => {
  const points=trajectory({x:0,y:-100,vx:100,vy:-20},3);
  near(points[0].x,5); near(points[0].y,-100.5);
  near(points[2].x,15); near(points[2].y,-100);
});
