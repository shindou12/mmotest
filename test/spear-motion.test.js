import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { spearPose, SPEAR_MOTIONS } from '../public/js/spear-motion.js';
import { makePlayer, setPlayerWeapon, animatePlayer } from '../public/js/models.js';
import { WEAPON_SKILLS, TREE_SKILLS } from '../public/js/skills.js';
import { World } from '../public/shared/sim.js';
const base={t:1,moving:false,walkT:0,kind:'spear',combo:0,swing:-1,spin:-1,sweep:-1,dodge:0,down:0,hurt:0};
test('spear shoulders remain fixed and poses are continuous through all styles and skills',()=>{
 for(let style=0;style<4;style++){
  const m=makePlayer('#448a9b');setPlayerWeapon(m,'spear',3,style);const u=m.userData;
  for(const [motion,duration] of Object.entries(SPEAR_MOTIONS)){
   let prev;
   for(let t=0;t<=duration;t+=.002){
    animatePlayer(m,{...base,motion,motionT:t});m.updateMatrixWorld(true);
    assert.ok(Math.abs(u.armR.position.z)<1e-9,'shoulder must not translate');
    const hand=u.hand.getWorldPosition(new THREE.Vector3());assert.ok(hand.toArray().every(Number.isFinite));
    if(prev)assert.ok(hand.distanceTo(prev)<.10,`${motion}: discontinuity at ${t}`);prev=hand;
   }
  }
 }
});
test('five thrust peaks match hit timings, with a deeper final thrust',()=>{
 const depths=[0,1,2,3,4].map(i=>spearPose({motion:'helix',motionT:.06+i*.08}).z);
 assert.ok(depths[4]>depths[0]+.1);
 for(let i=0;i<4;i++)assert.ok(depths[i]>spearPose({motion:'helix',motionT:.08*i}).z+.1);
 assert.ok(Math.abs(spearPose({motion:'whirlspear',motionT:.48}).yaw-Math.PI*6)<1e-8);
 const scheduled=[];WEAPON_SKILLS.helix.run({aim:()=>0,later:t=>scheduled.push(t)});
 scheduled.forEach((t,i)=>assert.ok(Math.abs(t-(.06+i*.08))<1e-9));
});
test('javelin release matches the extended arm pose and motion metadata is accepted safely',()=>{
 let released=false;const queue=[];
 TREE_SKILLS.javelin.run({aim:()=>0,later:(t,fn)=>queue.push({t,fn}),proj:()=>released=true,sfx:()=>{}});
 assert.equal(released,false);assert.equal(queue[0].t,.18);queue[0].fn();assert.equal(released,true);
 assert.equal(spearPose({motion:'javelin',motionT:.18}).z,.55);
 const w=new World();w.addPlayer(1,()=>{});w.handle(1,{t:'hello',name:'Spear',lv:1});
 w.handle(1,{t:'st',wk:'spear',pm:'helix',pt:.14});assert.equal(w.players.get(1).pm,'helix');assert.equal(w.players.get(1).pt,.14);
 w.handle(1,{t:'st',pm:'invalid',pt:Infinity});assert.equal(w.players.get(1).pm,'');assert.equal(w.players.get(1).pt,0);
});
