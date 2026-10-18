// エリアの見た目: 町（城壁で囲んだ区画の町）。区画（広場・通り・建物の敷地）は shared/town-layout.js で決まり、
// 建物はサーバーでも当たり判定になる。ここでは見た目を作る:
//   石畳の広場と通り・縁石 / 木組みの家・宿屋・店・納屋・教会・ギルド・風車 / 城壁・塔・門楼 /
//   街灯と旗飾り・露店・ベンチ・花壇・井戸・掲示板 / 空き地の庭・畑・木 / 城壁の外の森
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { exitsOf, boundR, angOf, dirOf, insideOpen, townLayout } from '../../shared/areas.js';
import { inBox } from '../../shared/town-layout.js';
import { toon } from '../toon.js';
import { local, I } from './kit.js';
import { cobbles, SURF } from './textures.js';
import { addTree, addPine } from './flora.js';

const jit = (hex, R, d = 0.06) => new THREE.Color(hex).offsetHSL((R() - 0.5) * d * 0.2, (R() - 0.5) * d * 0.5, (R() - 0.5) * d);
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL = (r1, r2, h, n = 10) => new THREE.CylinderGeometry(r1, r2, h, n);
const WOOD = 0x6a4a30, WOOD_D = 0x4a3222, IRON = 0x4a4c58, STONE = 0x9a958a, PLASTER = 0xeee4cc;
const ROOFS = [0xb0503a, 0x4f6a8f, 0x8a5a3a, 0x5a7a4a, 0x7a4a62, 0xc0703a, 0x9a4a3a, 0x6a6a7a];
const FLOWERS = [0xff7a8a, 0xffd84a, 0xffffff, 0xc07aff, 0xff9a4a];
const W_ = { surf: SURF.wood }, P_ = { surf: SURF.plaster }, M_ = { surf: SURF.masonry }, RF = { surf: SURF.roof };

export function buildTown(B, def, R, heightAt, anims, group) {
  const L = townLayout(def);
  if (!L) return;
  const exits = exitsOf(def), { square: SQ, streets, buildings, paved } = L;
  const inBld = (x, z, pad = 0) => buildings.some((b) => inBox(b, x, z, pad));
  const nearKeep = (x, z, pad = 0) => Math.hypot(x, z) < 7 + pad
    || (def.box && Math.hypot(def.box.x - x, def.box.z - z) < 3 + pad)
    || (def.npcs || []).some((n) => Math.hypot(n.x - x, n.z - z) < 3 + pad)
    || exits.some((e) => Math.hypot(e.x - x, e.z - z) < 6 + pad);
  const free = (x, z, pad = 0) => !paved(x, z, pad + 0.6) && !inBld(x, z, pad + 1.2) && insideOpen(def, x, z, 3 + pad) && !nearKeep(x, z, pad);
  const used = []; // 飾りを置いた所（重ならないように）
  const take = (x, z, r) => { if (used.some((u) => Math.hypot(u.x - x, u.z - z) < u.r + r)) return false; used.push({ x, z, r }); return true; };

  // ---- 石畳（広場と通り）と縁石 ----
  group.add(makePaving(L));
  curbs(B, L, R);
  // 広場の模様: 転移門を囲む2重の敷石の輪
  for (const [rr, w, c] of [[9.6, 0.5, 0x8a8478], [10.4, 0.32, 0xc8c0b0]]) {
    const k = Math.round(rr * 2 * Math.PI / 0.7);
    for (let i = 0; i < k; i++) {
      const a = i / k * Math.PI * 2, x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      B.add(BOX(0.66, 0.06, w), jit(c, R, 0.05), local(I, x, 0.035, z, 0, a, 0), { plain: true });
    }
  }

  // ---- 建物 ----
  buildings.forEach((b, i) => {
    const M = local(I, b.x, heightAt(b.x, b.z), b.z, 0, b.ry, 0), r = (b.seed % 1000) / 1000;
    const RR = seeded2(b.seed), roof = ROOFS[(b.seed >> 3) % ROOFS.length];
    if (b.kind === 'chapel') chapel(B, M, RR, b, anims, group);
    else if (b.kind === 'guild') guild(B, M, RR, b);
    else if (b.kind === 'mill') mill(B, M, RR, b, anims, group);
    else if (b.kind === 'barn') barn(B, M, RR, b, roof);
    else house(B, M, RR, b.kind === 'house' ? 'cottage' : b.kind, roof, b.w, b.d);
    // 家の脇の樽・木箱・袋（通りに面した側の端）
    if (b.kind !== 'chapel' && b.kind !== 'mill' && r < 0.75) {
      const s = r < 0.37 ? 1 : -1, lx = s * (b.w / 2 + 0.9), lz = -b.d / 2 + 0.4;
      const wx = b.x + lx * Math.cos(b.ry) + lz * Math.sin(b.ry), wz = b.z - lx * Math.sin(b.ry) + lz * Math.cos(b.ry);
      if (!paved(wx, wz, 0.3) && !inBld(wx, wz, 0.4) && take(wx, wz, 1.2)) clutter(B, local(M, lx, 0, lz), RR);
    }
    void i;
  });
  // 隣り合う家の間の物干し
  for (let i = 0; i < buildings.length; i++) for (let j = i + 1; j < buildings.length; j++) {
    const a = buildings[i], b = buildings[j], d = Math.hypot(a.x - b.x, a.z - b.z);
    if (a.kind === 'chapel' || b.kind === 'chapel' || a.kind === 'mill' || b.kind === 'mill' || d < 7 || d > 9.5 || Math.abs(Math.cos(a.ry - b.ry)) < 0.9) continue;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    if (paved(mx, mz, 0.5) || inBld(mx, mz, 0.3) || !take(mx, mz, 1.5) || R() < 0.4) continue;
    laundry(B, { x: a.x, z: a.z }, { x: b.x, z: b.z }, R);
  }

  // ---- 城壁・塔・門楼 ----
  townWall(B, def, exits, R, heightAt, group, anims);

  // ---- 通りの街灯（両側に交互）----
  for (const s of streets) for (let i = 1; i < s.pts.length; i++) {
    const a = s.pts[i - 1], b = s.pts[i], vx = b[0] - a[0], vz = b[1] - a[1], Ls = Math.hypot(vx, vz), ux = vx / Ls, uz = vz / Ls;
    for (let t = 5, k = 0; t < Ls - 2; t += 11, k++) {
      const side = (k + i) % 2 ? 1 : -1, x = a[0] + ux * t - uz * side * (s.w / 2 + 0.7), z = a[1] + uz * t + ux * side * (s.w / 2 + 0.7);
      if (paved(x, z, 0.2) || inBld(x, z, 0.8) || nearKeep(x, z, -2) || !insideOpen(def, x, z, 2) || !take(x, z, 2)) continue;
      lamp(B, local(I, x, heightAt(x, z), z, 0, Math.atan2(side * uz, -side * ux), 0), R);
    }
  }

  // ---- 広場: 四隅と辺の街灯・旗飾り・ベンチ・花壇・露店・井戸・掲示板 ----
  const lampPts = [[SQ.x0 + 2, SQ.z0 + 2], [-2.6, SQ.z0 + 1.2], [2.6, SQ.z0 + 1.2], [SQ.x1 - 2, SQ.z0 + 2], [SQ.x1 - 1.2, -3], [SQ.x1 - 1.2, 4], [SQ.x1 - 2, SQ.z1 - 2], [3, SQ.z1 - 1.2], [-3, SQ.z1 - 1.2], [SQ.x0 + 2, SQ.z1 - 2], [SQ.x0 + 1.2, 0], [SQ.x0 + 1.2, -6]];
  const lamps = lampPts.map(([x, z]) => {
    if (nearKeep(x, z, -3.4) && Math.hypot(x, z) > 7) return null;
    if ((def.box && Math.hypot(def.box.x - x, def.box.z - z) < 3) || !take(x, z, 1.4)) return null;
    lamp(B, local(I, x, 0, z, 0, Math.atan2(-x, -z), 0), R);
    return { x, z, y: 3.15 };
  });
  for (let i = 0; i < lamps.length; i++) { const p = lamps[i], q = lamps[(i + 1) % lamps.length]; if (p && q && Math.hypot(p.x - q.x, p.z - q.z) < 16) bunting(B, p, q, R); }
  for (const npc of def.npcs || []) { const x = npc.x + 1.5, z = npc.z - 2; take(x, z, 2.5); stall(B, local(I, x, 0, z, 0, 0.3, 0), R, npc.color); }
  const sqSpots = [];
  for (let x = SQ.x0 + 2.5; x <= SQ.x1 - 2.5; x += 2.8) for (const z of [SQ.z0 + 2.2, SQ.z1 - 2.2]) sqSpots.push([x, z]);
  for (let z = SQ.z0 + 4; z <= SQ.z1 - 4; z += 2.8) for (const x of [SQ.x0 + 2.2, SQ.x1 - 2.2]) sqSpots.push([x, z]);
  let placed = 0;
  for (const [x, z] of sqSpots.sort(() => R() - 0.5)) {
    if (nearKeep(x, z, -0.5) || streets.some((s) => s.pts.slice(1).some((p, i) => segD(x, z, s.pts[i], p) < s.w / 2 + 1.6)) || !take(x, z, 1.6)) continue;
    const M = local(I, x, 0, z, 0, Math.atan2(-x, -z) + Math.PI, 0);
    const kind = ['bench', 'planter', 'bench', 'well', 'board', 'cart', 'planter'][placed % 7];
    if (kind === 'bench') bench(B, M, R); else if (kind === 'planter') planter(B, M, R); else if (kind === 'well') well(B, M, R); else if (kind === 'board') noticeBoard(B, M, R); else cart(B, M, R);
    if (++placed >= 12) break;
  }

  // ---- 空き地: 庭・畑・木・植え込み ----
  for (let x = -60; x <= 60; x += 3.4) for (let z = -50; z <= 50; z += 3.4) {
    const jx = x + (R() - 0.5) * 1.6, jz = z + (R() - 0.5) * 1.6;
    if (!free(jx, jz, 0.4)) continue;
    const t = R();
    if (t < 0.12 && free(jx, jz, 2.2) && take(jx, jz, 3.4)) garden(B, local(I, jx, heightAt(jx, jz), jz, 0, Math.round(R() * 4) * Math.PI / 2, 0), R);
    else if (t < 0.42 && take(jx, jz, 2.2)) addTree(B, local(I, jx, heightAt(jx, jz), jz, 0, R() * 6.28, 0), R, { size: 0.65 + R() * 0.3, species: ['young', 'oak', 'birch', 'tall', 'young'][Math.floor(R() * 5)], fruit: 0.3 });
    else if (t < 0.62 && take(jx, jz, 1.2)) bush(B, local(I, jx, heightAt(jx, jz), jz, 0, R() * 6.28, 0), R);
    else if (t < 0.7 && take(jx, jz, 1.5)) flowerBed(B, local(I, jx, heightAt(jx, jz), jz, 0, R() * 6.28, 0), R);
    else if (t < 0.76 && take(jx, jz, 1.4)) hay(B, local(I, jx, heightAt(jx, jz), jz, 0, R() * 6.28, 0), R);
  }

  // ---- 城壁の外の森 ----
  for (let i = 0, n = 54; i < n; i++) {
    const a = i / n * Math.PI * 2 + R() * 0.05, [dx, dz] = dirOf(a), r = boundR(def, a) + 4.5 + R() * 6;
    const x = dx * r, z = dz * r;
    if (exits.some((e) => Math.hypot(e.x - x, e.z - z) < 11)) continue;
    const M = local(I, x, heightAt(x, z), z, 0, R() * 6.28, 0);
    if (R() < 0.3) addPine(B, M, R, { size: 1 + R() * 0.3 }); else addTree(B, M, R, { size: 1.1 + R() * 0.4 });
  }
  // 出口の道しるべ
  for (const e of exits) {
    const Ll = Math.hypot(e.x, e.z), ux = e.x / Ll, uz = e.z / Ll, cx = ux * (Ll - 3), cz = uz * (Ll - 3);
    const sx = cx - uz * 4.2, sz = cz + ux * 4.2;
    signpost(B, local(I, sx, heightAt(sx, sz), sz, 0, Math.atan2(ux, uz), 0), R);
  }
}

