// 砂塵の大蠍 スコルピオ（3層・最後のボス）の行動ロジックと砂の回廊。仕様は docs/design/boss-sheets/skorpio.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/shared/sim.js';
import { collide, inLair } from '../public/shared/areas.js';
import { BALANCE } from '../public/shared/balance.js';

let seed = 5;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// 3人が回廊の入口側（南）に並ぶ（届いたメッセージは1人目の分だけ見る）
function fight(count = 3) {
  const w = new World({ unlocked: 3 }), inbox = [];
  for (let id = 1; id <= count; id++) { w.addPlayer(id, (m) => { if (id === 1) inbox.push(m); }); w.handle(id, { t: 'hello', name: `P${id}`, lv: 24 }); }
  const A = w.area('f3_lab'), L = A.lair;
  for (let id = 1; id <= count; id++) { const p = w.players.get(id); p.area = A.id; p.x = L.x + (id - 2) * 3; p.z = L.box.z1 - 10; p.hp = p.mhp = 5000; }
  const b = w.spawnBoss(A); A.bossState = 'fight';
  const tick = (sec) => { for (let t = 0; t < sec; t += 0.05) w.tick(0.05); };
  const sent = (t) => inbox.filter((m) => m.t === t);
  return { w, A, L, b, tick, sent, inbox };
}
const free = (def, x, z) => { const q = collide(def, x, z, 0.4); return Math.hypot(q.x - x, q.z - z) < 1e-6; };
const K = (v) => Math.round(v * BALANCE.bossRange * 100) / 100;

test('the sand corridor: 28m wide and 72m long, walkable end to end, judged as a box instead of a circle', () => {
  const w = new World({ unlocked: 3 }), A = w.area('f3_lab'), L = A.lair, B = L.box;
  assert.equal(B.x1 - B.x0, 28); assert.equal(B.z1 - B.z0, 72);
  for (let z = B.z0 + 1; z < B.z1; z += 4) for (const x of [B.x0 + 1, L.x, B.x1 - 1]) assert.ok(free(A.def, x, z), `${x},${z}`);
  assert.ok(!free(A.def, B.x1 + 3, L.z));
  assert.ok(inLair(L, L.x, B.z0 + 2) && inLair(L, L.x, B.z1 - 2)); // 両端も部屋の中
  assert.ok(!inLair(L, B.x1 + 6, L.z));
  // ほかの迷宮区のボス部屋は今までどおり円
  const L1 = w.area('f1_lab').lair;
  assert.equal(L1.box, undefined); assert.equal(L1.r, 20);
});

test('the fight starts empty: skorpio waits buried at the far end, chases under the sand and bursts out under the target', () => {
  const { w, A, L, b, tick, sent } = fight();
  assert.ok(b.z < L.z - 20); // 奥（北）にいる
  tick(0.4);
  assert.ok(b.burrow, 'buried');
  assert.equal(sent('bossAct').at(-1).p, 'burrow');
  const hp = b.hp;
  w.handle(1, { t: 'hit', id: b.id, dmg: 5000 });
  assert.equal(b.hp, hp); // 潜っている間は当たらない
  const before = sent('tele').length;
  tick(4.6);
  const teles = sent('tele').slice(before);
  const trail = teles.filter((m) => m.sh[0].k === 'circle' && m.sh[0].r === K(1.6));
  const burst = teles.filter((m) => m.sh[0].k === 'circle' && m.sh[0].r === K(4.5));
  assert.ok(trail.length >= 10, String(trail.length)); // 盛り上がりが続く
  assert.ok(trail.at(-1).sh[0].z > trail[0].sh[0].z + 15); // 入口側へ追ってくる
  assert.equal(burst.length, 1); assert.equal(burst[0].kd, 1);
  tick(1.5);
  assert.equal(b.burrow, null);
  w.handle(1, { t: 'hit', id: b.id, dmg: 100 });
  assert.equal(b.hp, hp - 100); // 飛び出したら当たる
});

