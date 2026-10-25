import test from 'node:test';
import assert from 'node:assert/strict';
import { readProgress, writeProgress, recordResult } from '../dist/js/storage.js';
test('missing, corrupt and inaccessible storage fall back to a clean save', () => {
  for (const storage of [null,{getItem:()=>'{bad'},{getItem:()=>{throw Error('denied')}}]) {
    assert.deepEqual(readProgress(storage),{version:1,unlocked:1,best:{}});
  }
});
test('save validation rejects nonfinite scores, invalid keys and excessive level unlocks', () => {
  const storage={getItem:()=>JSON.stringify({version:1,unlocked:999,best:{'1':{score:123,stars:2},'2':{score:-2,stars:3},'999':{score:1,stars:1}}})};
  const p=readProgress(storage);
  assert.equal(p.unlocked,50); assert.deepEqual(p.best,{'1':{score:123,stars:2}});
});
test('completion unlocks the next stage and never overwrites a better score', () => {
  let p={version:1,unlocked:1,best:{}};
  p=recordResult(p,1,120,2); p=recordResult(p,1,80,1);
  assert.equal(p.unlocked,2); assert.equal(p.best[1].score,120);
  assert.equal(p.best[1].stars,2); assert.equal(writeProgress(p,{setItem:()=>{throw Error('full')}}),false);
});
