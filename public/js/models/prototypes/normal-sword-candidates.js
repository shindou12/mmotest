// Review candidates for the three ordinary sword silhouettes. Unique style 3 is excluded.
import * as THREE from 'three';
import { makeWeapon, makeWeaponPreview } from '../../models.js';
import { mesh, cyl, sphere, extrude } from '../kit.js';
import { toon } from '../../toon.js';

export const NORMAL_SWORD_FORMS=Object.freeze([
  Object.freeze({id:'straight',style:0,label:'Straight sword',A:'A / Refined · selected',B:'B / Bold'}),
  Object.freeze({id:'katana',style:1,label:'Katana',A:'A / Slender',B:'B / Resolute'}),
  Object.freeze({id:'leaf',style:2,label:'Leaf blade',A:'A / Willow',B:'B / Laurel'}),
]);

// Closed, flat-faced blade: its ridge is real geometry rather than a floating strip.
function facetedBlade(k,rings,tip,faceColors) {
  const positions=[],colors=[],neutral=new THREE.Color(0xdfe7f0);
  const palette=[0xdfe7f0,0xeaf0f6,0xb6c3d2].map(hex=>{
    const c=new THREE.Color(hex);c.r*=k.steel.color.r/neutral.r;c.g*=k.steel.color.g/neutral.g;c.b*=k.steel.color.b/neutral.b;return c;
  });
  const add=(a,b,c,color,axis)=>{
    const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),C=new THREE.Vector3(...c);
    const normal=B.clone().sub(A).cross(C.clone().sub(A));
    if(normal.dot(axis)<0)[b,c]=[c,b];
    positions.push(...a,...b,...c);for(let i=0;i<3;i++)colors.push(...palette[color].toArray());
  };
  const center=ring=>ring.reduce((s,p)=>s.add(new THREE.Vector3(...p)),new THREE.Vector3()).multiplyScalar(1/ring.length);
  const centers=rings.map(center),n=rings[0].length;
  for(let i=0;i<rings.length;i++)for(let f=0;f<n;f++){
    const j=(f+1)%n,a=rings[i][f],b=rings[i][j],color=faceColors[f];
    const radial=new THREE.Vector3((a[0]+b[0])/2-centers[i].x,0,(a[2]+b[2])/2);
    if(i<rings.length-1){const c=rings[i+1][f],d=rings[i+1][j];add(a,b,d,color,radial);add(a,d,c,color,radial);}
    else add(a,b,tip,color,radial);
  }
  for(let i=1;i<n-1;i++)add(rings[0][0],rings[0][i],rings[0][i+1],2,new THREE.Vector3(0,-1,0));
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
  k.g.add(mesh(geometry,toon(0xffffff,{vertexColors:true,emissive:k.steel.emissive,emissiveIntensity:k.steel.emissiveIntensity})));
  // Follow the same rarity edge convention as the gameplay factory, using the actual contour.
  const contour=[];
  for(const ring of rings)contour.push([Math.max(...ring.map(p=>p[0])),ring[0][1]]);
  contour.push([tip[0],tip[1]]);
  for(const ring of [...rings].reverse())contour.push([Math.min(...ring.map(p=>p[0])),ring[0][1]]);
  k.edge(contour,.028);
}
const diamond=(y,w,d)=>[[-w,y,0],[0,y,-d],[w,y,0],[0,y,d]];
const add=(k,geo,mat,pos,rot,scale)=>{const m=mesh(geo,mat,pos,rot,scale);k.g.add(m);return m;};

