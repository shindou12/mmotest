import * as THREE from 'three';
import { cyl, sphere, extrude } from './kit.js';
import { facetedBlade, diamond, add, leatherHilt } from './sword-geometry.js';

export function katana(k,variant){
  const p=variant==='A'?{length:1.35,width:.095,curve:.105,guard:.105,grip:.034}:{length:1.30,width:.125,curve:.145,guard:.118,grip:.038};
  const rings=[];
  for(let i=0;i<=8;i++){
    const t=i/8,x=p.curve*t*t,y=.12+(p.length-.17)*t,w=p.width*(1-.23*t),d=.022*(1-.30*t);
    rings.push([[x-w/2,y,-d],[x-w/2,y,d],[x-w*.06,y,d*1.30],[x+w/2,y,0],[x-w*.06,y,-d*1.30]]);
  }
  facetedBlade(k,rings,[p.curve+p.width*.32,.12+p.length,0],[2,0,1,1,0]);
  // A tsuba lies across the hilt axis (+Y). The old upright disc is deliberately corrected.
  add(k,cyl(p.guard,p.guard,.026,variant==='A'?14:8),k.gold,[0,.086,0],null,[1,1,variant==='A'?.84:.72]);
  add(k,new THREE.BoxGeometry(p.width+.008,.060,.059),k.gold,[0,.139,0]);
  leatherHilt(k,{length:variant==='A'?.44:.41,radius:p.grip,weave:true,pommel:'cap'});
}
export function leaf(k,variant){
  const profile=variant==='A'?[[.12,.044],[.30,.053],[.57,.083],[.82,.103],[1.05,.083],[1.25,.043]]:[[.12,.049],[.31,.077],[.61,.122],[.82,.117],[1.04,.082],[1.18,.043]];
  const tip=variant==='A'?1.40:1.34;
  facetedBlade(k,profile.map(([y,w])=>diamond(y,w,.026*(1-(y-.12)*.2))),[0,tip,0],[0,1,1,2]);
  if(variant==='A')add(k,extrude([[-.19,.13],[-.18,.072],[-.075,.085],[0,.105],[.075,.085],[.18,.072],[.19,.13],[.075,.145],[0,.151],[-.075,.145]],.064,.004),k.gold);
  else add(k,extrude([[-.22,.07],[-.21,.027],[-.155,.036],[-.065,.088],[.065,.088],[.155,.036],[.21,.027],[.22,.07],[.075,.147],[-.075,.147]],.074,.005),k.gold);
  add(k,cyl(.042,.042,.065,8),k.gold,[0,.103,0]);
  leatherHilt(k,{length:.38,radius:.037,pommel:variant==='A'?'leaf':'disc'});
  add(k,sphere(.029,8,6),k.gem,[0,.106,.044]);
}