const seeded2 = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const segD = (x, z, a, b) => {
  const vx = b[0] - a[0], vz = b[1] - a[1], L2 = vx * vx + vz * vz, t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / L2));
  return Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t);
};

// 石畳: 広場（角の丸い長方形）と通り（線分ごとの長方形と、つなぎ目の円）。町の中は平らなので y は一定
function makePaving(L) {
  const geos = [], q = L.square, sh = (pts) => { const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))), 6); return g; };
  const rr = new THREE.Shape(), r = q.r;
  rr.moveTo(q.x0 + r, -q.z0); rr.lineTo(q.x1 - r, -q.z0); rr.quadraticCurveTo(q.x1, -q.z0, q.x1, -q.z0 - r);
  rr.lineTo(q.x1, -q.z1 + r); rr.quadraticCurveTo(q.x1, -q.z1, q.x1 - r, -q.z1); rr.lineTo(q.x0 + r, -q.z1);
  rr.quadraticCurveTo(q.x0, -q.z1, q.x0, -q.z1 + r); rr.lineTo(q.x0, -q.z0 - r); rr.quadraticCurveTo(q.x0, -q.z0, q.x0 + r, -q.z0);
  geos.push(new THREE.ShapeGeometry(rr, 8));
  for (const s of L.streets) {
    s.pts.forEach((p, i) => {
      const c = new THREE.CircleGeometry(s.w / 2, 18); c.translate(p[0], -p[1], 0); geos.push(c);
      if (!i) return;
      const a = s.pts[i - 1], vx = p[0] - a[0], vz = p[1] - a[1], Ls = Math.hypot(vx, vz), nx = -vz / Ls * s.w / 2, nz = vx / Ls * s.w / 2;
      geos.push(sh([[a[0] + nx, a[1] + nz], [p[0] + nx, p[1] + nz], [p[0] - nx, p[1] - nz], [a[0] - nx, a[1] - nz]]));
    });
  }
  const g = mergeGeometries(geos.map((x) => { const y = x.index ? x.toNonIndexed() : x; for (const k of Object.keys(y.attributes)) if (k !== 'position') y.deleteAttribute(k); return y; }));
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = new Float32Array(p.count * 2), nor = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { p.setY(i, 0.035); uv[i * 2] = p.getX(i) / 5; uv[i * 2 + 1] = p.getZ(i) / 5; nor[i * 3 + 1] = 1; }
  // 裏返った三角形（形の向きによる）を表に直す
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i), az = p.getZ(i), bx = p.getX(i + 1), bz = p.getZ(i + 1), cx = p.getX(i + 2), cz = p.getZ(i + 2);
    if ((bx - ax) * (cz - az) - (bz - az) * (cx - ax) > 0) { p.setXYZ(i + 1, cx, 0.035, cz); p.setXYZ(i + 2, bx, 0.035, bz); const u1 = uv[(i + 1) * 2], v1 = uv[(i + 1) * 2 + 1]; uv[(i + 1) * 2] = uv[(i + 2) * 2]; uv[(i + 1) * 2 + 1] = uv[(i + 2) * 2 + 1]; uv[(i + 2) * 2] = u1; uv[(i + 2) * 2 + 1] = v1; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const m = new THREE.Mesh(g, toon(0xe8e2d6, { map: cobbles(), noOcc: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  m.receiveShadow = true;
  return m;
}

// 縁石: 石畳の縁に沿って、外側が石畳でない所に並べる
function curbs(B, L, R) {
  const put = (x, z, ux, uz) => { if (L.paved(x + uz * 0.7, z - ux * 0.7, 0) || L.buildings.some((b) => inBox(b, x, z, 0.2))) return; B.add(BOX(0.84, 0.2, 0.36), jit(0xb4ada0, R, 0.1), local(I, x, 0.07, z, 0, Math.atan2(ux, uz) + Math.PI / 2, 0)); };
  // 広場の外周（角の丸い長方形を辿る）
  const q = L.square, pts = [];
  const r = q.r, path = new THREE.Path();
  path.moveTo(q.x0 + r, q.z0); path.lineTo(q.x1 - r, q.z0); path.quadraticCurveTo(q.x1, q.z0, q.x1, q.z0 + r); path.lineTo(q.x1, q.z1 - r);
  path.quadraticCurveTo(q.x1, q.z1, q.x1 - r, q.z1); path.lineTo(q.x0 + r, q.z1); path.quadraticCurveTo(q.x0, q.z1, q.x0, q.z1 - r); path.lineTo(q.x0, q.z0 + r); path.quadraticCurveTo(q.x0, q.z0, q.x0 + r, q.z0);
  const n = Math.round(path.getLength() / 0.9);
  for (const v of path.getSpacedPoints(n)) pts.push([v.x, v.y]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], Ls = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / Ls, uz = (bz - az) / Ls;
    const x = (ax + bx) / 2 - uz * 0.2, z = (az + bz) / 2 + ux * 0.2; // 外向きは (-uz, ux)
    put(x, z, -ux, -uz);
  }
  for (const s of L.streets) for (let i = 1; i < s.pts.length; i++) {
    const a = s.pts[i - 1], b = s.pts[i], Ls = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / Ls, uz = (b[1] - a[1]) / Ls;
    for (let t = 0.45; t < Ls; t += 0.9) for (const side of [1, -1]) {
      const x = a[0] + ux * t - uz * side * (s.w / 2 + 0.18), z = a[1] + uz * t + ux * side * (s.w / 2 + 0.18);
      put(x, z, side > 0 ? ux : -ux, side > 0 ? uz : -uz);
    }
  }
}

// 城壁（輪郭の外側に沿って石積みの壁と狭間）・角の丸塔・出口の門楼
function townWall(B, def, exits, R, heightAt, group, anims) {
  const exitAng = exits.map((e) => angOf(e.x, e.z));
  const angGap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const at = (a, off = 1.3) => { const [dx, dz] = dirOf(a), r = boundR(def, a) + off; return [dx * r, dz * r]; };
  const N = 150, H = 3.8, T = 1.3, stone = 0xa29a8c;
  for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, am = (a0 + a1) / 2;
    if (exitAng.some((e) => angGap(am, e) * boundR(def, am) < 4.4)) continue;
    const [x0, z0] = at(a0), [x1, z1] = at(a1), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, len = Math.hypot(x1 - x0, z1 - z0) + 0.06, ry = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
    const y = Math.min(heightAt(mx, mz), 0.6);
    B.add(BOX(len, H + 1, T), jit(stone, R, 0.04), local(I, mx, y + (H - 1) / 2, mz, 0, ry, 0), M_);
    B.add(BOX(len, 0.25, T + 0.25), jit(0x8a8378, R, 0.03), local(I, mx, y + H, mz, 0, ry, 0), M_);
    if (i % 2 === 0) B.add(BOX(Math.min(len, 1.1), 0.6, T + 0.1), jit(stone, R, 0.05), local(I, mx, y + H + 0.42, mz, 0, ry, 0), M_); // 狭間（凸）
  }
  // 塔: 45°ごと（出口の近くは門楼にする）
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2 + Math.PI / 8;
    if (exitAng.some((e) => angGap(a, e) * boundR(def, a) < 9)) continue;
    const [x, z] = at(a, 1.5);
    tower(B, local(I, x, Math.min(heightAt(x, z), 0.6), z, 0, a, 0), R, 2.3, 7.5);
  }
  // 門楼: 出口の両脇に四角い塔、上をアーチの渡りでつなぐ。両脇に旗
  for (const a of exitAng) {
    const [dx, dz] = dirOf(a), r = boundR(def, a) + 1.3, tx = -dz, tz = dx, ry = Math.atan2(dx, dz);
    for (const s of [-1, 1]) {
      const x = dx * r + tx * s * 5.2, z = dz * r + tz * s * 5.2, M = local(I, x, 0, z, 0, ry, 0);
      B.add(BOX(3.2, 8, 3.2), jit(stone, R, 0.04), local(M, 0, 3.5, 0), M_);
      for (let k = 0; k < 4; k++) for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [1.3, 1.3], [-1.3, 1.3]].slice(k, k + 1)) B.add(BOX(0.7, 0.7, 0.7), jit(stone, R, 0.05), local(M, ox, 7.85, oz), M_);
      B.add(new THREE.ConeGeometry(2.6, 2.6, 4), jit(0x7a4a3a, R), local(M, 0, 9.4, 0, 0, Math.PI / 4, 0), RF);
      banner(group, anims, dx * (r - 2) + tx * s * 3.4, 0, dz * (r - 2) + tz * s * 3.4, ry + Math.PI, s > 0 ? 0xb0403a : 0x3a5a9a);
    }
    const M = local(I, dx * r, 0, dz * r, 0, ry, 0);
    B.add(BOX(7.4, 1.6, 2.6), jit(stone, R, 0.04), local(M, 0, 5.6, 0), M_);
    for (let k = 0; k < 9; k++) { const t = k / 8, ang = Math.PI * t; B.add(BOX(0.9, 0.5, 2.7), jit(0x8a8378, R, 0.04), local(M, Math.cos(ang) * -3.4, 3.4 + Math.sin(ang) * 1.4, 0, 0, 0, ang - Math.PI / 2), M_); }
    for (let k = 0; k < 5; k++) B.add(BOX(0.7, 0.6, 2.7), jit(stone, R, 0.05), local(M, -3 + k * 1.5, 6.7, 0), M_);
  }
}

