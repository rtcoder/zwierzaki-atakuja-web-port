import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPACT_THRESHOLDS, DAMAGE_TO_DESTROY, impactDamage, scoreForBody,
  unusedAmmoBonus, medalForScore, shouldEndSettling, bossShot, bossLauncherHit,
  materialColors } from '../dist/js/rules.js';
import { LEVELS } from '../dist/js/levels.js';

test('damage uses strict speed thresholds and truncates each individual hit', () => {
  assert.deepEqual(IMPACT_THRESHOLDS, [50, 100, 150, 200, 50, 1000]);
  assert.equal(DAMAGE_TO_DESTROY, 4);
  for (const [material, threshold] of IMPACT_THRESHOLDS.entries()) {
    assert.equal(impactDamage(material, threshold), 0);
    assert.equal(impactDamage(material, threshold + 1), 1);
    assert.equal(impactDamage(material, -(threshold + 1)), 1);
    assert.equal(impactDamage(material, 1.99 * threshold), 1);
    assert.equal(impactDamage(material, 2 * threshold), 2);
    assert.equal(impactDamage(material, 4 * threshold), 4);
  }
  assert.equal(impactDamage(4, 99, impactDamage(4, 99)), 2);
  assert.equal(impactDamage(4, 0, 2, true), 3);
  assert.equal(impactDamage(4, 0, 4), 5);
});

test('score belongs to destroyed primitives, with no points for the animal', () => {
  assert.deepEqual([0, 1, 2, 3, 5].map(material => scoreForBody({material})), [10, 15, 20, 25, 0]);
  assert.equal(scoreForBody({material:4, isTarget:true, targetSize:'big'}), 40);
  assert.equal(scoreForBody({material:4, isTarget:true, targetSize:'small'}), 30);
  assert.equal(scoreForBody({kind:'compound', material:0}), 0);
  assert.equal(scoreForBody({kind:'ground', material:0}), 0);
  assert.equal(scoreForBody({kind:'box', material:0, breakable:false}), 0);
  assert.equal(scoreForBody({kind:'box', material:0, plainStaticPlatform:true}), 0);
});

test('destruction pool matches all 50 original level factories', () => {
  for (const level of LEVELS) {
    const bodies=[...level.bodies,...level.compounds.flatMap(body=>body.children)];
    assert.equal(bodies.reduce((score,body)=>score+scoreForBody(body),0),level.sourceMaxPoints,`Level ${level.id}`);
  }
});

test('unused ammunition preserves each animal value without including the spent shot', () => {
  assert.deepEqual([0,1,2,3,4].map(id => unusedAmmoBonus([id])), [40,10,20,40,20]);
  assert.equal(unusedAmmoBonus([1,1]), 20);
  assert.equal(unusedAmmoBonus([]), 0);
});

test('medals match the original strict integer percentage tests', () => {
  assert.equal(medalForScore(70,100), 3);
  assert.equal(medalForScore(71,100), 2);
  assert.equal(medalForScore(85,100), 2);
  assert.equal(medalForScore(86,100), 1);
  assert.equal(medalForScore(93,110), 2);
  assert.equal(medalForScore(94,110), 1);
});

test('settling stops after one stable second or original four/ten second gates', () => {
  const base={elapsedMs:1000,stillMs:0,debrisCount:0,allBodiesSleeping:false,targetsRemaining:1,ammoCountIncludingCurrent:1};
  assert.equal(shouldEndSettling(base),false);
  assert.equal(shouldEndSettling({...base,stillMs:1000}),true);
  assert.equal(shouldEndSettling({...base,elapsedMs:4000,allBodiesSleeping:true}),false);
  assert.equal(shouldEndSettling({...base,elapsedMs:4001,allBodiesSleeping:true}),true);
  assert.equal(shouldEndSettling({...base,elapsedMs:4001,allBodiesSleeping:true,debrisCount:1}),false);
  assert.equal(shouldEndSettling({...base,elapsedMs:4001,targetsRemaining:0}),true);
  assert.equal(shouldEndSettling({...base,elapsedMs:4001,ammoCountIncludingCurrent:0}),true);
  assert.equal(shouldEndSettling({...base,elapsedMs:10000}),false);
  assert.equal(shouldEndSettling({...base,elapsedMs:10001}),true);
});

test('boss fires one shot backwards along the live barrel axis with original speed range', () => {
  const barrel={x:100,y:-100,angle:0};
  assert.deepEqual(bossShot(10,barrel,30,()=>0),{x:70,y:-100,vx:-330,vy:-0,speed:330});
  assert.equal(bossShot(10,barrel,30,()=>0.9999).speed,409);
  assert.equal(bossShot(20,barrel,30,()=>0).speed,340);
  assert.equal(bossShot(30,barrel,30,()=>0).speed,380);
  assert.equal(bossShot(40,barrel,30,()=>0).speed,280);
  assert.equal(bossShot(50,barrel,30,()=>0).speed,255);
  assert.equal(bossLauncherHit({x:49,y:0},{x:0,y:0}),true);
  assert.equal(bossLauncherHit({x:50,y:0},{x:0,y:0}),false);
});

test('material palette keeps native colors and Java integer per-body shade math', () => {
  assert.deepEqual(materialColors(1,1,1,false),['#666666','#888888']);
  assert.deepEqual(materialColors(1,1,1,true),['#5a5a5a','#787878']);
  assert.deepEqual(materialColors(3,1,1,false),['#00b366','#007d47']);
});
