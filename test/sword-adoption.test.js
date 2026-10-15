import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { makeWeapon, makePlayer, setPlayerWeapon, animatePlayer, weaponStyle, makeLootItem } from '../public/js/models.js';
import { UNIQUES, WEAPON_KINDS } from '../public/shared/data.js';
import { SWORD_UNIQUE_STYLES, normalizeWeaponStyle } from '../public/shared/weapon-appearances.js';
import { World } from '../public/shared/sim.js';
import { shapeOf } from './golden/model-trace.mjs';
import { sampleSequence } from '../public/js/previews/sword-comparison-timeline.js';
const swords=UNIQUES.filter(u=>u.kind==='sword').map(d=>({...d,unique:d.key}));

test('all 24 ordinary sword quality/style combinations exactly match the approved A shapes',()=>{
  const expected=JSON.parse(fs.readFileSync(new URL('./fixtures/selected-normal-swords.json',import.meta.url)));
  for(let s=0;s<3;s++)for(let r=0;r<8;r++)assert.deepEqual(shapeOf(makeWeapon('sword',r,s)),expected[`${s}/${r}`]);
});

test('each unique sword selects its own model in hand and on the ground; legacy items retain style 3',()=>{
  const m=makePlayer('#448a9b'),shapes=new Set();
  for(const it of [...swords,...swords].reverse()){
    const style=weaponStyle(it);assert.equal(style,SWORD_UNIQUE_STYLES[it.unique]);
    setPlayerWeapon(m,'sword',it.rarity,style);assert.equal(m.userData.weaponModel.userData.appearance,it.unique);
    shapes.add(shapeOf(makeWeapon('sword',it.rarity,style)).hash);
    const loot=makeLootItem(it);let identity;loot.traverse(o=>{if(o.userData.appearance)identity=o.userData.appearance;});assert.equal(identity,it.unique);
  }
  assert.equal(shapes.size,5);
  for(const kind of WEAPON_KINDS)assert.equal(weaponStyle({kind,rarity:7,name:'Legacy item'}),3);
  assert.equal(weaponStyle({kind:'sword',rarity:7,unique:'unrecognised'}),3);
  assert.equal(weaponStyle({kind:'spear',rarity:7,unique:'durandal'}),3);
});

test('unique blades are closed outward solids with finite, bounded models',()=>{
  for(const it of swords){
    const model=makeWeapon('sword',it.rarity,weaponStyle(it));let count=0,blade;
    model.traverse(o=>{if(!o.isMesh)return;count++;assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));if(o.material.vertexColors)blade=o;});
    assert.ok(count<=16);const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());assert.ok(size.y>1.8&&size.y<2.2);assert.ok(size.x<(it.unique==='oni_kiba' ? 0.9 : 0.65));
    const p=blade.geometry.attributes.position,edges=new Map();let volume=0;const key=v=>v.toArray().map(n=>Math.round(n*1e6)).join(',');
    for(let i=0;i<p.count;i+=3){const[a,b,c]=[0,1,2].map(n=>new THREE.Vector3().fromBufferAttribute(p,i+n));assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).length()>1e-9);volume+=a.dot(b.clone().cross(c))/6;for(const[x,y]of[[a,b],[b,c],[c,a]]){const k=[key(x),key(y)].sort().join('|');edges.set(k,(edges.get(k)||0)+1);}}
    assert.ok(volume>0);for(const n of edges.values())assert.equal(n,2,'open blade edge');
  }
});

test('every unique keeps the shared grip through normal, heavy and skill animations',()=>{
  const m=makePlayer('#448a9b');
  for(const it of swords){setPlayerWeapon(m,'sword',it.rarity,weaponStyle(it));const u=m.userData;
    for(const action of['ready','combo','heavy','skill'])for(let time=0;time<2;time+=.08){animatePlayer(m,sampleSequence(time,action).pose);m.updateMatrixWorld(true);const grip=u.weaponModel.localToWorld(new THREE.Vector3(0,-.15,0));assert.ok(grip.distanceTo(u.gripHand.getWorldPosition(new THREE.Vector3()))<1e-6);assert.ok(u.gripHand.getWorldQuaternion(new THREE.Quaternion()).angleTo(u.weapon.getWorldQuaternion(new THREE.Quaternion()))<1e-6);assert.ok(u.weapon.matrixWorld.elements.every(Number.isFinite));}
  }
});

test('the existing snapshot style field carries all five allowlisted unique IDs and rejects invalid values',()=>{
  const inbox=[],w=new World();w.addPlayer(1,m=>inbox.push(m));w.handle(1,{t:'hello',name:'Appearances'});
  const p=w.players.get(1);
  for(const style of [4,5,6,7,8]){w.handle(1,{t:'st',wk:'sword',wst:style});assert.equal(p.wst,style);w.snapshot(w.area(p.area));const snap=inbox.filter(m=>m.t==='snap').at(-1);assert.equal(snap.p[0][16],style);}
  for(const bad of [9,99,-1,4.5,'4',{},null,Infinity]){w.handle(1,{t:'st',wk:'sword',wst:bad});assert.equal(p.wst,0);}
  for(const kind of WEAPON_KINDS.filter(k=>k!=='sword'))for(const style of[4,5,6,7,8])assert.equal(normalizeWeaponStyle(kind,style),0);
  for(const kind of WEAPON_KINDS)for(const style of[0,1,2,3])assert.equal(normalizeWeaponStyle(kind,style),style);
});
