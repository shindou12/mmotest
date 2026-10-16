// 地形エリア「ひだまりの谷」（1階の草原）の形。サーバーとクライアントで同じものを使う（three.js を使わない・乱数なし）
//
// 地形（北が -z）:
//   南  … 入口の切り通しと、なだらかな丘の草地（風車の丘）。中央の広い草地が戦う場所
//   中央 … 西から東へ蛇行する川。石橋が1つ（橋の上だけ渡れる）
//   北  … 川から林の斜面を上がると、崖で切り立った台地（+8m）。崖の切れ目の坂道から上がれる。台地の縁に崩れた見張り塔、奥に迷宮区への道
//   東  … 高い岩山（+15m）から滝が落ちて、滝つぼの池から川へ。東の切り通しから狩場へ
//   西  … 小高い丘の上に古い大樹。西の切り通しから古井戸へ
export const W = 220, D = 170; // 地形の広さ（x: -110〜110, z: -85〜85）
export const WATER = -1.3;
export const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

// ---- 地形の形 -----------------------------------------------------------------
export const riverZ = (x) => 6 + 9 * Math.sin(x * 0.03 + 0.4) + 3.5 * Math.sin(x * 0.085 + 1.7) - Math.max(0, x - 40) * 0.12;
export const cliffZ = (x) => -30 + 5 * Math.sin(x * 0.045) + 2.5 * Math.sin(x * 0.13 + 2);
export const RAMP = { x: -28, w: 9 }; // 台地への坂道（崖の切れ目）
export const BLUFF = { x: 86, z: -30, r: 30, h: 15 };
export const POND = { x: 62, z: -9, r: 8 };
export const KNOLL = { x: -62, z: 30, r: 16, h: 5 };
export const MILL = { x: 50, z: 48, r: 18, h: 4.5 };

export function noise(x, z) {
  return Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.13) * 0.5 + Math.sin(x * 0.043 - z * 0.051) * 0.9 + Math.sin(x * 0.29 + z * 0.23) * 0.15;
}

export function groundAt(x, z) {
  let h = noise(x, z) * 0.45;
  // 南のなだらかな丘
  for (const k of [KNOLL, MILL, { x: -10, z: 62, r: 22, h: 2.5 }, { x: 85, z: 30, r: 20, h: 3.5 }, { x: -95, z: -5, r: 18, h: 3 }]) {
    const d = Math.hypot(x - k.x, z - k.z);
    if (d < k.r) h += k.h * (0.5 + 0.5 * Math.cos(Math.PI * d / k.r));
  }
  // 谷を囲む山の壁（マップの外周。川だけは切り通しで抜ける）
  const e = borderE(x, z);
  if (e > 0) h += (26 * ss(0, 1, e) + e * (noise(x * 1.7, z * 1.7) * 5 + 4)) * (1 - gorge(x, z) * 0.85);
  // 南の草地のうねり
  if (z > 12) h += Math.sin(x * 0.05 + 0.7) * Math.cos(z * 0.06) * 1.1 * ss(12, 30, z);
  // 川の北岸から崖の足元まで、林の斜面がゆるく上がる
  const rz = riverZ(x), cz = cliffZ(x);
  h += 2.2 * ss(rz - 4, cz + 2, z) * (z < rz ? 1 : 0);
  // 台地: 崖で +8m。坂道のところだけ幅の広い斜面
  const ramp = ss(RAMP.w + 6, RAMP.w - 2, Math.abs(x - RAMP.x));
  const w = lerp(2.6, 20, ramp);
  const t = Math.min(1, Math.max(0, (cz - z) / w));
  h += 8 * lerp(t * t * t * (t * (t * 6 - 15) + 10), t, ramp) + noise(x * 0.7, z * 0.7) * 0.6 * ss(0.6, 1, t); // 坂道の幅でなめらかにつなぐ（段差を作らない）
  // 東の岩山（崖で囲まれた高台）
  const db = Math.hypot((x - BLUFF.x) * 0.9, z - BLUFF.z);
  h += BLUFF.h * ss(BLUFF.r, BLUFF.r - 5, db);
  h = Math.max(h, WATER + 0.6); // 川・池のほかに水たまりができないように
  // 川の谷と滝つぼの池を削る
  const dr = Math.abs(z - rz);
  h -= (h - (WATER - 1.4)) * (1 - ss(3.2, 9, dr));
  // 滝つぼから川へ流れる小川
  { const ax = POND.x - 1, az = POND.z + 5, bx = POND.x - 3, bz = riverZ(POND.x - 3), dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)), ds = Math.hypot(x - ax - dx * t, z - az - dz * t);
    h -= (h - (WATER - 0.8)) * (1 - ss(1.6, 4.5, ds)); }
  const dp = Math.hypot(x - POND.x, z - POND.z);
  if (dp < POND.r + 6) h = lerp(WATER - 1.6, h, ss(POND.r - 2, POND.r + 6, dp));
  // 道は少しならす
  const pd = pathDist(x, z);
  if (pd < 3) h -= (1 - pd / 3) * 0.08;
  return h;
}

