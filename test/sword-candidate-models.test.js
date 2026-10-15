import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeWeaponPreview } from '../public/js/models.js';
import { NEW_SWORD_CANDIDATES } from '../public/js/models/new-sword-candidates.js';

test('two new sword studies have distinct identities and readable game-scale proportions',()=>{
  assert.equal(NEW_SWORD_CANDIDATES.length,2);
  assert.deepEqual(NEW_SWORD_CANDIDATES.map(x=>x.id),['oni-kiba','sosei']);
  const boxes=[];
  for(const candidate of NEW_SWORD_CANDIDATES){
    const sword=makeWeaponPreview('sword',6,0,candidate.build),box=new THREE.Box3().setFromObject(sword);
    assert.equal(sword.userData.appearance,'prototype-'+candidate.id);
    assert.ok(sword.children.length<=16,`${candidate.id} should stay visually economical`);
    assert.ok(box.getSize(new THREE.Vector3()).y>1.8&&box.getSize(new THREE.Vector3()).y<2.2);
    sword.traverse(node=>{const a=node.geometry?.attributes?.position;if(a)for(const n of a.array)assert.ok(Number.isFinite(n),`${candidate.id} has non-finite geometry`);});
    boxes.push(box);
  }
  const oniWidth=boxes[0].getSize(new THREE.Vector3()).x,soseiWidth=boxes[1].getSize(new THREE.Vector3()).x;
  assert.ok(oniWidth>soseiWidth*1.5,'the forward hook should change the silhouette width');
});