function tower(B, M, R, rad, h) {
  B.add(CYL(rad, rad * 1.08, h + 1, 12), jit(0xa29a8c, R, 0.04), local(M, 0, (h - 1) / 2, 0), M_);
  B.add(CYL(rad + 0.25, rad + 0.25, 0.4, 12), jit(0x8a8378, R, 0.03), local(M, 0, h, 0), M_);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; B.add(BOX(0.8, 0.7, 0.6), jit(0xa29a8c, R, 0.05), local(M, Math.sin(a) * (rad + 0.05), h + 0.55, Math.cos(a) * (rad + 0.05), 0, a, 0), M_); }
  B.add(new THREE.ConeGeometry(rad + 0.6, 3.4, 12), jit(0x6a4a52, R), local(M, 0, h + 2.4, 0), RF);
  for (let k = 0; k < 3; k++) { const a = k * 2.1; B.add(BOX(0.25, 0.7, 0.1), 0x2a2420, local(M, Math.sin(a) * (rad + 0.02), h * 0.6, Math.cos(a) * (rad + 0.02), 0, a, 0)); }
}

// ---------------------------------------------------------------------------
// 家（土台・漆喰の壁・柱と梁と筋交い・窓と鎧戸と花箱・扉とひさし・板葺きの屋根・煙突）
//   M の -z が正面。kind: cottage（平屋）/ tall（2階建て、2階が少し張り出す）/ inn（横長の宿屋、吊り看板）
// ---------------------------------------------------------------------------
function house(B, M, R, kind, roofC, W0, D0) {
  const W = W0 ?? (kind === 'inn' ? 8.2 : 5.6 + R() * 1.2), D = D0 ?? (kind === 'inn' ? 5.4 : 4.4 + R() * 0.6);
  const floors = kind === 'cottage' || kind === 'shop' ? 1 : 2, FH = 2.7, base = 0.6, WH = FH * floors;
  const add = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0, o) => B.add(geo, c, local(M, x, y, z, rx, ry, rz), o);
  const wood = (c = WOOD_D) => jit(c, R, 0.08), plaster = jit(PLASTER, R, 0.04);
  const addW = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0) => add(geo, c, x, y, z, rx, ry, rz, W_);
  // 土台
  add(BOX(W + 0.5, base, D + 0.5), jit(STONE, R, 0.08), 0, base / 2, 0, 0, 0, 0, M_);
  for (let k = 0; k < 6; k++) add(BOX(0.5 + R() * 0.4, 0.22, 0.08), jit(0x7a766c, R), -W / 2 + 0.6 + k * (W - 1) / 5, 0.25 + (k % 2) * 0.2, -D / 2 - 0.26);
  // 壁（2階は前後に少し張り出す）
  for (let f = 0; f < floors; f++) {
    const ov = f ? 0.25 : 0, y0 = base + f * FH;
    add(BOX(W, FH, D + ov * 2), plaster, 0, y0 + FH / 2, 0, 0, 0, 0, P_);
    // 柱・梁
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) addW(BOX(0.26, FH, 0.26), wood(), sx * W / 2, y0 + FH / 2, sz * (D / 2 + ov));
    for (const y of [y0 + 0.1, y0 + FH - 0.1]) for (const sz of [-1, 1]) addW(BOX(W + 0.18, 0.2, 0.16), wood(), 0, y, sz * (D / 2 + ov + 0.02));
    for (const y of [y0 + 0.1, y0 + FH - 0.1]) for (const sx of [-1, 1]) addW(BOX(0.16, 0.2, D + ov * 2 + 0.18), wood(), sx * (W / 2 + 0.02), y, 0);
    // 筋交い（正面の両端）
    for (const sx of [-1, 1]) addW(BOX(0.14, FH * 0.8, 0.1), wood(), sx * (W / 2 - 0.55), y0 + FH / 2, -(D / 2 + ov + 0.04), 0, 0, sx * 0.42);
    if (f) for (let k = 0; k < 4; k++) addW(BOX(0.18, 0.18, 0.5), wood(), -W / 2 + 0.6 + k * (W - 1.2) / 3, y0 - 0.02, -(D / 2 + 0.1)); // 張り出しの持ち送り
    // 窓
    const wy = y0 + FH * 0.52, front = -(D / 2 + ov + 0.06);
    const cols = f === 0 ? [-W * 0.3, W * 0.3] : kind === 'inn' ? [-W * 0.33, 0, W * 0.33] : [-W * 0.22, W * 0.22];
    for (const x of cols) windowAt(B, local(M, x, wy, front, 0, Math.PI, 0), R, f === 0);
    windowAt(B, local(M, -W * 0.2, wy, D / 2 + ov + 0.06, 0, 0, 0), R, false);
    windowAt(B, local(M, W / 2 + 0.06, wy, 0, 0, Math.PI / 2, 0), R, false);
  }
  // 扉（枠・ひさし・踏み石）
  const dz = -(D / 2 + 0.07);
  addW(BOX(1.1, 2.0, 0.1), wood(0x5a3a24), 0, base + 1.0, dz);
  for (let k = 0; k < 3; k++) addW(BOX(0.06, 1.9, 0.04), wood(0x3a2618), -0.35 + k * 0.35, base + 1.0, dz - 0.06);
  add(new THREE.SphereGeometry(0.06, 6, 4), 0xd8b050, 0.38, base + 1.0, dz - 0.1);
  for (const s of [-1, 1]) addW(BOX(0.18, 2.2, 0.18), wood(), s * 0.66, base + 1.1, dz);
  add(BOX(1.7, 0.1, 0.8), jit(roofC, R), 0, base + 2.35, dz - 0.35, -0.3, 0, 0);
  add(BOX(1.4, 0.18, 0.7), jit(STONE, R), 0, 0.09, -(D / 2 + 0.6));
  for (const sx of [-1, 1]) if (R() < 0.75) pot(B, local(M, sx * 1.15, 0, -(D / 2 + 0.55)), R);
  // 屋根: 段々の板葺き（1段ごとに色と角度を少し変える）・棟木・妻壁
  const pitch = kind === 'inn' ? 0.55 : 0.68, run = D / 2 + 0.7, slope = run / Math.cos(pitch), ry0 = base + WH, rows = 7;
  for (const s of [-1, 1]) for (let i = 0; i < rows; i++) {
    const t = (i + 0.5) / rows, z = s * run * t, y = ry0 + Math.tan(pitch) * run * (1 - t) + 0.1;
    add(BOX(W + 1.0, 0.14, slope / rows + 0.14), new THREE.Color(roofC).offsetHSL((R() - 0.5) * 0.02, 0, (R() - 0.5) * 0.06 - (i % 2) * 0.035), 0, y, z, s * pitch + (R() - 0.5) * 0.03, 0, (R() - 0.5) * 0.012, RF);
  }
  const ridgeY = ry0 + Math.tan(pitch) * run + 0.16;
  addW(BOX(W + 1.1, 0.22, 0.3), wood(), 0, ridgeY, 0);
  const gable = new THREE.Shape([new THREE.Vector2(-D / 2 - 0.25, 0), new THREE.Vector2(D / 2 + 0.25, 0), new THREE.Vector2(0, Math.tan(pitch) * (D / 2 + 0.25))]);
  for (const s of [-1, 1]) {
    B.add(new THREE.ExtrudeGeometry(gable, { depth: 0.1, bevelEnabled: false }), plaster, local(M, s * (W / 2 - 0.05), ry0, 0, 0, Math.PI / 2 * s, 0), P_);
    addW(BOX(0.14, 1.2, 0.14), wood(), s * (W / 2 + 0.06), ry0 + 0.62, 0); // 妻の束
  }
  // 煙突
  const cx = W * 0.26 * (R() < 0.5 ? 1 : -1), cz = D * 0.18, ch = ridgeY - ry0 + 0.7;
  add(BOX(0.75, ch, 0.75), jit(0x8a7f74, R, 0.08), cx, ry0 + ch / 2, cz, 0, 0, 0, M_);
  add(BOX(0.95, 0.16, 0.95), jit(0x5a5650, R), cx, ry0 + ch + 0.05, cz);
  // 店: 正面の縞の日よけ・吊り看板・店先の品物
  if (kind === 'shop') {
    const c1 = jit(ROOFS[Math.floor(R() * ROOFS.length)], R), c2 = new THREE.Color(0xf4ecdc);
    for (let k = 0; k < 6; k++) add(BOX(W * 0.8 / 6 + 0.01, 0.06, 1.4), k % 2 ? c2 : c1, -W * 0.4 + (k + 0.5) * W * 0.8 / 6, base + 2.5, -(D / 2 + 0.7), -0.32, 0, 0);
    for (const sx of [-1, 1]) add(CYL(0.05, 0.05, 2.4, 6), IRON, sx * W * 0.4, base + 1.2, -(D / 2 + 1.3));
    for (let k = 0; k < 3; k++) {
      const x = -W * 0.3 + k * W * 0.3;
      if (Math.abs(x) < 0.9) continue;
      addW(BOX(0.8, 0.5, 0.55), jit(0xa07a4a, R), x, base + 0.25, -(D / 2 + 0.7));
      for (let j = 0; j < 4; j++) add(new THREE.SphereGeometry(0.11, 6, 4), jit([0xd04a3a, 0xe0c040, 0x6ab04a, 0xd88a3a][Math.floor(R() * 4)], R), x - 0.2 + (j % 2) * 0.4, base + 0.58, -(D / 2 + 0.6) - Math.floor(j / 2) * 0.2);
    }
  }
  // 宿屋の吊り看板
  if (kind === 'inn') {
    add(BOX(0.1, 0.1, 1.2), IRON, W * 0.38, base + FH + 0.5, -(D / 2 + 0.85));
    add(BOX(0.9, 0.6, 0.08), jit(0xc89a5a, R), W * 0.38, base + FH + 0.05, -(D / 2 + 1.2));
    add(CYL(0.16, 0.16, 0.1, 10), 0xd8b050, W * 0.38, base + FH + 0.05, -(D / 2 + 1.25), Math.PI / 2, 0, 0);
  }
}