// ---- 道（折れ線） ---------------------------------------------------------------
export const PATHS = [
  // 南の入口 → 中央の草地 → 石橋 → 林 → 坂道 → 台地 → 見張り塔 → 北の切り通し（迷宮区へ）
  [[1, 84], [2, 55], [-4, 30], [0, riverZ(0) + 6], [0, riverZ(0) - 6], [-14, -14], [-28, -24], [-28, -46], [-27, -56], [-8, -55], [10, -50], [-6, -62], [-6, -84]],
  // 中央 → 川沿いを東へ → 滝つぼ
  [[-4, 30], [20, 22], [42, 12], [54, 2]],
  // 中央 → 東の切り通し（狩場へ）
  [[20, 22], [55, 26], [80, 32], [108, 34]],
  // 中央 → 西の大樹の丘 → 西の切り通し（古井戸へ）
  [[-4, 30], [-30, 34], [-55, 30], [-75, 42], [-108, 46]],
];
const SEG = PATHS.flatMap((p) => p.slice(1).map((b, i) => [p[i], b]));
export function pathDist(x, z) {
  let best = 1e9;
  for (const [[ax, az], [bx, bz]] of SEG) {
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}


// 谷を囲む山の壁の強さ（0 = 谷の中、1 で山の上）
export const borderE = (x, z) => Math.max((Math.abs(x) - 92) / 26, (Math.abs(z) - 64) / 22);

// 出口: 山の壁を切り通しで抜ける。dir は谷の外へ向かう向き。in はその出口から来たときに立つ場所
export const EXITS = [
  { to: 'f1_town', x: 1, z: 78, dir: [0, 1], in: [1, 66] },
  { to: 'f1_lab', x: -6, z: -74, dir: [0, -1], in: [-6, -62] },
  { to: 'f1_hunt', x: 101, z: 34, dir: [1, 0], in: [88, 33] },
  { to: 'f1_dun', x: -101, z: 46, dir: [-1, 0], in: [-88, 44] },
];
// 切り通し（出口の前後の帯で山を削る）
export function gorge(x, z) {
  let g = 0;
  for (const e of EXITS) {
    const [dx, dz] = e.dir, ax = e.x - dx * 14, az = e.z - dz * 14, L = 60;
    const t = Math.max(0, Math.min(L, (x - ax) * dx + (z - az) * dz)), px = ax + dx * t, pz = az + dz * t;
    g = Math.max(g, ss(13, 5, Math.hypot(x - px, z - pz)));
  }
  return g;
}

// 石橋（川をまたぐ。橋の上は歩ける高さ）
export const BRIDGE = { x: 0, z: riverZ(0), hw: 2.2, hl: 7.5 };
export function deckAt(x, z) {
  if (Math.abs(x - BRIDGE.x) > BRIDGE.hw || Math.abs(z - BRIDGE.z) > BRIDGE.hl) return -Infinity;
  return WATER + 0.98 + 1.6 * Math.cos(Math.min(1, Math.abs(z - BRIDGE.z) / 7) * Math.PI / 2);
}
// 立つ高さ（地面か橋の上）
export const heightAt = (x, z) => Math.max(groundAt(x, z), deckAt(x, z));

// ぶつかる物（円）: 見張り塔・風車・大樹の幹
export const SOLIDS = [{ x: 10, z: -44, r: 4.8 }, { x: MILL.x, z: MILL.z, r: 3.3 }, { x: KNOLL.x, z: KNOLL.z, r: 1.6 }];

// 歩けるか: 谷の中・急な崖でない・深い水でない（橋の上は歩ける）・ぶつかる物の中でない
export function walkable(x, z) {
  if (Math.abs(x) > W / 2 - 1 || Math.abs(z) > D / 2 - 1) return false;
  if (SOLIDS.some((s) => Math.hypot(x - s.x, z - s.z) < s.r)) return false;
  if (deckAt(x, z) > -Infinity) return true;
  if (borderE(x, z) > 0.3 && gorge(x, z) < 0.5) return false;
  const h = groundAt(x, z);
  if (h < WATER - 0.3) return false;
  const s = Math.max(Math.abs(groundAt(x + 0.5, z) - groundAt(x - 0.5, z)), Math.abs(groundAt(x, z + 0.5) - groundAt(x, z - 0.5)));
  return s < 0.9;
}

// 敵の出る場所 [x, z, 半径]（広くて平らな所）・宝箱・ワープ地点
export const SPAWNS = [[6, 34, 18], [-40, 44, 11], [34, 44, 11], [-4, -6, 8], [24, -54, 13], [-55, -50, 12], [76, 18, 9], [-70, 12, 9]];
export const CHESTS = [[18, -54], [55, -3], [-57, 25]];
export const WAYPOINT = [8, 40];
