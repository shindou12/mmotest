import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TECHNIQUES,TECHNIQUE_IDS } from '../public/shared/techniques.js';
import { MOTION_DURATIONS } from '../public/shared/motion-catalog.js';
import { TREES,TREE_SKILLS,canLearn,treeEffects } from '../public/js/skills.js';
import { makePlayer,setPlayerWeapon,animatePlayer } from '../public/js/models.js';
import { sampleTechnique } from '../public/js/technique-motion.js';
import { World } from '../public/shared/sim.js';
const base={t:1,moving:false,walkT:0,combo:0,swing:-1,spin:-1,sweep:-1,dodge:0,down:0,hurt:0};
test('29 techniques are actual one-rank tree nodes and only activate with their weapon',()=>{
 assert.equal(TECHNIQUE_IDS.length,29);
 // 片手剣・大剣は新しい武器ツリー（weapon-tree.test.js）に移った
 for(const kind of ['spear','dagger','axe','bow']){
  const additions=Object.values(TECHNIQUES).filter(t=>t.kind===kind);assert.equal(additions.length,5);
  const char={lv:30,tree:{[kind+'_norm']:3,[kind+'_heavy']:3}};
  for(const t of additions){const n=TREES[kind].nodes.find(n=>n.active===t.id);assert.ok(n);assert.equal(n.max,1);assert.equal(canLearn({lv:1,tree:{}},n.id),false);assert.equal(canLearn(char,n.id),true);char.tree[n.id]=1;assert.equal(canLearn(char,n.id),false);assert.equal(TREE_SKILLS[t.id].motion,t.id);assert.equal(MOTION_DURATIONS[t.id],t.duration);}
  const active=treeEffects(char,kind).actives;for(const t of additions)assert.ok(active.has(t.id));
  assert.equal(treeEffects(char,kind==='bow'?'axe':'bow').actives.size,0);
 }
});
test('all new motion tracks are finite, continuous and distinct through every weapon style',()=>{
 const signatures=new Set();
 for(const t of Object.values(TECHNIQUES)){
  signatures.add(JSON.stringify(t.hits.map(at=>sampleTechnique(t.id,at))));
  for(let style=0;style<4;style++){
   const m=makePlayer('#448a9b');setPlayerWeapon(m,t.kind,3,style);const u=m.userData;let previous;
   for(let time=0;time<=t.duration;time+=.005){
    animatePlayer(m,{...base,kind:t.kind,motion:t.id,motionT:time});m.updateMatrixWorld(true);
    assert.equal(u.armR.position.z,0);const hand=u.hand.getWorldPosition(new THREE.Vector3());assert.ok(hand.toArray().every(Number.isFinite));
    if(previous)assert.ok(hand.distanceTo(previous)<.25,`${t.id}: discontinuity at ${time}`);previous=hand;
    const grip=new THREE.Vector3(0,0,0).applyMatrix4(u.weapon.matrixWorld);assert.ok(grip.distanceTo(u.weapon.parent.getWorldPosition(new THREE.Vector3()))<1e-8);
   }
  }
 }
 assert.equal(signatures.size,29,'Each new skill must have a distinct pose sequence');
});
function context(){
 const events=[],queue=[],target={id:1,x:0,z:2,a:0,rad:.5,hp:300,mhp:1000};let time=0;
 const log=method=>(...args)=>events.push({time,method,args});const fx={slash:log('slash'),ringWave:log('ringWave'),lightning:log('lightning'),parts:{emit:log('emit'),burst:log('burst')}};
 const c={me:{x:0,z:0,a:0},aim:()=>0,col:()=>0xabcdef,point:()=>({x:0,z:6}),later:(delay,fn)=>queue.push({at:time+delay,fn}),fx,hit:log('hit'),arc:log('arc'),line:log('line'),circle:log('circle'),proj:log('proj'),arrow:log('arrow'),buff:log('buff'),dash:log('dash'),sfx:log('sfx'),shake:log('shake'),taunt:log('taunt'),nearest:()=>target,targets:()=>[target]};
 return {c,events,run:()=>{let steps=0;while(queue.length){assert.ok(++steps<200);queue.sort((a,b)=>a.at-b.at);const q=queue.shift();time=q.at;q.fn();}}};
}
test('every technique runs real effects at authored times, including bleed, trap and return leg',()=>{
 for(const t of Object.values(TECHNIQUES)){const {c,events,run}=context();TREE_SKILLS[t.id].run(c);run();assert.ok(events.length,t.id);const hits=events.filter(e=>['hit','arc','line','circle','proj','arrow','buff','ringWave'].includes(e.method));assert.ok(hits.length,t.id);assert.ok(hits.some(e=>t.hits.includes(e.time)),t.id);}
 const bleed=context();TREE_SKILLS.dagger_bleed.run(bleed.c);bleed.run();assert.equal(bleed.events.filter(e=>e.method==='hit'&&e.args[2].type==='dot').length,4);
 const trap=context();TREE_SKILLS.bow_trap.run(trap.c);trap.run();assert.equal(trap.events.filter(e=>e.method==='circle').length,1);
 const ret=context();TREE_SKILLS.axe_return.run(ret.c);ret.run();const legs=ret.events.filter(e=>e.method==='proj');assert.equal(legs.length,2);assert.equal(legs[1].args[0].a,Math.PI);assert.equal(legs[1].args[0].sz,8);
});
test('server shares controls, bounds slow, ignores boss displacement and rejects foreign weapon effects',()=>{
 const w=new World();w.addPlayer(1,()=>{});w.handle(1,{t:'hello',name:'Spear',lv:1});const p=w.players.get(1);p.area='f1_field';p.wk='spear';p.x=0;p.z=0;const A=w.area(p.area);
 const mob={kind:'normal',x:0,z:3};w.applyTechniqueControl(A,p,mob,'spear_sweep');assert.equal(mob.slowT,3);assert.equal(mob.slowRate,.5);
 const boss={kind:'boss',x:0,z:3};w.applyTechniqueControl(A,p,boss,'spear_press');assert.equal(boss.z,3);
 const untouched={kind:'normal',x:0,z:3};w.applyTechniqueControl(A,p,untouched,'axe_hook');assert.equal(untouched.z,3);
 w.handle(1,{t:'st',wk:'spear',pm:'spear_intercept',pt:1.02});assert.equal(p.pm,'spear_intercept');assert.equal(p.pt,1.02);
});

