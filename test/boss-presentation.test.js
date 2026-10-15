import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as THREE from 'three';
import {World} from '../public/shared/sim.js';import {FLOORS} from '../public/shared/data.js';import {makeMob,animateMob} from '../public/js/models.js';
import {BOSS_DEMO_MOVES,bossMoveSpec,BossPlayback} from '../public/shared/boss-moves.js';import {sampleBossPose} from '../public/js/boss-motion.js';import {FX} from '../public/js/fx.js';import {BossEffects} from '../public/js/boss-effects.js';import {attackTrace} from './boss-presentation-utils.js';

test('six presentations preserve the pre-change attack timings, shapes, projectile paths and damage in all three phases',()=>{
 const reference=JSON.parse(fs.readFileSync(new URL('./fixtures/boss-attack-parity.json',import.meta.url),'utf8'));
 for(const id of BOSS_DEMO_MOVES)for(const phase of [1,2,3])assert.deepEqual(attackTrace(World,...id.split('/'),phase),reference.traces[id+'/'+phase],id+'/'+phase);
});
test('all six authored motions remain finite, keep grips connected and restore the original pose after playback',()=>{
 for(const id of BOSS_DEMO_MOVES)for(const phase of [1,2,3]){
  const [identity,pattern]=id.split('/'),b=FLOORS.find(f=>f.boss.appearance===identity).boss,m=makeMob(b.t,b.color,b.scale,b.accent,true,identity),original=makeMob(b.t,b.color,b.scale,b.accent,true,identity),spec=bossMoveSpec(identity,pattern,phase);
  for(let age=0;age<=spec.duration;age+=1/120){animateMob(m,{t:2,st:0,bossMove:pattern,bossTime:age,bossPhase:phase});m.updateMatrixWorld(true);m.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite),id));
   if(identity==='graz')assert.ok(m.userData.weaponModel.localToWorld(new THREE.Vector3()).distanceTo(m.userData.grip.getWorldPosition(new THREE.Vector3()))<1e-8);
   if(identity==='yugdra')for(const {leg,point} of m.userData.rootTips)assert.ok(leg.localToWorld(point.clone()).y>=.0249*b.scale);
  }
  animateMob(m,{t:2,st:0});animateMob(original,{t:2,st:0});m.updateMatrixWorld(true);original.updateMatrixWorld(true);
  const anchors=x=>x.userData.motionRest.map(r=>r.node.matrixWorld.elements);
  assert.deepEqual(anchors(m),anchors(original),id+' leaves an altered idle pose');
  assert.equal(sampleBossPose(identity,'missing',0),null);
 }
});
test('playback handles late joins, duplicate snapshots, replaced actions and stun cancellation',()=>{
 const p=new BossPlayback();assert.equal(p.receive({id:7,p:'cone',seq:2,phase:1,sp:.9,age:.4},10,'graz'),true);
 assert.ok(Math.abs(p.sample(7,10.1,'graz').age-.5)<1e-8);
 assert.equal(p.receive({id:7,p:'cone',seq:2,age:.5},10.1,'graz'),false);
 assert.equal(p.receive({id:7,p:'slam',seq:1},10.2,'graz'),false);
 assert.equal(p.receive({id:7,p:'slam',seq:3},10.2,'graz'),true);assert.equal(p.sample(7,10.3,'graz').pattern,'slam');
 p.cancel(7);assert.equal(p.sample(7,10.4,'graz'),null);assert.equal(p.receive({id:7,p:'cone',age:Infinity},12,'graz'),false);
});
test('server sends active presentation age to late joiners and removes it on stun',()=>{
 const world=new World({unlocked:3}),messages=[];world.addPlayer(1,m=>messages.push(m));const p=world.players.get(1);p.joined=true;p.area='f1_lab';const A=world.area(p.area);p.x=A.lair.x;p.z=A.lair.z+6;const b=world.spawnBoss(A);
 world.bossPattern(A,b,'cone',p,[p]);const act=messages.find(m=>m.t==='bossAct');assert.equal(act.seq,1);assert.equal(act.phase,1);assert.equal(act.sp,.9);
 world.time=.3;world.snapshot(A);assert.equal(messages.at(-1).bm[0].age,.3);
 world.stunBoss(A,b);world.snapshot(A);assert.deepEqual(messages.at(-1).bm,[]);
});
test('themed effects use finite geometry and release ribbons and owned temporary effects on cancellation',()=>{
 for(const id of ['graz','yugdra','skorpio']){
  const scene=new THREE.Scene(),fx=new FX(scene),effects=new BossEffects(scene,fx),b=FLOORS.find(f=>f.boss.appearance===id).boss,m=makeMob(b.t,b.color,b.scale,b.accent,true,id);scene.add(m);
  const pattern={graz:'cone',yugdra:'shock',skorpio:'shot'}[id],spec=bossMoveSpec(id,pattern);
  for(let t=0;t<spec.duration;t+=1/60){animateMob(m,{t,st:0,bossMove:pattern,bossTime:t});effects.update(m,{pattern,age:t,phase:1,speed:.9,spec,key:'test'},1/60,t);fx.update(1/60);}
  effects.prepare(m,{k:'circle',x:0,z:5,r:3},.2);effects.impact(m,{k:id==='yugdra'?'ring':'circle',x:0,z:5,r:3,r0:5,r1:8});effects.projectile(m,0,1.3,2);fx.update(.01);
  scene.traverse(o=>{const a=o.geometry?.attributes.position?.array;if(a)assert.ok([...a].every(Number.isFinite));});effects.clear(m);
  assert.equal(effects.actors.size,0);assert.ok(fx.items.every(it=>it.bossOwner!==m.uuid));
 }
});
