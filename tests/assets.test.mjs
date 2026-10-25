import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ASSET_META, ASSET_SOURCE, FONTS, EFFECTS} from '../dist/js/assets.js';

const root=new URL('../',import.meta.url);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

test('runtime ships the approved candidates with traceable inputs and unchanged logical geometry',async()=>{
  const original=JSON.parse(await readFile(new URL('assets-original/manifest.json',root),'utf8'));
  const runtime=JSON.parse(await readFile(new URL('dist/assets/manifest.json',root),'utf8'));
  assert.match(ASSET_SOURCE.pixelPolicy,/\bAI\b/i);
  assert.deepEqual(runtime.assets,ASSET_META);
  assert.deepEqual(Object.keys(ASSET_META).sort(),Object.keys(original.assets).sort());
  for(const [key,meta] of Object.entries(ASSET_META)) {
    assert.equal(meta.candidateFile,`assets-ai/images/${key}.png`,key);
    assert.equal(meta.candidateSha256,digest(await readFile(new URL(meta.candidateFile,root))),key);
    assert.deepEqual([meta.width,meta.height],[original.assets[key].width,original.assets[key].height],key);
    assert.deepEqual([meta.pixelWidth,meta.pixelHeight],[meta.width*4,meta.height*4],key);
    assert.equal(meta.originalSha256,original.assets[key].sha256,key);
  }
  for(const key of ['FONT','fS','fontNum'])assert.equal(ASSET_META[key].origin,'deterministic_font');
  assert.equal(ASSET_META.tutorMouth0.origin,'original_upscale');
});

test('font glyphs and animation frame rectangles fit the packed runtime atlases',()=>{
  for(const font of Object.values(FONTS)) {
    const meta=ASSET_META[font.asset];
    for(const [character,glyph] of Object.entries(font.glyphs)) {
      assert.ok(glyph.x>=0&&glyph.y>=0&&glyph.x+glyph.width<=meta.width&&glyph.y+glyph.height<=meta.height,character);
    }
  }
  for(const effect of Object.values(EFFECTS)) {
    const meta=ASSET_META[effect.asset];
    assert.equal(meta.width,effect.frameWidth*effect.frames,effect.asset);
    assert.equal(meta.height,effect.frameHeight,effect.asset);
  }
});


test('blink derivatives are traceable to the shipped bear bases',async()=>{
  const patches=Object.entries(ASSET_META).filter(([key])=>/^target.*_eyes$/.test(key));
  assert.equal(patches.length,6);
  for(const [key,meta] of patches) {
    assert.equal(meta.baseKey,key.replace(/_eyes$/,''));
    assert.equal(meta.baseSha256,ASSET_META[meta.baseKey].sha256,key);
    assert.equal(meta.derivativeFile,`assets-ai/runtime-blinks/${key}.png`);
    assert.equal(meta.derivativeSha256,digest(await readFile(new URL(meta.derivativeFile,root))),key);
    assert.equal(meta.sha256,meta.derivativeSha256,key);
  }
});