// 窓（枠・灯りのともったガラス・桟・鎧戸。lowBox なら下に花箱）。M の +z が外向き
function windowAt(B, M, R, lowBox) {
  const add = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0, o) => B.add(geo, c, local(M, x, y, z, rx, ry, rz), o);
  add(BOX(0.95, 1.05, 0.1), jit(WOOD_D, R), 0, 0, 0);
  add(BOX(0.75, 0.85, 0.05), 0xffd890, 0, 0, 0.04, 0, 0, 0, { glowing: true });
  add(BOX(0.06, 0.85, 0.07), jit(WOOD_D, R), 0, 0, 0.07);
  add(BOX(0.75, 0.06, 0.07), jit(WOOD_D, R), 0, 0.05, 0.07);
  const sh = [0x5a7a5a, 0x4f6a8f, 0x8a4a3a, 0x6a5a4a][Math.floor(R() * 4)];
  for (const s of [-1, 1]) add(BOX(0.42, 1.0, 0.05), jit(sh, R), s * 0.72, 0, 0.06, 0, s * 0.3, 0);
  add(BOX(1.15, 0.08, 0.26), jit(WOOD, R), 0, -0.58, 0.1);
  if (lowBox) {
    add(BOX(1.0, 0.24, 0.3), jit(0x7a5236, R), 0, -0.76, 0.2);
    for (let k = 0; k < 6; k++) add(new THREE.IcosahedronGeometry(0.1 + R() * 0.04, 0), FLOWERS[Math.floor(R() * FLOWERS.length)], -0.4 + k * 0.16, -0.58, 0.2 + (R() - 0.5) * 0.1, 0, 0, 0, { flat: true });
    for (let k = 0; k < 3; k++) add(new THREE.IcosahedronGeometry(0.13, 0), jit(0x4a8a3a, R), -0.3 + k * 0.3, -0.64, 0.28, 0, 0, 0, { flat: true });
  }
}