test('stack: the yellow mark follows one player and its total damage is split by how many stand inside', () => {
  const { w, A, b, tick, sent } = fight();
  const P = [1, 2, 3].map((id) => w.players.get(id));
  // 3人が集まっている
  P.forEach((p, i) => { p.x = A.lair.x + i * 0.8; p.z = A.lair.z; });
  w.stackMark(A, b, P[0], 5, 3, 900);
  const s = sent('stack').at(-1);
  assert.equal(s.tid, 1); assert.equal(s.r, K(3)); assert.equal(s.d, 5000);
  tick(5.1);
  let t = sent('tele').filter((m) => m.c === '#ffd84a').at(-1);
  assert.equal(t.n, 3); assert.equal(t.dmg, 300);
  // 1人だけ離れて受ける → 1人で全部
  P[1].x += 20; P[2].x += 20;
  w.stackMark(A, b, P[0], 5, 3, 900);
  P[0].x -= 4; // 付いた人が動くと、円もついていく
  tick(5.1);
  t = sent('tele').filter((m) => m.c === '#ffd84a').at(-1);
  assert.equal(t.n, 1); assert.equal(t.dmg, 900);
  assert.ok(Math.abs(t.sh[0].x - P[0].x) < 0.01);
});

test('away mark: a red circle follows one player; everyone inside takes the full hit (not split) and is knocked back', () => {
  const { w, A, b, tick, sent } = fight();
  const P = [1, 2, 3].map((id) => w.players.get(id));
  P.forEach((p, i) => { p.x = A.lair.x + i * 0.8; p.z = A.lair.z; });
  let at = null;
  w.awayMark(A, b, P[0], 4, 5, 600, (q) => { at = { x: q.x, z: q.z }; });
  const s = sent('stack').at(-1);
  assert.equal(s.kind, 'away'); assert.equal(s.r, K(5));
  tick(4.1);
  const t = sent('tele').at(-1);
  assert.equal(t.c, '#ff2a2a'); assert.equal(t.kd, 1);
  assert.equal(t.n, 3); assert.equal(t.dmg, 600); // 3人入っていても割られない
  assert.ok(at && Math.abs(at.x - P[0].x) < 0.01);
});

test('from the second bar, burrowing marks one player and skorpio bursts out right under that player', () => {
  const { w, A, b, tick, sent } = fight();
  tick(6);
  while (b.burrow || b.cast) tick(0.1);
  b.hp = b.mhp * 0.6; b.stackCd = 99;
  tick(0.1);
  b.burrowCd = 0; b.stackT = 0;
  for (let i = 0; i < 200 && !b.burrow; i++) tick(0.05);
  assert.ok(b.burrow?.mark, 'marked burrow');
  const m = sent('stack').at(-1);
  assert.equal(m.kind, 'away');
  assert.ok(sent('cast').some((c) => c.name === '砂喰らい'));
  const p = w.players.get(m.tid);
  p.x = A.lair.x + 9; p.z = A.lair.z + 20; // 走って逃げても、飛び出すのはその人の足元
  tick(5.6);
  assert.ok(Math.hypot(b.x - p.x, b.z - p.z) < 0.5, `${b.x},${b.z} vs ${p.x},${p.z}`);
});

test('the gather mark and the away mark never overlap', () => {
  const { b, tick, inbox } = fight();
  tick(6);
  b.hp = b.mhp * 0.6; // 2本目（潜行＝離れる印が出る）
  tick(120);
  const marks = inbox.filter((m) => m.t === 'stack').map((m) => ({ kind: m.kind || 'stack', from: inbox.indexOf(m), d: m.d }));
  assert.ok(marks.some((m) => m.kind === 'away') && marks.some((m) => m.kind === 'stack'), JSON.stringify(marks.map((m) => m.kind)));
  // 印が付いてから弾けるまでのあいだに、もう片方の印が付かない（弾けた印は c が黄色／赤の tele）
  for (const m of marks) {
    const end = inbox.findIndex((x, j) => j > m.from && x.t === 'tele' && (x.c === '#ffd84a' || (x.c === '#ff2a2a' && x.n != null)));
    const between = inbox.slice(m.from + 1, end).filter((x) => x.t === 'stack');
    assert.equal(between.length, 0, `${m.kind} overlaps`);
  }
});

