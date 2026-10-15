// 霧の大樹 ユグドラ（2層）の行動ロジックと十字の間。仕様は docs/design/boss-sheets/yugdra.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/shared/sim.js';
import { collide } from '../public/shared/areas.js';
import { BALANCE } from '../public/shared/balance.js';
const K = (v) => Math.round(v * BALANCE.bossRange * 100) / 100; // ボスの予兆は全体に広がる

let seed = 11;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function fight(count = 3) {
  const w = new World({ unlocked: 3 }), inbox = [];
  for (let id = 1; id <= count; id++) { w.addPlayer(id, (m) => inbox.push(m)); w.handle(id, { t: 'hello', name: `P${id}`, lv: 16 }); }
  const A = w.area('f2_lab'), L = A.lair;
  // 3人とも南の通路に立つ
  for (let id = 1; id <= count; id++) { const p = w.players.get(id); p.area = A.id; p.x = L.x + (id - 2) * 2; p.z = L.z + 12; p.hp = p.mhp = 600; }
  const b = w.spawnBoss(A); A.bossState = 'fight';
  const tick = (sec) => { for (let t = 0; t < sec; t += 0.05) w.tick(0.05); };
  const sent = (t) => inbox.filter((m) => m.t === t);
  return { w, A, L, b, tick, sent };
}
// その場所に立てるか（壁に押し出されない）
const free = (def, x, z) => { const q = collide(def, x, z, 0.4); return Math.hypot(q.x - x, q.z - z) < 1e-6; };
const angDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

test('the cross room: four 12m-wide arms around the centre, all walkable, walls between them', () => {
  const w = new World({ unlocked: 3 }), A = w.area('f2_lab'), def = A.def, L = A.lair;
  for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    for (let d = 0; d <= 16; d += 2) for (const side of [-5, 0, 5]) {
      const px = L.x + dx * d + dz * side, pz = L.z + dz * d + dx * side;
      assert.ok(free(def, px, pz), `arm ${dx},${dz} at ${d}m side ${side}`);
    }
  }
  assert.ok(!free(def, L.x + 12, L.z + 12)); // 通路の間（斜め）は壁
});

test('yugdra stays rooted in the centre', () => {
  const { L, b, tick } = fight();
  tick(8);
  assert.ok(Math.hypot(b.x - L.x, b.z - L.z) < 0.01);
});

test('the root torrent fills the arm the target stands in, from the centre to the end', () => {
  const { w, A, L, b, sent } = fight();
  w.bossPattern(A, b, 'torrent', w.players.get(1), [...w.players.values()]);
  const t = sent('tele').at(-1);
  assert.equal(t.sh[0].k, 'line'); assert.equal(t.sh[0].w, K(12)); assert.equal(t.kd, 1);
  assert.ok(angDist(t.sh[0].a, 0) < 0.01); // 南の通路
  assert.ok(Math.hypot(t.sh[0].x - L.x, t.sh[0].z - L.z) < 0.01);
});

test('breaking the first bar grows four knots at the arm ends; they heal the tree until all are cut, then it staggers', () => {
  const { w, A, L, b, tick, sent } = fight();
  tick(1); b.hp = b.mhp * 0.6; tick(0.1);
  const knots = [...A.mobs.values()].filter((m) => m.kind === 'add');
  assert.equal(knots.length, 4);
  for (const k of knots) { assert.ok(Math.abs(Math.hypot(k.x - L.x, k.z - L.z) - 16) < 0.01); assert.ok(free(A.def, k.x, k.z)); }
  assert.equal(sent('cast').at(-1).name, '吸い上げ');
  const hp0 = b.hp; tick(2);
  assert.ok(b.hp > hp0); // 回復している
  assert.ok(knots.every((k) => Math.hypot(k.x - k.hx, k.z - k.hz) < 0.01)); // 根瘤は動かない
  for (const k of knots) w.handle(1, { t: 'hit', id: k.id, dmg: k.mhp + 1, st: 0 });
  tick(0.1);
  assert.equal(b.drain, null); assert.ok(b.stunT > 0);
  assert.equal(sent('castEnd').at(-1).ok, 0);
});

