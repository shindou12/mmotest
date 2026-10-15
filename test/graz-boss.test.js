// コボルド王 グラズ（1層）の行動ロジック。仕様は docs/design/boss-sheets/graz.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/shared/sim.js';

// 乱数を固定（技の選び方が毎回同じになる）
let seed = 7;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function fight(count = 3) {
  const w = new World({ unlocked: 3 }), inbox = [];
  for (let id = 1; id <= count; id++) { w.addPlayer(id, (m) => inbox.push(m)); w.handle(id, { t: 'hello', name: `P${id}`, lv: 8 }); }
  const A = w.area('f1_lab');
  for (let id = 1; id <= count; id++) { const p = w.players.get(id); p.area = A.id; p.x = A.lair.x + (id - 2) * 3; p.z = A.lair.z; p.hp = p.mhp = 300; }
  const b = w.spawnBoss(A); A.bossState = 'fight';
  const tick = (sec) => { for (let t = 0; t < sec; t += 0.05) w.tick(0.05); };
  const sent = (t) => inbox.filter((m) => m.t === t);
  return { w, A, b, tick, sent, inbox };
}

test('graz opens with a knockback sword throw and has three HP bars', () => {
  const { b, tick, sent } = fight();
  assert.equal(b.bars, 3);
  tick(1.5);
  assert.equal(sent('bossAct')[0].p, 'throw');
  const t = sent('tele')[0];
  assert.equal(t.sh[0].k, 'line'); assert.equal(t.kd, 1);
});

test('breaking the first bar starts the summon cast; enough damage interrupts it with a stun', () => {
  const { w, b, tick, sent } = fight();
  tick(2); b.hp = b.mhp * 0.6; tick(0.1);
  assert.equal(b.cast.name, '近衛兵召集');
  assert.equal(sent('cast').at(-1).need, 1);
  w.handle(1, { t: 'hit', id: b.id, dmg: b.mhp * 0.07, st: 0 });
  tick(0.1);
  assert.equal(b.cast, null); assert.ok(b.stunT > 0);
  assert.equal(sent('castEnd').at(-1).ok, 0);
});

test('an uninterrupted summon cast brings three adds', () => {
  const { A, b, tick, sent } = fight();
  tick(2); b.hp = b.mhp * 0.6; tick(4.5);
  assert.equal(sent('castEnd').at(-1).ok, 1);
  assert.equal([...A.mobs.values()].filter((m) => m.kind === 'add').length, 3);
});

test('graz turns on a player below 30% HP with the shared mark, runs at them, and a taunt takes him back', () => {
  const { w, b, tick, sent } = fight();
  tick(5);
  const weak = [2, 3].find((id) => id !== b.target); // いま狙われていない人を弱らせる
  w.players.get(weak).hp = 60;
  tick(0.1);
  assert.equal(sent('mark').at(-1).tid, weak);
  assert.equal(b.tauntBy, weak);
  w.players.get(1).x = b.x; w.players.get(1).z = b.z + 2;
  w.handle(1, { t: 'taunt', r: 20 });
  assert.equal(b.tauntBy, 1);
  tick(0.5);
  assert.equal(sent('mark').length, 3); // 3人それぞれに1通ずつ。10秒に1回まで
});

test('breaking the second bar turns graz into the rampage with big swings', () => {
  const { b, tick, sent } = fight();
  tick(2); b.hp = b.mhp * 0.3; tick(0.1);
  assert.ok(b.rampage); assert.equal(b.bar, 3);
  assert.equal(sent('bossEv').at(-1).sfx, 'phase'); // 暴走の合図（文章はなし）
  assert.equal(sent('bossEv').at(-1).title, undefined);
  tick(1);
  assert.equal(sent('bossAct').at(-1).p, 'spin');
});

test('the judgement tracks the weakest player slowly, then fires a wide knockback line', () => {
  const { w, A, b, tick, sent } = fight();
  tick(2); b.hp = b.mhp * 0.5; b.bar = 2; b.cast = null; b.busyT = 0;
  w.players.get(2).hp = 120;
  w.bossPattern(A, b, 'judge', w.players.get(1), [...w.players.values()]);
  const ang0 = b.a; // 技の開始時は狙った相手（1）の方を向く
  assert.equal(sent('judge').at(-1).tid, 2);
  assert.equal(sent('cast').at(-1).name, '王の裁き');
  tick(0.5);
  assert.ok(Math.abs(b.a - ang0) <= 0.9 * 0.55 + 1e-6); // ゆっくり向きを合わせる
  tick(1.6);
  const t = sent('tele').at(-1);
  assert.equal(t.sh[0].k, 'line'); assert.equal(t.sh[0].w, 6); assert.equal(t.kd, 1);
  // 通り道に横向きの帯が4本並び、それぞれ中心から左右へ4段ずつ広がる（本線と直角）
  const before = sent('tele').length;
  tick(2);
  const waves = sent('tele').slice(before).filter((m) => m.sh.length === 2);
  assert.equal(waves.length, 4 * 4 * 3); // 帯4本 × 4段 × 3人
  for (const v of waves) for (const s of v.sh) assert.ok(Math.abs(Math.cos(s.a - t.sh[0].a)) < 0.01); // 直角
  assert.ok(waves.every((v) => v.sh[0].w === 8.5));
});