test('real hit packets apply shared slow, push and pull without stacking damage multipliers',()=>{
 const w=new World();w.addPlayer(1,()=>{});w.handle(1,{t:'hello',name:'Control',lv:1});const p=w.players.get(1);p.area='f1_field';p.wk='spear';p.x=0;p.z=0;const A=w.area(p.area);
 const m=w.spawnMob(A,0,0,4,1);const hp=m.hp;
 w.handle(1,{t:'hit',id:m.id,dmg:1,tech:'spear_sweep'});assert.equal(m.hp,hp-1);assert.equal(m.slowT,3);assert.equal(m.slowRate,.5);
 const before=Math.hypot(m.x-p.x,m.z-p.z);w.handle(1,{t:'hit',id:m.id,dmg:1,tech:'spear_press'});assert.ok(Math.hypot(m.x-p.x,m.z-p.z)>before);
 p.wk='axe';const pushed=Math.hypot(m.x-p.x,m.z-p.z);w.handle(1,{t:'hit',id:m.id,dmg:1,tech:'axe_hook'});assert.ok(Math.hypot(m.x-p.x,m.z-p.z)<pushed);assert.equal(m.hp,hp-3);
 const char={lv:7,tree:{sword_norm:3,sword_heavy:3}};assert.equal(canLearn(char,'sword_aircut_node'),false);
});

test('delayed traps and bleed cannot damage enemies in a different area',()=>{
 const trap=context();let area='f1_field';trap.c.area=()=>area;TREE_SKILLS.bow_trap.run(trap.c);area='f1_town';trap.run();assert.equal(trap.events.filter(e=>e.method==='circle').length,0);
 const slash=context();area='f1_field';slash.c.area=()=>area;TREE_SKILLS.dagger_bleed.run(slash.c);area='f2_field';slash.run();assert.equal(slash.events.filter(e=>e.method==='hit').length,0);
});

test('only returning axe uses an axe projectile; greatsword recoil keeps its slash wave',()=>{
 const axe=context();TREE_SKILLS.axe_return.run(axe.c);axe.run();assert.ok(axe.events.filter(e=>e.method==='proj').every(e=>e.args[0].shape==='axe'));
 const gs=context();TREE_SKILLS.gs_recoil.run(gs.c);gs.run();assert.equal(gs.events.find(e=>e.method==='proj').args[0].shape,undefined);
});
