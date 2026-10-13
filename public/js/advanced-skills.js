import { TECHNIQUES } from '../shared/techniques.js';
const TYPE={type:'tskill'};
const offset=(x,z,a,d)=>({x:x+Math.sin(a)*d,z:z+Math.cos(a)*d});
function cast(c,t){
 const a=c.aim(),start={x:c.me.x,z:c.me.z},tag={...TYPE,tech:t.id},area=c.area?.();
 const schedule=(delay,fn)=>c.later(delay,()=>{if(!c.area||c.area()===area)fn();});
 const slash=(mult,r=3.4,deg=140,angle=a,options={})=>{
  c.arc(r,deg,mult,{...tag,a:angle,...options});c.fx.slash(c.me.x,c.me.z,angle,r,deg,c.col(),1.15);c.sfx('swing');
 };
 const line=(mult,len=5,w=1.8,angle=a,options={})=>{
  c.line(len,w,mult,{...tag,a:angle,...options});
  for(let d=.7;d<len;d+=.5)c.fx.parts.emit(c.me.x+Math.sin(angle)*d,1.2,c.me.z+Math.cos(angle)*d,{color:c.col(),size:.42,life:.25,speed:1,gravity:0});c.sfx('swing');
 };
 const arrow=(mult,angle=a,options={})=>c.arrow({a:angle,mult,...tag,...options});
 const at=(i,fn)=>schedule(t.hits[i],fn);
 const buff=(seconds,mods)=>{c.buff(t.id,t.name,seconds,mods,c.col());c.fx.ringWave(c.me.x,c.me.z,c.col(),2.6,.35);};
 switch(t.id){
 case 'sword_parry': buff(.4,{dr:70});at(0,()=>line(2.2,4.3,1.8));break;
 case 'sword_aircut':at(0,()=>{c.proj({a,mult:1.8,speed:24,life:.55,rad:1,...tag});c.fx.slash(c.me.x,c.me.z,a,3,100,c.col(),.9);});break;
 case 'sword_sideturn':c.dash(a+Math.PI/2,3,.22,.25);c.me.a=a;at(0,()=>slash(2.4,3.7,150));break;
 case 'sword_dance':at(0,()=>buff(5,{normp:40,aspd:15}));break;
 case 'gs_guillotine':at(0,()=>{line(4.8,4.5,1.8,a,{stun:22});c.shake(.5);c.sfx('impact');});break;
 case 'gs_rising':at(0,()=>slash(2.6,3.7,100,a,{stun:18}));break;
 case 'gs_broad':at(0,()=>slash(3,4.7,230,a,{stun:8}));break;
 case 'gs_recoil':c.dash(a+Math.PI,2,.18,0);c.me.a=a;at(0,()=>{c.proj({a,mult:3.8,speed:21,life:.42,rad:1.3,...tag});c.sfx('heavy');});break;
 case 'gs_siege':at(0,()=>buff(5,{heavyp:60,stunp:80,move:-25}));break;
 case 'spear_fan':t.hits.forEach((_,i)=>at(i,()=>line(1,5,1.5,a+(i-1)*.5)));break;
 case 'spear_sweep':at(0,()=>slash(1.8,4,180,a,{stun:6}));break;
 case 'spear_press':c.dash(a,2,.2,0);at(0,()=>line(2.2,3.8,2.4,a,{threat:5}));break;
 case 'spear_stake':{const p=c.point(),d=Math.min(6,Math.hypot(p.x-start.x,p.z-start.z)),spot=offset(start.x,start.z,a,d);c.fx.ringWave(spot.x,spot.z,c.col(),1.8,.4);at(0,()=>{c.circle(spot.x,spot.z,1.8,3,{...tag,threat:3,stun:10});c.fx.lightning(spot.x,spot.z,c.col());c.sfx('thunder');});break;}
 case 'spear_intercept':buff(3,{dr:35});c.taunt(8);t.hits.forEach((_,i)=>at(i,()=>line(1.5,5.5,2,a,{threat:3})));break;
 case 'dagger_flank':c.dash(a+Math.PI/2,4,.18,.25);c.me.a=a;at(0,()=>slash(2.4,3.1,100));break;
 case 'dagger_vital':at(0,()=>{const target=c.nearest(3.5);if(target){c.hit(target,target.hp<=target.mhp*.5?3.4:1.8,tag);c.fx.slash(target.x,target.z,a,1.4,60,c.col(),.8);}});break;
 case 'dagger_bleed':{const wounded=new Set();t.hits.forEach((_,i)=>at(i,()=>{for(const target of c.targets(c.me.x,c.me.z,2.8)){
  const angle=Math.atan2(target.x-c.me.x,target.z-c.me.z);if(Math.abs(Math.atan2(Math.sin(angle-a),Math.cos(angle-a)))>1.3)continue;
  c.hit(target,1,tag);if(!wounded.has(target.id)){wounded.add(target.id);for(let k=1;k<=4;k++)schedule(k,()=>{if(target.hp>0)c.hit(target,.35,{type:'dot',noProc:true});});}
 }c.fx.slash(c.me.x,c.me.z,a+(i?-.3:.3),2.8,150,0xff7283,.9,i===1);c.sfx('swing');}));break;}
 case 'dagger_pin':at(0,()=>arrow(1.4,a,{noZone:true,speed:38,color:0xcab4ff}));break;
 case 'dagger_quicken':at(0,()=>buff(5,{move:35,aspd:25}));break;
 case 'axe_hook':at(0,()=>slash(1,4.6,110));at(1,()=>slash(2.2,3.5,120,a,{tech:null,stun:9}));break;
 case 'axe_execute':at(0,()=>{const target=c.nearest(4.2);if(target){c.hit(target,target.hp<=target.mhp*.3?6:3,{...tag,stun:16});c.fx.slash(c.me.x,c.me.z,a,4,75,c.col(),2);c.sfx('impact');c.shake(.4);}});break;
 case 'axe_return':at(0,()=>c.proj({a,mult:1.7,speed:20,life:.4,rad:1.3,shape:'axe',...tag}));at(1,()=>{const from=offset(start.x,start.z,a,8);c.proj({a:a+Math.PI,mult:1.7,speed:20,life:.4,rad:1.3,shape:'axe',sx:from.x,sz:from.z,...tag});});break;
 case 'axe_blood':at(0,()=>slash(2.5,4.2,230,a,{healOnHit:.10}));break;
 case 'axe_rush':buff(.4,{dr:30});c.dash(a,5,.28,0);at(0,()=>slash(3.2,3.5,120,a,{stun:10}));break;
 case 'bow_double':at(0,()=>arrow(.9));at(1,()=>arrow(1.8,a,{big:true}));break;
 case 'bow_tether':at(0,()=>arrow(1.6,a,{color:0x85d9ff}));break;
 case 'bow_side':c.dash(a-Math.PI/2,3.5,.22,.3);c.me.a=a;at(0,()=>arrow(1.2,a-.035));at(1,()=>arrow(1.2,a+.035));break;
 case 'bow_trap':{const p=c.point(),d=Math.min(8,Math.hypot(p.x-start.x,p.z-start.z)),spot=offset(start.x,start.z,a,d);let triggered=false;
 at(0,()=>{c.fx.ringWave(spot.x,spot.z,0x85d9ff,1.8,5,.08,.25);for(let k=0;k<20;k++)schedule(.2+k*.25,()=>{
 if(triggered||!c.targets(spot.x,spot.z,1.8).length)return;triggered=true;c.circle(spot.x,spot.z,1.8,2.6,tag);c.fx.parts.burst(spot.x,.4,spot.z,30,{color:0x85d9ff,speed:6,size:.4,life:.4,up:3});c.sfx('hit');});});break;}
 case 'bow_chime':at(0,()=>{c.circle(c.me.x,c.me.z,3,1.4,tag);c.fx.ringWave(c.me.x,c.me.z,0x85d9ff,3,.3);c.sfx('wave');});break;
 }
}
export const ADVANCED_TREE_SKILLS=Object.fromEntries(Object.values(TECHNIQUES).map(t=>[t.id,{name:t.name,kind:t.kind,cd:t.cd,desc:t.desc,role:t.role,motion:t.id,duration:t.duration,run:c=>cast(c,t)}]));
