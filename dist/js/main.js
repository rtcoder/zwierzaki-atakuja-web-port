import {loadAssets,ANIMALS,ASSET_META} from './assets.js';
import {Game} from './game.js';
import {Renderer} from './renderer.js';
import {LEVEL_COUNT} from './levels.js';
import {AIM_STEP,FIXED_DT} from './mechanics.js';
import {readProgress,writeProgress,recordResult} from './storage.js';

const $=id=>document.getElementById(id);
const descriptions=['Szyszka z niespodzianką','Klasyczny strzał','Dopalacz w locie','Salwa kolców','Lot wprost do celu'];
const longDescriptions=['Zrzuca wybuchającą szyszkę.','Bez dodatkowej zdolności — liczy się celny strzał.','Przyspiesza w kierunku lotu.','Wystrzeliwuje dziesięć kolców.','Skręca w stronę najbliższego niedźwiadka.'];
let game,renderer,images,progress=readProgress(),savedResult=null,lastHUD='',started=false,drag=null;
let previousPaused=false;
const welcome=$('welcome-dialog');welcome.showModal();
welcome.addEventListener('cancel',event=>event.preventDefault());

function assetURL(key){return `assets/${ASSET_META[key].file}`;}
function openDialog(id) {
  previousPaused=game?.paused??true;if(game)game.paused=true;
  if(id==='levels-dialog')buildLevels();$(id).showModal();renderHUD();
}
for(const dialog of document.querySelectorAll('dialog:not(#welcome-dialog)')) {
  dialog.querySelector('.close-dialog')?.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{if(game)game.paused=previousPaused;lastHUD='';renderHUD();});
}
$('help-button').addEventListener('click',()=>openDialog('help-dialog'));
$('about-button').addEventListener('click',()=>openDialog('about-dialog'));
$('levels-button').addEventListener('click',()=>openDialog('levels-dialog'));
$('fullscreen-button').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{$('status-text').textContent='Pełny ekran jest niedostępny w tej przeglądarce.';}
});

function loadLevel(id) {
  game.load(id);game.paused=false;savedResult=null;lastHUD='';renderer.ready=false;
  $('result-overlay').hidden=true;renderHUD();
}
function buildLevels() {
  const grid=$('level-grid');grid.replaceChildren();
  for(let id=1;id<=LEVEL_COUNT;id++) {
    const button=document.createElement('button');const best=progress.best[id];
    button.className=`level-tile${id===game.level.id?' current':''}${best?' completed':''}`;
    button.textContent=id;button.setAttribute('aria-label',`Plansza ${id}${best?`, ukończona, wynik ${best.score}`:''}${id%10===0?', z armatą':''}`);
    if(best){const stars=document.createElement('small');stars.textContent='★'.repeat(best.stars);button.append(stars);}
    if(id%10===0){const flag=document.createElement('span');flag.className='flag';flag.textContent='⚑';button.append(flag);}
    button.addEventListener('click',()=>{$('levels-dialog').close();loadLevel(id);});grid.append(button);
  }
}
function act() {
  if(!game||game.paused)return;
  if(game.state==='aiming'){game.fire();$('game-canvas').focus({preventScroll:true});}
  else if(game.canUseAbility)game.ability();
  renderHUD();
}
$('fire-button').addEventListener('click',act);
$('restart-button').addEventListener('click',()=>loadLevel(game.level.id));
$('retry-result').addEventListener('click',()=>loadLevel(game.level.id));
$('next-button').addEventListener('click',()=>{if(game.state==='won'&&game.level.id<LEVEL_COUNT)loadLevel(game.level.id+1);else if(game.state==='lost')loadLevel(game.level.id);else openDialog('levels-dialog');});
function togglePause(){if(!started||['won','lost'].includes(game.state))return;game.paused=!game.paused;renderHUD();}
$('pause-button').addEventListener('click',togglePause);$('pause-cover').addEventListener('click',togglePause);
$('overview-button').addEventListener('click',()=>{renderer.setMode('overview');lastHUD='';renderHUD();});
$('follow-button').addEventListener('click',()=>{renderer.setMode('follow');lastHUD='';renderHUD();});
function aimFromControls() {
  game.aim(-Number($('angle').value)/4.5,-Number($('power').value)/5);
  renderHUD();
}
for(const id of ['angle','power'])$(id).addEventListener('input',aimFromControls);

