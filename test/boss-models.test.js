import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeMob, animateMob } from '../public/js/models.js';
import { FLOORS } from '../public/shared/data.js';

test('all three early bosses use distinct appearances while regular enemies retain their models', () => {
  const expected = ['graz', 'yugdra', 'skorpio'];
  for (const [i, floor] of FLOORS.entries()) {
    const b = floor.boss, boss = makeMob(b.t, b.color, b.scale, b.accent, true, b.appearance);
    assert.equal(boss.userData.identity, expected[i]);
    assert.equal(boss.scale.x, b.scale);
    const regular = makeMob(b.t, b.color, 1, b.accent, false, b.appearance);
    assert.equal(regular.userData.identity, undefined);
  }
});

test('both new bosses keep finite connected limbs through warning, attack, enraged and hit-flash states', () => {
  for (const { boss: b } of FLOORS.slice(1, 3)) {
    const model = makeMob(b.t, b.color, 1, b.accent, true, b.appearance);
    for (const st of [0, 1, 2, 3]) for (const enraged of [false, true]) for (const flash of [0, .7]) for (let t = 0; t < 3; t += .125) {
      animateMob(model, { st, enraged, flash, t });model.updateMatrixWorld(true);
      model.traverse(o => assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
      assert.ok(Number.isFinite(model.userData.aura.intensity));
      if (flash) for (const { m } of model.userData.mats) assert.equal(m.emissiveIntensity, flash * 1.5);
      if (b.appearance === 'skorpio') {
        const u = model.userData;
        assert.equal(u.scorpionLegs.length, 8);assert.equal(u.scorpionClaws.length, 2);
        for (let i = 1; i < u.tailJoints.length; i++) {
          const prev = u.tailJoints[i - 1], current = u.tailJoints[i];
          const end = prev.node.localToWorld(new THREE.Vector3(0, prev.length, 0));
          assert.ok(end.distanceTo(current.node.getWorldPosition(new THREE.Vector3())) < 1e-9);
        }
        assert.equal(u.stinger.parent, u.tailJoints.at(-1).node);
        assert.equal(u.body.rotation.x, 0);
      } else {
        for (const { leg, point } of model.userData.rootTips) {
          const foot = leg.localToWorld(point.clone());assert.ok(foot.y >= .0249, 'root goes below the ground');
        }
      }
    }
  }
});

test('the eight scorpion feet lift in an alternating gait and return to the ground while idle', () => {
  const b = FLOORS[2].boss, model = makeMob(b.t, b.color, 1, b.accent, true, b.appearance);
  const height = () => model.userData.scorpionLegs.map(l => l.knee.localToWorld(new THREE.Vector3(l.side * .37, -.47, 0)).y);
  animateMob(model, { st: 0, t: .35 });model.updateMatrixWorld(true);const idle = height();
  assert.ok(idle.every(h => h > 0 && h < .07));
  animateMob(model, { st: 1, t: .35 });model.updateMatrixWorld(true);const walking = height();
  assert.ok(walking.some((h, i) => h > idle[i] + .03));
  assert.ok(walking.some((h, i) => Math.abs(h - idle[i]) < .01));
  animateMob(model, { st: 0, t: 1 });model.updateMatrixWorld(true);
  assert.deepEqual(height(), idle);
});
