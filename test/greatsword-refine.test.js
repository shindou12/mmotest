import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeWeapon, weaponStyle } from '../public/js/models.js';
import { UNIQUES, makeItem } from '../public/shared/data.js';
import { GREATSWORD_UNIQUE_STYLES } from '../public/shared/weapon-appearances.js';

const APPEARANCES = ['greatsword-balanced', 'greatsword-cleaver', 'greatsword-zweihander', 'greatsword-flamberge', 'greatsword-odachi', 'greatsword-falchion'];

test('all six ordinary greatsword forms are registered, distinct, and finite', () => {
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
  assert.equal(hashes.size, 6, 'each ordinary style needs a different model structure');
});

test('existing Greatsword uniques resolve to dedicated models while regular styles remain reachable', () => {
  const uniques = UNIQUES.filter(item => item.kind === 'greatsword').map(item => ({ ...item, unique: item.key }));
  assert.deepEqual(Object.fromEntries(uniques.map(item => [item.unique, weaponStyle(item)])), GREATSWORD_UNIQUE_STYLES);
  for (const item of uniques) {
    const model = makeWeapon('greatsword', item.rarity, weaponStyle(item));
    assert.equal(model.userData.appearance, `greatsword-${item.unique}`);
    assert.ok(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y > 2.4);
  }
  const regularStyles = new Set(Array.from({ length: 50 }, (_, i) => weaponStyle(makeItem(i + 1, 0, { slot: 'weapon', kind: 'greatsword' }))));
  assert.ok(regularStyles.has(4), 'odachi should appear on ordinary Greatsword drops');
  assert.ok(regularStyles.has(5), 'falchion should appear on ordinary Greatsword drops');
});

test('all Greatsword styles preserve finite two-handed grip placement', () => {
  for (let style = 0; style < 8; style++) {
    const model = makeWeapon('greatsword', 6, style);
    model.updateMatrixWorld(true);
    assert.ok(model.children.length > 0);
    model.traverse(part => {
      const positions = part.geometry?.attributes?.position;
      if (positions) for (const value of positions.array) assert.ok(Number.isFinite(value));
    });
  }
});
