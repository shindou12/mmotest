import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makePlayer, setPlayerWeapon, makeWeapon, animatePlayer } from '../public/js/models.js';
import { makeSwordCandidate } from '../public/js/models/prototypes/straight-sword-candidates.js';
import { GRIP_Y } from '../public/js/pose-rig.js';
import { ALL_MOTIONS } from '../public/js/technique-motion.js';

function actor(variant) {
  const m=makePlayer('#448a9b');setPlayerWeapon(m,'sword',1,0);
  if(variant){const u=m.userData;u.weaponModel.removeFromParent();u.weaponModel=makeSwordCandidate(variant);u.weaponModel.position.y=-GRIP_Y.sword;u.weapon.add(u.weaponModel);}
  return m;
}
const base={t:0,moving:false,walkT:0,kind:'sword',combo:0,swing:-1,spin:-1,sweep:-1,dodge:0,down:0,hurt:0};

test('both sword candidates fit the existing palm through all sword techniques and basic poses',()=>{
  const models=[actor(),actor('refined'),actor('bold')],poses=[];
  for(let i=0;i<=20;i++){
    const k=i/20;
    for(const combo of [0,1,2])poses.push({...base,t:k,swing:k,combo});
    poses.push({...base,t:k,charging:true,charge:k,swing:.02},{...base,t:k,guard:true},{...base,t:k,dodge:k},{...base,t:k,down:k},{...base,t:k,moving:true,walkT:k});
  }
  for(const motion of Object.values(ALL_MOTIONS).filter(m=>m.kind==='sword'))for(let i=0;i<=20;i++)poses.push({...base,motion:motion.id,motionT:motion.duration*i/20,t:i/20});
  for(const pose of poses){
    for(const model of models){animatePlayer(model,pose);model.updateMatrixWorld(true);}
    for(const model of models.slice(1)){
      const u=model.userData;
      for(const key of ['body','head','armR','elbowR','hand','weapon'])assert.deepEqual(u[key].matrixWorld.elements,models[0].userData[key].matrixWorld.elements,key);
      const contact=u.weaponModel.localToWorld(new THREE.Vector3(0,GRIP_Y.sword,0));
      assert.ok(contact.distanceTo(u.weapon.getWorldPosition(new THREE.Vector3()))<1e-9,'grip detached from palm');
      assert.ok(u.weaponModel.matrixWorld.elements.every(Number.isFinite));
    }
  }
});

test('candidate geometry stays in the normal sword envelope and within its render budget',()=>{
  const baseline=makeWeapon('sword',1,0),variants=['refined','bold'].map(makeSwordCandidate);
  const budget=m=>{let draws=0,triangles=0;m.traverse(o=>{if(o.isMesh){draws+=Array.isArray(o.material)?o.geometry.groups.length:1;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));}});return {draws,triangles};};
  const before=budget(baseline);
  for(const model of variants){
    const box=new THREE.Box3().setFromObject(model),cost=budget(model);
    assert.ok(box.max.y>=1.38&&box.max.y<=1.45,'blade should keep the normal sword length');
    assert.ok(box.min.y>=-.47&&box.min.y<=-.42,'hilt should remain within the grip envelope');
    assert.ok(cost.draws<=before.draws&&cost.triangles<=before.triangles,'candidate exceeds the existing sword budget');
    model.traverse(o=>{if(o.isMesh&&!o.userData.noOutline)assert.equal(o.children.filter(c=>c.isMesh&&c.userData.noOutline).length,1,'one outline per mesh');});
  }
});
