import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makePlayer, makeWeapon, setPlayerWeapon, animatePlayer } from '../public/js/models.js';
import { GRIP_Y } from '../public/js/pose-rig.js';
import { TREE_MOTIONS } from '../public/shared/tree-motions.js';
import { TECHNIQUES } from '../public/shared/techniques.js';

const base={t:1,kind:'sword',moving:false,walkT:0,combo:0,swing:-1,spin:-1,sweep:-1,dodge:0,down:0,hurt:0};
const position=o=>o.getWorldPosition(new THREE.Vector3());
const states=[{}, {moving:true,walkT:.4}, {charging:true,charge:1,swing:.02}, {guard:true}, {dodge:.5}, {hurt:1}, {down:.7}, ...[0,1,2].flatMap(combo=>[.05,.25,.7].map(swing=>({combo,swing}))), ...[...Object.values(TREE_MOTIONS),...Object.values(TECHNIQUES)].filter(m=>m.kind==='sword').flatMap(m=>[0,.4,.9].map(t=>({motion:m.id,motionT:m.duration*t})))];

test('sword fingers keep their hilt axis and palm contact through all styles, skills and reactions',()=>{
  for(let style=0;style<4;style++){
    const m=makePlayer('#448a9b');setPlayerWeapon(m,'sword',3,style);const u=m.userData;
    for(const pose of states){
      animatePlayer(m,{...base,...pose});m.updateMatrixWorld(true);
      const grip=u.weaponModel.localToWorld(new THREE.Vector3(0,GRIP_Y.sword,0));
      assert.ok(grip.distanceTo(position(u.gripHand))<1e-6,`style ${style}: fingers leave hilt`);
      assert.ok(u.weapon.getWorldQuaternion(new THREE.Quaternion()).angleTo(u.gripHand.getWorldQuaternion(new THREE.Quaternion()))<1e-6,'glove rotates independently of hilt');
      assert.ok(u.gripDefaultParts.every(p=>!p.visible));
      assert.ok(u.gripHand.matrixWorld.elements.every(Number.isFinite));
    }
  }
});

test('changing weapons restores the original glove and never accumulates extra gripping hands',()=>{
  const m=makePlayer('#448a9b');setPlayerWeapon(m,'sword',1,0);const u=m.userData,hand=u.gripHand,count=u.hand.children.length;
  for(let i=0;i<3;i++)for(const kind of ['bow','spear','axe','greatsword','dagger']){
    setPlayerWeapon(m,kind,1);assert.equal(hand.visible,false);assert.ok(u.gripDefaultParts.every(p=>p.visible));
    setPlayerWeapon(m,'sword',i%2,i%4);assert.equal(u.gripHand,hand);assert.equal(hand.visible,true);assert.equal(u.hand.children.length,count);
  }
});

test('ready and charge keep the blade raised and clear of the torso',()=>{
  for(const pose of [{},{moving:true,walkT:.3},{charging:true,charge:1,swing:.02}]){
    const m=makePlayer('#448a9b');setPlayerWeapon(m,'sword',1,0);const u=m.userData;
    animatePlayer(m,{...base,...pose});m.updateMatrixWorld(true);
    const inverse=u.body.matrixWorld.clone().invert();
    const grip=u.weaponModel.localToWorld(new THREE.Vector3(0,GRIP_Y.sword,0));
    const tip=u.weaponModel.localToWorld(new THREE.Vector3(0,1.42,0));
    assert.ok(tip.clone().sub(grip).normalize().y>.5,'blade lies flat in ready stance');
    for(let y=.12;y<=1.42;y+=.05){
      const p=u.weaponModel.localToWorld(new THREE.Vector3(0,y,0)).applyMatrix4(inverse);
      if(p.y>.92&&p.y<1.55)assert.ok(Math.hypot(p.x,p.z)>.30,`blade enters torso at ${p.toArray()}`);
    }
  }
});

test('the replacement straight sword retains quality effects within a small render budget',()=>{
  for(let rarity=0;rarity<8;rarity++){
    const w=makeWeapon('sword',rarity,0);assert.equal(w.userData.appearance,'refined-straight-sword');
    let meshes=0;w.traverse(o=>{if(!o.isMesh)return;meshes++;for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));});
    assert.ok(meshes<=12,`rarity ${rarity}: excessive draw calls`);
    assert.ok(new THREE.Box3().setFromObject(w).getSize(new THREE.Vector3()).x<.5,'blade no longer reads as one-handed');
    if(rarity>=4){let glow=false;w.traverse(o=>{if(o.material?.emissiveIntensity>0&&o.material.emissive?.getHex())glow=true;});assert.ok(glow,'quality glow lost');}
  }
});
