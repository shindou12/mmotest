import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makePlayer, setPlayerWeapon, animatePlayer } from '../public/js/models.js';
import { GRIP_Y } from '../public/js/weapon-pose.js';
import { WEAPON_KINDS, starterWeapon } from '../public/shared/data.js';

const base = { t: 1, moving: false, walkT: 0, combo: 0, swing: -1, spin: -1, sweep: -1, dodge: 0, down: 0, hurt: 0, guard: false };
const poses = [{}, { moving: true, walkT: .4 }, { swing: .1 }, { swing: .55 }, { swing: .45, combo: 2 }, { guard: true }, { sweep: 2 }, { dodge: .5 }, { down: .8 }];
function point(object) { return object.getWorldPosition(new THREE.Vector3()); }

test('all weapon styles stay anchored to the palm through every player pose', () => {
  for (const kind of WEAPON_KINDS) for (let style = 0; style < 4; style++) {
    const model = makePlayer('#448a9b');setPlayerWeapon(model, kind, 3, style);
    const u = model.userData;
    assert.equal(u.weapon.parent, kind === 'bow' ? u.handL : u.hand);
    for (const pose of poses) {
      animatePlayer(model, { ...base, ...pose, kind });model.updateMatrixWorld(true);
      const grip = u.weaponModel.localToWorld(new THREE.Vector3(0, GRIP_Y[kind], 0));
      assert.ok(grip.distanceTo(point(u.weapon.parent)) < 1e-6, `${kind}/${style}: grip detaches`);
      assert.ok(u.weapon.quaternion.toArray().every(Number.isFinite));
    }
  }
});

test('bow remains upright and the drawing hand reaches the string for every style', () => {
  for (let style = 0; style < 4; style++) {
    const model = makePlayer('#448a9b');setPlayerWeapon(model, 'bow', 3, style);
    const u = model.userData;
    for (const state of [{}, { charging: true, charge: .5 }, { charging: true, charge: 1 }, { swing: .05 }]) {
      animatePlayer(model, { ...base, ...state, kind: 'bow' });model.updateMatrixWorld(true);
      const b = u.weaponModel.userData.bow;
      const bottom = u.weaponModel.localToWorld(new THREE.Vector3(b.sx, -b.tip, 0));
      const top = u.weaponModel.localToWorld(new THREE.Vector3(b.sx, b.tip, 0));
      const axis = top.sub(bottom).normalize();assert.ok(axis.y > .999);
      if (state.charging || state.swing >= 0) {
        const x = b.string.geometry.attributes.position.getX(1);
        const stringGrip = u.weaponModel.localToWorld(new THREE.Vector3(x, 0, 0));
        assert.ok(stringGrip.distanceTo(point(u.hand)) < .02, `bow/${style}: drawing hand misses string`);
      }
    }
  }
});

test('spear thrust points forward, sweep extends sideways, shield faces the enemy', () => {
  const model = makePlayer('#448a9b');setPlayerWeapon(model, 'spear', 0);
  const u = model.userData;
  for (const pose of [{ swing: .35 }, { guard: true }, { sweep: 1.5 }]) {
    animatePlayer(model, { ...base, ...pose, kind: 'spear' });model.updateMatrixWorld(true);
    const tip = u.weaponModel.localToWorld(new THREE.Vector3(0, GRIP_Y.spear + 1, 0));
    const axis = tip.sub(point(u.hand)).normalize().applyQuaternion(u.body.getWorldQuaternion(new THREE.Quaternion()).invert());
    assert.ok(pose.sweep >= 0 ? axis.x > .99 : axis.z > .99);
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(u.shield.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(u.body.getWorldQuaternion(new THREE.Quaternion()).invert());
    assert.ok(facing.z > .99);
  }
});

test('greatsword and axe support hand stays on the lower handle during idle and attacks', () => {
  for (const kind of ['greatsword', 'axe']) {
    const model = makePlayer('#448a9b');setPlayerWeapon(model, kind, 0);
    const u = model.userData;
    for (const pose of [{}, { swing: .1 }, { swing: .5 }, { swing: .24, combo: 2 }, { swing: .7, combo: 2 }]) {
      animatePlayer(model, { ...base, ...pose, kind });model.updateMatrixWorld(true);
      const lowerGrip = u.weaponModel.localToWorld(new THREE.Vector3(0, GRIP_Y[kind] - .18, 0));
      assert.ok(lowerGrip.distanceTo(point(u.handL)) < .025, `${kind}: support hand is detached`);
    }
  }
});

test('each of the six starting weapons has the selected type and skill', () => {
  for (const kind of WEAPON_KINDS) {
    const item = starterWeapon(kind);assert.equal(item.kind, kind);assert.equal(item.slot, 'weapon');assert.ok(item.skill);
  }
});

test('bow limbs and string stay outside the chest during idle, drawing and release', () => {
  for (let style = 0; style < 4; style++) {
    const model = makePlayer('#448a9b');setPlayerWeapon(model, 'bow', 3, style);
    const u = model.userData;
    for (const pose of [{}, { moving: true, walkT: .3 }, { charging: true, charge: .5 }, { charging: true, charge: 1 }, { swing: 0 }, { swing: .2 }]) {
      animatePlayer(model, { ...base, ...pose, kind: 'bow' });model.updateMatrixWorld(true);
      const inverse = u.body.matrixWorld.clone().invert();
      u.weaponModel.traverse(part => {
        if (!part.geometry?.attributes.position || !part.visible) return;
        const positions = part.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const p = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(part.matrixWorld).applyMatrix4(inverse);
          if (p.y < .92 || p.y > 1.55) continue;
          assert.ok(Math.hypot(p.x, p.z) > .33, `bow/${style}: vertex intersects chest at ${p.toArray()}`);
        }
      });
      const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(u.head.getWorldQuaternion(new THREE.Quaternion()));
      assert.ok(facing.z > .995 && Math.abs(facing.x) < .03, 'head does not face the aiming direction');
    }
  }
});
