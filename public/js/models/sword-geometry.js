import * as THREE from 'three';
import { mesh, cyl, sphere, extrude } from './kit.js';
import { toon } from '../toon.js';

// Closed, flat-faced blade: its ridge is real geometry rather than a floating strip.
export function facetedBlade(k,rings,tip,faceColors,{colors:bladeColors=null,edge=true}={}) {
  const positions=[],colors=[],neutral=new THREE.Color(0xdfe7f0);
  const palette=(bladeColors||[0xdfe7f0,0xeaf0f6,0xb6c3d2]).map(hex=>{
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
  if(edge)k.edge(contour,.028);
}
export const diamond=(y,w,d)=>[[-w,y,0],[0,y,-d],[w,y,0],[0,y,d]];
export const add=(k,geo,mat,pos,rot,scale)=>{const m=mesh(geo,mat,pos,rot,scale);k.g.add(m);return m;};

export function leatherHilt(k,{length=.38,radius=.039,weave=false,pommel='round'}={}){
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

