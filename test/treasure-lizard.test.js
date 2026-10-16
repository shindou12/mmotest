// きらめくトカゲ: まれに屋外に出て、プレイヤーから逃げ、立ち止まるたびにコインをまく。倒すと良い装備が2つ
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/shared/sim.js';
import { TREASURE_ID } from '../public/shared/data.js';

let seed = 9;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function field() {
  const w = new World({ unlocked: 3 }), inbox = [];
  w.addPlayer(1, (m) => inbox.push(m)); w.handle(1, { t: 'hello', name: 'P', lv: 5 });
  const A = w.area('f1_field'), p = w.players.get(1); p.area = A.id; p.x = 8; p.z = 40; // 谷の中央の草地 p.hp = p.mhp = 300;
  const tick = (sec) => { for (let t = 0; t < sec; t += 0.05) w.tick(0.05); };
  return { w, A, p, tick, sent: (t) => inbox.filter((m) => m.t === t) };
}

test('it appears rarely: one check every 30s at 4%, at most one per area', () => {
  const { A, tick } = field();
  let seen = 0;
  for (let i = 0; i < 400; i++) { tick(30); if ([...A.mobs.values()].some((m) => m.kind === 'treasure')) seen++; }
  assert.ok(seen > 0 && seen < 400 * 0.4, String(seen));
  assert.ok([...A.mobs.values()].filter((m) => m.kind === 'treasure').length <= 1);
});

test('it runs away faster than a player, pausing to scatter coins, then burrows away after 45s', () => {
  const { w, A, p, tick, sent } = field();
  const m = w.spawnTreasure(A);
  assert.ok(m && m.d === TREASURE_ID);
  assert.ok(m.arch.speed > 7.2);
  p.x = m.x + 4; p.z = m.z; // すぐ横に立つ
  const d0 = Math.hypot(m.x - p.x, m.z - p.z);
  tick(2.5);
  assert.ok(Math.hypot(m.x - p.x, m.z - p.z) > d0 + 6, 'fled');
  tick(0.6); // 最初の 0.6 秒は立ち止まり、2.2 秒走って、また立ち止まる → コイン
  assert.ok(sent('gold').length >= 3, 'coins scattered at the pause');
  tick(45);
  assert.ok(!A.mobs.has(m.id));
  assert.equal(sent('escape').length, 1);
});

test('killing it pays well: two items, one of them two-or-more affixes, and a gold bag', () => {
  const { w, A, sent } = field();
  const m = w.spawnTreasure(A);
  w.killMob(A, m);
  const loot = sent('loot').at(-1);
  assert.equal(loot.items.length, 2);
  assert.ok(loot.items.some((d) => d.it.affixes.length >= 2 || d.it.rarity >= 6));
  assert.equal(sent('gold').at(-1).bag, true);
});
