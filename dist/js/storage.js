export const SAVE_KEY='zwierzaki-web:progress:v1';
const fresh=()=>({version:1,unlocked:1,best:{}});
const browserStorage=()=>{try{return globalThis.localStorage;}catch{return null;}};
export function readProgress(storage=browserStorage()) {
  try {
    const raw=JSON.parse(storage?.getItem(SAVE_KEY)??'null');
    if(!raw || raw.version!==1) return fresh();
    const value=fresh();
    if(Number.isInteger(raw.unlocked)) value.unlocked=Math.max(1,Math.min(50,raw.unlocked));
    if(raw.best && typeof raw.best==='object') for(const [key,record] of Object.entries(raw.best)) {
      const id=Number(key);
      if(!Number.isInteger(id)||id<1||id>50||!record||!Number.isFinite(record.score)||record.score<0) continue;
      value.best[id]={score:Math.floor(record.score),stars:Math.max(0,Math.min(3,Math.floor(Number(record.stars)||0)))};
    }
    return value;
  } catch {return fresh();}
}
export function writeProgress(progress,storage=browserStorage()) {
  try {if(!storage)return false;storage.setItem(SAVE_KEY,JSON.stringify(progress));return true;} catch{return false;}
}
export function recordResult(progress,level,score,stars) {
  const next={version:1,unlocked:Math.min(50,Math.max(progress.unlocked,level+1)),best:{...progress.best}};
  const previous=next.best[level];
  next.best[level]={score:Math.max(previous?.score??0,Math.floor(score)),stars:Math.max(previous?.stars??0,stars)};
  return next;
}
