// 地形エリア（shape: 'terrain'）の共通部分: 地形の登録表と、歩けるかどうかの格子（ナビ格子）・道探し
// 地形ごとのファイル（meadow.js など）は、高さ・歩けるか・出口・敵の出る場所・宝箱・ワープ地点を持つ
import * as meadow from './meadow.js';

export const TERRAINS = { meadow };
export const terrainOf = (def) => TERRAINS[def.terrain];

// ナビ格子: 1m のマスごとに歩けるか（エリアごとに一度だけ作る）
const NAV = new Map();
export function navOf(def) {
  if (NAV.has(def.id)) return NAV.get(def.id);
  const T = terrainOf(def), W = T.W, H = T.D, x0 = -W / 2, z0 = -H / 2;
  const solid = new Uint8Array(W * H);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) solid[r * W + c] = T.walkable(x0 + c + 0.5, z0 + r + 0.5) ? 0 : 1;
  // 道探し用の粗い格子（2m）: 4マスとも歩けるところだけ通れる
  const CW = W >> 1, CH = H >> 1, coarse = new Uint8Array(CW * CH);
  for (let r = 0; r < CH; r++) for (let c = 0; c < CW; c++) {
    const i = r * 2 * W + c * 2;
    coarse[r * CW + c] = solid[i] || solid[i + 1] || solid[i + W] || solid[i + W + 1] ? 1 : 0;
  }
  const nav = { W, H, x0, z0, solid, CW, CH, coarse };
  NAV.set(def.id, nav);
  return nav;
}
export function solidCell(nav, c, r) {
  return c < 0 || r < 0 || c >= nav.W || r >= nav.H || nav.solid[r * nav.W + c] === 1;
}
export const navWalkable = (nav, x, z) => !solidCell(nav, Math.floor(x - nav.x0), Math.floor(z - nav.z0));

// 歩けないマスから押し出す（迷路の壁と同じやり方。マスが小さいので2回）
export function collideTerrain(def, x, z, rad) {
  const nav = navOf(def);
  for (let pass = 0; pass < 3; pass++) {
    const c = Math.floor(x - nav.x0), r = Math.floor(z - nav.z0);
    const reach = Math.ceil(rad) + 1;
    for (let dr = -reach; dr <= reach; dr++) for (let dc = -reach; dc <= reach; dc++) {
      if (!solidCell(nav, c + dc, r + dr)) continue;
      const cx = nav.x0 + c + dc, cz = nav.z0 + r + dr;
      const nx = Math.max(cx, Math.min(x, cx + 1)), nz = Math.max(cz, Math.min(z, cz + 1));
      const dx = x - nx, dz = z - nz, d = Math.hypot(dx, dz);
      if (d >= rad) continue;
      if (d > 1e-4) { x = nx + dx / d * rad; z = nz + dz / d * rad; }
      else { // 中心がマスの中: 一番近い辺へ
        const opts = [[cx - rad - x, 0], [cx + 1 + rad - x, 0], [0, cz - rad - z], [0, cz + 1 + rad - z]];
        opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
        x += opts[0][0]; z += opts[0][1];
      }
    }
  }
  return { x, z };
}

// まっすぐ歩いて行けるか（1m ごとに調べる）
export function clearLine(def, x, z, tx, tz) {
  const nav = navOf(def), L = Math.hypot(tx - x, tz - z), n = Math.ceil(L / 0.8);
  for (let i = 1; i <= n; i++) if (!navWalkable(nav, x + (tx - x) * i / n, z + (tz - z) * i / n)) return false;
  return true;
}

// 目標へ向かう次の地点: まっすぐ行ければそのまま、崖・川をはさむときは粗い格子で幅優先探索
export function terrainStep(def, x, z, tx, tz) {
  if (clearLine(def, x, z, tx, tz)) return { x: tx, z: tz };
  const nav = navOf(def), CW = nav.CW, CH = nav.CH;
  const cell = (px, pz) => ({ c: Math.max(0, Math.min(CW - 1, Math.floor((px - nav.x0) / 2))), r: Math.max(0, Math.min(CH - 1, Math.floor((pz - nav.z0) / 2))) });
  const s = cell(x, z), t = cell(tx, tz), key = (c, r) => r * CW + c;
  const prev = new Map([[key(s.c, s.r), -1]]), q = [[s.c, s.r]];
  let found = false;
  for (let qi = 0; qi < q.length && prev.size < 6000; qi++) {
    const [c, r] = q[qi];
    if (c === t.c && r === t.r) { found = true; break; }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= CW || nr >= CH) continue;
      const k = key(nc, nr);
      if (prev.has(k) || nav.coarse[k]) continue;
      if (dc && dr && (nav.coarse[key(c + dc, r)] || nav.coarse[key(c, r + dr)])) continue; // 斜めは角を切らない
      prev.set(k, key(c, r));
      q.push([nc, nr]);
    }
  }
  if (!found) return { x: tx, z: tz };
  // 目標からさかのぼり、出発点からまっすぐ行ける一番先のマスを次の地点にする
  const pathCells = [];
  for (let k = key(t.c, t.r); k !== -1 && k !== undefined; k = prev.get(k)) pathCells.push(k);
  pathCells.reverse();
  let next = pathCells[1] ?? pathCells[0];
  for (let i = pathCells.length - 1; i > 0; i--) {
    const k = pathCells[i], px = nav.x0 + (k % CW) * 2 + 1, pz = nav.z0 + Math.floor(k / CW) * 2 + 1;
    if (clearLine(def, x, z, px, pz)) { next = k; break; }
  }
  return { x: nav.x0 + (next % CW) * 2 + 1, z: nav.z0 + Math.floor(next / CW) * 2 + 1 };
}

// 敵の出る場所から1点（歩けて、周り pad m も歩ける所）
export function terrainSpot(def, rand = Math.random, pad = 2) {
  const T = terrainOf(def), nav = navOf(def), S = T.SPAWNS;
  const total = S.reduce((a, s) => a + s[2] * s[2], 0);
  for (let tries = 0; tries < 30; tries++) {
    let k = rand() * total, s = S[0];
    for (const q of S) { k -= q[2] * q[2]; if (k <= 0) { s = q; break; } }
    const a = rand() * Math.PI * 2, d = s[2] * Math.sqrt(rand()), x = s[0] + Math.sin(a) * d, z = s[1] + Math.cos(a) * d;
    if (!navWalkable(nav, x, z)) continue;
    if ([[pad, 0], [-pad, 0], [0, pad], [0, -pad]].some(([dx, dz]) => !navWalkable(nav, x + dx, z + dz))) continue;
    return { x, z };
  }
  return { x: S[0][0], z: S[0][1] };
}
