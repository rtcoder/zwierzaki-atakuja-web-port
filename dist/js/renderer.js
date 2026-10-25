import { ANIMALS } from './assets.js';
import { trajectory, clamp } from './mechanics.js';
import { materialColors } from './rules.js';

// Reproduce bi.a(Image,H,S%,V%) at runtime; keep original asset bytes intact.
function grassForTheme(image,theme) {
  const [h,saturation,value]=[[80,80,100],[283,50,80],[203,60,100],[15,90,100],[0,0,60]][theme-1];
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const context=canvas.getContext('2d');context.drawImage(image,0,0);
  const pixels=context.getImageData(0,0,image.width,image.height),d=pixels.data,T=Math.trunc;
  for(let i=0;i<d.length;i+=4) {
    const max=Math.max(d[i],d[i+1],d[i+2]),min=Math.min(d[i],d[i+1],d[i+2]);
    const s=T((max?T(T((max-min)*255*100/max)/255):0)*saturation/100),v=T(T(max*100/255)*value/100);
    const V=T(v*255/100);let rgb;
    if(!s)rgb=[V,V,V];
    else {
      const sector=T(h/60),fraction=T(h*100/60)-sector*100;
      const p=T(v*(100-s)*255/10000),q=T(v*(100-T(s*fraction/100))*255/10000),t=T(v*(100-T(s*(100-fraction)/100))*255/10000);
      rgb=[[V,t,p],[q,V,p],[p,V,t],[p,q,V],[t,p,V],[V,p,q]][sector%6];
    }
    [d[i],d[i+1],d[i+2]]=rgb;
  }
  context.putImageData(pixels,0,0);return canvas;
}

