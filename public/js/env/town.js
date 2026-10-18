// エリアの見た目: 町（石畳の広場・木組みの家並み・街灯と旗飾り・露店・ベンチ・花壇・井戸・樽や木箱）
// どれも見た目だけ（当たり判定はない）。広場の中央（転移門）・出口への道・NPC・共有ボックスの周りは空ける
import * as THREE from 'three';
import { exitsOf, boundR, angOf, insideOpen } from '../../shared/areas.js';
import { toon } from '../toon.js';
import { local, I } from './kit.js';
import { cobbles } from './textures.js';

const jit = (hex, R, d = 0.06) => new THREE.Color(hex).offsetHSL((R() - 0.5) * d * 0.2, (R() - 0.5) * d * 0.5, (R() - 0.5) * d);
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL = (r1, r2, h, n = 10) => new THREE.CylinderGeometry(r1, r2, h, n);
const WOOD = 0x6a4a30, WOOD_D = 0x4a3222, IRON = 0x4a4c58, STONE = 0x9a958a, PLASTER = 0xeee4cc;
const ROOFS = [0xb0503a, 0x4f6a8f, 0x8a5a3a, 0x5a7a4a, 0x7a4a62, 0xc0703a];
const FLOWERS = [0xff7a8a, 0xffd84a, 0xffffff, 0xc07aff, 0xff9a4a];

export function buildTown(B, def, R, heightAt, anims, group, { plaza = def.R * 0.62, onPath = () => false } = {}) {
  const exits = exitsOf(def);
  const blocked = (x, z, pad = 0) => Math.hypot(x, z) < 7 + pad
    || (def.box && Math.hypot(def.box.x - x, def.box.z - z) < 3.2 + pad)
    || (def.npcs || []).some((n) => Math.hypot(n.x - x, n.z - z) < 2.6 + pad)
    || exits.some((e) => Math.hypot(e.x - x, e.z - z) < 7 + pad)
    || onPath(x, z, 2.2 + pad) || !insideOpen(def, x, z, 1.5);
  // 中心を向く置き方（部品の -z が広場の中心を向く）
  const facing = (x, z, s = 1) => local(I, x, heightAt(x, z), z, 0, Math.atan2(x, z), 0, s);

  group.add(makePlaza(def, plaza, heightAt));
  // 広場の縁石（道の切れ目は空ける）
  const nCurb = Math.round(plaza * 2 * Math.PI / 0.9);
  for (let i = 0; i < nCurb; i++) {
    const a = i / nCurb * Math.PI * 2, x = Math.sin(a) * (plaza + 0.25), z = Math.cos(a) * (plaza + 0.25);
    if (onPath(x, z, 2.2)) continue;
    B.add(BOX(0.82, 0.22, 0.45), jit(0xb4ada0, R, 0.1), local(I, x, heightAt(x, z) + 0.06, z, 0, a, 0));
  }

  // 広場の模様: 転移門を囲む2重の敷石の輪
  for (const [rr, w, c] of [[9.6, 0.5, 0x8a8478], [10.4, 0.32, 0xc8c0b0]]) {
    const k = Math.round(rr * 2 * Math.PI / 0.7);
    for (let i = 0; i < k; i++) {
      const a = i / k * Math.PI * 2, x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      B.add(BOX(0.66, 0.06, w), jit(c, R, 0.05), local(I, x, heightAt(x, z) + 0.035, z, 0, a, 0), { plain: true });
    }
  }
  // 掲示板（依頼の紙を貼った板）
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2 + 2.2, x = Math.sin(a) * 18.8, z = Math.cos(a) * 18.8;
    if (blocked(x, z, 1)) continue;
    noticeBoard(B, facing(x, z), R);
    break;
  }
  // 家並み
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) / n * Math.PI * 2;
    const r = boundR(def, angOf(Math.sin(a), Math.cos(a))) - 7.5, x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (exits.some((e) => Math.hypot(e.x - x, e.z - z) < 9) || onPath(x, z, 4.5)) continue;
    if (def.box && Math.hypot(def.box.x - x, def.box.z - z) < 7) continue;
    const kind = i % 3 === 1 ? 'tall' : i === 4 ? 'inn' : 'cottage';
    house(B, facing(x, z), R, kind, ROOFS[i % ROOFS.length]);
    // 家の脇の樽・木箱・袋、隣の家との間の柵と木
    clutter(B, local(facing(x, z), R() < 0.5 ? 4.3 : -4.3, 0, -1.6), R);
    const a2 = a + Math.PI / n, r2 = r + 1.5, x2 = Math.sin(a2) * r2, z2 = Math.cos(a2) * r2;
    if (!blocked(x2, z2, 1)) {
      const m = facing(x2, z2);
      fence(B, local(m, 0, 0, -1.2), R, 3.2);
      smallTree(B, local(m, 0, 0, 0.8), R);
    }
  }

  // 街灯と、隣の街灯との間の旗飾り
  const lamps = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.2, x = Math.sin(a) * 13, z = Math.cos(a) * 13;
    if (def.box && Math.hypot(def.box.x - x, def.box.z - z) < 4) { lamps.push(null); continue; }
    lamp(B, local(I, x, heightAt(x, z), z, 0, a, 0), R);
    lamps.push({ x, z, y: heightAt(x, z) + 3.15 });
  }
  for (let i = 0; i < lamps.length; i++) {
    const p = lamps[i], q = lamps[(i + 1) % lamps.length];
    if (p && q) bunting(B, p, q, R);
  }
  // ベンチ（街灯の間、中心向き）と花壇
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) / 8 * Math.PI * 2 + 0.2, x = Math.sin(a) * 16.5, z = Math.cos(a) * 16.5;
    if (blocked(x, z, 0.6)) continue;
    if (i % 2) bench(B, facing(x, z), R); else planter(B, facing(x, z), R);
  }
  // 露店（NPCの近く）
  for (const npc of def.npcs || []) stall(B, local(I, npc.x + 1.5, heightAt(npc.x, npc.z), npc.z - 2, 0, 0.3, 0), R, npc.color);
  // 井戸（広場の外、空いている所）
  for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2 + 0.5, x = Math.sin(a) * (plaza + 3.2), z = Math.cos(a) * (plaza + 3.2);
    if (blocked(x, z, 1.5)) continue;
    well(B, facing(x, z), R);
    break;
  }
  // 出口: 両脇の旗と道しるべ
  for (const e of exits) {
    const L = Math.hypot(e.x, e.z), ux = e.x / L, uz = e.z / L, cx = ux * (L - 6), cz = uz * (L - 6);
    for (const s of [-1, 1]) {
      const x = cx + uz * 3.4 * s, z = cz - ux * 3.4 * s;
      banner(group, anims, x, heightAt(x, z), z, Math.atan2(ux, uz), s > 0 ? 0xb0403a : 0x3a5a9a);
    }
    const sx = cx - uz * 4.6, sz = cz + ux * 4.6;
    signpost(B, local(I, sx, heightAt(sx, sz), sz, 0, Math.atan2(ux, uz), 0), R);
  }
}