function leatherHilt(k,{length=.38,radius=.039,weave=false,pommel='round'}={}){
  const top=.05,bottom=top-length,wrap=toon(weave?0x725438:0x553a26);
  add(k,cyl(radius,radius*1.06,length,8),k.grip,[0,(top+bottom)/2,0],null,[1,1,weave?.88:1]);
  if(weave){
    for(let i=0;i<4;i++)for(const side of [-1,1])for(const angle of [-.58,.58])
      add(k,new THREE.BoxGeometry(radius*1.7,.009,.008),wrap,[0,-.028-i*.087,side*radius*.87],[0,0,angle]);
  }else for(let i=0;i<3;i++)add(k,new THREE.TorusGeometry(radius*1.04,.007,4,10),wrap,[0,-.06-i*.09,0],[Math.PI/2,0,0]);
  for(const y of [.047,bottom])add(k,cyl(radius*1.24,radius*1.24,.027,8),k.gold,[0,y,0]);
  if(pommel==='round')add(k,sphere(.060,8,6),k.gold,[0,bottom-.044,0]);
  else if(pommel==='disc')add(k,cyl(.066,.066,.040,10),k.gold,[0,bottom-.046,0],[Math.PI/2,0,0]);
  else if(pommel==='leaf')add(k,new THREE.OctahedronGeometry(.067),k.gold,[0,bottom-.043,0],null,[.78,1,.52]);
}

function straightBold(k){
  facetedBlade(k,[diamond(.12,.119,.035),diamond(1.10,.119*.76,.035*.78)],[0,1.40,0],[0,1,1,2]);
  add(k,extrude([[-.255,.045],[.255,.045],[.255,.123],[.220,.15],[-.220,.15],[-.255,.123]],.088,.004),k.gold);
  add(k,cyl(.038,.043,.09,8),k.gold,[0,.085,0]);leatherHilt(k,{radius:.045,pommel:'disc'});
}
function katana(k,variant){
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
function leaf(k,variant){
  const profile=variant==='A'?[[.12,.044],[.30,.053],[.57,.083],[.82,.103],[1.05,.083],[1.25,.043]]:[[.12,.049],[.31,.077],[.61,.122],[.82,.117],[1.04,.082],[1.18,.043]];
  const tip=variant==='A'?1.40:1.34;
  facetedBlade(k,profile.map(([y,w])=>diamond(y,w,.026*(1-(y-.12)*.2))),[0,tip,0],[0,1,1,2]);
  if(variant==='A')add(k,extrude([[-.19,.13],[-.18,.072],[-.075,.085],[0,.105],[.075,.085],[.18,.072],[.19,.13],[.075,.145],[0,.151],[-.075,.145]],.064,.004),k.gold);
  else add(k,extrude([[-.22,.07],[-.21,.027],[-.155,.036],[-.065,.088],[.065,.088],[.155,.036],[.21,.027],[.22,.07],[.075,.147],[-.075,.147]],.074,.005),k.gold);
  add(k,cyl(.042,.042,.065,8),k.gold,[0,.103,0]);
  leatherHilt(k,{length:.38,radius:.037,pommel:variant==='A'?'leaf':'disc'});
  add(k,sphere(.029,8,6),k.gem,[0,.106,.044]);
}

// Historical style-0 builder, for comparison only. This is the pre-A sword from refactor/solid.
function legacyStraight(k){
  const w=.075,L=1.3,pts=[[-w,0],[w,0],[w,L-.22],[0,L],[-w,L-.22]];
  k.edge(pts,.035);add(k,extrude(pts,.035),k.steel,[0,.12,0]);
  add(k,new THREE.BoxGeometry(.022,L*.7,.05),toon(0x9aa4b4),[0,.12+L*.4,0]);
  add(k,new THREE.TorusGeometry(.26,.03,6,16,Math.PI*.7),k.gold,[0,-.05,0],[0,0,Math.PI*.15]);
  add(k,sphere(.05,10,8),k.gem,[0,.1,.04]);k.handle(.42);
}
export function makeNormalSwordCandidate(style,variant='A',rarity=1){
  if(![0,1,2].includes(style)||!['before','A','B'].includes(variant))throw new RangeError('Unknown ordinary sword candidate');
  let root;
  if(style===0&&variant==='A')root=makeWeapon('sword',rarity,0); // The already selected A is the actual game model.
  else if(variant==='before'&&style>0)root=makeWeapon('sword',rarity,style);
  else root=makeWeaponPreview('sword',rarity,style,k=>{
    if(variant==='before')legacyStraight(k);
    else if(style===0)straightBold(k);
    else if(style===1)katana(k,variant);
    else leaf(k,variant);
  });
  root.name=`ordinary-sword-${style}-${variant}`;
  Object.assign(root.userData,{normalSword:true,style,variant,gripY:-.15,previewOnly:true});
  return root;
}
