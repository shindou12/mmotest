// 屋外の精鋭（性質つき・手下つき）とフィールドの主（気配で目覚める・技を使う）
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/shared/sim.js';
import { AFFIXES, AFFIX_IDS, rollAffixes, affixMask, affixesOf, OMEN } from '../public/shared/sim/elites.js';

let seed = 7;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function field(area = 'f1_field', x = 8, z = 40) {
  const w = new World({ unlocked: 3 }), inbox = [];
  w.addPlayer(1, (m) => inbox.push(m)); w.handle(1, { t: 'hello', name: 'P', lv: 5 });
  const A = w.area(area), p = w.players.get(1); p.area = A.id; p.x = x; p.z = z; p.hp = p.mhp = 300;
  const tick = (sec) => { for (let t = 0; t < sec; t += 0.05) w.tick(0.05); };
  return { w, A, p, tick, sent: (t) => inbox.filter((m) => m.t === t) };
}

test('affixes: count grows with the floor, never splitter together with regen, and survive the bitmask round trip', () => {
  for (let i = 0; i < 300; i++) {
    for (const [f, lo, hi] of [[1, 1, 1], [2, 1, 2], [3, 2, 3]]) {
      const a = rollAffixes(f);
      assert.ok(a.length >= lo && a.length <= hi && new Set(a).size === a.length);
      assert.ok(!(a.includes('splitter') && a.includes('regen')));
      assert.deepEqual(affixesOf(affixMask(a)).sort(), [...a].sort());
    }
  }
  assert.equal(AFFIX_IDS.length, Object.keys(AFFIXES).length);
});

test('an elite comes with escorts, is announced, and pays more for each affix', () => {
  const { w, A, sent } = field();
  const before = A.mobs.size;
  const m = w.spawnElite(A, 1, 8, 30, 3, ['swift', 'thunder']);
  assert.equal(A.mobs.size, before + 3);
  assert.ok(sent('chat').some((c) => /精鋭〔俊足・雷鳴〕/.test(c.text ?? c.msg ?? JSON.stringify(c))));
  const snap = w.snapshot(A) ?? null; void snap;
  w.killMob(A, m);
  const loot = sent('loot').at(-1);
  assert.ok(loot.items.length >= 1);
  assert.equal(sent('gold').at(-1).bag, true);
});

test('affix behaviour: bulwark cuts damage unless winding up, splitter splits into three, thunder strikes nearby players', () => {
  const { w, A, p, tick, sent } = field();
  const b = w.spawnElite(A, 1, 8, 34, 3, ['bulwark']);
  assert.equal(w.affixTaken(b, 100), 60);
  b.st = 2; assert.equal(w.affixTaken(b, 100), 100);
  const s = w.spawnElite(A, 0, 12, 34, 3, ['splitter']);
  const n0 = A.mobs.size;
  w.killMob(A, s);
  assert.equal(A.mobs.size, n0 - 1 + 3);
  const t = w.spawnElite(A, 1, 8, 36, 3, ['thunder']);
  t.target = p.id; t.thT = 0.01;
  const teles = sent('tele').length;
  w.tickAffixes(A, t, [p], 0.05);
  const last = sent('tele').at(-1);
  assert.ok(sent('tele').length > teles && last.c === '#ffe050' && Math.hypot(last.sh[0].x - p.x, last.sh[0].z - p.z) < 1);
});

test('the field lord wakes when the omen fills, uses its moves, and the omen waits after it falls', () => {
  const { w, A, p, sent } = field();
  const N = A.def.named;
  assert.ok(N.omen && N.at && N.moves.length);
  for (let i = 0; i < N.omen / OMEN.mob; i++) { const m = w.spawnMob(A, 0, 8, 30, 2); w.killMob(A, m); }
  const lord = A.mobs.get(A.namedId);
  assert.ok(lord && lord.named && lord.name === N.name);
  assert.ok(Math.hypot(lord.x - N.at[0], lord.z - N.at[1]) < 1);
  assert.ok(sent('chat').some((c) => JSON.stringify(c).includes('目を覚ました')));
  // 技: 3回に1回（怒ると2回に1回）
  p.x = lord.x + 3; p.z = lord.z;
  let moves = 0;
  for (let i = 0; i < 6; i++) { const t0 = sent('tele').length; lord.st = 0; lord.cd = 0; w.mobAttack(A, lord, p, 0); if (lord.moveN % 3 === 0) moves++; void t0; }
  assert.equal(moves, 2);
  w.killMob(A, lord);
  for (let i = 0; i < 40; i++) { const m = w.spawnMob(A, 0, 8, 30, 2); w.killMob(A, m); }
  assert.ok(!(A.namedId && A.mobs.has(A.namedId)), 'no new lord during the cooldown');
});