function renderHUD() {
  if(!game)return;
  const signature=[game.state,game.ammoIndex,game.score,game.targets.length,game.aimStep,game.powerIndex,
    game.abilityUsed,game.paused,game.launcherLives,game.level.id,renderer?.mode].join('|');
  if(signature===lastHUD)return;lastHUD=signature;
  $('stage-number').textContent=String(game.level.id).padStart(2,'0');
  $('targets-value').textContent=game.targets.length;$('score-value').textContent=game.score;
  $('lives').hidden=!game.level.boss;
  [...$('lives').children].forEach((heart,index)=>heart.classList.toggle('empty',index>=game.launcherLives));
  $('lives').setAttribute('aria-label',`Życia wyrzutni: ${game.launcherLives} z 3`);
  const ammo=$('ammo');ammo.replaceChildren();
  game.level.ammo.forEach((id,index)=>{
    const slot=document.createElement('span');slot.className=`ammo-slot${index<game.ammoIndex?' used':''}${index===game.ammoIndex?' current':''}`;
    const image=document.createElement('img');image.src=assetURL(ANIMALS[id].frames[0]);image.alt=ANIMALS[id].label;slot.append(image);ammo.append(slot);
  });
  if(ammo.scrollWidth>ammo.clientWidth)ammo.scrollLeft=Math.max(0,game.ammoIndex*(window.innerWidth<=580?26:37)-26);
  const animal=game.currentAnimal??game.level.ammo.at(-1);
  $('animal-image').src=assetURL(ANIMALS[animal].frames[0]);$('animal-name').textContent=ANIMALS[animal].label;$('animal-ability').textContent=descriptions[animal];
  $('angle').value=-game.aimStep*4.5;$('power').value=-game.powerIndex*5;
  $('angle-value').textContent=`${(-game.aimStep*4.5).toLocaleString('pl-PL',{maximumFractionDigits:1})}°`;
  $('power-value').textContent=`${(-game.powerIndex*5).toLocaleString('pl-PL',{maximumFractionDigits:1})}%`;
  for(const id of ['angle','power']){const input=$(id);input.disabled=game.state!=='aiming'||game.paused;input.style.setProperty('--fill',`${(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))*100}%`);}
  $('fire-button').disabled=game.paused||!(game.state==='aiming'||game.canUseAbility);
  $('fire-label').textContent=game.state==='aiming'?'ATAKUJ!':game.canUseAbility?'ZDOLNOŚĆ':game.state==='boss'?'OSTRZAŁ':game.state==='won'?'SUKCES!':game.state==='lost'?'KONIEC':'W LOCIE…';
  document.querySelector('.fire-arrow').hidden=game.state!=='aiming';
  $('fire-shortcut').textContent=game.canUseAbility?'E / SPACJA':game.state==='aiming'?'SPACJA':'OBSERWUJ';
  const states={aiming:'PRZYGOTUJ ATAK',flying:'ZWIERZAK W AKCJI',settling:'KONSTRUKCJA PRACUJE',boss:'UWAGA NA ARMATĘ',won:'MISJA WYKONANA',lost:'JESZCZE JEDNA PRÓBA?'};
  $('state-label').textContent=states[game.state];
  const hints={aiming:'Ustaw kąt i moc. Resztę zrobi grawitacja.',flying:game.canUseAbility?'Teraz! Naciśnij E, żeby użyć zdolności.':'Celny strzał robi różnicę.',settling:'Jeszcze chwila… niech wszystko opadnie.',boss:'Armata odpowiada ogniem. Zniszcz jej lufę!',won:'',lost:''};
  $('field-hint').textContent=hints[game.state];$('field-hint').hidden=['won','lost'].includes(game.state);
  $('status-text').textContent=game.state==='aiming'?`Strąć wszystkie niedźwiadki. ${ANIMALS[animal].label}: ${longDescriptions[animal]}`:
    game.state==='boss'?'Wyrzutnia ma trzy życia. Zniszcz lufę, żeby zatrzymać ostrzał.':
    game.state==='settling'?'Zliczanie zniszczeń. Kolejny zwierzak zaraz będzie gotowy.':
    game.state==='won'?'Plansza ukończona. Najlepszy wynik został zapisany w tej przeglądarce.':
    game.state==='lost'?'Spróbuj innego kąta albo większej mocy. Masz nieograniczoną liczbę prób.':
    game.canUseAbility?'Użyj zdolności w odpowiednim momencie: przycisk, E lub spacja.':
    game.currentAnimal===1?'Skunks nie ma dodatkowej zdolności. Zaczekaj na wynik strzału.':'Zdolność użyta. Obserwuj lot zwierzaka.';
  const modalOpen=!!document.querySelector('dialog[open]');
  $('pause-cover').hidden=!game.paused||modalOpen||!started;
  $('pause-button').innerHTML=game.paused?'<span aria-hidden="true">▷</span> Wznów':'<span aria-hidden="true">Ⅱ</span> Pauza';
  $('overview-button').classList.toggle('active',renderer.mode==='overview');$('follow-button').classList.toggle('active',renderer.mode==='follow');
  if(['won','lost'].includes(game.state))showResult();
}

