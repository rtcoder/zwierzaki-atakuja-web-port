import {readFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ASSET_META} from '../dist/js/assets.js';
import {LEVELS} from '../dist/js/levels.js';
import {scoreForBody} from '../dist/js/rules.js';

const originals=JSON.parse(await readFile(new URL('../assets-original/manifest.json',import.meta.url),'utf8'));
if(Object.keys(originals.assets).length!==Object.keys(ASSET_META).length)throw Error('Original/runtime asset count mismatch');
let count=0,bytes=0,originalBytes=0;
for(const [name,asset] of Object.entries(ASSET_META)) {
  const original=originals.assets[name];
  if(!original)throw Error(`Missing original: ${name}`);
  const originalData=await readFile(new URL(`../assets-original/${original.file}`,import.meta.url));
  if(createHash('sha256').update(originalData).digest('hex')!==original.sha256)throw Error(`Original image changed: ${name}`);
  if(asset.originalSha256!==original.sha256||asset.originalFile!==original.file)throw Error(`Invalid provenance: ${name}`);
  if(asset.width!==original.width||asset.height!==original.height||asset.scale!==4)throw Error(`Logical geometry changed: ${name}`);
  if(asset.candidateFile!==`assets-ai/images/${name}.png`)throw Error(`Invalid candidate path: ${name}`);
  const candidateData=await readFile(new URL(`../${asset.candidateFile}`,import.meta.url));
  if(createHash('sha256').update(candidateData).digest('hex')!==asset.candidateSha256)throw Error(`Candidate image changed: ${name}`);
  if(!['ai_generated','ai_normalized','ai_repaired','deterministic_font','original_upscale'].includes(asset.origin))throw Error(`Invalid artwork origin: ${name}`);
  if(/^target.*_eyes$/.test(name)) {
    if(asset.baseKey!==name.replace(/_eyes$/,'')||asset.baseSha256!==ASSET_META[asset.baseKey]?.sha256)throw Error(`Stale blink base: ${name}`);
    if(asset.derivativeFile!==`assets-ai/runtime-blinks/${name}.png`)throw Error(`Invalid blink derivative: ${name}`);
    const derivative=await readFile(new URL(`../${asset.derivativeFile}`,import.meta.url));
    if(createHash('sha256').update(derivative).digest('hex')!==asset.derivativeSha256||asset.sha256!==asset.derivativeSha256)throw Error(`Blink derivative changed: ${name}`);
  }
  const data=await readFile(new URL(`../dist/assets/${asset.file}`,import.meta.url));
  const hash=createHash('sha256').update(data).digest('hex');
  if(hash!==asset.sha256||data.length!==asset.bytes)throw Error(`Runtime image changed: ${name}`);
  if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error(`Expected lossless PNG: ${name}`);
  const width=data.readUInt32BE(16),height=data.readUInt32BE(20);
  if(width!==original.width*4||height!==original.height*4||width!==asset.pixelWidth||height!==asset.pixelHeight)throw Error(`Incorrect 4x dimensions: ${name}`);
  bytes+=data.length;originalBytes+=originalData.length;count++;
}
for(const file of await readdir(new URL('../dist/js/',import.meta.url))) {
  if(!file.endsWith('.js'))continue;
  const result=spawnSync(process.execPath,['--check',new URL(`../dist/js/${file}`,import.meta.url).pathname],{encoding:'utf8'});
  if(result.status!==0)throw Error(result.stderr);
}
for(const level of LEVELS) {
  const bodies=[...level.bodies,...level.compounds.flatMap(c=>c.children)];
  const score=bodies.reduce((sum,b)=>sum+scoreForBody(b),0);
  if(score!==level.sourceMaxPoints)throw Error(`Level ${level.id} score mismatch: ${score}/${level.sourceMaxPoints}`);
}
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if(match[1]==='./')continue;
  if(/^https?:/.test(match[1]))throw Error('Unexpected external runtime dependency');
  await stat(new URL(`../dist/${match[1]}`,import.meta.url));
}
console.log(`Verified: ${count} unchanged originals (${originalBytes} bytes), ${count} AI-remastered runtime PNGs with candidate provenance (${bytes} bytes), ${LEVELS.length} source-scored stages, JavaScript syntax and HTML references.`);
