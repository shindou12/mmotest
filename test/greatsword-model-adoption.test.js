import test from 'node:test';
import assert from 'node:assert/strict';
import { makePlayer, makeWeapon, makeLootItem, setPlayerWeapon, weaponStyle } from '../public/js/models.js';
import { UNIQUES, WEAPON_KINDS } from '../public/shared/data.js';
import { GREATSWORD_UNIQUE_STYLES, normalizeWeaponStyle } from '../public/shared/weapon-appearances.js';
import { World } from '../public/shared/sim.js';

const uniques = UNIQUES.filter(item => item.kind === 'greatsword').map(item => ({ ...item, unique: item.key }));

test('Excalibur and Dainsleif use their distinct models when equipped and dropped', () => {
  const player = makePlayer('#448a9b');
  for (const item of uniques) {
    const style = weaponStyle(item);
    assert.equal(style, GREATSWORD_UNIQUE_STYLES[item.unique]);
    setPlayerWeapon(player, 'greatsword', item.rarity, style);
    assert.equal(player.userData.weaponModel.userData.appearance, `greatsword-${item.unique}`);
    let droppedAppearance = null;
    makeLootItem(item).traverse(part => { if (part.userData.appearance) droppedAppearance = part.userData.appearance; });
    assert.equal(droppedAppearance, `greatsword-${item.unique}`);
    assert.equal(makeWeapon('greatsword', item.rarity, style).userData.appearance, `greatsword-${item.unique}`);
  }
});

test('Greatsword style IDs survive snapshots and remain isolated to this weapon kind', () => {
  const inbox = [], world = new World();
  world.addPlayer(1, message => inbox.push(message));
  world.handle(1, { t: 'hello', name: 'Greatsword appearance' });
  const player = world.players.get(1);
  for (const style of [4, 5, 6, 7]) {
    world.handle(1, { t: 'st', wk: 'greatsword', wst: style });
    assert.equal(player.wk, 'greatsword');
    assert.equal(player.wst, style);
    world.snapshot(world.area(player.area));
    assert.equal(inbox.filter(message => message.t === 'snap').at(-1).p[0][16], style);
  }
  for (const kind of WEAPON_KINDS.filter(value => value !== 'greatsword' && value !== 'sword')) {
    for (const style of [4, 5, 6, 7]) assert.equal(normalizeWeaponStyle(kind, style), 0);
  }
  for (const bad of [8, 99, -1, 4.5, '5', {}, null, Infinity]) {
    world.handle(1, { t: 'st', wk: 'greatsword', wst: bad });
    assert.equal(player.wst, 0);
  }
});
