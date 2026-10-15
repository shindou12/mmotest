// Two silhouette-first sword studies. These are preview-only until a model is selected.
import * as THREE from 'three';
import { cyl, sphere, extrude } from './kit.js';
import { toon, glow } from '../toon.js';
import { facetedBlade, diamond, add, leatherHilt } from './sword-geometry.js';

const neutral=new THREE.Color(0xdfe7f0);
function blade(k,rings,tip,colors,light,intensity=.035){
  const p={...k,steel:{color:neutral,emissive:new THREE.Color(light),emissiveIntensity:intensity}};
  facetedBlade(p,rings,tip,[0,1,1,2],{colors,edge:false});
}
function offsetRing(y,x,w,d){return diamond(y,w,d).map(p=>[p[0]+x,p[1],p[2]]);}
function inlay(k,points,material,z){const m=add(k,extrude(points,.008,0),material,[0,0,z]);m.userData.noOutline=true;m.userData.keep=true;return m;}

// 鬼牙: a forward-weighted kopis-like blade. Its smooth, one-way hook differs from
// the katana's slight rear curve and Laevateinn's repeated wave.
function oniKiba(k){
  const bronze=toon(0x986143),grip=toon(0x3d2928),ember=glow(0xd98658);
  const rows=[[.15,-.012,.060,.030],[.36,-.018,.068,.032],[.66,.015,.082,.033],[.94,.088,.105,.032],[1.19,.208,.104,.029],[1.40,.342,.067,.024]];
  blade(k,rows.map(([y,x,w,d])=>offsetRing(y,x,w,d)),[.485,1.57,0],[0xb6b7b4,0xe3d8c7,0x737d83],0x684b42);
  // A compact guard sweeps in the opposite direction to the forward-weighted tip.
  add(k,extrude([[-.245,.075],[-.205,.035],[-.12,.052],[-.035,.084],[.075,.082],[.17,.045],[.22,.065],[.16,.128],[.075,.145],[-.025,.12],[-.12,.135],[-.20,.17]],.075,.006),bronze);
  add(k,cyl(.045,.042,.082,8),bronze,[0,.13,0]);
  leatherHilt({...k,grip},{length:.39,radius:.037,pommel:'disc'});
  add(k,cyl(.047,.047,.018,8),grip,[0,-.385,.026],[Math.PI/2,0,0]);
  // One small maker's mark keeps the broad outer sweep as the main read.
  inlay(k,[[-.015,.20],[.015,.20],[.035,.40],[.008,.52],[-.010,.40]],ember,.034);
  add(k,sphere(.018,8,6),ember,[0,.13,.054]);
  k.g.userData.appearance='prototype-oni-kiba';
}

// Sosei: a narrow blade whose last third divides into two prongs, leaving a clear
// open notch. The forked tip is the defining contour; the guard stays quiet.
function sosei(k){
  const silver=toon(0x8cabb8),blue=toon(0x263c52),ice=glow(0x85d9e8);
  blade(k,[offsetRing(.15,0,.052,.027),offsetRing(.40,0,.060,.029),offsetRing(.62,0,.054,.027)],[0,.76,0],[0xc3d8df,0xe6edf0,0x708a99],0x527781,.045);
  for(const side of [-1,1]){
    const rows=[[.62,side*.025,.030,.024],[.87,side*.047,.036,.025],[1.12,side*.088,.034,.023],[1.40,side*.155,.027,.020],[1.53,side*.192,.014,.016]];
    blade(k,rows.map(([y,x,w,d])=>offsetRing(y,x,w,d)),[side*.215,1.59,0],[0xc3d8df,0xe6edf0,0x708a99],0x527781,.045);
  }
  // A plain ring guard anchors the unusual tip without borrowing the winged crystal guard.
  add(k,new THREE.TorusGeometry(.105,.014,6,18),silver,[0,.105,0]);
  add(k,cyl(.045,.045,.052,8),silver,[0,.11,0]);
  leatherHilt({...k,grip:blue,gold:silver},{length:.39,radius:.036,pommel:'cap'});
  add(k,new THREE.OctahedronGeometry(.038),ice,[0,.103,.055],null,[.75,1,.55]);
  add(k,cyl(.036,.036,.016,8),blue,[0,-.388,.024],[Math.PI/2,0,0]);
  k.g.userData.appearance='prototype-sosei';
}

export const NEW_SWORD_CANDIDATES=Object.freeze([
  Object.freeze({id:'oni-kiba',name:'鬼牙',reading:'おにきば',description:'刃先が前へ大きく張り出す鉤刃。刀の反りとも、波刃とも異なる一方向の曲線。',build:oniKiba}),
  Object.freeze({id:'sosei',name:'双星剣',reading:'そうせいけん',description:'細身の剣身が先端で二股に分かれる。中央の抜けが遠目にも読める形。',build:sosei}),
]);