function showResult() {
  const won=game.state==='won';
  $('result-overlay').hidden=false;$('result-kicker').textContent=won?'DOBRA ROBOTA, EKIPO':'NIEDŹWIADKI JESZCZE STOJĄ';
  $('result-title').textContent=won?'Las odzyskany!':'Pora na rewanż.';
  $('result-character').src=assetURL(won?'char_squirrel1':'targetBIG_dmg1');
  $('result-stars').textContent=won?'★'.repeat(game.result.stars)+'☆'.repeat(3-game.result.stars):'↻';
  $('result-stars').setAttribute('aria-label',won?`${game.result.stars} z 3 gwiazdek`:'Spróbuj ponownie');
  $('result-description').textContent=won?`${game.score} punktów, w tym ${game.result.bonus} za niewykorzystane zwierzaki.`:
    game.launcherLives===0?'Armata zniszczyła wyrzutnię. Spróbuj najpierw trafić w jej lufę.':`Pozostałe cele: ${game.targets.length}. Zmień kąt, zwiększ moc i spróbuj ponownie.`;
  $('next-button').textContent=won?(game.level.id<LEVEL_COUNT?'Następna plansza →':'Wszystkie plansze →'):'Spróbuj ponownie ↻';
  $('retry-result').hidden=!won;
  if(won&&savedResult!==game.result) {
    progress=recordResult(progress,game.level.id,game.score,game.result.stars);
    if(!writeProgress(progress))$('status-text').textContent='Plansza ukończona. Przeglądarka nie pozwoliła zapisać wyniku — pozostaje dostępny w tej sesji.';
    savedResult=game.result;
  }
}

document.addEventListener('keydown',event=>{
  if(!started||document.querySelector('dialog[open]'))return;
  if(['INPUT','BUTTON','A'].includes(event.target.tagName)&&event.code!=='Escape')return;
  const keys=['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyE','KeyR','KeyP','KeyV','Escape'];
  if(!keys.includes(event.code))return;event.preventDefault();
  if((event.code==='Space'||event.code==='KeyE')&&!event.repeat)act();
  else if(event.code==='KeyR'&&!event.repeat)loadLevel(game.level.id);
  else if(['KeyP','Escape'].includes(event.code)&&!event.repeat)togglePause();
  else if(event.code==='KeyV'&&!event.repeat){renderer.setMode(renderer.mode==='overview'?'follow':'overview');lastHUD='';}
  else if(event.code.startsWith('Arrow')) {
    const input=$(['ArrowUp','ArrowDown'].includes(event.code)?'angle':'power');
    if(!input.disabled) {
      if(['ArrowUp','ArrowRight'].includes(event.code))input.stepUp();else input.stepDown();
      aimFromControls();
    }
  }
  renderHUD();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&started&&game){game.paused=true;lastHUD='';renderHUD();}});