// 樽・木箱・袋のひとかたまり
function clutter(B, M, R) {
  const add = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0, o) => B.add(geo, c, local(M, x, y, z, rx, ry, rz), o);
  const barrel = (x, z) => {
    add(CYL(0.36, 0.36, 0.9, 12), jit(0x8a6440, R), x, 0.45, z);
    add(CYL(0.4, 0.4, 0.4, 12), jit(0x8a6440, R), x, 0.45, z);
    for (const y of [0.12, 0.78]) add(CYL(0.39, 0.39, 0.07, 12), IRON, x, y, z);
  };
  const crate = (x, y, z, s = 0.7, ry = 0) => {
    add(BOX(s, s, s), jit(0xa07a4a, R), x, y + s / 2, z, 0, ry, 0);
    for (const sy of [-1, 1]) add(BOX(s + 0.04, 0.08, s + 0.04), jit(0x6a4a2a, R), x, y + s / 2 + sy * (s / 2 - 0.04), z, 0, ry, 0);
  };
  barrel(0, 0);
  if (R() < 0.7) barrel(0.75, 0.25);
  crate(-0.3, 0, 0.8, 0.7, R());
  if (R() < 0.5) crate(-0.3, 0.7, 0.8, 0.5, R());
  if (R() < 0.6) add(new THREE.SphereGeometry(0.32, 8, 6), jit(0xc8b080, R), 0.6, 0.25, 0.95, 0, 0, 0.3);
}

function fence(B, M, R, len) {
  const n = Math.round(len / 0.45);
  for (let k = 0; k <= n; k++) B.add(BOX(0.12, 0.85 + (k % 2) * 0.1, 0.06), jit(0xc8b494, R, 0.05), local(M, -len / 2 + k * len / n, 0.45, 0));
  for (const y of [0.3, 0.7]) B.add(BOX(len + 0.1, 0.09, 0.05), jit(0xa8946e, R), local(M, 0, y, 0.05));
}

function smallTree(B, M, R) {
  B.add(CYL(0.12, 0.2, 1.6, 7), jit(0x6b4a2a, R), local(M, 0, 0.8, 0));
  const c = new THREE.Color(0x4a8f3e);
  for (const [x, y, z, s] of [[0, 2.0, 0, 0.95], [0.5, 1.7, 0.2, 0.6], [-0.45, 1.75, -0.15, 0.65], [0.1, 2.55, -0.1, 0.6]]) {
    B.add(new THREE.IcosahedronGeometry(s, 1), c.clone().offsetHSL((R() - 0.5) * 0.02, 0, (y > 2.3 ? 0.06 : 0) + (R() - 0.5) * 0.05), local(M, x, y, z, R(), R(), R()), { flat: true });
  }
}

// 街灯（石の台・鉄の柱・腕木から吊るしたランタン）。M の向きで腕木を外へ張る
function lamp(B, M, R) {
  const add = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0, o) => B.add(geo, c, local(M, x, y, z, rx, ry, rz), o);
  add(CYL(0.34, 0.42, 0.45, 8), jit(STONE, R, 0.05), 0, 0.22, 0);
  add(CYL(0.08, 0.11, 3.1, 8), IRON, 0, 1.95, 0);
  for (const y of [0.55, 2.2]) add(CYL(0.14, 0.14, 0.1, 8), IRON, 0, y, 0);
  add(BOX(0.08, 0.08, 0.8), IRON, 0, 3.35, 0.35);
  add(new THREE.ConeGeometry(0.12, 0.25, 8), IRON, 0, 3.6, 0);
  // ランタン
  add(BOX(0.34, 0.06, 0.34), IRON, 0, 3.05, 0.7);
  add(BOX(0.26, 0.36, 0.26), 0xffe2a0, 0, 2.85, 0.7, 0, 0, 0, { glowing: true });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(BOX(0.04, 0.4, 0.04), IRON, sx * 0.15, 2.85, 0.7 + sz * 0.15);
  add(new THREE.ConeGeometry(0.26, 0.2, 4), IRON, 0, 3.15, 0.7, 0, Math.PI / 4, 0);
  add(CYL(0.01, 0.01, 0.2, 4), IRON, 0, 3.27, 0.7);
  // 柱に吊るした花かご
  add(BOX(0.06, 0.06, 0.45), IRON, 0, 2.5, -0.2);
  add(new THREE.SphereGeometry(0.24, 8, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), jit(0x7a5a3a, R), 0, 2.2, -0.42);
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2;
    add(new THREE.IcosahedronGeometry(0.09, 0), k % 2 ? jit(0x4a8a3a, R) : FLOWERS[Math.floor(R() * FLOWERS.length)], Math.sin(a) * 0.17, 2.24 + (k % 3) * 0.03, -0.42 + Math.cos(a) * 0.17, 0, 0, 0, { flat: true });
  }
}

// 植木鉢
function pot(B, M, R) {
  B.add(CYL(0.24, 0.18, 0.4, 9), jit(0xb0603a, R, 0.08), local(M, 0, 0.2, 0));
  B.add(new THREE.IcosahedronGeometry(0.3, 0), jit(0x4a8a3a, R), local(M, 0, 0.55, 0, R(), R(), 0), { flat: true });
  for (let k = 0; k < 3; k++) B.add(new THREE.IcosahedronGeometry(0.08, 0), FLOWERS[Math.floor(R() * FLOWERS.length)], local(M, (R() - 0.5) * 0.35, 0.7 + R() * 0.1, (R() - 0.5) * 0.35), { flat: true });
}

// 掲示板。M の -z が正面
function noticeBoard(B, M, R) {
  const add = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0) => B.add(geo, c, local(M, x, y, z, rx, ry, rz));
  for (const s of [-1, 1]) add(BOX(0.14, 2.3, 0.14), jit(WOOD_D, R), s * 0.95, 1.15, 0);
  add(BOX(1.9, 1.1, 0.08), jit(0x9a7448, R), 0, 1.45, 0);
  for (const sx of [-1, 1]) add(BOX(2.3, 0.1, 0.5), jit(0x8a4a3a, R), 0, 2.32 - 0.04, sx * 0.14, sx * 0.5, 0, 0);
  const papers = [0xf4ecd8, 0xe8dcc0, 0xf8f4ea];
  for (let k = 0; k < 5; k++) add(BOX(0.36 + R() * 0.1, 0.42 + R() * 0.1, 0.02), papers[k % 3], -0.66 + k * 0.33, 1.45 + (k % 2 ? 0.18 : -0.14), -0.06, 0, 0, (R() - 0.5) * 0.2);
}

// 2本の街灯の上を結ぶ、たるんだ紐と三角の小旗
function bunting(B, p, q, R) {
  const N = 12, cat = (t) => new THREE.Vector3(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t - Math.sin(t * Math.PI) * 0.7, p.z + (q.z - p.z) * t);
  const tri = new THREE.Shape([new THREE.Vector2(-0.17, 0), new THREE.Vector2(0.17, 0), new THREE.Vector2(0, -0.42)]);
  const cols = [0xd04a3a, 0xf0c040, 0x4a8ad0, 0xf4f0e6, 0x5aa050];
  const ry = Math.atan2(q.x - p.x, q.z - p.z) - Math.PI / 2;
  for (let k = 0; k < N; k++) {
    const a = cat(k / N), b = cat((k + 1) / N), mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
    const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0));
    m.setPosition(mid);
    B.add(CYL(0.014, 0.014, len, 3), 0x8a7a66, m.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), { plain: true });
    if (k === 0) continue;
    B.add(new THREE.ExtrudeGeometry(tri, { depth: 0.015, bevelEnabled: false }), cols[(k + Math.floor(R() * 2)) % cols.length], local(I, a.x, a.y, a.z, 0, ry, 0));
  }
}

function bench(B, M, R) {
  const add = (geo, c, x, y, z, rx = 0) => B.add(geo, c, local(M, x, y, z, rx, 0, 0));
  for (const s of [-1, 1]) { add(BOX(0.1, 0.45, 0.45), IRON, s * 0.75, 0.22, 0); add(BOX(0.08, 0.6, 0.08), IRON, s * 0.75, 0.6, 0.22, -0.15); }
  for (let k = 0; k < 3; k++) add(BOX(1.8, 0.06, 0.14), jit(0x9a6a40, R, 0.05), 0, 0.47, -0.15 + k * 0.15);
  for (let k = 0; k < 2; k++) add(BOX(1.8, 0.12, 0.05), jit(0x9a6a40, R, 0.05), 0, 0.72 + k * 0.17, 0.26 + k * 0.02, -0.15);
}

