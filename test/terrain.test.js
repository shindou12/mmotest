// 地形エリア（ひだまりの谷）: 崖・川は歩けず、橋と坂道は歩ける。ワープ地点から出口・敵の出る場所・宝箱へ歩いて行ける
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, collide, exitsOf, chestsOf, waypointOf, arrival, insideOpen, pathStep } from '../public/shared/areas.js';
import { navOf, terrainSpot } from '../public/shared/terrain/index.js';
import * as M from '../public/shared/terrain/meadow.js';

const def = AREAS.f1_field;
// 1m の格子で、from から歩いて届くマス
function reach(from) {
  const n = navOf(def), seen = new Uint8Array(n.W * n.H), q = [];
  const c0 = Math.floor(from.x - n.x0), r0 = Math.floor(from.z - n.z0);
  seen[r0 * n.W + c0] = 1; q.push([c0, r0]);
  for (let i = 0; i < q.length; i++) {
    const [c, r] = q[i];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, k = nr * n.W + nc;
      if (nc < 0 || nr < 0 || nc >= n.W || nr >= n.H || seen[k] || n.solid[k]) continue;
      seen[k] = 1; q.push([nc, nr]);
    }
  }
  return (x, z) => seen[Math.floor(z - n.z0) * n.W + Math.floor(x - n.x0)] === 1;
}

test('the valley: cliffs, deep water and the mountain wall block; the bridge and the ramp do not', () => {
  assert.equal(def.shape, 'terrain');
  assert.ok(!insideOpen(def, 10, M.cliffZ(10)), 'cliff face');
  assert.ok(!insideOpen(def, 20, M.riverZ(20)), 'river');
  assert.ok(insideOpen(def, 0, M.BRIDGE.z), 'bridge');
  assert.ok(insideOpen(def, M.RAMP.x, M.cliffZ(M.RAMP.x)), 'ramp');
  assert.ok(!insideOpen(def, 0, -82), 'north mountain wall');
  // 当たり: 岸から川へ歩いても、水には入れない
  let x = 20, z = M.riverZ(20) + 14;
  for (let i = 0; i < 60; i++) { const c = collide(def, x, z - 0.3, 0.45); x = c.x; z = c.z; }
  assert.ok(insideOpen(def, x, z), `ended in water at ${z.toFixed(1)}`);
});

test('from the waypoint every exit, spawn area and chest can be reached on foot', () => {
  const ok = reach(waypointOf(def));
  for (const e of exitsOf(def)) { assert.ok(ok(e.x, e.z), 'exit ' + e.to); const a = arrival(def, e.to); assert.ok(ok(a.x, a.z), 'arrival ' + e.to); }
  for (const [x, z] of M.SPAWNS) assert.ok(ok(x, z), `spawn ${x},${z}`);
  for (const c of chestsOf(def)) assert.ok(ok(c.x, c.z), 'chest ' + c.id);
  for (let i = 0; i < 50; i++) { const s = terrainSpot(def); assert.ok(ok(s.x, s.z)); }
});

test('a mob on the south bank walks to the bridge instead of into the river to reach the plateau', () => {
  let x = 30, z = 30;
  const tx = 24, tz = -54;
  for (let i = 0; i < 1500 && Math.hypot(tx - x, tz - z) > 2; i++) {
    const wp = pathStep(def, x, z, tx, tz);
    const a = Math.atan2(wp.x - x, wp.z - z);
    const c = collide(def, x + Math.sin(a) * 0.3, z + Math.cos(a) * 0.3, 0.6);
    x = c.x; z = c.z;
  }
  assert.ok(Math.hypot(tx - x, tz - z) <= 2, `stuck at ${x.toFixed(1)},${z.toFixed(1)}`);
});
