#!/usr/bin/env node
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { Game } from '../dist/js/game.js';
import { LEVEL_COUNT } from '../dist/js/levels.js';

// Discovered through actual Game.aim/fire/update calls, without changing bodies,
// scores, targets, ammunition, state, or the physics implementation.
export const FIRST_LEVEL_WINNING_INPUTS = Object.freeze([
  Object.freeze({aimStep: -6, powerIndex: -19}),
  Object.freeze({aimStep: -6, powerIndex: -19}),
  Object.freeze({aimStep: -6, powerIndex: -19}),
]);

const numericBodyFields = ['x','y','vx','vy','angle','angularVelocity','mass','inertia','inverseMass','inverseInertia'];

export function assertFiniteGame(game, label = `stage ${game.level.id}`) {
  const visit = body => {
    for (const key of numericBodyFields) {
      assert.ok(Number.isFinite(body[key]), `${label}: ${body.id}.${key} = ${body[key]}`);
    }
    for (const vertex of body.verticesWorld ?? []) {
      assert.ok(Number.isFinite(vertex.x) && Number.isFinite(vertex.y), `${label}: ${body.id} world vertex`);
    }
    body.children?.forEach(visit);
  };
  game.world.bodies.forEach(visit);
  for (const key of ['score','time','shotTime','settleTime','stillTime']) {
    assert.ok(Number.isFinite(game[key]), `${label}: ${key} = ${game[key]}`);
  }
  assert.ok(game.ammoIndex >= 0 && game.ammoIndex <= game.level.ammo.length, `${label}: ammunition bounds`);
  if (game.bossProjectile) {
    for (const key of ['x','y','vx','vy','age']) {
      assert.ok(Number.isFinite(game.bossProjectile[key]), `${label}: boss projectile ${key}`);
    }
  }
}

export function advanceToInput(game, maxTicks = 400) {
  let ticks = 0;
  while (!['aiming','won','lost'].includes(game.state) && ticks < maxTicks) {
    game.update();
    ticks++;
    assertFiniteGame(game, `stage ${game.level.id}, transition tick ${ticks}`);
  }
  assert.ok(['aiming','won','lost'].includes(game.state), `stage ${game.level.id}: stuck in ${game.state} after ${maxTicks} ticks`);
  return ticks;
}

export function playFirstLevelWin() {
  const game = new Game(1);
  const shots = [];
  for (const input of FIRST_LEVEL_WINNING_INPUTS) {
    assert.equal(game.state, 'aiming');
    game.aim(input.aimStep, input.powerIndex);
    assert.equal(game.fire(), true);
    const ticks = advanceToInput(game);
    shots.push({...input, ticks, state:game.state, targets:game.targets.length, score:game.score});
  }
  assert.equal(game.state, 'won', 'The real three-shot input sequence must complete stage one');
  return {shots, result:game.result, ammoRemaining:game.ammoRemaining};
}

function withSeed(seed, run) {
  const previousRandom = Math.random;
  let randomState = seed >>> 0;
  Math.random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  try { return run(); }
  finally { Math.random = previousRandom; }
}

export function smokeCampaign({ticks = 120, abilityTick = 24, seed = 0x5a17a, onProgress = () => {}} = {}) {
  return withSeed(seed, () => {
    const results = [];
    for (let id = 1; id <= LEVEL_COUNT; id++) {
      const game = new Game(id);
      assertFiniteGame(game, `stage ${id}, initial state`);
      const bossTicks = advanceToInput(game);
      assert.equal(game.state, 'aiming', `stage ${id}: first launch must be available after the opening boss turn`);
      const initialTargets = game.targets.length;
      game.aim(-7,-18);
      assert.equal(game.fire(), true, `stage ${id}: fire accepted`);
      assert.equal(game.shotsFired, 1);
      assert.equal(game.ammoIndex, 1);
      let abilityUsed = false, peakSpeed = 0;
      for (let tick = 0; tick < ticks; tick++) {
        if (tick === abilityTick && game.canUseAbility) abilityUsed = game.ability();
        game.update();
        assertFiniteGame(game, `stage ${id}, launch tick ${tick + 1}`);
        for (const body of game.primitives) peakSpeed = Math.max(peakSpeed, Math.hypot(body.vx,body.vy));
      }
      const row = {id,bossTicks,ticks,animal:game.level.ammo[0],abilityUsed,state:game.state,
        targetsBefore:initialTargets,targetsAfter:game.targets.length,score:game.score,
        launcherLives:game.launcherLives,peakSpeed:Math.round(peakSpeed*1000)/1000};
      results.push(row);
      onProgress(row);
    }
    return results;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const firstLevel = playFirstLevelWin();
  console.log(JSON.stringify({firstLevel}));
  const campaign = smokeCampaign({onProgress(row) {
    if (row.id % 10 === 0) console.log(JSON.stringify({checkedThroughStage:row.id}));
  }});
  console.log(JSON.stringify({stages:campaign.length,updatesPerLaunch:120,
    abilityUses:campaign.filter(s=>s.abilityUsed).length,
    bossStages:campaign.filter(s=>s.bossTicks>0).map(s=>s.id),
    maximumObservedSpeed:Math.max(...campaign.map(s=>s.peakSpeed)),results:campaign}));
}
