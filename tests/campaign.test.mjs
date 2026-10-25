import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/js/game.js';
import { FIRST_LEVEL_WINNING_INPUTS, advanceToInput, assertFiniteGame, smokeCampaign } from '../tools/smoke-campaign.mjs';

test('three real 27-degree, 95-percent launches win recovered stage one', () => {
  const game = new Game(1);
  assert.equal(game.targets.length, 2);
  for (let shot = 0; shot < FIRST_LEVEL_WINNING_INPUTS.length; shot++) {
    assert.equal(game.state, 'aiming');
    const {aimStep,powerIndex} = FIRST_LEVEL_WINNING_INPUTS[shot];
    game.aim(aimStep,powerIndex);
    assert.equal(game.fire(), true);
    assert.equal(game.shotsFired, shot+1);
    advanceToInput(game);
    assertFiniteGame(game);
  }
  assert.equal(game.state, 'won');
  assert.equal(game.targets.length, 0);
  assert.equal(game.ammoRemaining, 0);
  assert.equal(game.result.bonus, 0);
  // Two large bears award 80 points. Optional
  // destroyed construction pieces need not be identical after solver changes.
  assert.ok(game.result.score >= 80);
  assert.equal(game.result.score, game.score);
  assert.ok(game.result.stars >= 1);
});

test('every original stage accepts a genuine launch and keeps finite state through 120 ticks', () => {
  const rows = smokeCampaign();
  assert.equal(rows.length, 50);
  assert.deepEqual(rows.map(row=>row.id), Array.from({length:50},(_,i)=>i+1));
  assert.deepEqual(rows.filter(row=>row.bossTicks>0).map(row=>row.id), [10,20,30,40,50]);
  assert.ok(rows.some(row=>row.abilityUsed), 'The smoke run must also exercise real midair abilities');
  assert.ok(rows.every(row=>row.ticks===120));
});

test('stage forty-four has a clear launch path before its distant cliffs', () => {
  const game = new Game(44);
  game.aim(-7,-18);
  assert.equal(game.fire(),true);
  const startX = game.projectile.x;
  game.update();
  assert.equal(game.state,'flying');
  assert.ok(game.projectile.x > startX+10, 'The animal must travel right after launch');
  assert.ok(Math.hypot(game.projectile.vx,game.projectile.vy)>300, 'A misplaced cliff must not stop the animal at its spawn');
  assertFiniteGame(game);
});
