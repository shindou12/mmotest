// 町の区画（サーバーとブラウザの共通）: 広場・通り・建物の敷地。建物は当たり判定（向きのある長方形）にもなる
//   def.layout = 'town' のエリアだけ。種から決まるので、どこで計算しても同じ形になる
const cache = new Map();

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const segDist = (x, z, a, b) => {
  const vx = b[0] - a[0], vz = b[1] - a[1], L2 = vx * vx + vz * vz;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / L2));
  return Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t);
};
// 角の丸い長方形の内側までの距離（内側は負）
const rrectDist = (x, z, q) => {
  const hx = (q.x1 - q.x0) / 2 - q.r, hz = (q.z1 - q.z0) / 2 - q.r, cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2;
  const dx = Math.abs(x - cx) - hx, dz = Math.abs(z - cz) - hz;
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - q.r;
};

// deps: { exitsOf, insideOpen, boundR, angOf }（areas.js から渡す。循環 import を避けるため）
export function townLayout(def, deps) {
  if (cache.has(def.id)) return cache.get(def.id);
  const { exitsOf, insideOpen } = deps;
  const R = seeded(0x7a3 ^ def.id.length * 977);
  const square = { x0: -17, x1: 17, z0: -13, z1: 14, r: 4 };
  const exits = exitsOf(def);
  // 通り: 広場から各出口へ（少し折れ曲がる）、出口のない方向へも袋小路を通す
  const streets = [];
  for (const e of exits) {
    const L = Math.hypot(e.x, e.z), ux = e.x / L, uz = e.z / L;
    const sx = Math.abs(ux) > Math.abs(uz) ? Math.sign(ux) * square.x1 : ux * Math.abs(square.z0 / uz), sz = Math.abs(ux) > Math.abs(uz) ? uz * Math.abs(square.x1 / ux) : Math.sign(uz) * Math.abs(square.z0);
    const mx = (sx + e.x) / 2 + uz * 2.5, mz = (sz + e.z) / 2 - ux * 2.5;
    streets.push({ pts: [[sx * 0.9, sz * 0.9], [mx, mz], [e.x + ux * 5, e.z + uz * 5]], w: 5.2, to: e.to });
  }
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (const [dx, dz] of dirs) {
    if (exits.some((e) => (e.x * dx + e.z * dz) / Math.hypot(e.x, e.z) > 0.7)) continue;
    const sx = dx * square.x1 * 0.9, sz = dz * square.z1 * 0.9;
    let L = 6; while (insideOpen(def, sx + dx * (L + 2), sz + dz * (L + 2), 4.5)) L += 2;
    streets.push({ pts: [[sx, sz], [sx + dx * L * 0.5 - dz * 1.5, sz + dz * L * 0.5 + dx * 1.5], [sx + dx * L, sz + dz * L]], w: 4.4, end: true, dir: [dx, dz] });
  }
  // 環状の裏通り（広場と城壁の間を一周し、区画を作る）
  const { boundR } = deps, ring = [];
  for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI * 2, r = boundR(def, a) * 0.64; ring.push([Math.sin(a) * r, -Math.cos(a) * r]); }
  streets.push({ pts: ring, w: 3.8, ring: true });
  const paved = (x, z, pad = 0) => rrectDist(x, z, square) < pad || streets.some((s) => s.pts.some((p, i) => i && segDist(x, z, s.pts[i - 1], p) < s.w / 2 + pad));

  // 建物: 通りと広場の縁に沿って、通りを向けて並べる
  const buildings = [];
  const keepOut = [def.gate && { x: def.gate.x, z: def.gate.z, r: 8 }, def.box && { ...def.box, r: 3.5 }, ...(def.npcs || []).map((n) => ({ x: n.x, z: n.z, r: 4 })), ...exits.map((e) => ({ x: e.x, z: e.z, r: 7 }))].filter(Boolean);
  const corners = (b, pad = 0) => {
    const c = Math.cos(b.ry), s = Math.sin(b.ry), hw = b.w / 2 + pad, hd = b.d / 2 + pad;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [0, 0], [0, -hd], [0, hd], [-hw, 0], [hw, 0]].map(([lx, lz]) => [b.x + lx * c + lz * s, b.z - lx * s + lz * c]);
  };
  const fits = (b) => {
    const cs = corners(b, 0.3);
    if (!cs.every(([x, z]) => insideOpen(def, x, z, 3.2))) return false;
    if (cs.some(([x, z]) => paved(x, z, 0.4))) return false;
    if (keepOut.some((k) => cs.some(([x, z]) => Math.hypot(x - k.x, z - k.z) < k.r))) return false;
    return !buildings.some((o) => Math.hypot(o.x - b.x, o.z - b.z) < (Math.hypot(o.w, o.d) + Math.hypot(b.w, b.d)) / 2 + 1.5
      && (corners(b, 0.6).some(([x, z]) => inBox(o, x, z, 0.6)) || corners(o, 0.6).some(([x, z]) => inBox(b, x, z, 0.6))));
  };
  // 通りの片側に並べる。a→b の左（side=1）か右（-1）
  const line = (a, b, w, side, kinds, first = null) => {
    const vx = b[0] - a[0], vz = b[1] - a[1], L = Math.hypot(vx, vz), ux = vx / L, uz = vz / L;
    const nx = -uz * side, nz = ux * side; // 通りから外へ
    let t = 1.5;
    while (t < L - 2) {
      const kind = first || kinds[Math.floor(R() * kinds.length)];
      const bw = kind === 'tall' ? 5.4 + R() * 1.2 : kind === 'inn' ? 8.4 : 5.6 + R() * 1.6, bd = kind === 'inn' ? 5.6 : 4.6 + R() * 0.8;
      const off = w / 2 + 1.3 + bd / 2 + R() * 0.4, c = t + bw / 2;
      if (c + bw / 2 > L - 0.5) break;
      // 正面（部品の -z）が通りを向く: 部品の -z → ワールドの (-nx, -nz)
      const bld = { x: a[0] + ux * c + nx * off, z: a[1] + uz * c + nz * off, ry: Math.atan2(nx, nz), w: bw, d: bd, kind, seed: Math.floor(R() * 1e6) };
      if (fits(bld)) { buildings.push(bld); first = null; t += bw + 0.8 + R() * 1.4; } else t += 1.2;
    }
  };
  const SQ = square;
  // 特別な建物（宿屋は広場の北、教会は南の通りの突き当たり、風車は空き地）
  const special = (b) => { if (fits(b)) buildings.push(b); };
  // 南の通りの脇に教会、北東の角に風車、東の通りの突き当たりにギルド
  const south = streets.find((q) => q.end && q.dir[1] === 1), east = streets.find((q) => q.end && q.dir[0] === 1);
  if (south) special({ x: 8.2, z: 34, ry: Math.PI / 2, w: 7, d: 10, kind: 'chapel', seed: 11 });
  if (east) special({ x: 21.5, z: -17.8, ry: Math.PI, w: 7, d: 6, kind: 'guild', seed: 12 });
  for (const [x, z] of [[36, -30], [-36, -30], [36, 30]]) { const mill = { x, z, ry: Math.atan2(-x, -z) + Math.PI, w: 5, d: 5, kind: 'mill', seed: 13 }; if (fits(mill)) { buildings.push(mill); break; } }
  // 広場の縁
  line([SQ.x0 + 2, SQ.z0], [SQ.x1 - 2, SQ.z0], 0.6, -1, ['tall', 'house'], 'inn');
  line([SQ.x1 - 4, SQ.z1], [SQ.x0 + 4, SQ.z1], 0.6, -1, ['tall', 'house', 'shop']);
  line([SQ.x1, SQ.z0 + 4], [SQ.x1, SQ.z1 - 4], 0.6, -1, ['shop', 'house']);
  line([SQ.x0, SQ.z1 - 4], [SQ.x0, SQ.z0 + 4], 0.6, -1, ['house', 'tall']);
  // 通りの両側
  for (const s of streets) for (let i = 1; i < s.pts.length; i++) for (const side of [1, -1]) line(s.pts[i - 1], s.pts[i], s.w, side, s.ring ? ['house', 'house', 'tall', 'barn'] : ['house', 'house', 'tall', 'shop', 'house']);
  const out = { square, streets, buildings, paved };
  cache.set(def.id, out);
  return out;
}

