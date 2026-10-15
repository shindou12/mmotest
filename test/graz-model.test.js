import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMob, animateMob } from '../public/js/models.js';
import { FLOORS } from '../public/shared/data.js';

test('only the first-floor boss selects the dedicated Grasz appearance', () => {
  for (const floor of FLOORS) {
    const b = floor.boss;
    const model = makeMob(b.t, b.color, b.scale, b.accent, true, b.appearance);
    assert.equal(model.userData.identity === 'graz', floor.n === 1);
    assert.equal(model.scale.x, b.scale);
  }
  const regularKnight = makeMob('knight', 0x8a6a40, 1, null, false, 'graz');
  assert.equal(regularKnight.userData.identity, undefined);
});

test('Grasz keeps boss motion pivots, warning flashes and a held sword through every state', () => {
  const b = FLOORS[0].boss;
  const old = makeMob(b.t, b.color, 1, b.accent, true);
  const fresh = makeMob(b.t, b.color, 1, b.accent, true, b.appearance);
  for (const st of [0, 1, 2, 3]) for (const enraged of [false, true]) for (const flash of [0, .7]) for (const t of [0, .375, 1.125, 2]) {
    const state = { t, st, enraged, flash };
    animateMob(old, state); animateMob(fresh, state);
    old.updateMatrixWorld(true); fresh.updateMatrixWorld(true);
    for (const key of ['body', 'arm', 'cape', 'sigil', 'aura']) {
      assert.deepEqual(fresh.userData[key].matrixWorld.elements, old.userData[key].matrixWorld.elements, `${key}: animation changed`);
    }
    for (let i = 0; i < 2; i++) assert.deepEqual(fresh.userData.legs2[i].matrixWorld.elements, old.userData.legs2[i].matrixWorld.elements);
    assert.equal(fresh.userData.weaponModel.parent, fresh.userData.grip);
    fresh.traverse(o => assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
    assert.equal(fresh.userData.aura.intensity, old.userData.aura.intensity);
    if (flash) for (const { m } of fresh.userData.mats) assert.equal(m.emissiveIntensity, flash * 1.5);
  }
  assert.equal(fresh.userData.head.name, 'graz-head');
  assert.equal(fresh.userData.shield.name, 'graz-king-shield');
});
