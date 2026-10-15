// gunfight: two cartoon pixel cowboys trade shots from both sides of the
// screen, muzzle flashes, tracers, ricochet sparks, smoke and comic bursts,
// until the last shot settles it: either one wins (a coin toss), or now and
// then both go down at once and a turkey struts out to gobble over them. A one-shot effect in the same shape
// as the app's (effects.ts): `(w, h) => html`, closing itself with the drip
// close signal before the 8 s backstop.

const CLOSE = `console.log("__drip_close__");try{if(window.parent!==window)window.parent.postMessage("__drip_close__","*")}catch(e){}`

/** How long the fight runs, in ms; under the one-shot backstop (8 s). */
export const GUNFIGHT_MS = 6800

export function dripGunfight(w: number, h: number): string {
  const s = Math.max(3, Math.min(7, Math.floor(h / 110)))
  return `<html><head><style>
*{margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:rgba(0,0,0,0)}
canvas{position:absolute;left:0;top:0;image-rendering:pixelated}
</style></head><body>
<canvas id="c" width="${w}" height="${h}"></canvas>
<script>
(function(){
var W=${w},H=${h},S=${s},END=${GUNFIGHT_MS};
var c=document.getElementById("c").getContext("2d");
// The cowboy, facing right: 14 x 18 pixels, gun held out at (13, 9).
var SPRITE=[
"....HHHH......",
"...HHHHHH.....",
".HHHHHHHHHH...",
"...hhhhhh.....",
"...SSSSSS.....",
"...SSSESE.....",
"...SSSSSS.....",
"...SMMMMS.....",
"....SSSS......",
"..RRRRRRRSSGGG",
"..RRRRRRR..g..",
"..RRRRRRR.....",
"..BBBYBBB.....",
"..PPPPPPP.....",
"..PPP.PPP.....",
"..PPP.PPP.....",
"..KKK.KKK.....",
".KKKK.KKKK...."];
var HAT=SPRITE.slice(0,4);
var COL={H:"#8b5a2b",h:"#3b2410",S:"#f2c08a",E:"#111",M:"#4a2c14",B:"#2b1a0e",Y:"#ffd23f",P:"#3a4a8a",K:"#5b3a1e",G:"#a7b0ba",g:"#5a5f66"};
var SW=14*S,SH=18*S,GROUND=H-Math.max(16,S*4);
var L={x:-SW,shirt:"#d63031",flip:false,fall:0,hat:null};
var R={x:W,shirt:"#0984e3",flip:true,fall:0,hat:null};
var LX=Math.max(24,W*0.08),RX=W-LX-SW;
var parts=[],texts=[],shots=[],fired={};
// Shots: who fires, when (ms), and whether it ends the fight.
var r0=Math.random(),OUTCOME=r0<0.4?"L":r0<0.8?"R":"both";
var PLAN=[["L",1300],["R",1850],["L",2400],["R",2900],["L",3400],["R",3850]];
if(OUTCOME==="both")PLAN.push(["L",4350,true],["R",4350,true]);else PLAN.push([OUTCOME,4350,true]);
var WIN=OUTCOME==="L"?L:OUTCOME==="R"?R:null;
// The turkey, facing right: tail fan behind, snood and wattle in front.
var TURKEY=[
"..OoYO..........",
".OoYoOY.........",
"OoYoOYo.....hh..",
"OYoOYoO....hEh..",
".OoYOo....hhhk..",
"..BBBBBBBBhhrr..",
".BBBBBBBBBBBr...",
".BBBBBBBBBBB....",
"..BBBBBBBBB.....",
"...BBBBBBB......"];
var TCOL={O:"#e67e22",o:"#6d3a1a",Y:"#f1c40f",B:"#8e5a2a",h:"#c8d6e5",E:"#111",k:"#f39c12",r:"#e74c3c",L:"#f39c12"};
var gobbled=false;
function drawTurkey(t){
  var t0=t-4900;if(OUTCOME!=="both"||t0<0)return;
  var tw=16*S,mid=W/2-tw/2,x;
  if(t0<700)x=-tw+(mid+tw)*(t0/700);else if(t0<1300)x=mid;else x=mid+(W-mid)*((t0-1300)/600);
  var walking=t0<700||t0>=1300,bob=walking?(Math.floor(t0/120)%2)*S:Math.round(Math.sin(t0/60))*S;
  var y=GROUND-14*S;
  for(var r=0;r<TURKEY.length;r++)for(var k=0;k<16;k++){var ch=TURKEY[r][k];if(ch===".")continue;
    var lift=(r<=5&&k>=10)?bob:0;c.fillStyle=TCOL[ch];c.fillRect(x+k*S,y+r*S+lift,S,S)}
  var step=walking&&Math.floor(t0/120)%2;
  c.fillStyle=TCOL.L;c.fillRect(x+(4+(step?1:0))*S,y+10*S,S,3*S);c.fillRect(x+(8-(step?1:0))*S,y+10*S,S,3*S);
  c.fillRect(x+(3+(step?1:0))*S,y+12*S,2*S,S);c.fillRect(x+(7-(step?1:0))*S,y+12*S,2*S,S);
  if(!gobbled&&t0>=750){gobbled=true;say(mid+tw/2,y-S*10,"GOBBLE!",true)}
}
function drawRows(rows,x,y,flip,shirt){
  for(var r=0;r<rows.length;r++)for(var k=0;k<rows[r].length;k++){
    var ch=rows[r][k];if(ch===".")continue;
    c.fillStyle=ch==="R"?shirt:COL[ch];
    var px=flip?x+(13-k)*S:x+k*S;c.fillRect(px,y+r*S,S,S);
  }
}
function drawCowboy(p,t){
  var y=GROUND-SH;
  c.save();
  if(p.fall>0){var fx=p.flip?p.x+SW:p.x,fy=GROUND;c.translate(fx,fy);c.rotate((p.flip?1:-1)*p.fall*Math.PI/2);c.translate(-fx,-fy)}
  var rows=p.hat?SPRITE.slice(4):SPRITE;
  drawRows(rows,p.x,p.hat?y+4*S:y,p.flip,p.shirt);
  c.restore();
  if(p.hat){c.save();c.translate(p.hat.x,p.hat.y);c.rotate(p.hat.a);drawRows(HAT,-7*S,-2*S,p.flip,p.shirt);c.restore()}
}
function muzzle(p){return{x:p.flip?p.x:p.x+SW,y:GROUND-SH+9*S+S/2}}
function burst(x,y,n,colors,speed,life){
  for(var i=0;i<n;i++){var a=Math.random()*Math.PI*2,v=speed*(0.4+Math.random());
    parts.push({x:x,y:y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-speed*0.3,life:life,max:life,size:S*(0.6+Math.random()),col:colors[i%colors.length],g:0.25})}
}
function smoke(x,y,n){for(var i=0;i<n;i++)parts.push({x:x,y:y,vx:(Math.random()-0.5)*0.8,vy:-0.6-Math.random()*0.8,life:900,max:900,size:S*(1.5+Math.random()*2),col:"smoke",g:-0.005})}
function say(x,y,word,big){texts.push({x:x,y:y,word:word,t:0,life:big?1100:650,big:!!big})}
function star(x,y,r1,r2,n){c.beginPath();for(var i=0;i<n*2;i++){var r=i%2?r2:r1,a=i*Math.PI/n-Math.PI/2;c.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r)}c.closePath()}
function drawText(tx){
  var k=Math.min(1,tx.t/120),fade=tx.t>tx.life-200?(tx.life-tx.t)/200:1,size=(tx.big?S*9:S*5)*(0.6+0.4*k);
  c.save();c.globalAlpha=Math.max(0,fade);c.translate(tx.x,tx.y);c.rotate(tx.big?-0.12:(tx.x<W/2?-0.18:0.18));
  star(0,0,size*1.6,size*1.1,12);c.fillStyle="#fff";c.fill();c.lineWidth=Math.max(2,S*0.8);c.strokeStyle="#111";c.stroke();
  star(0,0,size*1.25,size*0.9,12);c.fillStyle=tx.big?"#ffd23f":"#ffeaa7";c.fill();
  c.font="900 "+Math.round(size)+"px Impact, 'Arial Black', sans-serif";c.textAlign="center";c.textBaseline="middle";
  c.lineWidth=Math.max(3,S);c.strokeStyle="#111";c.strokeText(tx.word,0,2);c.fillStyle=tx.big?"#e17055":"#d63031";c.fillText(tx.word,0,2);
  c.restore();
}
function fire(who,final){
  var from=who==="L"?L:R,to=who==="L"?R:L,m=muzzle(from);
  burst(m.x,m.y,10,["#fff","#ffd23f","#ff9f43"],3,260);smoke(m.x,m.y,4);
  say(from.flip?m.x-S*12:m.x+S*12,m.y-S*10,"BANG!",false);
  var target=final?{x:to.x+SW/2,y:GROUND-SH+6*S}:{x:to.flip?to.x+S*2:to.x+SW-S*2,y:GROUND-SH+(Math.random()<0.5?2:12)*S};
  shots.push({x:m.x,y:m.y,tx:target.x,ty:target.y,t:0,dur:320,final:!!final,to:to,flash:90});
}
function land(sh){
  if(sh.final){
    burst(sh.tx,sh.ty,26,["#fff","#ffd23f","#ff7675","#fdcb6e"],4.5,600);
    say(sh.tx,sh.ty-S*16,"POW!",true);
    var p=sh.to;p.hat={x:p.x+SW/2,y:GROUND-SH+2*S,vx:(p.flip?1.6:-1.6),vy:-7,a:0,va:(p.flip?0.25:-0.25)};p.dying=0;
  }else{
    burst(sh.tx,sh.ty,12,["#fff","#ffd23f","#dfe6e9"],3.2,380);
    if(Math.random()<0.6)say(sh.tx+(sh.to.flip?-1:1)*S*10,sh.ty-S*8,Math.random()<0.5?"PING!":"ZING!",false);
  }
}
var start=performance.now(),last=start;
function frame(now){
  var t=now-start,dt=Math.min(40,now-last);last=now;
  c.clearRect(0,0,W,H);
  // Walk in, then stand.
  var walk=Math.min(1,t/900),e=1-Math.pow(1-walk,3);
  L.x=-SW+(LX+SW)*e;R.x=W-(W-RX)*e;
  for(var i=0;i<PLAN.length;i++){if(!fired[i]&&t>=PLAN[i][1]){fired[i]=1;fire(PLAN[i][0],PLAN[i][2])}}
  [L,R].forEach(function(p){
    if(p.dying!==undefined){p.dying+=dt;p.fall=Math.min(1,p.dying/450)}
    if(p.hat){p.hat.x+=p.hat.vx;p.hat.y+=p.hat.vy;p.hat.vy+=0.35;p.hat.a+=p.hat.va;if(p.hat.y>GROUND-S*2){p.hat.y=GROUND-S*2;p.hat.vy*=-0.35;p.hat.vx*=0.6;p.hat.va*=0.5}}
    drawCowboy(p,t);
  });
  // The winner blows the smoke off his barrel; stars over whoever fell.
  if(WIN&&t>4900&&t<6200&&Math.random()<0.25){var m=muzzle(WIN);smoke(m.x+(WIN.flip?-S:S),m.y-S,1)}
  [L,R].forEach(function(p){if(p.fall>=1&&t>5000&&t<5900&&!p.stars){p.stars=1;for(var j=0;j<5;j++)texts.push({x:p.x+SW*0.2+j*S*3,y:GROUND-S*6,word:"★",t:0,life:900,big:false})}});
  drawTurkey(t);
  // Tracers.
  for(var s2=shots.length-1;s2>=0;s2--){var sh=shots[s2];sh.t+=dt;var k=Math.min(1,sh.t/sh.dur);
    var bx=sh.x+(sh.tx-sh.x)*k,by=sh.y+(sh.ty-sh.y)*k,tail=0.12;
    var ax=sh.x+(sh.tx-sh.x)*Math.max(0,k-tail),ay=sh.y+(sh.ty-sh.y)*Math.max(0,k-tail);
    c.strokeStyle="rgba(255,234,167,0.85)";c.lineWidth=Math.max(2,S*0.7);c.beginPath();c.moveTo(ax,ay);c.lineTo(bx,by);c.stroke();
    c.fillStyle="#fff";c.fillRect(bx-S/2,by-S/2,S,S);
    if(sh.flash>0){sh.flash-=dt;star(sh.x,sh.y,S*5,S*2,8);c.fillStyle="rgba(255,210,63,0.95)";c.fill()}
    if(k>=1){land(sh);shots.splice(s2,1)}
  }
  // Sparks and smoke.
  for(var q=parts.length-1;q>=0;q--){var pt=parts[q];pt.life-=dt;if(pt.life<=0){parts.splice(q,1);continue}
    pt.x+=pt.vx;pt.y+=pt.vy;pt.vy+=pt.g;var a=pt.life/pt.max;
    if(pt.col==="smoke"){c.fillStyle="rgba(220,220,220,"+(0.45*a)+")";c.beginPath();c.arc(pt.x,pt.y,pt.size*(2-a),0,Math.PI*2);c.fill()}
    else{c.globalAlpha=a;c.fillStyle=pt.col;c.fillRect(pt.x,pt.y,pt.size,pt.size);c.globalAlpha=1}
  }
  for(var u=texts.length-1;u>=0;u--){var tx=texts[u];tx.t+=dt;if(tx.t>=tx.life){texts.splice(u,1);continue}
    if(tx.word==="★"){c.save();c.globalAlpha=1-tx.t/tx.life;c.font=Math.round(S*5)+"px sans-serif";c.fillStyle="#ffd23f";c.fillText("★",tx.x+Math.sin((t+u*300)/150)*S*3,tx.y-Math.cos((t+u*300)/150)*S*1.5);c.restore()}
    else drawText(tx)}
  if(t<END)requestAnimationFrame(frame);else{c.clearRect(0,0,W,H);${CLOSE}}
}
requestAnimationFrame(frame);
setTimeout(function(){${CLOSE}},END+600);
})();
</${'script'}>
</body></html>`
}
