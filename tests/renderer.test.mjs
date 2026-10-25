import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/js/game.js';
import { Renderer } from '../dist/js/renderer.js';
import { ASSET_META, drawBitmapText } from '../dist/js/assets.js';

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

test('a 4x animal sprite still occupies its original 54x54 world rectangle', () => {
  const calls=[], image={width:216,height:216};
  const renderer=Object.assign(Object.create(Renderer.prototype), {
    images:{char_squirrel1:image},ctx:{drawImage:(...args)=>calls.push(args)},
  });
  renderer.image('char_squirrel1',-27,-27);
  assert.deepEqual(calls,[[image,-27,-27,54,54]]);
});

test('a 4x explosion selects the complete third frame without enlarging its destination', () => {
  const calls=[], image={width:720,height:120};
  const renderer=Object.assign(Object.create(Renderer.prototype), {
    images:{explosion:image},ctx:{drawImage:(...args)=>calls.push(args),
      save(){},restore(){},translate(){}},
  });
  renderer.effect({type:'explosion',x:0,y:0,age:2,duration:6},new Game(1));
  assert.deepEqual(calls,[[image,240,0,120,120,-30,-30,60,60]]);
});

test('4x bitmap glyphs use physical source pixels and original text advances', () => {
  const calls=[], image={width:1920,height:52};
  const width=drawBitmapText({drawImage:(...args)=>calls.push(args)}, {FONT:image},'!!',10,20);
  assert.equal(width,12);
  assert.deepEqual(calls,[[image,4,0,24,52,10,20,6,13],[image,4,0,24,52,16,20,6,13]]);
});

test('4x scenery retains tree heights and the original 320-unit grass tiling', () => {
  const calls=[],tree={width:272,height:400},grass={width:1280,height:128};
  const renderer=Object.assign(cameraRenderer(800,'overview'), {
    images:{tree_1a:tree},grasses:[grass],ctx:{drawImage:(...args)=>calls.push(args),
      fillRect(){},beginPath(){},ellipse(){},fill(){}},
  });
  renderer.scenery(new Game(1));
  const trees=calls.filter(call=>call[0]===tree);
  assert.ok(trees.length>0);
  for(const [,x,y,width,height] of trees) {
    assert.equal(y,-97);
    assert.equal(width,68);
    assert.equal(height,100);
  }
  const tiles=calls.filter(call=>call[0]===grass);
  assert.ok(tiles.length>1);
  for(let i=1;i<tiles.length;i++)assert.equal(tiles[i][1]-tiles[i-1][1],320);
  for(const tile of tiles)assert.equal(tile[3],320);
});


test('all six remastered blink patches align with their matching bear faces', () => {
  for(const size of ['BIG','SMALL'])for(let damage=0;damage<3;damage++) {
    const key=`target${size}_dmg${damage}`,eyesKey=`${key}_eyes`;
    const r=size==='BIG'?20:13,base={},eyes={},calls=[];
    const renderer=Object.assign(Object.create(Renderer.prototype),{
      images:{[key]:base,[eyesKey]:eyes},ctx:{save(){},restore(){},translate(){},rotate(){},drawImage:(...args)=>calls.push(args)},
    });
    const rect=ASSET_META[eyesKey].blinkRect;
    assert.ok(rect,`Missing placement provenance: ${eyesKey}`);
    renderer.body({x:0,y:0,angle:0,isTarget:true,targetSize:size==='BIG'?'big':'small',radius:r,damage,_uid:0},new Game(1),0);
    assert.deepEqual(calls,[[base,-r,-r,r*2,r*2],[eyes,-r+rect.x,-r+rect.y,rect.width,rect.height]],eyesKey);
    calls.length=0;
    renderer.body({x:0,y:0,angle:0,isTarget:true,targetSize:size==='BIG'?'big':'small',radius:r,damage,_uid:0},new Game(1),1);
    assert.deepEqual(calls,[[base,-r,-r,r*2,r*2]],`open ${key}`);
  }
});
