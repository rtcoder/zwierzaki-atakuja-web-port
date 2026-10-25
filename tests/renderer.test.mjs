import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/js/game.js';
import { Renderer } from '../dist/js/renderer.js';

// Exercise real camera methods without constructing Canvas/DOM resources.
function cameraRenderer(width, mode) {
  return Object.assign(Object.create(Renderer.prototype), {
    width, height:500, mode, ready:false, camera:{x:0,y:0,scale:1},
  });
}

for (const {width,mode} of [{width:800,mode:'overview'},{width:390,mode:'follow'}]) {
  for (const level of [1,44]) {
    test(`${mode}: loading stage ${level} after pan and zoom brings the launcher into view`, () => {
      const game=new Game(1), renderer=cameraRenderer(width,mode);
      renderer.updateCamera(game);
      renderer.pan(-2000,1000);
      renderer.zoom(2);
      game.load(level);
      renderer.ready=false;
      renderer.updateCamera(game);

      const launcher=renderer.screenPoint(game.level.launcher.x,game.level.launcher.y);
      assert.ok(launcher.x>=0 && launcher.x<=width, `launcher x=${launcher.x}`);
      assert.ok(launcher.y>=0 && launcher.y<=renderer.height, `launcher y=${launcher.y}`);
      assert.equal(renderer.mode,mode);
    });
  }
}

test('camera updates and resizing keep the manual view on the same stage', () => {
  const game=new Game(1), renderer=cameraRenderer(800,'overview');
  renderer.updateCamera(game);
  renderer.pan(-300,100);
  renderer.zoom(1.5);
  const manualView={...renderer.camera};
  renderer.width=900;
  renderer.ready=false;
  renderer.updateCamera(game);
  assert.deepEqual(renderer.camera,manualView);
  assert.equal(renderer.mode,'free');
});

test('loading another stage preserves the explicitly selected automatic mode', () => {
  const game=new Game(1), renderer=cameraRenderer(800,'overview');
  renderer.updateCamera(game);
  renderer.setMode('follow');
  game.load(44);
  renderer.updateCamera(game);
  assert.equal(renderer.mode,'follow');
  const launcher=renderer.screenPoint(game.level.launcher.x,game.level.launcher.y);
  assert.ok(launcher.x>=0 && launcher.x<=renderer.width);
});