test('the wrath (third bar) sweeps the arms one by one in a fixed turn, each warned before the previous bursts', () => {
  const { w, A, b, tick, sent } = fight();
  b.bar = 3; b.wrath = true; b.drain = null;
  const before = sent('tele').length;
  w.bossPattern(A, b, 'wheel', w.players.get(1), [...w.players.values()]);
  tick(3);
  const lines = sent('tele').slice(before).filter((m) => m.sh[0].w === K(12));
  const order = [...new Set(lines.map((m) => m.sh[0].a))];
  assert.equal(order.length, 4);
  for (let i = 1; i < 4; i++) assert.ok(angDist(order[i], order[i - 1] - Math.PI / 2) < 0.01); // 毎回 90° ずつ同じ向きに回る
});

test('the root ripple is a thin line spanning the whole room that sweeps across it step by step (dodge through it)', () => {
  const { w, A, L, b, tick, sent } = fight(1);
  const before = sent('tele').length;
  w.bossPattern(A, b, 'ripple', w.players.get(1), [...w.players.values()]);
  tick(5);
  const lines = sent('tele').slice(before).filter((m) => m.sh[0].len === 40);
  assert.equal(lines.length, 25);
  for (const m of lines) { assert.ok(m.sh[0].w <= K(1.6)); assert.equal(m.kd, undefined); }
  // 線の真ん中が、一方向へ 1.5m ずつ進む（部屋の端から端まで 36m）
  const mids = lines.map((m) => ({ x: m.sh[0].x + Math.sin(m.sh[0].a) * 20 - L.x, z: m.sh[0].z + Math.cos(m.sh[0].a) * 20 - L.z }));
  for (let i = 1; i < mids.length; i++) assert.ok(Math.abs(Math.hypot(mids[i].x - mids[i - 1].x, mids[i].z - mids[i - 1].z) - 1.5) < 0.05);
  assert.ok(Math.abs(Math.hypot(mids.at(-1).x - mids[0].x, mids.at(-1).z - mids[0].z) - 36) < 0.1);
});

test('the spore field scatters small slow blasts over the cross with gaps left between them, then yugdra keeps attacking', () => {
  const { w, A, L, b, tick, sent } = fight(1);
  const before = sent('tele').length;
  const busy = w.bossPattern(A, b, 'spores', w.players.get(1), [...w.players.values()]);
  assert.ok(busy <= 1.0); // すぐ次の技へ
  assert.equal(sent('cast').at(-1).name, '胞子の野');
  tick(1.5);
  const s = sent('tele').slice(before).filter((m) => m.sh[0].k === 'circle' && m.sh[0].r === K(1.8));
  assert.ok(s.length >= 14 && s.length <= 22, String(s.length)); // 円が広がると数は減る（覆う広さはほぼ同じ）
  for (const m of s) {
    assert.ok(m.d >= 2600 && m.d <= 3400); // 起動が遅い
    assert.equal(m.kd, undefined);
    assert.ok(free(A.def, m.sh[0].x, m.sh[0].z)); // 十字の床の上
  }
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) assert.ok(Math.hypot(s[i].sh[0].x - s[j].sh[0].x, s[i].sh[0].z - s[j].sh[0].z) >= 4.2 * BALANCE.bossRange - 0.01); // すき間がある
  // ダメージは小さめ（根の奔流の 1/4 未満）
  w.bossPattern(A, b, 'torrent', w.players.get(1), [...w.players.values()]);
  assert.ok(s[0].dmg * 4 < sent('tele').at(-1).dmg);
  assert.ok(Math.hypot(L.x, L.z) >= 0);
});

test('every move yugdra uses has an authored motion, plus the drain stance', async () => {
  const { YUGDRA_MOTIONS } = await import('../public/js/models/bosses/yugdra-motion.js');
  const { yugdra } = await import('../public/shared/sim/bosses/yugdra.js');
  const moves = new Set([...yugdra.patterns({ bar: 1, basePats: ['torrent', 'nova', 'rain'] }), ...yugdra.patterns({ wrath: true, sporeCd: 0 }), 'drain']);
  for (const p of moves) assert.ok(YUGDRA_MOTIONS[p], p);
});