// 点が建物の敷地（pad だけ広げた長方形）の中か
export function inBox(b, x, z, pad = 0) {
  const c = Math.cos(b.ry), s = Math.sin(b.ry), dx = x - b.x, dz = z - b.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) < b.w / 2 + pad && Math.abs(lz) < b.d / 2 + pad;
}
// 円（半径 rad）を建物の外へ押し出す
export function pushOutBox(b, x, z, rad) {
  const c = Math.cos(b.ry), s = Math.sin(b.ry), dx = x - b.x, dz = z - b.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c, hw = b.w / 2, hd = b.d / 2;
  const nx = Math.max(-hw, Math.min(hw, lx)), nz = Math.max(-hd, Math.min(hd, lz));
  let ox = lx - nx, oz = lz - nz, d = Math.hypot(ox, oz);
  if (d >= rad) return null;
  let px, pz;
  if (d > 1e-4) { px = nx + ox / d * rad; pz = nz + oz / d * rad; }
  else { // 中心が建物の中: 一番近い辺へ
    const opts = [[hw + rad - lx, 0], [-hw - rad - lx, 0], [0, hd + rad - lz], [0, -hd - rad - lz]].sort((p, q) => Math.abs(p[0] + p[1]) - Math.abs(q[0] + q[1]));
    px = lx + opts[0][0]; pz = lz + opts[0][1];
  }
  // ローカル → ワールド（逆回転）
  return { x: b.x + px * c + pz * s, z: b.z - px * s + pz * c };
}