// 丸い石の花壇（花と小さな木）
function planter(B, M, R) {
  B.add(CYL(1.1, 1.15, 0.5, 14), jit(0xb0a898, R, 0.05), local(M, 0, 0.25, 0));
  B.add(CYL(1.22, 1.22, 0.1, 14), jit(0x9a9286, R), local(M, 0, 0.52, 0));
  B.add(CYL(1.0, 1.0, 0.05, 14), 0x4a3a2a, local(M, 0, 0.5, 0));
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2 + R() * 0.3, r = 0.6 + R() * 0.3;
    B.add(new THREE.IcosahedronGeometry(0.11 + R() * 0.05, 0), FLOWERS[Math.floor(R() * FLOWERS.length)], local(M, Math.sin(a) * r, 0.6 + R() * 0.08, Math.cos(a) * r), { flat: true });
    if (k % 2) B.add(new THREE.IcosahedronGeometry(0.15, 0), jit(0x4a8a3a, R), local(M, Math.sin(a + 0.2) * r * 0.9, 0.56, Math.cos(a + 0.2) * r * 0.9), { flat: true });
  }
  smallTree(B, local(M, 0, 0.5, 0, 0, 0, 0, 0.8), R);
}

// 露店（4本柱・前板つきの台・縞の日よけ・品物の箱）
function stall(B, M, R, color) {
  const add = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0, o) => B.add(geo, c, local(M, x, y, z, rx, ry, rz), o);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(CYL(0.07, 0.08, sz < 0 ? 2.5 : 2.2, 6), jit(WOOD, R), sx * 1.5, sz < 0 ? 1.25 : 1.1, sz * 0.75);
  add(BOX(3.2, 0.12, 1.4), jit(0xa07a50, R), 0, 0.95, 0);
  add(BOX(3.2, 0.85, 0.08), jit(0x8a6440, R), 0, 0.5, 0.72);
  for (let k = 0; k < 4; k++) add(BOX(0.06, 0.8, 0.04), jit(WOOD_D, R), -1.2 + k * 0.8, 0.5, 0.77);
  // 縞の日よけ（手前に下がる）
  const c1 = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.15), c2 = new THREE.Color(0xf6f0e2);
  for (let k = 0; k < 7; k++) add(BOX(3.6 / 7 + 0.01, 0.06, 1.9), k % 2 ? c2 : c1, -1.8 + (k + 0.5) * 3.6 / 7, 2.35, 0, 0.17, 0, 0);
  for (let k = 0; k < 7; k++) add(BOX(3.6 / 7 + 0.01, 0.28, 0.05), k % 2 ? c2 : c1, -1.8 + (k + 0.5) * 3.6 / 7, 2.06, 0.95);
  // 品物
  for (let k = 0; k < 3; k++) {
    const x = -1.0 + k, fc = [0xd04a3a, 0xe0c040, 0x6ab04a][k];
    add(BOX(0.7, 0.22, 0.5), jit(0xb08a5a, R), x, 1.12, -0.1);
    for (let j = 0; j < 5; j++) add(new THREE.SphereGeometry(0.11, 8, 6), jit(fc, R, 0.08), x - 0.22 + (j % 3) * 0.22, 1.28 + (j > 2 ? 0.08 : 0), -0.18 + (j > 2 ? 0.08 : 0));
  }
  clutter(B, local(M, 2.3, 0, -0.3, 0, 0, 0, 0.85), R);
}

function well(B, M, R) {
  const add = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0, o) => B.add(geo, c, local(M, x, y, z, rx, ry, rz), o);
  add(CYL(1.0, 1.08, 0.85, 14), jit(STONE, R, 0.05), 0, 0.42, 0);
  add(CYL(1.12, 1.12, 0.14, 14), jit(0x8a857a, R), 0, 0.88, 0);
  add(CYL(0.82, 0.82, 0.05, 14), 0x2a4a6a, 0, 0.7, 0);
  for (const s of [-1, 1]) add(BOX(0.16, 2.0, 0.16), jit(WOOD_D, R), s * 0.9, 1.6, 0);
  add(CYL(0.06, 0.06, 2.0, 6), jit(WOOD, R), 0, 2.05, 0, 0, 0, Math.PI / 2);
  add(CYL(0.02, 0.02, 0.7, 4), 0x3a3030, 0, 1.7, 0);
  add(CYL(0.18, 0.14, 0.26, 8), jit(0x8a6440, R), 0, 1.25, 0);
  for (const s of [-1, 1]) add(BOX(2.3, 0.08, 0.95), jit(0x8a4a3a, R), 0, 2.85 - 0.18, s * 0.4, s * 0.55, 0, 0);
}

function signpost(B, M, R) {
  B.add(CYL(0.08, 0.1, 2.4, 6), jit(WOOD_D, R), local(M, 0, 1.2, 0));
  for (const [y, ry] of [[2.0, 0.3], [1.6, -0.5]]) {
    B.add(BOX(1.1, 0.24, 0.06), jit(0xb08a5a, R), local(M, 0, y, 0, 0, ry, 0).multiply(local(I, 0.4, 0, 0)));
    B.add(new THREE.ConeGeometry(0.17, 0.2, 3), jit(0xb08a5a, R), local(M, 0, y, 0, 0, ry, 0).multiply(local(I, 1.02, 0, 0, 0, 0, -Math.PI / 2, 1, 1, 0.35)));
  }
}

// 出口の脇の旗（布が風で揺れる）
function banner(group, anims, x, y, z, ry, color) {
  const g = new THREE.Group();
  g.position.set(x, y, z); g.rotation.y = ry;
  const pole = new THREE.Mesh(CYL(0.07, 0.09, 4.6, 8), toon(0x5a4030));
  pole.position.y = 2.3; g.add(pole);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), toon(0xd8b050));
  top.position.y = 4.65; g.add(top);
  const bar = new THREE.Mesh(CYL(0.035, 0.035, 1.2, 6), toon(0x5a4030));
  bar.rotation.z = Math.PI / 2; bar.position.set(0.55, 4.3, 0); g.add(bar);
  const geo = new THREE.PlaneGeometry(1.0, 2.2, 4, 8);
  geo.translate(0.55, 4.3 - 1.1, 0);
  // 裾を燕尾に切る
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 4.3 - 2.15) p.setY(i, p.getY(i) + Math.abs(p.getX(i) - 0.55) * 0.5);
  const base = Float32Array.from(p.array);
  const cloth = new THREE.Mesh(geo, toon(color, { side: THREE.DoubleSide }));
  cloth.castShadow = true;
  g.add(cloth);
  // 紋章（金の菱形）
  const em = new THREE.Mesh(new THREE.CircleGeometry(0.26, 4), toon(0xe0c060, { side: THREE.DoubleSide }));
  em.position.set(0.55, 3.45, 0.012); g.add(em);
  const ph = x * 0.3 + z * 0.2;
  anims.push((t) => {
    for (let i = 0; i < p.count; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1], k = (4.3 - by) / 2.2;
      p.setZ(i, Math.sin(t * 2.4 + bx * 2.5 + by * 1.2 + ph) * 0.12 * k + Math.sin(t * 1.3 + ph) * 0.06 * k);
    }
    p.needsUpdate = true;
    em.position.z = 0.012 + Math.sin(t * 2.4 + 0.55 * 2.5 + 3.45 * 1.2 + ph) * 0.12 * 0.4 + Math.sin(t * 1.3 + ph) * 0.06 * 0.4;
  });
  group.add(g);
}

