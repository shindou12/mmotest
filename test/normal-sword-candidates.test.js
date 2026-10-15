import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeNormalSwordCandidate } from '../public/js/models/prototypes/normal-sword-candidates.js';
import { makePlayer, makeWeapon, setPlayerWeapon, animatePlayer } from '../public/js/models.js';
import { GRIP_Y } from '../public/js/pose-rig.js';
import { sampleSequence } from '../public/js/previews/sword-comparison-timeline.js';

function bladeOf(model){let blade;model.traverse(o=>{if(o.isMesh&&o.material.vertexColors)blade=o;});return blade;}
function dimensions(model){return new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());}

test('ordinary candidate blades are closed, outward-facing and finite at all quality tiers',()=>{
  for(const style of [0,1,2])for(const variant of ['A','B'])for(let rarity=0;rarity<8;rarity++){
    const m=makeNormalSwordCandidate(style,variant,rarity),blade=bladeOf(m);assert.ok(blade);
    const positions=blade.geometry.attributes.position,edges=new Map();let volume=0;
    const key=v=>v.toArray().map(n=>Math.round(n*1e6)).join(',');
    for(let i=0;i<positions.count;i+=3){
      const [a,b,c]=[0,1,2].map(n=>new THREE.Vector3().fromBufferAttribute(positions,i+n));
      assert.ok([...a.toArray(),...b.toArray(),...c.toArray()].every(Number.isFinite));
      assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).length()>1e-9,'degenerate blade face');
      volume+=a.dot(b.clone().cross(c))/6;
      for(const [p,q]of [[a,b],[b,c],[c,a]]){const edge=[key(p),key(q)].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);}
    }
    assert.ok(volume>0,'blade faces point inward');for(const count of edges.values())assert.equal(count,2,'open blade seam');
    const size=dimensions(m);assert.ok(size.y>1.7&&size.y<2.1);assert.ok(size.x<.6,'ordinary sword becomes too broad');
    let draws=0;m.traverse(o=>{if(o.isMesh)draws++;});assert.ok(draws<=12,'unnecessary draw calls');
    if(rarity>=4)assert.ok(blade.material.emissiveIntensity>0&&blade.material.emissive.getHex()>0,'quality glow is missing');
  }
});

test('review candidates retain the selected straight A and distinct katana and leaf silhouettes',()=>{
  const actual=makeNormalSwordCandidate(0,'A'),selected=makeWeapon('sword',1,0);
  assert.deepEqual(dimensions(actual).toArray(),dimensions(selected).toArray());
  assert.deepEqual(Array.from(bladeOf(actual).geometry.attributes.position.array),Array.from(bladeOf(selected).geometry.attributes.position.array));
  for(const style of [1,2]){
    const a=bladeOf(makeNormalSwordCandidate(style,'A')).geometry.attributes.position.array,b=bladeOf(makeNormalSwordCandidate(style,'B')).geometry.attributes.position.array;
    assert.notDeepEqual(Array.from(a),Array.from(b),'two proposals have the same geometry');
  }
  const katana=bladeOf(makeNormalSwordCandidate(1,'A')).geometry.attributes.position;
  let tipX=0,maxY=-Infinity;for(let i=0;i<katana.count;i++)if(katana.getY(i)>maxY){maxY=katana.getY(i);tipX=katana.getX(i);}assert.ok(tipX>.1,'katana loses its curve');
  const leaf=bladeOf(makeNormalSwordCandidate(2,'A')).geometry.attributes.position;
  let middle=0,base=0;for(let i=0;i<leaf.count;i++){if(leaf.getY(i)>.5&&leaf.getY(i)<1)middle=Math.max(middle,Math.abs(leaf.getX(i)));if(leaf.getY(i)<.2)base=Math.max(base,Math.abs(leaf.getX(i)));}assert.ok(middle>base*2,'leaf loses its central swell');
  assert.throws(()=>makeNormalSwordCandidate(3,'A'),RangeError);
});

test('all ordinary candidates stay in the same gripping hand throughout the actual game sequences',()=>{
  const m=makePlayer('#448a9b');setPlayerWeapon(m,'sword',1,0);const u=m.userData;
  for(const style of [0,1,2])for(const variant of ['before','A','B']){
    const candidate=makeNormalSwordCandidate(style,variant);u.weaponModel.removeFromParent();candidate.position.y=-GRIP_Y.sword;u.weapon.add(candidate);u.weaponModel=candidate;
    for(const action of ['ready','combo','heavy','skill'])for(let time=0;time<2;time+=.1){
      animatePlayer(m,sampleSequence(time,action).pose);m.updateMatrixWorld(true);
      const grip=candidate.localToWorld(new THREE.Vector3(0,GRIP_Y.sword,0));
      assert.ok(grip.distanceTo(u.gripHand.getWorldPosition(new THREE.Vector3()))<1e-6,'candidate loses the grip');
      assert.ok(u.weapon.getWorldQuaternion(new THREE.Quaternion()).angleTo(u.gripHand.getWorldQuaternion(new THREE.Quaternion()))<1e-6);
      assert.ok(u.weapon.matrixWorld.elements.every(Number.isFinite));
    }
  }
});
