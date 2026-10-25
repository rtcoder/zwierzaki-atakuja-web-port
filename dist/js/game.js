import { PhysicsWorld } from './physics.js';
import { getLevel } from './levels.js';
import { launchState, specialAbility, coneBlastEffect, FIXED_DT, clamp } from './mechanics.js';
import { impactDamage, scoreForBody, unusedAmmoBonus, medalForScore, shouldEndSettling, bossShot, bossLauncherHit } from './rules.js';

export class Game {
  constructor(level=1) {this.paused=false;this.load(level);}

  load(level) {
    this.level=getLevel(level);this.world=new PhysicsWorld();this.world.addGround();
    for(const b of [...this.level.bodies,...this.level.compounds])this.world.add(b);
    this.damageable=this.world.bodies.flatMap(b=>b.children??[b]).filter(b=>b.kind!=='ground');
    this.damageable.forEach((b,i)=>{b.damage=0;b.paletteIndex=i+1;});
    this.maxScore=this.damageable.reduce((sum,b)=>sum+scoreForBody(b),0);
    this.ammoIndex=0;this.shotsFired=0;this.score=0;this.time=0;this.shotTime=0;
    this.settleTime=0;this.stillTime=0;this.effects=[];this.trail=[];this.lastTrail=[];
    this.projectile=null;this.bossProjectile=null;this.abilityUsed=false;this.result=null;
    this.launcherLives=3;this.aimStep=-6;this.powerIndex=-19;this.state='aiming';
    this.paused=false;this.version=(this.version??0)+1;this._effectId=0;
    this.startBossTurn();
  }

  get targets() {return this.damageable.filter(b=>b.isTarget&&!b.removed);}
  get ammoRemaining() {return this.level.ammo.length-this.ammoIndex;}
  get currentAnimal() {return this.state==='aiming'?this.level.ammo[this.ammoIndex]:(this.projectile?.animalId??this.level.ammo[this.ammoIndex]);}
  get shot() {return launchState(this.level.launcher,this.aimStep,this.powerIndex,this.level.launcher.speedMultiplier);}
  get canUseAbility() {return this.state==='flying'&&!this.abilityUsed&&this.projectile&&!this.projectile.removed&&this.projectile.animalId!==1;}
  get primitives() {return this.world.bodies.flatMap(b=>b.children??[b]).filter(b=>b.kind!=='ground'&&!b.removed);}

  aim(step,power) {
    if(this.state!=='aiming'||this.paused)return;
    this.aimStep=clamp(Math.round(step),-15,13);this.powerIndex=clamp(Math.round(power),-20,0);
  }

  fire() {
    if(this.state!=='aiming'||this.paused||this.ammoRemaining<=0)return false;
    const animalId=this.level.ammo[this.ammoIndex++];
    this.projectile=this.world.add({id:`shot-${++this.shotsFired}`,kind:'circle',radius:10,mass:1,
      ...this.shot,material:5,role:'animal',animalId,frame:3});
    this.lastTrail=this.trail;this.trail=[];this.state='flying';this.shotTime=0;
    this.abilityUsed=false;this.stillTime=0;this.version++;return true;
  }

  ability() {
    if(!this.canUseAbility||this.paused)return false;
    const action=specialAbility(this.projectile.animalId,this.projectile,this.targets);
    if(!action)return false;
    Object.assign(this.projectile,action.velocity);
    if(action.angularVelocity!==undefined)this.projectile.angularVelocity=action.angularVelocity;
    if(action.frame)this.projectile.frame=action.frame;
    for(const p of action.projectiles)this.world.add({...p,id:`special-${this.shotsFired}-${this._effectId++}`,material:5});
    this.abilityUsed=true;this.version++;return true;
  }

  applyImpact(body,speed,force=false) {
    if(body.removed||body.kind==='ground'||body.role||body.breakable===false||body.plainStaticPlatform)return;
    const before=body.damage??0;body.damage=impactDamage(body.material,speed,before,force);
    if(body.damage===before)return;
    this.version++;
    if(body.damage>=4)this.destroy(body);
    else this.effects.push({id:this._effectId++,type:'hit',x:body.x,y:body.y,age:0,duration:.35});
  }

  destroy(body) {
    if(body.removed)return;
    const points=scoreForBody(body);this.score+=points;
    this.effects.push({id:this._effectId++,type:body.isTarget?'target':'debris',x:body.x,y:body.y,
      age:0,duration:.8,material:body.material,targetSize:body.targetSize,points});
    this.world.remove(body);this.version++;
  }

  explode(origin) {
    this.effects.push({id:this._effectId++,type:'explosion',x:origin.x,y:origin.y,age:0,duration:.65});
    for(const root of this.world.bodies){const blast=coneBlastEffect(origin,root);root.vx+=blast.dvx;root.vy+=blast.dvy;}
    for(const body of [...this.primitives]){const blast=coneBlastEffect(origin,body);if(blast.damageSpeed)this.applyImpact(body,blast.damageSpeed);}
  }

  startSettling() {
    if(this.state!=='flying')return;
    this.state='settling';this.settleTime=0;this.stillTime=0;this.version++;
  }

