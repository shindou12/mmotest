// 階層ごとのドロップの調整（FLOORS[].drops）: 1層は落としやすく、武器が多く、良い品は少しだけ渋い
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/shared/sim.js';
import { FLOORS, makeItem, rollRarity } from '../public/shared/data.js';

let seed = 3;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

test('floor 1 drops: an extra weapon-only roll, slightly fewer multi-affix grades; other floors unchanged', () => {
  assert.deepEqual(FLOORS[0].drops, { weapon: 0.17, rare: 0.8 });
  assert.equal(FLOORS[1].drops, undefined); assert.equal(FLOORS[2].drops, undefined);
  const N = 6000;
  const good = (rare) => { let g = 0; for (let i = 0; i < N; i++) if (rollRarity(0, 0, 20, rare) >= 2) g++; return g / N; };
  const base = good(1), f1 = good(0.8);
  assert.ok(f1 < base && f1 > base * 0.6, `${f1} vs ${base}`);
  void makeItem;
});

test('floor 1 mobs drop weapons about 1.8x as often; armor and accessories stay as they were', () => {
  const w = new World({ unlocked: 3 }), loot = [];
  w.addPlayer(1, (m) => { if (m.t === 'loot') loot.push(m); }); w.handle(1, { t: 'hello', name: 'P', lv: 3 });
  const A = w.area('f1_field'), p = w.players.get(1); p.area = A.id; p.x = 0; p.z = 0; p.hp = p.mhp = 100;
  const N = 3000;
  for (let i = 0; i < N; i++) { const m = w.spawnMob(A, 0, 1, 1, 3); w.killMob(A, m); }
  const items = loot.flatMap((l) => l.items.map((d) => d.it));
  const weapons = items.filter((it) => it.slot === 'weapon').length / N, others = items.filter((it) => it.slot !== 'weapon').length / N;
  assert.ok(Math.abs(weapons - (0.34 * 0.6 + 0.17)) < 0.03, `weapons ${weapons}`);
  assert.ok(Math.abs(others - 0.34 * 0.4) < 0.03, `others ${others}`);
});
