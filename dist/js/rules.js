/**
 * Gameplay rules recovered from Nokia ZwierzakiAtakuja 1.5.
 * Damage input is PRE-SOLVE NORMAL CONTACT SPEED, including angular velocity.
 * It is not the collision solver's accumulated impulse. See docs/RULES.md.
 */
export const IMPACT_THRESHOLDS = Object.freeze([50, 100, 150, 200, 50, 1000]);
export const DAMAGE_TO_DESTROY = 4;
export const MATERIAL_SCORES = Object.freeze([10, 15, 20, 25, 0, 0]);
export const TARGET_SCORES = Object.freeze({big:40, small:30});
export const UNUSED_AMMO_SCORES = Object.freeze([40, 10, 20, 40, 20]);
export const BOSS_LAUNCHER_LIVES = 3;
export const FLIGHT_TIMEOUT_TICKS = 100;
export const BOSS_SPEEDS = Object.freeze({
  10:Object.freeze({base:370,range:80}),
  20:Object.freeze({base:400,range:120}),
  30:Object.freeze({base:420,range:80}),
  40:Object.freeze({base:340,range:120}),
  50:Object.freeze({base:315,range:120}),
});

/** Returns the NEW integer damage, not the increment. Destroy at >=4.
 * v.b(int), ae/ab/ag.a(float[],float,int), and aj.a(...) in the original.
 * Caller skips non-damageable bodies and a circle/box's zero local hit vector.
 * The original force flag bypasses the speed threshold once, then clears.
 */
export function impactDamage(material, relativeNormalSpeed, currentDamage=0, force=false) {
  const threshold=IMPACT_THRESHOLDS[material];
  if (threshold===undefined) return currentDamage;
  const speed=Math.abs(Math.fround(relativeNormalSpeed));
  if (!force && speed<=threshold && currentDamage<DAMAGE_TO_DESTROY) return currentDamage;
  const increment=Math.max(1,Math.fround(speed/threshold));
  return Math.trunc(Math.fround(currentDamage+increment));
}

/** Call once for each destroyed primitive, never once per contact. c.z(). */
export function scoreForBody(body) {
  if (body.kind==='compound' || body.kind==='ground' || body.breakable===false || body.plainStaticPlatform) return 0;
  if (body.isTarget || body.material===4) {
    const size=body.targetSize ?? (Math.abs(body.radius-20)<0.001?'big':Math.abs(body.radius-13)<0.001?'small':null);
    return TARGET_SCORES[size] ?? 0;
  }
  return MATERIAL_SCORES[body.material] ?? 0;
}

/** Receives only unspent animal IDs. Original queue index 0 was the spent shot. */
export function unusedAmmoBonus(ammo) {
  return ammo.reduce((score,animal)=>score+(UNUSED_AMMO_SCORES[animal]??0),0);
}

/** Original medal IDs: 1=gold, 2=silver, 3=bronze. Strict > is intentional. */
export function medalForScore(score,maxDestructionScore) {
  if (score>Math.trunc(maxDestructionScore*85/100)) return 1;
  if (score>Math.trunc(maxDestructionScore*70/100)) return 2;
  return 3;
}

/** c.n(), state 6. Timers are milliseconds measured from settling entry.
 * allBodiesSleeping represents the original scene's motion/stability predicate;
 * the port may derive it from the physics world's sleeping/motion observation.
 */
export function shouldEndSettling({elapsedMs,stillMs,debrisCount,
  allBodiesSleeping,targetsRemaining,ammoCountIncludingCurrent}) {
  return stillMs>=1000 || elapsedMs>10000 || elapsedMs>4000 &&
    (debrisCount===0 && allBodiesSleeping || targetsRemaining===0 || ammoCountIncludingCurrent===0);
}

/** c.setState(...,13). One projectile per boss turn, at the live barrel pose. */
export function bossShot(levelId,barrel,muzzleDistance,random=Math.random) {
  const {base,range}=BOSS_SPEEDS[levelId]??{base:390,range:1};
  const speed=base-Math.trunc(range/2)+Math.min(range-1,Math.floor(random()*range));
  const cos=Math.cos(barrel.angle),sin=Math.sin(barrel.angle);
  return {x:barrel.x-muzzleDistance*cos,y:barrel.y-muzzleDistance*sin,
    vx:-speed*cos,vy:-speed*sin,speed};
}

/** c constructor and state13. Use nativeScale=1 for the canonical 320x240 world. */
export function bossLauncherHit(projectile,launcher,nativeScale=1) {
  const radius=40+Math.trunc(10/nativeScale);
  return (projectile.x-launcher.x)**2+(projectile.y-launcher.y)**2<radius*radius;
}

const THEME_COLORS = Object.freeze([
  [0xf6e08f,0xe4c96b], [0xcc0099,0x8e006b], [0x7fd4e7,0x64bbce],
  [0x33ff00,0x24b200], [0xcccccc,0xaaaaaa],
]);
const FIXED_MATERIAL_COLORS = Object.freeze({
  1:[0x666666,0x888888], 2:[0x009999,0x006b6b], 3:[0x00b366,0x007d47],
});

/** c.loadLevel + bg.a colors. theme is 1..5; primitiveIndex matches original
 * coloring enumeration (top-level non-target index starts at 1; child at 0).
 * shade=false reproduces the special circle branch without per-body shading.
 */
export function materialColors(material,theme=1,primitiveIndex=1,shade=true) {
  const palette=material===0?THEME_COLORS[theme-1]:FIXED_MATERIAL_COLORS[material];
  if (!palette) return ['#000000','#000000'];
  const n=shade?(primitiveIndex%3-([1,5].includes(theme)?2:1))*30:0;
  return palette.map(color=>{
    const rgb=[color>>16&255,color>>8&255,color&255].map(channel=>
      Math.max(0,Math.min(255,channel+Math.trunc(channel*n/255))));
    return '#'+rgb.map(channel=>channel.toString(16).padStart(2,'0')).join('');
  });
}
