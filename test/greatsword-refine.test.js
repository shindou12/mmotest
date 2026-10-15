import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeWeapon } from '../public/js/models.js';

const APPEARANCES = ['greatsword-balanced', 'greatsword-cleaver', 'greatsword-zweihander', 'greatsword-flamberge'];

test('all four base greatsword forms are registered, distinct, and finite', () => {
  const hashes = new Set();
  for (let style = 0; style < APPEARANCES.length; style++) {
    const weapon = makeWeapon('greatsword', 2, style), box = new THREE.Box3().setFromObject(weapon), size = box.getSize(new THREE.Vector3());
    assert.equal(weapon.userData.appearance, APPEARANCES[style]);
    assert.ok(size.y > 2 && size.y < 4.1, `${style} has an unexpected length: ${size.y}`);
    weapon.traverse(part => {
      const positions = part.geometry?.attributes?.position;
      if (positions) for (const value of positions.array) assert.ok(Number.isFinite(value), `${style} contains a non-finite vertex`);
    });
    const fingerprint = weapon.children.map(part => [part.type, part.geometry?.attributes?.position?.count, part.position.toArray()]).flat().join('|');
    hashes.add(fingerprint);
  }
  assert.equal(hashes.size, 4, 'each style needs a different model structure');
});
