import {readFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ASSET_META} from '../dist/js/assets.js';
import {LEVELS} from '../dist/js/levels.js';
import {scoreForBody} from '../dist/js/rules.js';

let count=0,bytes=0;
for(const [name,asset] of Object.entries(ASSET_META)) {
  const data=await readFile(new URL(`../dist/assets/${asset.file}`,import.meta.url));
  const hash=createHash('sha256').update(data).digest('hex');
  if(hash!==asset.sha256)throw Error(`Original image changed: ${name}`);
  bytes+=data.length;count++;
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
console.log(`Verified: ${count} byte-identical images (${bytes} bytes), ${LEVELS.length} source-scored stages, JavaScript syntax and HTML references.`);
