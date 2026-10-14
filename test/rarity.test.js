import test from 'node:test';
import assert from 'node:assert/strict';
import { makeItem, gradeItem, itemQuality, migrateItem, RARITIES, TITLES, isLegend } from '../public/shared/data.js';

const withAffixes = (ilvl, tiers, bm) => {
  const it = makeItem(ilvl, 3, { slot: 'weapon', kind: 'sword' });
  it.affixes = tiers.map((t, i) => [['atkp', 'crit', 'critd'][i], t, 0]);
  it.bm = bm; it.enh = 0;
  return gradeItem(it);
};

test('rarity is the item quality: base roll + affix count and tiers, not the drop roll', () => {
  assert.equal(RARITIES.length, 8);
  assert.equal(withAffixes(21, [5, 5, 5], 1.4).rarity, 5, 'all max tiers and a top base roll is a masterwork');
  assert.ok(withAffixes(21, [1, 1, 1], 1.0).rarity <= 2, 'three T1 mods on a late item are poor');
  assert.ok(withAffixes(21, [5, 5], 1.3).rarity >= withAffixes(21, [1, 1, 1], 1.3).rarity, 'two great mods beat three bad ones');
  // 序盤（T1しか出ない頃）は T3 を満点として測るので、特性3つ・基本値最高でも上質止まり（逸品・傑作にはならない）
  assert.ok(withAffixes(3, [1, 1, 1], 1.4).rarity <= 3);
  assert.ok(withAffixes(3, [1, 1, 1], 1.1).rarity <= 2);
});

test('enhancing raises the quality and can raise the rarity', () => {
  const it = withAffixes(21, [4, 4, 3], 1.2);
  const q0 = itemQuality(it), r0 = it.rarity;
  it.enh = 10; gradeItem(it);
  assert.ok(itemQuality(it) > q0);
  assert.ok(it.rarity >= r0);
});

test('legendary and divine stay their own unique tiers', () => {
  for (let i = 0; i < 20; i++) {
    assert.equal(makeItem(20, 4).rarity, 6);
    assert.equal(makeItem(20, 5).rarity, 7);
  }
  assert.ok(isLegend(6) && isLegend(7) && !isLegend(5));
});

test('old saves (6-step rarity) are migrated once to the new scale', () => {
  const oldEpic = { slot: 'weapon', kind: 'sword', rarity: 3, ilvl: 21, atk: 30, affixes: [['atkp', 5, 12], ['crit', 5, 7], ['critd', 4, 22]], enh: 0, v: 2, name: 'x' };
  migrateItem(oldEpic);
  assert.equal(oldEpic.v, 3);
  assert.ok(oldEpic.rarity >= 0 && oldEpic.rarity <= 5 && oldEpic.bm > 0);
  const r = oldEpic.rarity;
  migrateItem(oldEpic);
  assert.equal(oldEpic.rarity, r, 'idempotent');

  const oldDivine = { slot: 'weapon', kind: 'sword', rarity: 5, unique: 'amenomurakumo', fx: ['wave'], ilvl: 20, atk: 40, affixes: [], enh: 0, v: 2 };
  assert.equal(migrateItem(oldDivine).rarity, 7);
  const oldTitle = { slot: 'title', title: 't_star', rarity: 5, affixes: [], v: 2 };
  assert.equal(migrateItem(oldTitle).rarity, TITLES.t_star.rarity);
  const oldLore = { slot: 'title', rarity: 4, fx: ['wave'], affixes: [], v: 2 };
  assert.equal(migrateItem(oldLore).rarity, 6);
});
