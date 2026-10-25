// Constants recovered from e.a(int), e.a(), c.h() and c.A() in MIDlet 1.5.
import { IMPACT_THRESHOLDS } from './rules.js';
export const AIM_STEP = 0.07853982;
export const FIXED_DT = 0.05;
export const GRAVITY = 200;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function launchState(pivot, aimStep, powerIndex, multiplier=11) {
  const angle=clamp(Math.round(aimStep),-15,13)*AIM_STEP;
  const pull=clamp(Math.round(powerIndex),-20,0)*2;
  const speed=-pull*multiplier;
  const cos=Math.cos(angle), sin=Math.sin(angle);
  return {x:pivot.x+cos*(20+pull)+sin*8,
    y:pivot.y+sin*(20+pull)-cos*8,
    vx:speed*cos,vy:speed*sin,angle,pull};
}

export function trajectory(state, steps=80) {
  let {x,y,vx,vy}=state;
  const points=[];
  for(let i=0;i<steps;i++) {
    vy+=GRAVITY*FIXED_DT; x+=vx*FIXED_DT; y+=vy*FIXED_DT;
    points.push({x,y});
    if(y>5) break;
  }
  return points;
}

export function specialAbility(animal,body,targets) {
  const {x,y,vx,vy}=body;
  if(animal===0) return {velocity:{vx,vy:-Math.abs(vy)},projectiles:[
    {kind:'circle',radius:8,sensor:true,canRotate:false,x,y:y+17,vx,vy:vy+100,role:'cone'}]};
  if(animal===2) {
    const speed=Math.hypot(vx,vy);
    if(speed<1e-8) return null;
    return {velocity:{vx:vx/speed*600,vy:vy/speed*600},projectiles:[]};
  }
  if(animal===3) return {velocity:{vx,vy:-Math.abs(vy)},frame:4,
    projectiles:Array.from({length:10},(_,i)=>{
      const angle=3.2986724+i*.31415927;
      return {kind:'circle',radius:2,sensor:true,canRotate:false,x,y,
        vx:vx+140*Math.cos(angle),vy:vy-140*Math.sin(angle),role:'spine'};
    })};
  if(animal===4 && targets.length) {
    const nearest=targets.reduce((a,b)=>Math.hypot(a.x-x,a.y-y)<Math.hypot(b.x-x,b.y-y)?a:b);
    const dx=nearest.x-x,dy=nearest.y-y,d=Math.hypot(dx,dy),speed=Math.hypot(vx,vy);
    if(d<1e-8) return null;
    return {velocity:{vx:dx/d*speed,vy:dy/d*speed},angularVelocity:(dx<0?-1:1)*10*Math.PI,projectiles:[]};
  }
  return null;
}

/** bg.a(v,ad[],...), bf.a(ad,v,float,float): squirrel/cone area effect.
 * Apply velocity deltas once per physical root, damage once per primitive.
 * For a compound, call for its root to push it and its children to damage them.
 * damageSpeed is a synthetic argument to impactDamage, not an explosion impulse.
 * TYPE6 cone/spines are sensor contacts: consume them on their first hit and
 * apply forced direct impact damage in the coordinator before this blast.
 */
export function coneBlastEffect(origin,body,{enhanced=false,nativeScale=1}={}) {
  const result={dvx:0,dvy:0,damageSpeed:0};
  if(body.removed || body.kind==='ground' || body.role) return result;
  const dx=body.x-origin.x,dy=body.y-origin.y,d2=dx*dx+dy*dy;
  const sourceRadius=1.2*(body.boundingRadius??body.radius??0)/nativeScale;
  if(d2>Math.max(40000,sourceRadius*sourceRadius)) return result;
  if(body.canTranslate!==false && body.inverseMass!==0) {
    result.dvx=5500*dx/Math.max(100,d2);
    result.dvy=5500*dy/Math.max(100,d2);
  }
  const threshold=IMPACT_THRESHOLDS[body.material];
  if(d2<10000 && threshold!==undefined && body.kind!=='compound' &&
     body.breakable!==false && !body.plainStaticPlatform) {
    const strength=enhanced?2.5:2;
    const fraction=strength*50/100;
    result.damageSpeed=fraction*threshold+(strength-fraction)*50+1;
  }
  return result;
}
