// missiles: Missile Command over Claude's window. Missiles streak down from
// random points along the top towards random points on the ground (some at
// the turrets), staggered. Three pixel turrets stand on the ground: a click
// sends an interceptor from the nearest ready turret up to the click point,
// where it bursts into a blast that starts small, grows to full size, then
// fades and is gone in about 1.7 s; any missile whose head touches a live blast is destroyed, and
// its own small blast can take others with it. A missile that reaches the
// ground leaves a crater; one that hits a turret destroys it, and with every
// turret gone the round ends early. Level 1 is easy, level 10 close to
// impossible: more, faster missiles (each with its own speed, 0.4 to 2.2
// times the level's base), more at once, a smaller blast, slower
// reloads and interceptors, and from level 7 missiles that split in flight.
//
// An interactive one-shot in the effects' shape (effects.ts): `(w, h, level)
// => html`. The overlay takes clicks and keys for it (overlay.ts,
// `interactive`). It closes itself with the drip close signal after a short
// end screen, at once on Esc, and always before its backstop
// (oneShotSafetyMs: MISSILES_SAFETY_MS).

const CLOSE = `console.log("__drip_close__");try{if(window.parent!==window)window.parent.postMessage("__drip_close__","*")}catch(e){}`

export const MISSILES_DEFAULT_LEVEL = 3
export const MISSILES_MIN_LEVEL = 1
export const MISSILES_MAX_LEVEL = 10
/** The longest a round runs, in ms; a wave usually ends sooner. */
export const MISSILES_ROUND_MS = 30_000
/** How long a blast lives, in ms: it starts small, grows to full size, then fades. */
export const MISSILES_BLAST_MS = 1_700
/** A blast's radius at its start, as a fraction of its full size. */
export const MISSILES_BLAST_START = 0.15
/** Each missile's speed, as a range of multiples of the level's base speed:
 *  slow drifters and fast darts in the same wave. */
export const MISSILES_SPEED_RANGE = [0.4, 2.2] as const
/** The turrets on the ground, as fractions of the width. */
export const MISSILES_TURRETS = [0.15, 0.5, 0.85]
/** How long the end screen stays, in ms. */
export const MISSILES_END_MS = 2_200
/** The backstop: the round, the end screen and ten seconds more. */
export const MISSILES_SAFETY_MS = MISSILES_ROUND_MS + MISSILES_END_MS + 10_000

/** A level from anything: a whole number from 1 to 10, the default otherwise. */
export function missilesLevel(level: unknown): number {
  const n = typeof level === 'number' && Number.isFinite(level) ? Math.round(level) : MISSILES_DEFAULT_LEVEL
  return Math.min(MISSILES_MAX_LEVEL, Math.max(MISSILES_MIN_LEVEL, n))
}

export type MissilesTuning = {
  /** Missiles in the wave (not counting the ones that split off). */
  count: number
  /** Seconds a missile at the base speed takes from the top to the ground;
   *  each missile's own speed is MISSILES_SPEED_RANGE times the base. */
  fallS: number
  /** Seconds over which the wave is launched. */
  launchS: number
  /** The most missiles in the air at once. */
  maxActive: number
  /** A blast's full radius, in px at an 800 px tall window. */
  blastR: number
  /** Ms a turret takes to reload after a shot. */
  reloadMs: number
  /** An interceptor's speed, in px/s at an 800 px tall window. */
  interceptorSpeed: number
  /** Chance a missile is aimed at a turret. */
  turretAim: number
  /** Chance a missile splits in flight (0 below level 7). */
  splitChance: number
}

/** How a level plays. */
export function missilesTuning(level: number): MissilesTuning {
  const L = missilesLevel(level)
  const k = (L - 1) / 9
  return {
    count: Math.round(12 + 28 * k),
    fallS: +(5 * Math.pow(1.4 / 5, k)).toFixed(2),
    launchS: +(14 - 3 * k).toFixed(2),
    maxActive: Math.round(6 + 8 * k),
    blastR: Math.round(64 - 30 * k),
    reloadMs: Math.round(250 + 650 * k),
    interceptorSpeed: Math.round(1700 - 600 * k),
    turretAim: +(0.15 + 0.25 * k).toFixed(2),
    splitChance: L >= 7 ? +(0.12 * (L - 6)).toFixed(2) : 0,
  }
}

