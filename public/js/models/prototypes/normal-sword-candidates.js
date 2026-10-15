// Review candidates for the three ordinary sword silhouettes. Unique style 3 is excluded.
import * as THREE from 'three';
import { makeWeapon, makeWeaponPreview } from '../../models.js';
import { mesh, cyl, sphere, extrude } from '../kit.js';
import { toon } from '../../toon.js';
import { facetedBlade, diamond, add, leatherHilt } from '../sword-geometry.js';
import { katana, leaf } from '../sword-forms.js';

export const NORMAL_SWORD_FORMS=Object.freeze([
  Object.freeze({id:'straight',style:0,label:'Straight sword',A:'A / Refined · selected',B:'B / Bold'}),
  Object.freeze({id:'katana',style:1,label:'Katana',A:'A / Slender',B:'B / Resolute'}),
  Object.freeze({id:'leaf',style:2,label:'Leaf blade',A:'A / Willow',B:'B / Laurel'}),
]);

function straightBold(k){
  facetedBlade(k,[diamond(.12,.119,.035),diamond(1.10,.119*.76,.035*.78)],[0,1.40,0],[0,1,1,2]);
  add(k,extrude([[-.255,.045],[.255,.045],[.255,.123],[.220,.15],[-.220,.15],[-.255,.123]],.088,.004),k.gold);
  add(k,cyl(.038,.043,.09,8),k.gold,[0,.085,0]);leatherHilt(k,{radius:.045,pommel:'disc'});
}
function legacyKatana(k) { // 刀: 反りのある片刃
        const { g, gold, handle, blade } = k;
        const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10, y = t * 1.35, x = Math.sin(t * 1.2) * 0.12; pts.push([x + 0.045, y]); }
        for (let i = 10; i >= 0; i--) { const t = i / 10, y = t * 1.35, x = Math.sin(t * 1.2) * 0.12; pts.push([x - (t > 0.92 ? 0 : 0.03), y]); }
        blade(pts, 0.03);
        g.add(mesh(cyl(0.1, 0.1, 0.03, 14), gold, [0, 0.1, 0], [Math.PI / 2, 0, 0]));
        handle(0.5, 0.032);
}
function legacyLeaf(k) { // 幅広の葉形
        const { g, gold, gem, handle, blade } = k;
        blade([[-0.06, 0], [0.06, 0], [0.13, 0.55], [0.1, 0.95], [0, 1.25], [-0.1, 0.95], [-0.13, 0.55]], 0.04);
        g.add(mesh(new THREE.BoxGeometry(0.42, 0.07, 0.09), gold, [0, 0.08, 0]));
        g.add(mesh(sphere(0.05, 10, 8), gem, [0, 0.08, 0.05]));
        handle(0.38);
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
  if(variant==='A')root=makeWeapon('sword',rarity,style); // The already selected A is the actual game model.
  else if(variant==='before'&&style>0)root=makeWeaponPreview('sword',rarity,style,style===1?legacyKatana:legacyLeaf);
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