// ---------------------------------------------------------------------------
// 特別な建物（M の -z が正面。b.w × b.d が敷地＝当たり判定）
// ---------------------------------------------------------------------------
// 教会: 石積みの身廊・急な屋根・正面の鐘楼・尖った窓・丸窓
function chapel(B, M, R, b, anims, group) {
  const W = b.w, D = b.d, H = 5.2, add = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0, o = M_) => B.add(geo, c, local(M, x, y, z, rx, ry, rz), o);
  const st = 0xd8d0c0;
  add(BOX(W + 0.4, 0.5, D + 0.4), jit(0x9a958a, R), 0, 0.25, 0);
  add(BOX(W, H, D - 2.6), jit(st, R, 0.03), 0, 0.5 + H / 2, 1.3);
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
    const z = -0.2 + k * 2.3;
    add(BOX(0.5, H, 0.7), jit(0xc8bfae, R, 0.03), sx * (W / 2 + 0.15), 0.5 + H / 2, z); // 控え壁
    add(BOX(0.12, 2.0, 0.8), 0x6a8ad0, sx * (W / 2 + 0.03), 0.5 + H * 0.55, z + 1.15, 0, 0, 0, { glowing: true });
    add(new THREE.ConeGeometry(0.42, 0.5, 4), 0x6a8ad0, sx * (W / 2 + 0.03), 0.5 + H * 0.55 + 1.2, z + 1.15, 0, Math.PI / 4, 0, { glowing: true });
  }
  // 屋根（急勾配）
  const pitch = 0.95, run = W / 2 + 0.5, slope = run / Math.cos(pitch);
  for (const s of [-1, 1]) add(BOX(slope, 0.2, D - 2.2), jit(0x4f5a6a, R), s * run / 2, 0.5 + H + Math.tan(pitch) * run / 2, 1.3, 0, 0, -s * pitch, RF);
  // 正面の鐘楼
  const TW = 3.0, TH = 10;
  add(BOX(TW, TH, 2.8), jit(st, R, 0.03), 0, TH / 2, -D / 2 + 1.4);
  add(BOX(TW + 0.3, 0.3, 3.1), jit(0xb0a898, R), 0, TH, -D / 2 + 1.4);
  for (const sx of [-1, 1]) add(BOX(0.4, 1.6, 3.0), jit(st, R), sx * (TW / 2 - 0.2), TH + 1.1, -D / 2 + 1.4);
  add(new THREE.ConeGeometry(2.2, 4.4, 4), jit(0x4f5a6a, R), 0, TH + 1.9 + 2.2, -D / 2 + 1.4, 0, Math.PI / 4, 0, RF);
  add(BOX(0.12, 1.1, 0.12), 0xd8b050, 0, TH + 6.6, -D / 2 + 1.4, 0, 0, 0, {});
  add(BOX(0.6, 0.12, 0.12), 0xd8b050, 0, TH + 6.8, -D / 2 + 1.4, 0, 0, 0, {});
  // 鐘（ゆっくり揺れる）
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 0.8, 12, 1, true), toon(0xc89a3a, { side: THREE.DoubleSide }));
  const piv = new THREE.Group(); piv.add(bell); bell.position.y = -0.5;
  piv.position.set(0, TH + 1.6, -D / 2 + 1.4); piv.applyMatrix4(M); group.add(piv);
  anims.push((t) => { piv.rotation.x = Math.sin(t * 1.3) * 0.12; });
  // 扉（アーチ）・丸窓
  add(BOX(1.5, 2.4, 0.15), jit(0x5a3a24, R), 0, 0.5 + 1.2, -D / 2 - 0.02, 0, 0, 0, W_);
  add(CYL(0.75, 0.75, 0.15, 12, 1), jit(0x5a3a24, R), 0, 0.5 + 2.4, -D / 2 - 0.02, Math.PI / 2, 0, 0, W_);
  add(CYL(0.7, 0.7, 0.1, 12), 0xffc870, 0, 6.6, -D / 2 - 0.02, Math.PI / 2, 0, 0, { glowing: true });
  add(CYL(0.85, 0.85, 0.08, 12), jit(0xb0a898, R), 0, 6.6, -D / 2 + 0.02, Math.PI / 2, 0, 0);
  for (const sx of [-1, 1]) planter(B, local(M, sx * 2.6, 0, -D / 2 - 1.4, 0, 0, 0, 0.7), R);
}

// ギルド: 石の1階と木組みの2階、正面の旗、両開きの大扉
function guild(B, M, R, b) {
  const W = b.w, D = b.d, add = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0, o = {}) => B.add(geo, c, local(M, x, y, z, rx, ry, rz), o);
  add(BOX(W, 3.2, D), jit(0xb0a898, R, 0.03), 0, 1.6, 0, 0, 0, 0, M_);
  add(BOX(W + 0.5, 2.8, D + 0.5), jit(PLASTER, R, 0.03), 0, 3.2 + 1.4, 0, 0, 0, 0, P_);
  for (const sx of [-1, -0.33, 0.33, 1]) add(BOX(0.24, 2.8, 0.24), jit(WOOD_D, R), sx * (W / 2 + 0.25), 4.6, -(D / 2 + 0.25), 0, 0, 0, W_);
  add(BOX(W + 0.7, 0.24, 0.24), jit(WOOD_D, R), 0, 3.25, -(D / 2 + 0.27), 0, 0, 0, W_);
  add(BOX(W + 0.7, 0.24, 0.24), jit(WOOD_D, R), 0, 5.95, -(D / 2 + 0.27), 0, 0, 0, W_);
  for (const x of [-W * 0.32, 0, W * 0.32]) windowAt(B, local(M, x, 4.6, -(D / 2 + 0.31), 0, Math.PI, 0), R, false);
  for (const sx of [-1, 1]) add(BOX(0.95, 2.4, 0.12), jit(0x5a3a24, R), sx * 0.5, 1.2, -D / 2 - 0.05, 0, 0, 0, W_);
  add(CYL(1.0, 1.0, 0.12, 12, 1, false, 0, Math.PI), jit(0x5a3a24, R), 0, 2.4, -D / 2 - 0.05, Math.PI / 2, 0, Math.PI / 2, W_);
  // 寄棟の屋根
  const roof = new THREE.ConeGeometry(Math.hypot(W, D) / 2 + 0.6, 3.2, 4);
  add(roof, jit(0x3a5a8a, R), 0, 6.0 + 1.6, 0, 0, Math.PI / 4, 0, RF);
  // 盾の看板と旗
  add(BOX(1.2, 1.4, 0.12), jit(0x3a5a9a, R), 0, 3.0 + 0.2, -D / 2 - 0.12);
  add(new THREE.OctahedronGeometry(0.35, 0), 0xe0c060, 0, 3.2, -D / 2 - 0.2);
  for (const sx of [-1, 1]) { add(BOX(0.08, 0.08, 1.0), IRON, sx * W * 0.38, 5.2, -D / 2 - 0.7); add(BOX(0.7, 1.4, 0.04), sx > 0 ? 0xb0403a : 0x3a5a9a, sx * W * 0.38, 4.5, -D / 2 - 1.15); }
  clutter(B, local(M, W / 2 + 1, 0, -D / 2 + 0.6), R);
}

// 風車: 石の円塔・円錐の屋根・回る4枚羽根
function mill(B, M, R, b, anims, group) {
  const add = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0, o = {}) => B.add(geo, c, local(M, x, y, z, rx, ry, rz), o);
  add(CYL(1.9, 2.4, 7, 12), jit(0xd8d0c0, R, 0.03), 0, 3.5, 0, 0, 0, 0, M_);
  add(new THREE.ConeGeometry(2.4, 2.6, 12), jit(0x8a5a3a, R), 0, 8.3, 0, 0, 0, 0, RF);
  add(BOX(1.0, 1.9, 0.15), jit(0x5a3a24, R), 0, 0.95, -2.3, 0, 0, 0, W_);
  for (const y of [3.5, 5.6]) windowAt(B, local(M, 0, y, -2.15, 0, Math.PI, 0), R, false);
  add(CYL(0.25, 0.25, 1.2, 8), jit(WOOD_D, R), 0, 7.2, -2.3, Math.PI / 2, 0, 0, W_);
  // 羽根（別のメッシュで回す）
  const sails = new THREE.Group(), wmat = toon(0x8a6a48), cloth = toon(0xf0e8d8);
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2;
    const spar = new THREE.Mesh(BOX(0.18, 5.2, 0.12), wmat); spar.position.y = 2.6; arm.add(spar);
    const sail = new THREE.Mesh(BOX(1.1, 3.8, 0.04), cloth); sail.position.set(0.62, 3.0, 0.04); arm.add(sail);
    for (let j = 0; j < 4; j++) { const bar = new THREE.Mesh(BOX(1.2, 0.07, 0.08), wmat); bar.position.set(0.62, 1.4 + j * 1.1, 0); arm.add(bar); }
    sails.add(arm);
  }
  const hub = new THREE.Group(); hub.add(sails); hub.position.set(0, 7.2, -2.95); hub.applyMatrix4(M); group.add(hub);
  hub.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  anims.push((t) => { sails.rotation.z = t * 0.6; });
  hay(B, local(M, 2.8, 0, -1.5), R); hay(B, local(M, -2.6, 0, 0.8), R);
}