// 石畳の円盤（地面の起伏に沿わせて少し浮かせる）
function makePlaza(def, rad, heightAt) {
  const g = new THREE.RingGeometry(0.001, rad, 96, 28);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, heightAt(x, z) + 0.035);
    uv.setXY(i, x / 5, z / 5);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, toon(0xe8e2d6, { map: cobbles(), noOcc: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// 家（土台・漆喰の壁・柱と梁と筋交い・窓と鎧戸と花箱・扉とひさし・板葺きの屋根・煙突）
//   M の -z が正面。kind: cottage（平屋）/ tall（2階建て、2階が少し張り出す）/ inn（横長の宿屋、吊り看板）
// ---------------------------------------------------------------------------
function house(B, M, R, kind, roofC) {
  const W = kind === 'inn' ? 8.2 : 5.6 + R() * 1.2, D = kind === 'inn' ? 5.4 : 4.4 + R() * 0.6;
  const floors = kind === 'cottage' ? 1 : 2, FH = 2.7, base = 0.6, WH = FH * floors;
  const add = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0, o) => B.add(geo, c, local(M, x, y, z, rx, ry, rz), o);
  const wood = (c = WOOD_D) => jit(c, R, 0.08), plaster = jit(PLASTER, R, 0.04);
  // 土台
  add(BOX(W + 0.5, base, D + 0.5), jit(STONE, R, 0.08), 0, base / 2, 0);
  for (let k = 0; k < 6; k++) add(BOX(0.5 + R() * 0.4, 0.22, 0.08), jit(0x7a766c, R), -W / 2 + 0.6 + k * (W - 1) / 5, 0.25 + (k % 2) * 0.2, -D / 2 - 0.26);
  // 壁（2階は前後に少し張り出す）
  for (let f = 0; f < floors; f++) {
    const ov = f ? 0.25 : 0, y0 = base + f * FH;
    add(BOX(W, FH, D + ov * 2), plaster, 0, y0 + FH / 2, 0);
    // 柱・梁
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(BOX(0.26, FH, 0.26), wood(), sx * W / 2, y0 + FH / 2, sz * (D / 2 + ov));
    for (const y of [y0 + 0.1, y0 + FH - 0.1]) for (const sz of [-1, 1]) add(BOX(W + 0.18, 0.2, 0.16), wood(), 0, y, sz * (D / 2 + ov + 0.02));
    for (const y of [y0 + 0.1, y0 + FH - 0.1]) for (const sx of [-1, 1]) add(BOX(0.16, 0.2, D + ov * 2 + 0.18), wood(), sx * (W / 2 + 0.02), y, 0);
    // 筋交い（正面の両端）
    for (const sx of [-1, 1]) add(BOX(0.14, FH * 0.8, 0.1), wood(), sx * (W / 2 - 0.55), y0 + FH / 2, -(D / 2 + ov + 0.04), 0, 0, sx * 0.42);
    if (f) for (let k = 0; k < 4; k++) add(BOX(0.18, 0.18, 0.5), wood(), -W / 2 + 0.6 + k * (W - 1.2) / 3, y0 - 0.02, -(D / 2 + 0.1)); // 張り出しの持ち送り
    // 窓
    const wy = y0 + FH * 0.52, front = -(D / 2 + ov + 0.06);
    const cols = f === 0 ? [-W * 0.3, W * 0.3] : kind === 'inn' ? [-W * 0.33, 0, W * 0.33] : [-W * 0.22, W * 0.22];
    for (const x of cols) windowAt(B, local(M, x, wy, front, 0, Math.PI, 0), R, f === 0);
    windowAt(B, local(M, -W * 0.2, wy, D / 2 + ov + 0.06, 0, 0, 0), R, false);
    windowAt(B, local(M, W / 2 + 0.06, wy, 0, 0, Math.PI / 2, 0), R, false);
  }
  // 扉（枠・ひさし・踏み石）
  const dz = -(D / 2 + 0.07);
  add(BOX(1.1, 2.0, 0.1), wood(0x5a3a24), 0, base + 1.0, dz);
  for (let k = 0; k < 3; k++) add(BOX(0.06, 1.9, 0.04), wood(0x3a2618), -0.35 + k * 0.35, base + 1.0, dz - 0.06);
  add(new THREE.SphereGeometry(0.06, 6, 4), 0xd8b050, 0.38, base + 1.0, dz - 0.1);
  for (const s of [-1, 1]) add(BOX(0.18, 2.2, 0.18), wood(), s * 0.66, base + 1.1, dz);
  add(BOX(1.7, 0.1, 0.8), jit(roofC, R), 0, base + 2.35, dz - 0.35, -0.3, 0, 0);
  add(BOX(1.4, 0.18, 0.7), jit(STONE, R), 0, 0.09, -(D / 2 + 0.6));
  for (const sx of [-1, 1]) if (R() < 0.75) pot(B, local(M, sx * 1.15, 0, -(D / 2 + 0.55)), R);
  // 屋根: 段々の板葺き（1段ごとに色と角度を少し変える）・棟木・妻壁
  const pitch = kind === 'inn' ? 0.55 : 0.68, run = D / 2 + 0.7, slope = run / Math.cos(pitch), ry0 = base + WH, rows = 7;
  for (const s of [-1, 1]) for (let i = 0; i < rows; i++) {
    const t = (i + 0.5) / rows, z = s * run * t, y = ry0 + Math.tan(pitch) * run * (1 - t) + 0.1;
    add(BOX(W + 1.0, 0.14, slope / rows + 0.14), new THREE.Color(roofC).offsetHSL((R() - 0.5) * 0.02, 0, (R() - 0.5) * 0.06 - (i % 2) * 0.035), 0, y, z, s * pitch + (R() - 0.5) * 0.03, 0, (R() - 0.5) * 0.012);
  }
  const ridgeY = ry0 + Math.tan(pitch) * run + 0.16;
  add(BOX(W + 1.1, 0.22, 0.3), wood(), 0, ridgeY, 0);
  const gable = new THREE.Shape([new THREE.Vector2(-D / 2 - 0.25, 0), new THREE.Vector2(D / 2 + 0.25, 0), new THREE.Vector2(0, Math.tan(pitch) * (D / 2 + 0.25))]);
  for (const s of [-1, 1]) {
    B.add(new THREE.ExtrudeGeometry(gable, { depth: 0.1, bevelEnabled: false }), plaster, local(M, s * (W / 2 - 0.05), ry0, 0, 0, Math.PI / 2 * s, 0));
    add(BOX(0.14, 1.2, 0.14), wood(), s * (W / 2 + 0.06), ry0 + 0.62, 0); // 妻の束
  }
  // 煙突
  const cx = W * 0.26 * (R() < 0.5 ? 1 : -1), cz = D * 0.18, ch = ridgeY - ry0 + 0.7;
  add(BOX(0.75, ch, 0.75), jit(0x8a7f74, R, 0.08), cx, ry0 + ch / 2, cz);
  add(BOX(0.95, 0.16, 0.95), jit(0x5a5650, R), cx, ry0 + ch + 0.05, cz);
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