  startBossTurn() {
    const boss=this.level.boss;
    if(!boss)return false;
    const barrel=this.damageable.find(b=>b.id===boss.barrelBodyId&&!b.removed);
    if(!barrel)return false;
    this.bossProjectile={...bossShot(this.level.id,barrel,boss.muzzleDistance),age:0};
    this.state='boss';return true;
  }

  finishShot() {
    for(const b of [...this.world.bodies])if(b.role)this.world.remove(b);
    this.projectile=null;
    if(this.targets.length===0) {
      const bonus=unusedAmmoBonus(this.level.ammo.slice(this.ammoIndex));
      this.score+=bonus;const medal=medalForScore(this.score,this.maxScore);
      this.result={score:this.score,bonus,stars:4-medal,medal};this.state='won';
    } else if(this.ammoRemaining<=0||this.launcherLives<=0) {
      this.result={score:this.score,bonus:0,stars:0};this.state='lost';
    } else {this.state='aiming';this.startBossTurn();}
    this.version++;
  }

  update(dt=FIXED_DT) {
    if(this.paused||['won','lost','aiming'].includes(this.state))return;
    this.time+=dt;
    for(const effect of this.effects)effect.age+=dt;
    this.effects=this.effects.filter(e=>e.age<e.duration);
    if(this.state==='boss') {
      const p=this.bossProjectile;
      if(p) {
        // The original boss turn runs its projectile separately from damage.
        if(p.age<.5)this.world.step(dt);
        p.age+=dt;p.vy+=200*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
        const hit=bossLauncherHit(p,this.level.launcher);
        if(hit||p.y>5||p.age>5||p.x<this.level.launcher.x-150) {
          if(hit){this.launcherLives--;this.effects.push({id:this._effectId++,type:'explosion',x:p.x,y:p.y,age:0,duration:.65});}
          this.bossProjectile=null;this.state=this.launcherLives>0?'aiming':'lost';
          if(this.state==='lost')this.result={score:this.score,bonus:0,stars:0};this.version++;
        }
      }
      return;
    }
    if(this.state==='flying')this.shotTime+=dt;
    const events=this.world.step(dt,this.state==='flying'?{activeBodies:new Set(this.world.bodies.filter(b=>b.role))}:{});
    for(const event of events) {
      const speed=event.relativeNormalSpeed??event.relativeSpeed;
      const particle=event.a.sensor?event.a:event.b.sensor?event.b:null;
      if(particle) {
        const other=particle===event.a?event.b:event.a;
        if(particle.removed||other.role)continue;
        this.applyImpact(other,speed,true);this.world.remove(particle);
        if(particle.role==='cone')this.explode(particle);
        if(!this.world.bodies.some(b=>b.sensor&&!b.removed))this.startSettling();
      } else {
        this.applyImpact(event.a,speed);this.applyImpact(event.b,speed);
        const animal=event.a.role==='animal'?event.a:event.b.role==='animal'?event.b:null;
        const other=animal===event.a?event.b:event.a;
        if(animal&&other.kind!=='ground'&&!other.role) {
          if(animal.animalId===0&&!this.abilityUsed){this.abilityUsed=true;this.explode({x:animal.x,y:animal.y+17});}
          if(!this.world.bodies.some(b=>b.sensor&&!b.removed))this.startSettling();
        }
      }
    }
    const targetBoundary=this.level.sourceLogicalSize[0]-this.level.sourceWorldOffset[0];
    for(const target of [...this.targets])if(target.x>targetBoundary)this.destroy(target);
    for(const b of [...this.primitives])if(b.y>600||Math.abs(b.x)>6000) {
      if(b.isTarget)this.destroy(b);else this.world.remove(b);
    }
    if(this.state==='flying') {
      const p=this.projectile;
      if(p&&!p.removed) {
        this.trail.push({x:p.x,y:p.y});if(this.trail.length>120)this.trail.shift();
      }
      const activeSpecial=this.world.bodies.some(b=>b.sensor&&!b.removed);
      if(this.targets.length===0||!activeSpecial&&(!p||p.removed||this.shotTime>5||
        this.shotTime>1&&Math.hypot(p.vx,p.vy)<8||p.x>this.bounds().maxX+250)) {
        this.startSettling();
      }
    }
    if(this.state==='settling') {
      this.settleTime+=dt;
      const sleeping=this.world.bodies.every(b=>Math.hypot(b.vx,b.vy)<1&&Math.abs(b.angularVelocity)<.08);
      this.stillTime=sleeping?this.stillTime+dt:0;
      if(shouldEndSettling({elapsedMs:this.settleTime*1000,stillMs:this.stillTime*1000,
        debrisCount:this.effects.filter(e=>e.type==='debris').length,allBodiesSleeping:sleeping,
        targetsRemaining:this.targets.length,ammoCountIncludingCurrent:this.ammoRemaining+1}))this.finishShot();
    }
  }

  bounds() {
    const shapes=this.level.bodies.concat(this.level.compounds.flatMap(b=>b.children));
    return {minX:this.level.launcher.x-105,maxX:Math.max(150,...shapes.map(b=>b.x+(b.width??b.radius??40)/2))+100,
      minY:Math.min(-420,...shapes.map(b=>b.y-(b.height??b.radius??40)/2-80)),maxY:65};
  }
}