const RATINGS = ['FLAWLESS. NOT A SCRATCH ON THE GROUND.', 'ACE DEFENDER.', 'HOLDING THE LINE.', 'THE GROUND TOOK A BEATING.', 'CRATER CITY.']

/** The rating under the score on the end screen (the page reckons it the same way). */
export function missilesRating(stopped: number, total: number): string {
  const p = total > 0 ? stopped / total : 1
  return RATINGS[p >= 1 ? 0 : p >= 0.8 ? 1 : p >= 0.5 ? 2 : p >= 0.2 ? 3 : 4]!
}

export function dripMissiles(w: number, h: number, level: number = MISSILES_DEFAULT_LEVEL): string {
  const L = missilesLevel(level)
  const t = missilesTuning(L)
  const s = Math.max(2, Math.min(6, Math.floor(h / 160)))
  const scale = Math.max(0.6, Math.min(1.6, h / 800))
  return `<html><head><style>
*{margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:rgba(6,8,22,0.38);cursor:crosshair;user-select:none;-webkit-user-select:none}
canvas{position:absolute;left:0;top:0;image-rendering:pixelated;cursor:crosshair}
</style></head><body>
<canvas id="c" width="${w}" height="${h}"></canvas>
<script>
(function(){
var W=${w},H=${h},S=${s},LEVEL=${L},COUNT=${t.count},FALL=${t.fallS * 1000},LAUNCH=${t.launchS * 1000},MAXA=${t.maxActive};
var BLAST=${Math.round(t.blastR * scale)},BLASTMS=${MISSILES_BLAST_MS},RELOAD=${t.reloadMs},SPLIT=${t.splitChance},AIM=${t.turretAim};
var SPMIN=${MISSILES_SPEED_RANGE[0]},SPMAX=${MISSILES_SPEED_RANGE[1]},B0=${MISSILES_BLAST_START};
var ISPEED=${Math.round(t.interceptorSpeed * scale)},ROUND=${MISSILES_ROUND_MS},ENDMS=${MISSILES_END_MS};
var RATINGS=${JSON.stringify(RATINGS)};
var c=document.getElementById("c").getContext("2d");
var GROUND=H-Math.max(18,S*6),INTRO=1400;
var missiles=[],shots=[],blasts=[],parts=[],texts=[],craters=[];
var turrets=${JSON.stringify(MISSILES_TURRETS)}.map(function(f){return{x:Math.round(W*f),alive:true,ready:0}});
var stats={score:0,stopped:0,landed:0,total:0,launched:0,fired:0,turrets:turrets.length};
var state="play",endAt=0,shake=0,closed=false,now0=0;
var TRAILS=["#ff4d6d","#ff9f1c","#f72585","#ffd60a","#b5179e"];
function close(){if(closed)return;closed=true;c.clearRect(0,0,W,H);${CLOSE}}
// The launch plan: COUNT missiles staggered over LAUNCH ms after the intro.
var plan=[];for(var i=0;i<COUNT;i++)plan.push(INTRO+LAUNCH*(i+Math.random()*0.9)/COUNT);
plan.sort(function(a,b){return a-b});
function rnd(a,b){return a+Math.random()*(b-a)}
function aliveTurrets(){return turrets.filter(function(u){return u.alive})}
function groundTarget(){
  var live=aliveTurrets();
  if(live.length&&Math.random()<AIM)return live[Math.floor(Math.random()*live.length)].x+rnd(-S,S);
  return rnd(W*0.03,W*0.97);
}
function launch(x,y,dur,child){
  missiles.push({sx:x,sy:y,tx:groundTarget(),ty:GROUND,x:x,y:y,age:0,dur:dur,col:TRAILS[Math.floor(Math.random()*TRAILS.length)],child:!!child,
    split:!child&&Math.random()<SPLIT,splitAt:rnd(0.3,0.55)});
  stats.total++;
}
function burst(x,y,n,cols,speed,life,g){for(var i=0;i<n;i++){var a=Math.random()*Math.PI*2,v=speed*(0.3+Math.random());
  parts.push({x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-speed*0.4,life:life,max:life,size:S*(0.6+Math.random()),col:cols[i%cols.length],g:g===undefined?0.18:g})}}
function say(x,y,word,col){texts.push({x:x,y:y,word:word,col:col||"#ffd60a",t:0,life:700})}
function blast(x,y,r,life){blasts.push({x:x,y:y,r:r,age:0,life:life,cur:0});burst(x,y,8,["#fff","#ffd60a","#4cc9f0"],2,300,0.05)}
function turretTop(u){return{x:u.x,y:GROUND-S*5}}
// A click: the nearest ready turret fires an interceptor up to the point.
function shoot(x,y){
  if(state!=="play"||closed)return;
  y=Math.min(y,GROUND-S*7);
  var best=null,bd=1e18;
  for(var i=0;i<turrets.length;i++){var u=turrets[i];if(!u.alive||u.ready>now0)continue;var d=Math.abs(u.x-x);if(d<bd){bd=d;best=u}}
  if(!best)return;
  best.ready=now0+RELOAD;stats.fired++;
  var o=turretTop(best),dist=Math.max(1,Math.hypot(x-o.x,y-o.y));
  shots.push({sx:o.x,sy:o.y,tx:x,ty:y,x:o.x,y:o.y,age:0,dur:dist/ISPEED*1000});
  burst(o.x,o.y,5,["#fff","#4cc9f0"],1.5,200,0.05);
}
function hitGround(m){
  stats.landed++;shake=Math.max(shake,S*2.5);
  var hit=null;for(var i=0;i<turrets.length;i++){var u=turrets[i];if(u.alive&&Math.abs(u.x-m.tx)<S*6){hit=u;break}}
  if(hit){hit.alive=false;stats.turrets--;shake=S*4;burst(hit.x,GROUND-S*3,30,["#4cc9f0","#fff","#ff9f1c","#8d99ae"],5,1100,0.22);say(hit.x,GROUND-S*16,"TURRET DOWN!","#4cc9f0")}
  else{craters.push({x:m.tx,w:S*rnd(5,8)});say(m.tx,GROUND-S*12,"BOOM!","#ff4d6d")}
  burst(m.tx,GROUND,22,["#ff4d6d","#ff9f1c","#ffd60a","#8d6e63","#5d4037"],4.2,900,0.22);
  blasts.push({x:m.tx,y:GROUND,r:BLAST*0.6,age:0,life:500,ground:true});
}
function destroy(m,i){
  missiles.splice(i,1);stats.stopped++;
  var pts=(m.child?5:10)*LEVEL;stats.score+=pts;
  burst(m.x,m.y,16,["#fff",m.col,"#ffd60a"],3.4,600,0.12);
  blast(m.x,m.y,BLAST*0.5,BLASTMS*0.5);
  say(m.x,m.y-S*8,["POP!","BAM!","ZAP!","+"+pts][Math.floor(Math.random()*4)],m.col);
}
document.addEventListener("mousedown",function(ev){ev.preventDefault();shoot(ev.clientX,ev.clientY)});
document.addEventListener("keydown",function(ev){if(ev.key==="Escape"||ev.keyCode===27){ev.preventDefault();close()}});
window.__missiles={stats:stats,missiles:missiles,shots:shots,blasts:blasts,turrets:turrets,shoot:shoot,state:function(){return state},level:LEVEL};
function pixelText(str,x,y,size,col,align){
  c.font="900 "+Math.round(size)+"px Menlo, Monaco, 'Courier New', monospace";c.textAlign=align||"left";c.textBaseline="top";
  c.fillStyle="#000";c.fillText(str,x+Math.max(2,size/8),y+Math.max(2,size/8));c.fillStyle=col;c.fillText(str,x,y);
}
function drawGround(){
  c.fillStyle="#2d6a4f";c.fillRect(0,GROUND,W,S*2);
  c.fillStyle="#52b788";for(var x=0;x<W;x+=S*4)c.fillRect(x,GROUND,S*2,S);
  c.fillStyle="#3e2723";c.fillRect(0,GROUND+S*2,W,H-GROUND-S*2);
  c.fillStyle="#5d4037";for(var x2=S*3;x2<W;x2+=S*9)c.fillRect(x2,GROUND+S*4,S,S);
  for(var j=0;j<craters.length;j++){var cr=craters[j];c.fillStyle="#120a08";c.fillRect(cr.x-cr.w/2,GROUND,cr.w,S*2);c.fillRect(cr.x-cr.w/2+S,GROUND+S*2,cr.w-S*2,S)}
}
// A turret: a pixel dome with a barrel; grey rubble once hit; its barrel dims while reloading.
var TURRET=["....bb....","....bb....","..dddddd..",".dddddddd.","dddddddddd"];
function drawTurret(u){
  var x0=u.x-S*5,y0=GROUND-S*5;
  if(!u.alive){c.fillStyle="#4a4e69";c.fillRect(x0+S,GROUND-S*2,S*3,S*2);c.fillRect(x0+S*5,GROUND-S,S*4,S);c.fillStyle="#22223b";c.fillRect(x0+S*3,GROUND-S*3,S*2,S*3);return}
  var ready=u.ready<=now0;
  for(var r=0;r<TURRET.length;r++)for(var k=0;k<10;k++){var ch=TURRET[r][k];if(ch===".")continue;
    c.fillStyle=ch==="b"?(ready?"#fff":"#8d99ae"):(r===2?"#90e0ef":"#4cc9f0");c.fillRect(x0+k*S,y0+r*S,S,S)}
}
function drawMissile(m){
  var g=c.createLinearGradient(m.sx,m.sy,m.x,m.y);g.addColorStop(0,"rgba(255,255,255,0)");g.addColorStop(1,m.col);
  c.strokeStyle=g;c.lineWidth=Math.max(2,S*0.7);c.beginPath();c.moveTo(m.sx,m.sy);c.lineTo(m.x,m.y);c.stroke();
  c.fillStyle=m.col;c.fillRect(m.x-S*1.5,m.y-S*1.5,S*3,S*3);
  c.fillStyle="#fff";c.fillRect(m.x-S/2,m.y-S/2,S,S);
  if(Math.random()<0.5)parts.push({x:m.x,y:m.y,vx:(Math.random()-0.5)*0.6,vy:-0.3,life:300,max:300,size:S*0.8,col:m.col,g:0});
}
function drawShot(sh){
  c.strokeStyle="rgba(76,201,240,0.9)";c.lineWidth=Math.max(2,S*0.6);c.beginPath();c.moveTo(sh.sx,sh.sy);c.lineTo(sh.x,sh.y);c.stroke();
  c.fillStyle="#fff";c.fillRect(sh.x-S,sh.y-S,S*2,S*2);
  // The target mark: a small x where it will burst.
  c.strokeStyle="rgba(255,255,255,0.7)";c.lineWidth=Math.max(1,S*0.4);c.beginPath();
  c.moveTo(sh.tx-S*2,sh.ty-S*2);c.lineTo(sh.tx+S*2,sh.ty+S*2);c.moveTo(sh.tx+S*2,sh.ty-S*2);c.lineTo(sh.tx-S*2,sh.ty+S*2);c.stroke();
}
// A blast starts small and grows to full size over most of its life (easing out), then fades away.
function blastRadius(b){if(b.ground)return b.r;var k=Math.min(1,b.age/(b.life*0.7));return b.r*(B0+(1-B0)*(1-Math.pow(1-k,2)))}
function drawBlast(b){
  var k=b.age/b.life,r=b.cur,a=b.ground?1-k:(k<0.7?1:1-(k-0.7)/0.3);
  var cols=b.ground?["#ff4d6d","#ff9f1c","#ffd60a"]:["#fff","#ffd60a","#4cc9f0","#f72585","#ff9f1c"];
  c.save();c.globalAlpha=Math.max(0,a);
  c.fillStyle=cols[Math.floor(b.age/60)%cols.length];
  c.beginPath();if(b.ground)c.arc(b.x,b.y,r,Math.PI,0);else c.arc(b.x,b.y,r,0,Math.PI*2);c.fill();
  c.globalAlpha=Math.max(0,a*0.85);c.fillStyle="#fff";c.beginPath();c.arc(b.x,b.y,r*0.3,0,Math.PI*2);c.fill();c.restore();
}
function drawText(tx){
  var k=Math.min(1,tx.t/100),a=tx.t>tx.life-250?(tx.life-tx.t)/250:1;
  c.save();c.globalAlpha=Math.max(0,a);pixelText(tx.word,tx.x,tx.y-tx.t*0.03,S*4*(0.6+0.4*k),tx.col,"center");c.restore();
}
function drawHud(){
  var size=Math.max(12,S*4),pad=S*4;
  pixelText("LEVEL "+LEVEL+"   SCORE "+stats.score,pad,pad,size,"#ffd60a","left");
  pixelText("STOPPED "+stats.stopped+"   LANDED "+stats.landed,W-pad,pad,size,"#4cc9f0","right");
  pixelText("TURRETS "+stats.turrets+"/"+turrets.length,pad,pad+size*1.4,Math.max(10,size*0.6),"rgba(255,255,255,0.75)","left");
  pixelText("ESC TO QUIT",W-pad,pad+size*1.4,Math.max(10,size*0.6),"rgba(255,255,255,0.6)","right");
}
function drawIntro(t){
  if(t>INTRO+400)return;var a=t>INTRO?1-(t-INTRO)/400:1;
  c.save();c.globalAlpha=a;
  pixelText("MISSILE COMMAND  LEVEL "+LEVEL,W/2,H*0.36,Math.max(18,S*7),"#ffd60a","center");
  pixelText("CLICK TO FIRE. KEEP THE MISSILES OFF THE GROUND. ESC TO QUIT.",W/2,H*0.36+Math.max(18,S*7)*1.6,Math.max(12,S*4),"#fff","center");
  c.restore();
}
function drawEnd(t){
  var k=Math.min(1,(t-endAt)/250),bw=Math.min(W*0.8,S*150),bh=Math.max(120,S*40),bx=W/2-bw/2,by=H*0.42-bh/2;
  c.save();c.globalAlpha=k;c.fillStyle="rgba(10,12,30,0.9)";c.fillRect(bx,by,bw,bh);c.strokeStyle="#ffd60a";c.lineWidth=S;c.strokeRect(bx,by,bw,bh);
  var big=Math.max(18,Math.min(S*8,bw/14));
  pixelText("STOPPED "+stats.stopped+" OF "+stats.total,W/2,by+bh*0.14,big,"#ffd60a","center");
  pixelText(stats.turrets===0?"ALL TURRETS LOST.":RATINGS[ratingIndex()],W/2,by+bh*0.14+big*1.5,Math.max(12,big*0.55),"#fff","center");
  pixelText("SCORE "+stats.score+"   LEVEL "+LEVEL,W/2,by+bh*0.14+big*2.6,Math.max(12,big*0.55),"#4cc9f0","center");
  c.restore();
}
function ratingIndex(){var p=stats.total>0?stats.stopped/stats.total:1;return p>=1?0:p>=0.8?1:p>=0.5?2:p>=0.2?3:4}
var start=performance.now(),last=start;
function frame(now){
  if(closed)return;
  var t=now-start,dt=Math.min(40,now-last);last=now;now0=now;
  if(state==="play"){
    while(stats.launched<plan.length&&t>=plan[stats.launched]&&missiles.length<MAXA){stats.launched++;launch(rnd(W*0.05,W*0.95),-S*2,FALL/rnd(SPMIN,SPMAX),false)}
    if(stats.launched<plan.length&&missiles.length>=MAXA){for(var p=stats.launched;p<plan.length;p++)plan[p]=Math.max(plan[p],t+120)}
    for(var i=missiles.length-1;i>=0;i--){var m=missiles[i];m.age+=dt;var k=Math.min(1,m.age/m.dur);
      m.x=m.sx+(m.tx-m.sx)*k;m.y=m.sy+(m.ty-m.sy)*k;
      if(m.split&&k>=m.splitAt){m.split=false;var n=LEVEL>=9?2:1;for(var q=0;q<n;q++)launch(m.x,m.y,(m.dur-m.age)*rnd(0.6,1.2),true);
        burst(m.x,m.y,8,["#fff",m.col],2,300,0.05)}
      if(k>=1){missiles.splice(i,1);hitGround(m)}}
    for(var si=shots.length-1;si>=0;si--){var sh=shots[si];sh.age+=dt;var sk=Math.min(1,sh.age/sh.dur);
      sh.x=sh.sx+(sh.tx-sh.sx)*sk;sh.y=sh.sy+(sh.ty-sh.sy)*sk;
      if(sk>=1){shots.splice(si,1);blast(sh.tx,sh.ty,BLAST,BLASTMS)}}
    for(var b=0;b<blasts.length;b++){var bl=blasts[b];if(bl.ground)continue;
      for(var j=missiles.length-1;j>=0;j--){var mm=missiles[j],dx=mm.x-bl.x,dy=mm.y-bl.y;if(dx*dx+dy*dy<=bl.cur*bl.cur)destroy(mm,j)}}
    var allLost=stats.turrets===0;
    if((stats.launched>=plan.length&&missiles.length===0&&t>INTRO)||t>=ROUND||allLost){state="end";endAt=t;
      for(var r2=missiles.length-1;r2>=0;r2--){stats.landed++;missiles.splice(r2,1)}shots.length=0}
  }
  for(var bk=blasts.length-1;bk>=0;bk--){var B0=blasts[bk];B0.age+=dt;if(B0.age>=B0.life){blasts.splice(bk,1);continue}B0.cur=blastRadius(B0)}
  c.clearRect(0,0,W,H);
  c.save();if(shake>0){c.translate((Math.random()-0.5)*shake,(Math.random()-0.5)*shake);shake=Math.max(0,shake-dt*0.03)}
  drawGround();
  for(var ui=0;ui<turrets.length;ui++)drawTurret(turrets[ui]);
  for(var mi=0;mi<missiles.length;mi++)drawMissile(missiles[mi]);
  for(var sj=0;sj<shots.length;sj++)drawShot(shots[sj]);
  for(var bi=0;bi<blasts.length;bi++)drawBlast(blasts[bi]);
  for(var pi=parts.length-1;pi>=0;pi--){var pt=parts[pi];pt.life-=dt;if(pt.life<=0){parts.splice(pi,1);continue}
    pt.x+=pt.vx;pt.y+=pt.vy;pt.vy+=pt.g;if(pt.y>GROUND+S*2&&pt.g>0.1){pt.y=GROUND+S*2;pt.vy*=-0.3;pt.vx*=0.7}
    c.globalAlpha=pt.life/pt.max;c.fillStyle=pt.col;c.fillRect(pt.x,pt.y,pt.size,pt.size);c.globalAlpha=1}
  for(var ti=texts.length-1;ti>=0;ti--){var tx=texts[ti];tx.t+=dt;if(tx.t>=tx.life){texts.splice(ti,1);continue}drawText(tx)}
  c.restore();
  drawHud();drawIntro(t);
  if(state==="end"){drawEnd(t);if(t-endAt>=ENDMS){close();return}}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setTimeout(close,ROUND+ENDMS+600);
})();
</${'script'}>
</body></html>`
}
