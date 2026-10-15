// 階層ごとのドロップの調整（FLOORS[].drops）: 1層は落としやすく、武器が多く、良い品は少しだけ渋い
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/shared/sim.js';
import { FLOORS, makeItem, rollRarity } from '../public/shared/data.js';

let seed = 3;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

test('floor 1 drops: more items, mostly weapons, slightly fewer multi-affix grades; other floors unchanged', () => {
  assert.deepEqual(FLOORS[0].drops, { item: 1.5, weapon: 0.8, rare: 0.8 });
  assert.equal(FLOORS[1].drops, undefined); assert.equal(FLOORS[2].drops, undefined);
  const N = 6000;
  const share = (opts) => { let w = 0; for (let i = 0; i < N; i++) if (makeItem(5, 0, opts).slot === 'weapon') w++; return w / N; };
  assert.ok(Math.abs(share({ weapon: 0.8 }) - 0.8) < 0.03);
  assert.ok(Math.abs(share({}) - 0.6) < 0.03);
  const good = (rare) => { let g = 0; for (let i = 0; i < N; i++) if (rollRarity(0, 0, 20, rare) >= 2) g++; return g / N; };
  const base = good(1), f1 = good(0.8);
  assert.ok(f1 < base && f1 > base * 0.6, `${f1} vs ${base}`);
});

test('floor 1 mobs drop about 1.5x as often as before', () => {
  const w = new World({ unlocked: 3 }), loot = [];
  w.addPlayer(1, (m) => { if (m.t === 'loot') loot.push(m); }); w.handle(1, { t: 'hello', name: 'P', lv: 3 });
  const A = w.area('f1_field'), p = w.players.get(1); p.area = A.id; p.x = 0; p.z = 0; p.hp = p.mhp = 100;
  const N = 1500;
  for (let i = 0; i < N; i++) { const m = w.spawnMob(A, 0, 1, 1, 3); w.killMob(A, m); }
  const rate = loot.length / N;
  assert.ok(Math.abs(rate - 0.51) < 0.05, String(rate));
});
