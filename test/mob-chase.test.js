// 敵の追いかけ方: 屋外は障害物を回り込み、迷路は通路をたどって近づく。縄張りから離れすぎると、体力はそのままで帰る
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/shared/sim.js';
import { obstaclesOf, grid, cellToWorld, worldToCell, solidAt, collide } from '../public/shared/areas.js';

let seed = 5;
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function area(id) {
  const w = new World({ unlocked: 3 });
  w.addPlayer(1, () => {}); w.handle(1, { t: 'hello', name: 'P', lv: 5 });
  const A = w.area(id), p = w.players.get(1); p.area = A.id; p.hp = p.mhp = 1e9;
  A.mobs.clear();
  const tick = (sec, each) => { for (let t = 0; t < sec; t += 0.05) { p.hp = p.mhp; w.tick(0.05); if (each?.()) return t; } return Infinity; };
  return { w, A, p, tick };
}
// 追う敵を1体だけ置く（ほかの敵は消し続ける）
function chaser(w, A, p, x, z) {
  const m = w.spawnMob(A, 0, x, z, 5);
  m.threat.set(p.id, 1e6); m.cd = 99; // 攻撃はせず追うだけ
  return m;
}

test('in the open, a chasing mob walks around a rock instead of pushing into it', () => {
  const { w, A, p, tick } = area('f1_field');
  const rocks = obstaclesOf(A.def).filter((o) => o.solid && o.r > 1.5);
  assert.ok(rocks.length >= 3);
  let reached = 0;
  for (const o of rocks.slice(0, 6)) {
    // 岩をはさんで反対側に立つ
    const a = Math.atan2(-o.x, -o.z), far = o.r + 3;
    const s = collide(A.def, o.x + Math.sin(a) * far, o.z + Math.cos(a) * far, 0.8);
    const e = collide(A.def, o.x - Math.sin(a) * far, o.z - Math.cos(a) * far, 0.8);
    A.mobs.clear();
    const m = chaser(w, A, p, s.x, s.z); p.x = e.x; p.z = e.z;
    const t = tick(8, () => { for (const q of A.mobs.values()) if (q !== m) A.mobs.delete(q.id); m.cd = 99; return Math.hypot(m.x - p.x, m.z - p.z) < 2.2; });
    if (t < 8) reached++;
  }
  assert.equal(reached, Math.min(6, rocks.length), `reached ${reached}`);
});

test('in a maze, a chasing mob follows the corridors to a player around several corners', () => {
  const { w, A, p, tick } = area('f1_lab');
  const g = grid(A.def), floors = [];
  for (let r = 0; r < g.H; r++) for (let c = 0; c < g.W; c++) if (!solidAt(g, c, r, true)) floors.push(cellToWorld(g, c, r));
  // 迷路の中で、通路をたどって 6〜8 マス先（角を曲がる）の2点
  const s = floors[Math.floor(floors.length * 0.3)], sc = worldToCell(g, s.x, s.z);
  const steps = new Map([[sc.r * g.W + sc.c, 0]]), q = [[sc.c, sc.r]];
  for (let i = 0; i < q.length; i++) for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const c = q[i][0] + dc, r = q[i][1] + dr, k = r * g.W + c;
    if (steps.has(k) || solidAt(g, c, r, true)) continue;
    steps.set(k, steps.get(q[i][1] * g.W + q[i][0]) + 1); q.push([c, r]);
  }
  const ek = [...steps].find(([k, n]) => n >= 6 && n <= 8 && ((k % g.W) !== sc.c && Math.floor(k / g.W) !== sc.r))[0];
  const e = cellToWorld(g, ek % g.W, Math.floor(ek / g.W));
  A.door = true;
  const m = chaser(w, A, p, s.x, s.z); p.x = e.x; p.z = e.z;
  const t = tick(30, () => { for (const q of A.mobs.values()) if (q !== m) A.mobs.delete(q.id); m.cd = 99; m.hx = m.x; m.hz = m.z; return Math.hypot(m.x - p.x, m.z - p.z) < 2.2; });
  assert.ok(t < 30, 'reached the player');
});

test('a mob dragged too far gives up and runs home without healing to full at once, then recovers slowly', () => {
  const { w, A, p, tick } = area('f1_field');
  const m = chaser(w, A, p, 0, 0);
  m.hp = Math.round(m.mhp * 0.4);
  // 縄張りの外まで連れ出して、しばらく殴らずにいる
  m.x = 30; m.z = 0; p.x = 46; p.z = 0; m.hx = -20; m.hz = 0;
  const keep = () => { for (const q of A.mobs.values()) if (q !== m) A.mobs.delete(q.id); m.cd = 99; };
  tick(6, keep);
  assert.ok(m.returning || Math.hypot(m.x - m.hx, m.z - m.hz) < 4, 'gave up the chase');
  assert.ok(m.hp < m.mhp * 0.5, `no instant full heal: ${m.hp}/${m.mhp}`);
  p.x = 200; // 追ってこない
  tick(20, keep);
  assert.ok(Math.hypot(m.x - m.hx, m.z - m.hz) < 6, 'back home');
  assert.ok(m.hp < m.mhp, 'still recovering');
  tick(40, keep);
  assert.equal(m.hp, m.mhp);
});

test('a mob that keeps getting hit keeps chasing past its usual range', () => {
  const { w, A, p, tick } = area('f1_field');
  const m = chaser(w, A, p, 0, 0);
  m.hx = -30; m.hz = 0; m.x = 22; m.z = 0; p.x = 30; p.z = 0;
  let k = 0;
  tick(3, () => { for (const q of A.mobs.values()) if (q !== m) A.mobs.delete(q.id); m.cd = 99; if (++k % 10 === 0) m.hp -= 1; p.x = m.x + 6; });
  assert.ok(!m.returning, 'still chasing while being hit');
});
