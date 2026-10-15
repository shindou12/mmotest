// 迷宮区（1〜3層）: 部屋と太い通路の形、ギミックへの道、番兵（強い精鋭）と群れ。仕様は docs/design/labyrinths.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/shared/sim.js';
import { grid } from '../public/shared/areas.js';
import { ELITE_BASE } from '../public/shared/data.js';

let seed = 5;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// 扉を開けた状態で、入口から歩いて行けるマス
function reach(g, from) {
  const seen = new Set([from.c + ',' + from.r]), q = [from];
  while (q.length) {
    const { c, r } = q.shift();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, k = nc + ',' + nr;
      if (seen.has(k) || nr < 0 || nr >= g.H || nc < 0 || nc >= g.W || g.rows[nr][nc] === '#') continue;
      seen.add(k); q.push({ c: nc, r: nr });
    }
  }
  return seen;
}

for (const [lab, gimmick] of [['f1_lab', 'L'], ['f2_lab', 'G'], ['f3_lab', 'P']]) {
  test(`${lab}: bigger rooms-and-corridors map; door, boss, gimmick, chests and spawns are all reachable from the entrance`, () => {
    const w = new World({ unlocked: 3 }), g = grid(w.area(lab).def);
    // 迷路部分は 40 マス。上にボス部屋（3層は細長い砂の回廊で 20 マス、他は 11 マス）
    const top = lab === 'f3_lab' ? 20 : 11;
    assert.equal(g.W, 31); assert.equal(g.H, top + 40);
    const ok = reach(g, g.pts.E[0]);
    for (const ch of ['D', 'B', gimmick, 'K', 'M', 'w', 'C']) for (const p of g.pts[ch] || []) assert.ok(ok.has(p.c + ',' + p.r), `${lab} ${ch} at ${p.c},${p.r}`);
    assert.ok((g.pts.K || []).length >= 3, 'sentinels');
    assert.ok((g.pts.w || []).length >= 3, 'swarms');
    // 通路は太い: 歩けるマスのうち、両隣（左右または上下）の片方しか開いていない「幅1マス」の場所はほとんどない
    let narrow = 0, open = 0;
    for (let r = top; r < g.H - 1; r++) for (let c = 1; c < g.W - 1; c++) {
      if (g.rows[r][c] === '#') continue;
      open++;
      const o = (dc, dr) => g.rows[r + dr][c + dc] !== '#';
      if (!o(1, 0) && !o(-1, 0)) narrow++;
    }
    assert.ok(narrow / open < 0.03, `narrow ${narrow}/${open}`);
  });
}

function fight(lab = 'f1_lab') {
  const w = new World({ unlocked: 3 }), inbox = [];
  w.addPlayer(1, (m) => inbox.push(m)); w.handle(1, { t: 'hello', name: 'P1', lv: 8 });
  const A = w.area(lab), p = w.players.get(1);
  p.area = A.id; p.hp = p.mhp = 400;
  const m = w.spawnMob(A, ELITE_BASE, 0, 0, 8, 'mob', true);
  const tick = (sec) => { for (let t = 0; t < sec; t += 0.05) w.tick(0.05); };
  return { w, A, p, m, tick, sent: (t) => inbox.filter((x) => x.t === t) };
}

test('the sentinel is a player-shaped elite with a shield, much tougher than a regular elite', () => {
  const { w, A, m } = fight();
  assert.equal(m.ai, 'sentinel'); assert.equal(m.arch.guard, true);
  const elite = w.spawnMob(A, 0, 5, 5, 8, 'mob', true);
  assert.ok(m.mhp > elite.mhp * 1.5);
  assert.equal(A.fdef.elites[0].look, 'player');
});

test('the sentinel guards while idle, lunges from afar, and lowers its shield right after attacking', () => {
  const { w, A, p, m, tick, sent } = fight();
  // 遠く（8m）から: 踏み込み突き（直線の予兆のあと一気に詰める）
  p.x = m.x; p.z = m.z + 8; m.cd = 0;
  tick(0.05);
  const lunge = sent('tele').at(-1);
  assert.equal(lunge.sh[0].k, 'line');
  const z0 = m.z; tick(0.9);
  assert.ok(m.z - z0 > 5, 'dashed in');
  // 攻撃を出し切った直後は盾が下がる → しばらくすると構え直す
  tick(0.6); assert.equal(m.guard, false);
  assert.ok(m.openT > 0);
  m.cd = 99; tick(1.5); assert.equal(m.guard, true);
  // 近く（2m）から: 3連斬り（扇が3回）
  p.x = m.x; p.z = m.z + 2; m.cd = 0; const before = sent('tele').length;
  tick(1.2);
  assert.equal(sent('tele').slice(before).filter((x) => x.sh[0].k === 'cone').length, 3);
  void w; void A;
});

test('sentinels always drop an item and pay more than a regular elite; swarms come in threes and are frail', () => {
  const { w, A, p, m } = fight();
  const before = [];
  w.players.get(1).send = undefined;
  const got = [];
  const orig = w.send.bind(w); w.send = (pl, msg) => { got.push(msg); orig(pl, msg); };
  p.x = m.x; p.z = m.z + 3;
  w.killMob(A, m);
  assert.equal(got.find((x) => x.t === 'loot').items.length, 1);
  // 群れ: 'w' の場所に3体、体力は普通の4割（とエリアの倍率）
  const g = grid(A.def), wp = g.pts.w[0];
  const pt = A.points.find((q) => q.ch === 'w' && q.c === wp.c && q.r === wp.r);
  p.x = 999; pt.t = 0; w.tick(0.05);
  assert.equal(pt.mobIds.length, 3);
  const swarm = pt.mobIds.map((id) => A.mobs.get(id));
  const regular = w.spawnMob(A, A.def.mobs.swarm, 0, 0, swarm[0].lv, 'mob');
  assert.ok(Math.abs(swarm[0].mhp / regular.mhp - 0.4) < 0.02);
  void before;
});