// 納屋: 板張りの壁・大きな両開き戸・干し草
function barn(B, M, R, b, roofC) {
  const W = b.w, D = b.d, H = 3.2, add = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0, o = W_) => B.add(geo, c, local(M, x, y, z, rx, ry, rz), o);
  const wc = jit(0x8a5a3a, R, 0.06);
  add(BOX(W, H, D), wc, 0, H / 2, 0);
  for (let k = 0; k <= 6; k++) add(BOX(0.1, H, 0.06), jit(0x6a4228, R), -W / 2 + k * W / 6, H / 2, -D / 2 - 0.03);
  for (const sx of [-1, 1]) {
    add(BOX(1.3, 2.4, 0.1), jit(0x7a4a2a, R), sx * 0.66, 1.2, -D / 2 - 0.08);
    add(BOX(0.12, 2.6, 0.12), jit(0xe8e0d0, R), sx * 0.66, 1.2, -D / 2 - 0.14, 0, 0, sx * 0.48);
  }
  const pitch = 0.6, run = D / 2 + 0.5, slope = run / Math.cos(pitch);
  for (const s of [-1, 1]) add(BOX(W + 0.6, 0.16, slope), jit(roofC, R), 0, H + Math.tan(pitch) * run / 2, s * run / 2, s * pitch, 0, 0, RF);
  const gable = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, Math.tan(pitch) * D / 2)]);
  for (const s of [-1, 1]) B.add(new THREE.ExtrudeGeometry(gable, { depth: 0.1, bevelEnabled: false }), wc, local(M, s * (W / 2 - 0.05), H, 0, 0, Math.PI / 2 * s, 0), W_);
  hay(B, local(M, W / 2 + 1.2, 0, -D / 2 + 0.5), R);
}

// ---------------------------------------------------------------------------
// 小物
// ---------------------------------------------------------------------------
// 物干し: 2軒の間に柱を立て、洗濯物を吊るす
function laundry(B, a, b, R) {
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, ry = Math.atan2(ux, uz);
  const p0 = { x: a.x + ux * L * 0.3, z: a.z + uz * L * 0.3 }, p1 = { x: a.x + ux * L * 0.7, z: a.z + uz * L * 0.7 };
  for (const p of [p0, p1]) B.add(CYL(0.05, 0.06, 2.4, 6), jit(WOOD, R), local(I, p.x, 1.2, p.z));
  const len = L * 0.4;
  B.add(CYL(0.012, 0.012, len, 3), 0xd8d0c0, local(I, (p0.x + p1.x) / 2, 2.25, (p0.z + p1.z) / 2, Math.PI / 2, ry, 0), { plain: true });
  const cols = [0xf4f0e6, 0x8ab0d8, 0xd88a7a, 0xe8d88a, 0xa8c8a0];
  for (let k = 0; k < 4; k++) {
    const t = (k + 0.7) / 5, x = p0.x + (p1.x - p0.x) * t, z = p0.z + (p1.z - p0.z) * t, w = 0.4 + R() * 0.25, h = 0.5 + R() * 0.3;
    B.add(BOX(w, h, 0.03), cols[Math.floor(R() * cols.length)], local(I, x, 2.22 - h / 2, z, 0, ry + Math.PI / 2, 0));
  }
}

// 畑: 低い柵で囲み、畝に野菜を並べる。かかしを立てることも
function garden(B, M, R) {
  const W = 4.2, D = 3.2;
  B.add(BOX(W, 0.08, D), 0x6a5038, local(M, 0, 0.03, 0), { plain: true });
  for (let r = 0; r < 4; r++) {
    const z = -D / 2 + 0.45 + r * 0.75, c = [0x5aa04a, 0x7ab84a, 0x4a8a3a, 0xc8a040][Math.floor(R() * 4)];
    B.add(BOX(W - 0.5, 0.16, 0.36), 0x7a5a3a, local(M, 0, 0.09, z), { plain: true });
    for (let k = 0; k < 6; k++) B.add(new THREE.IcosahedronGeometry(0.16 + R() * 0.06, 0), jit(c, R), local(M, -W / 2 + 0.55 + k * (W - 1.1) / 5, 0.25, z, R(), R(), 0), { flat: true });
  }
  fence(B, local(M, 0, 0, -D / 2 - 0.2), R, W);
  fence(B, local(M, 0, 0, D / 2 + 0.2), R, W);
  for (const s of [-1, 1]) fence(B, local(M, s * (W / 2 + 0.2), 0, 0, 0, Math.PI / 2, 0), R, D);
  if (R() < 0.5) { // かかし
    B.add(CYL(0.05, 0.05, 1.9, 6), jit(WOOD, R), local(M, 0.6, 0.95, 0));
    B.add(CYL(0.04, 0.04, 1.2, 6), jit(WOOD, R), local(M, 0.6, 1.4, 0, 0, 0, Math.PI / 2));
    B.add(BOX(0.5, 0.6, 0.25), jit(0xb06a4a, R), local(M, 0.6, 1.3, 0));
    B.add(new THREE.SphereGeometry(0.2, 8, 6), 0xe0d0a0, local(M, 0.6, 1.8, 0));
    B.add(new THREE.ConeGeometry(0.35, 0.3, 8), 0xc8a050, local(M, 0.6, 2.0, 0));
  }
}
// 植え込み（丸く刈った低木）
function bush(B, M, R) {
  const c = new THREE.Color(0x4a8a3a).offsetHSL((R() - 0.5) * 0.03, 0, (R() - 0.5) * 0.08);
  for (let k = 0; k < 3; k++) B.add(new THREE.IcosahedronGeometry(0.45 + R() * 0.25, 1), (p, n) => c.clone().offsetHSL(0, 0, n.y > 0.4 ? 0.05 : n.y < -0.2 ? -0.08 : 0), local(M, (R() - 0.5) * 0.9, 0.35 + R() * 0.15, (R() - 0.5) * 0.9, 0, 0, 0, 1, 0.8, 1), { surf: SURF.leaf });
  if (R() < 0.4) for (let k = 0; k < 5; k++) B.add(new THREE.IcosahedronGeometry(0.07, 0), FLOWERS[Math.floor(R() * FLOWERS.length)], local(M, (R() - 0.5) * 1.1, 0.7 + R() * 0.2, (R() - 0.5) * 1.1), { flat: true });
}
// 花壇（石で縁取った細長い花の列）
function flowerBed(B, M, R) {
  B.add(BOX(2.6, 0.22, 1.0), jit(0xa8a090, R), local(M, 0, 0.11, 0), M_);
  B.add(BOX(2.4, 0.06, 0.8), 0x4a3a2a, local(M, 0, 0.23, 0), { plain: true });
  const c = FLOWERS[Math.floor(R() * FLOWERS.length)], c2 = FLOWERS[Math.floor(R() * FLOWERS.length)];
  for (let k = 0; k < 14; k++) {
    const x = -1.05 + (k % 7) * 0.35, z = k < 7 ? -0.18 : 0.18;
    B.add(new THREE.IcosahedronGeometry(0.12, 0), jit(0x4a8a3a, R), local(M, x, 0.32, z), { flat: true });
    B.add(new THREE.IcosahedronGeometry(0.09, 0), k % 3 ? c : c2, local(M, x + 0.05, 0.45, z), { flat: true });
  }
}
// 干し草の山（丸めた草）
function hay(B, M, R) {
  const c = jit(0xd8b860, R, 0.06);
  for (let k = 0; k < 2 + Math.floor(R() * 2); k++) B.add(CYL(0.55, 0.55, 1.0, 12), c.clone().offsetHSL(0, 0, (R() - 0.5) * 0.05), local(M, (k - 0.5) * 1.15, 0.55, (R() - 0.5) * 0.3, 0, 0, Math.PI / 2));
}
// 荷車
function cart(B, M, R) {
  B.add(BOX(1.4, 0.5, 2.0), jit(0x9a7448, R), local(M, 0, 0.75, 0), W_);
  for (const sx of [-1, 1]) { B.add(CYL(0.45, 0.45, 0.1, 12), jit(0x5a3a24, R), local(M, sx * 0.78, 0.45, 0.2, 0, 0, Math.PI / 2), W_); B.add(CYL(0.04, 0.04, 1.6, 4), jit(WOOD, R), local(M, sx * 0.4, 0.55, -1.6, Math.PI / 2 - 0.15, 0, 0)); }
  for (let k = 0; k < 4; k++) B.add(new THREE.SphereGeometry(0.28, 8, 6), jit([0xc8b080, 0xd8a050, 0x7aa04a][k % 3], R), local(M, (R() - 0.5) * 0.8, 1.1, (R() - 0.5) * 1.2));
}