export class Renderer {
  constructor(canvas,images) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.images=images;
    this.mode=window.innerWidth<=580?'follow':'overview';this.camera={x:0,y:-160,scale:1};this.ready=false;this.width=1;this.height=1;
    this.grasses=Array.from({length:5},(_,i)=>grassForTheme(images.grass,i+1));
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
  }
  resize() {
    const rect=this.canvas.getBoundingClientRect();this.width=rect.width;this.height=rect.height;
    this.dpr=Math.min(window.devicePixelRatio||1,2);
    this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr);
    this.ready=false;
  }
  setMode(mode) {this.mode=mode;this.ready=false;}
  worldPoint(x,y) {return {x:(x-this.width/2)/this.camera.scale+this.camera.x,y:(y-this.height/2)/this.camera.scale+this.camera.y};}
  screenPoint(x,y) {return {x:(x-this.camera.x)*this.camera.scale+this.width/2,y:(y-this.camera.y)*this.camera.scale+this.height/2};}
  pan(dx,dy) {this.mode='free';this.camera.x-=dx/this.camera.scale;this.camera.y-=dy/this.camera.scale;}
  zoom(delta,px=this.width/2,py=this.height/2) {
    const before=this.worldPoint(px,py);this.mode='free';this.camera.scale=clamp(this.camera.scale*delta,.2,3);
    const after=this.worldPoint(px,py);this.camera.x+=before.x-after.x;this.camera.y+=before.y-after.y;
  }
  updateCamera(game) {
    if(this.mode==='free')return;
    const bounds=game.bounds();let x,y,scale;
    if(this.mode==='overview') {
      scale=Math.min(this.width/(bounds.maxX-bounds.minX),this.height/(bounds.maxY-bounds.minY));
      x=(bounds.minX+bounds.maxX)/2;y=(bounds.minY+bounds.maxY)/2;
    } else {
      scale=Math.min(this.height/350,this.width/480);
      const focus=game.bossProjectile??(game.state==='flying'?game.projectile:null);
      x=focus?focus.x+70:(game.state==='settling'||game.state==='won'?0:game.level.launcher.x+100);
      const half=this.width/scale/2;
      x=clamp(x,bounds.minX+half,bounds.maxX-half);
      y=Math.min(-135,(focus?.y??-135)-30);
    }
    if(!this.ready){this.camera={x,y,scale};this.ready=true;}
    else {for(const key of ['x','y','scale'])this.camera[key]+=({x,y,scale}[key]-this.camera[key])*.12;}
  }
  image(name,x,y,w,h) {
    const img=this.images[name];if(!img)return;
    if(w!==undefined)this.ctx.drawImage(img,x,y,w,h);else this.ctx.drawImage(img,x,y);
  }
  draw(game,seconds=0) {
    this.updateCamera(game);const c=this.ctx,w=this.width,h=this.height;
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.imageSmoothingEnabled=false;
    c.imageSmoothingEnabled=true;this.background(game);c.imageSmoothingEnabled=false;
    c.save();c.translate(w/2,h/2);c.scale(this.camera.scale,this.camera.scale);c.translate(-this.camera.x,-this.camera.y);
    this.scenery(game);
    this.path(game.lastTrail,.16,false);
    this.path(game.trail,.45,false);
    if(game.state==='aiming')this.path(trajectory(game.shot,90),.6,true);
    this.launcher(game);
    for(const body of game.primitives)this.body(body,game,seconds);
    if(game.bossProjectile){const p=game.bossProjectile;this.image('bullet',p.x-10,p.y-10);}
    for(const effect of game.effects)this.effect(effect,game);
    c.restore();
    if(this.mode!=='overview')this.offscreenTarget(game);
  }
  background(game) {
    const c=this.ctx,w=this.width,h=this.height,theme=Math.ceil(game.level.id/10);
    const img=this.images[`bg_${theme}`];
    c.fillStyle=['#aed8e7','#b6cbea','#c1d3dc','#dbdda2','#d0d8dc'][theme-1];c.fillRect(0,0,w,h);
    if(img) {
      // The recovered 400×300 backdrop stays behind the entire camera viewport.
      const scale=Math.max(w/img.width,h/img.height);
      const parallax=clamp(this.camera.x*.025,-30,30);
      c.drawImage(img,(w-img.width*scale)/2+parallax-30,(h-img.height*scale)*.6,img.width*scale+60,img.height*scale);
    }
  }
  scenery(game) {
    const c=this.ctx,bounds=game.bounds(),theme=Math.ceil(game.level.id/10);
    const left=this.camera.x-this.width/this.camera.scale/2-400;
    const right=this.camera.x+this.width/this.camera.scale/2+400;
    for(let x=Math.floor(left/280)*280;x<right;x+=280) {
      const tree=this.images[`tree_${theme}${Math.abs(Math.round(x/280))%2?'a':'b'}`];
      if(tree){c.globalAlpha=.45;c.drawImage(tree,x,-tree.height+3);c.globalAlpha=1;}
    }
    c.fillStyle=['#8fac55','#a993b5','#88b4b5','#9eb16a','#a2aaa2'][theme-1];
    c.fillRect(left,3,right-left,1500);
    const grass=this.grasses[theme-1];
    if(grass)for(let x=Math.floor(left/320)*320;x<right;x+=320)c.drawImage(grass,x,-8);
    c.fillStyle='#ffffff30';c.fillRect(left,1,right-left,2);
    // Small ground shadows keep tiny original sprites readable at desktop scale.
    c.fillStyle='#1d39231a';
    for(const x of [game.level.launcher.x,0]){c.beginPath();c.ellipse(x,4,x===0?140:45,6,0,0,Math.PI*2);c.fill();}
  }
  path(points,alpha,preview) {
    const c=this.ctx;c.fillStyle=preview?'#fffef4':'#fffde7';c.strokeStyle='#477654';c.lineWidth=.8;c.globalAlpha=alpha;
    for(let i=0;i<points.length;i+=preview?3:2){const p=points[i];if(p.y>0)break;c.beginPath();c.arc(p.x,p.y,preview?2.1:1.5,0,Math.PI*2);c.fill();if(preview)c.stroke();}
    c.globalAlpha=1;
  }
  launcher(game) {
    const c=this.ctx,{x,y,pedestalSections}=game.level.launcher;
    c.save();c.translate(x,y);
    for(let n=0;n<pedestalSections;n++)this.image('launcherBaseElement',-15,40+15*n);
    this.image('launcherBaseTop',-19,40);
    c.save();c.rotate(game.shot.angle);
    const pull=game.state==='aiming'?game.shot.pull:-20;
    this.image('launcher_5',-27,-27);
    this.image('launcher_1',-27+20+Math.min(-20,pull),-27);
    if(game.state==='aiming'&&game.currentAnimal!==undefined)this.image(ANIMALS[game.currentAnimal].frames[2],-27+20+pull,-35);
    this.image('launcher_4',-27,-27);c.restore();
    this.image('launcher_2',-4,-2);c.restore();
  }
  body(body,game,seconds) {
    const c=this.ctx;c.save();c.translate(body.x,body.y);c.rotate(body.angle);
    if(body.isTarget) {
      const size=body.targetSize==='small'?'SMALL':'BIG';const r=body.radius;
      const damage=Math.min(2,body.damage??0);this.image(`target${size}_dmg${damage}`,-r,-r);
      if((seconds+body._uid*.39)%3.7<.15)this.image(`target${size}_dmg${damage}_eyes`,-r+(size==='BIG'?11:6),-r+(size==='BIG'?12:7));
    } else if(body.role==='animal') {
      const animal=ANIMALS[body.animalId];this.image(body.frame===4?'char_hedgehog4':animal.frames[2],-27,-27);
    } else if(body.role==='cone')this.image('char_squirrel_cone',-8,-8);
    else if(body.role==='spine') {c.fillStyle='#4e3a23';c.fillRect(-2,-2,4,4);}
    else {
      const [a,b]=materialColors(body.material,Math.ceil(game.level.id/10),body.paletteIndex??1);
      c.fillStyle=a;c.strokeStyle='#f9ffffb3';c.lineWidth=.7;
      c.beginPath();
      if(body.kind==='circle')c.arc(0,0,body.radius,0,Math.PI*2);
      else {for(let i=0;i<body.vertices.length;i++){const p=body.vertices[i];if(!i)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);}c.closePath();}
      c.fill();c.stroke();
      if(body.kind==='box') {
        c.fillStyle=b;c.fillRect(-body.width/2+1,body.height/2-4,body.width-2,3);
        c.fillStyle='#fff4';c.fillRect(-body.width/2+1,-body.height/2+1,body.width-2,1.4);
      }
      if((body.damage??0)>0) {
        c.strokeStyle='#ffffffae';c.lineWidth=.8;c.beginPath();const r=body.boundingRadius*.75;
        c.moveTo(-r*.5,-r*.35);c.lineTo(1,2);c.lineTo(r*.35,-r*.1);
        if(body.damage>1){c.moveTo(1,2);c.lineTo(r*.15,r*.4);c.lineTo(-r*.2,r*.55);}c.stroke();
      }
    }
    c.restore();
  }
  effect(e,game) {
    const c=this.ctx,t=e.age/e.duration;c.save();c.translate(e.x,e.y);c.globalAlpha=1-t;
    if(e.type==='target'||e.type==='explosion') {
      const img=this.images[e.type==='explosion'?'explosion':'sparkles'];
      const size=e.type==='explosion'?30:34,frames=e.type==='explosion'?6:5;
      c.drawImage(img,Math.min(frames-1,Math.floor(t*frames))*size,0,size,size,-size,-size,size*2,size*2);
    } else {
      const color=materialColors(e.material??0,Math.ceil(game.level.id/10))[0];c.fillStyle=color;
      for(let i=0;i<7;i++){const angle=i*2.4,speed=18+(i%3)*12,x=Math.cos(angle)*speed*t,y=Math.sin(angle)*speed*t+35*t*t;c.save();c.translate(x,y);c.rotate(i+t*3);c.fillRect(-3,-3,6,6);c.restore();}
    }
    if(e.points){c.fillStyle='#fffef4';c.strokeStyle='#375f3f';c.lineWidth=3;c.font='bold 15px Arial';c.textAlign='center';c.strokeText(`+${e.points}`,0,-20-t*24);c.fillText(`+${e.points}`,0,-20-t*24);}
    c.restore();
  }
  offscreenTarget(game) {
    const target=game.targets[0];if(!target)return;
    const p=this.screenPoint(target.x,target.y);
    if(p.x>20&&p.x<this.width-20)return;
    const c=this.ctx,right=p.x>this.width;
    c.fillStyle='#ffffffd9';c.beginPath();c.roundRect(right?this.width-78:12,this.height*.48,66,27,13);c.fill();
    c.fillStyle='#41654c';c.font='bold 9px Arial';c.textAlign='center';c.fillText(right?'CELE  →':'←  CELE',right?this.width-45:45,this.height*.48+17);
  }
}