test('skorpio marks a stack early and keeps doing it, and never charges or burrows while a mark is out', () => {
  const { b, tick, sent, inbox } = fight();
  tick(48);
  const stacks = sent('stack');
  assert.ok(stacks.length >= 2, String(stacks.length));
  assert.ok(sent('cast').some((m) => m.name === '毒針の刻印'));
  for (const s of stacks) {
    const i = inbox.indexOf(s);
    // 刻印が付いてから弾けるまで（5秒 ≒ 100 tick 分のメッセージ）に、突進・潜行を始めない
    const until = inbox.findIndex((m, j) => j > i && m.t === 'tele' && m.c === '#ffd84a');
    const acts = inbox.slice(i, until).filter((m) => m.t === 'bossAct').map((m) => m.p);
    assert.ok(!acts.includes('charge') && !acts.includes('burrow'), acts.join(','));
  }
  assert.ok(b.hp > 0);
});

test('narrow directional strikes come often: the tail stab is the most frequent move', () => {
  const { tick, sent } = fight();
  tick(40);
  const acts = sent('bossAct').map((m) => m.p);
  const n = (p) => acts.filter((a) => a === p).length;
  assert.ok(n('sting') >= 8, acts.join(','));
  assert.ok(n('sting') > n('charge') && n('sting') > n('pincer'));
});

test('skorpio stays inside the corridor, even when charging to its end', () => {
  const { A, b, tick } = fight();
  const B = A.lair.box;
  for (let i = 0; i < 60; i++) { tick(1); assert.ok(b.x >= B.x0 && b.x <= B.x1 && b.z >= B.z0 && b.z <= B.z1, `${b.x},${b.z}`); }
});

test('second bar: skorpio starts burrowing; third bar: the sandstorm cast is a DPS check (stun when broken in time)', () => {
  const { w, b, tick, sent } = fight();
  tick(6);
  b.hp = b.mhp * 0.6; // 2本目
  tick(12);
  assert.ok(sent('bossAct').filter((m) => m.p === 'burrow').length >= 2); // 登場＋2本目
  while (b.burrow || b.cast) tick(0.1);
  b.hp = b.mhp * 0.3; // 3本目
  tick(0.1);
  const c = sent('cast').at(-1);
  assert.equal(c.name, '大砂嵐'); assert.equal(c.need, 1); assert.equal(c.act, 'storm');
  w.handle(1, { t: 'hit', id: b.id, dmg: b.mhp * 0.06 });
  tick(0.2);
  assert.ok(b.stunT > 0);
  assert.equal(sent('stun').length, 1);
  assert.ok(b.rage);
});

test('if the sandstorm is not broken, it sweeps the whole corridor with a knockback', () => {
  const { A, b, tick, sent } = fight();
  tick(6);
  b.hp = b.mhp * 0.3;
  while (b.burrow) tick(0.1);
  tick(0.1);
  assert.equal(sent('cast').at(-1).name, '大砂嵐');
  tick(6.2);
  const t = sent('tele').at(-1);
  const B = A.lair.box;
  assert.equal(t.kd, 1);
  assert.equal(t.sh[0].k, 'line'); assert.ok(t.sh[0].len >= B.z1 - B.z0 - 0.01 && t.sh[0].w >= B.x1 - B.x0);
});

test('every move skorpio uses has an authored motion', async () => {
  const { SKORPIO_MOTIONS } = await import('../public/js/models/bosses/skorpio-motion.js');
  const { skorpio } = await import('../public/shared/sim/bosses/skorpio.js');
  const moves = new Set([...skorpio.patterns({ bar: 2, burrowCd: 0, stackT: 0 }), ...skorpio.patterns({ rage: true, bar: 3, burrowCd: 0 }), 'stack', 'storm']);
  for (const p of moves) assert.ok(SKORPIO_MOTIONS[p], p);
});
