// One authored model per existing unique sword; the standard +Y blade and -.15 grip are shared.
import * as THREE from 'three';
import { cyl, sphere, extrude } from './kit.js';
import { toon, glow } from '../toon.js';
import { facetedBlade, diamond, add, leatherHilt } from './sword-geometry.js';

const neutral=new THREE.Color(0xdfe7f0);
function blade(k,profile,tip,colors,light,intensity=.06){
  const p={...k,steel:{color:neutral,emissive:new THREE.Color(light),emissiveIntensity:intensity}};
  facetedBlade(p,profile,tip,[0,1,1,2],{colors,edge:false});
}
function inlay(k,points,depth,material,z){
  const m=add(k,extrude(points,depth,0),material,[0,0,z]);m.userData.noOutline=true;m.userData.keep=true;return m;
}
function identify(k,id){k.g.userData.appearance=id;}

function amenomurakumo(k){
  const jade=toon(0x2a7877),ivory=toon(0xe4e6c7),light=glow(0x75dcca);
  blade(k,[[.15,.052,.032],[.32,.074,.034],[.62,.088,.034],[1.10,.074,.028],[1.39,.040,.022]].map(([y,w,d])=>diamond(y,w,d)),[0,1.62,0],[0xb9d2d0,0xe4f2e9,0x829d9d],0x246c69);
  // Compact cloud-shaped bronze guard and paired curls, rather than the shared wing silhouette.
  add(k,extrude([[-.255,.105],[-.22,.043],[-.12,.063],[-.065,.103],[.065,.103],[.12,.063],[.22,.043],[.255,.105],[.205,.157],[.12,.13],[.055,.175],[-.055,.175],[-.12,.13],[-.205,.157]],.075,.007),k.gold);
  for(const side of [-1,1])add(k,new THREE.TorusGeometry(.053,.013,5,12,Math.PI*1.6),jade,[side*.175,.112,.047],[0,0,side>0?-.6:Math.PI+.6]);
  add(k,cyl(.052,.044,.125,8),k.gold,[0,.16,0]);
  leatherHilt({...k,grip:jade},{length:.39,radius:.036,pommel:'cap'});
  for(const y of [-.055,-.245])add(k,cyl(.039,.039,.018,8),ivory,[0,y,0]);
  add(k,new THREE.OctahedronGeometry(.055),jade,[0,.117,.060],null,[.8,1,.65]);
  add(k,new THREE.TorusGeometry(.050,.020,6,12,Math.PI*1.65),k.gold,[0,-.389,0],[0,0,.25]);
  add(k,sphere(.024,8,6),light,[.008,-.396,.027]);
  // Three subdued, embedded cloud marks echo the item's existing wave/thunder effects.
  for(const y of [.48,.76,1.04])inlay(k,[[-.016,y],[0,y+.065],[.016,y],[0,y+.018]],.008,light,.032);
  identify(k,'amenomurakumo');
}
function durandal(k){
  const ivory=toon(0xdcd9cb),blue=toon(0x233e62),light=glow(0x9fc9ed);
  blade(k,[[.16,.078,.034],[.32,.096,.035],[.48,.082,.033],[1.30,.065,.027],[1.43,.042,.024]].map(([y,w,d])=>diamond(y,w,d)),[0,1.64,0],[0xe2e5e6,0xf1f2e9,0xa5b0c0],0x33445b,.035);
  // Architectural crossguard: short flared ends and an angular central escutcheon.
  add(k,extrude([[-.285,.075],[-.25,.035],[-.19,.060],[-.075,.095],[.075,.095],[.19,.060],[.25,.035],[.285,.075],[.255,.145],[.18,.138],[.065,.175],[-.065,.175],[-.18,.138],[-.255,.145]],.084,.006),k.gold);
  add(k,extrude([[-.066,.19],[.066,.19],[.060,.065],[0,.012],[-.060,.065]],.026,.003),ivory,[0,0,.058]);
  add(k,new THREE.OctahedronGeometry(.044),blue,[0,.115,.089],null,[.8,1,.60]);
  leatherHilt({...k,grip:blue},{length:.39,radius:.037,pommel:'disc'});
  add(k,cyl(.039,.039,.013,10),blue,[0,-.386,.025],[Math.PI/2,0,0]);
  add(k,new THREE.BoxGeometry(.035,.012,.008),ivory,[0,-.386,.035]);add(k,new THREE.BoxGeometry(.010,.040,.008),ivory,[0,-.386,.035]);
  // A narrow cross and fuller catch the light without turning the blade into a light source.
  inlay(k,[[-.008,.35],[.008,.35],[.008,1.26],[0,1.33],[-.008,1.26]],.006,k.gold,.034);
  inlay(k,[[-.038,.43],[.038,.43],[.038,.447],[-.038,.447]],.006,k.gold,.035);
  add(k,sphere(.018,8,6),light,[0,.115,.114]);
  identify(k,'durandal');
}
function laevateinn(k){
  const iron=toon(0x343038),copper=toon(0xb16a3b),leather=toon(0x40272c),ember=glow(0xf77834);
  const profile=[[.16,0,.059,.031],[.38,.014,.090,.034],[.65,-.024,.080,.034],[.91,.025,.075,.032],[1.17,-.013,.057,.028],[1.39,.025,.034,.021]];
  blade(k,profile.map(([y,x,w,d])=>diamond(y,w,d).map(p=>[p[0]+x,p[1],p[2]])),[.058,1.61,0],[0x49444d,0x776272,0x272832],0x8f3026,.12);
  // The forked, rising guard reads as a scorched branch. The blade stays a single connected solid.
  add(k,extrude([[-.235,.275],[-.20,.155],[-.105,.085],[-.060,.060],[.065,.060],[.16,.115],[.225,.23],[.21,.30],[.156,.187],[.065,.147],[-.062,.147],[-.15,.19],[-.205,.29]],.073,.005),iron);
  for(const side of [-1,1])add(k,new THREE.OctahedronGeometry(.030),copper,[side*.207,side>0?.245:.272,0],null,[.55,1,.7]);
  add(k,cyl(.050,.043,.09,8),copper,[0,.165,0]);
  leatherHilt({...k,gold:iron,grip:leather},{length:.39,radius:.037,pommel:'leaf'});
  for(const y of [-.04,-.295])add(k,new THREE.TorusGeometry(.039,.007,4,10),copper,[0,y,0],[Math.PI/2,0,0]);
  const core=[[-.014,.22],[.023,.37],[-.010,.64],[.039,.91],[.003,1.17],[.039,1.39],[.058,1.55],[.017,1.38],[-.020,1.17],[.010,.91],[-.039,.64],[-.004,.38]];
  for(const side of [-1,1])inlay(k,core,.009,ember,side*.034);
  add(k,new THREE.OctahedronGeometry(.031),ember,[0,.098,.054],null,[.75,1.35,.65]);
  add(k,sphere(.021,8,6),ember,[0,-.378,.030]);
  identify(k,'laevateinn');
}
export const UNIQUE_SWORDS=Object.freeze({amenomurakumo,durandal,laevateinn});