const canvas=$('game-canvas');
const pointer=event=>{const r=canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};};
canvas.addEventListener('pointerdown',event=>{
  if(!started||game.paused||event.button!==0)return;const p=pointer(event);const launch=renderer.screenPoint(game.shot.x,game.shot.y);
  drag={pointerId:event.pointerId,start:p,last:p,mode:game.state==='aiming'&&Math.hypot(p.x-launch.x,p.y-launch.y)<Math.max(35,28*renderer.camera.scale)?'aim':'pan',moved:false};
  canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});
});
canvas.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.pointerId)return;const p=pointer(event);
  if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>6)drag.moved=true;
  if(drag.mode==='aim'&&drag.moved) {
    const world=renderer.worldPoint(p.x,p.y),pivot=game.level.launcher;
    const dx=pivot.x-world.x,dy=pivot.y-world.y;
    game.aim(Math.atan2(dy,dx)/AIM_STEP,-Math.hypot(dx,dy)/2);
  } else if(drag.mode==='pan'&&drag.moved)renderer.pan(p.x-drag.last.x,p.y-drag.last.y);
  drag.last=p;lastHUD='';renderHUD();
});
canvas.addEventListener('pointerup',event=>{if(!drag||event.pointerId!==drag.pointerId)return;const fire=drag.mode==='aim'&&drag.moved;drag=null;if(fire)act();});
canvas.addEventListener('pointercancel',()=>{drag=null;});
canvas.addEventListener('lostpointercapture',()=>{drag=null;});
canvas.addEventListener('wheel',event=>{if(!started)return;event.preventDefault();const p=pointer(event);renderer.zoom(event.deltaY<0?1.12:1/1.12,p.x,p.y);lastHUD='';renderHUD();},{passive:false});

let previousTime=0,accumulator=0;
function frame(now) {
  if(!previousTime)previousTime=now;accumulator+=Math.min((now-previousTime)/1000,.2);previousTime=now;
  while(accumulator>=FIXED_DT){game.update(FIXED_DT);accumulator-=FIXED_DT;}
  renderer.draw(game,now/1000);renderHUD();requestAnimationFrame(frame);
}

try {
  images=await loadAssets();game=new Game(Math.min(progress.unlocked,LEVEL_COUNT));game.paused=true;
  renderer=new Renderer(canvas,images);
  for(const animal of ANIMALS) {
    const row=document.createElement('div');row.className='guide-animal';
    const img=document.createElement('img');img.src=assetURL(animal.frames[0]);img.alt='';
    const name=document.createElement('b');name.textContent=animal.label;
    const text=document.createElement('span');text.textContent=longDescriptions[animal.id];row.append(img,name,text);$('animal-guide').append(row);
  }
  $('start-button').disabled=false;$('start-button').textContent=progress.unlocked>1?'Wracamy do gry →':'No to atakujemy! →';
  $('start-button').addEventListener('click',()=>{welcome.close();started=true;game.paused=false;lastHUD='';canvas.focus({preventScroll:true});renderHUD();});
  // A read-only snapshot is useful for accessibility diagnostics and regression QA.
  window.zwierzaki={snapshot:()=>({level:game.level.id,state:game.state,paused:game.paused,
    score:game.score,targets:game.targets.length,ammo:game.ammoRemaining,angle:game.aimStep,
    power:game.powerIndex,lives:game.launcherLives,view:renderer.mode,
    projectile:game.projectile?{x:game.projectile.x,y:game.projectile.y}:null})};
  requestAnimationFrame(frame);
} catch(error) {
  console.error(error);$('start-button').textContent='Nie udało się wczytać gry';
  const box=$('loading-error');box.hidden=false;box.textContent='Nie udało się wczytać plików gry. Odśwież stronę, żeby spróbować ponownie.';
}
