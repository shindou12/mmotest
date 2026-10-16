// エリアの見た目: 飾りのプロップ（木・岩・花…）。種類ごとの登録表 PROPS
import * as THREE from 'three';
import { local } from './kit.js';

// プロップの登録表。種類（type）ごとの関数。プロップを足すときは、ここに関数を足して、エリアの props に名前を書く
// ctx: { B（まとめて描く入れ物）, M（置く位置の行列）, R（決まった乱数）, c1・c2（色）, def（エリア）, C（色の揺らぎ）, S（球） }
export const PROPS = {
  tree(ctx) {
    const { B, M, R, c1, c2, C, S } = ctx;
    B.add(new THREE.CylinderGeometry(0.22, 0.38, 2.6, 9), C(c2), local(M, 0, 1.3, 0));
    for (let i = 0; i < 3; i++) B.add(new THREE.ConeGeometry(0.16, 1.0, 6), C(c2), local(M, 0, 0.15, 0, 1.25, i * 2.1, 0, 1, 1, 1).multiply(local(new THREE.Matrix4(), 0, 0.4, 0)));
    B.add(new THREE.CylinderGeometry(0.06, 0.1, 1.0, 6), C(c2), local(M, 0.35, 2.2, 0, 0, 0, -0.8));
    const lc = new THREE.Color(c1);
    const clumps = [[0, 3.3, 0, 1.35], [0.8, 2.9, 0.3, 0.95], [-0.75, 3.0, -0.2, 1.0], [0.2, 4.1, -0.2, 0.95], [-0.2, 2.9, 0.75, 0.85], [0.3, 2.8, -0.8, 0.85]];
    for (const [x, y, z, r] of clumps) B.add(S(r), C(lc.clone().offsetHSL(0, 0, y > 3.5 ? 0.06 : -0.02)), local(M, x, y, z, 0, 0, 0, 1, 0.85, 1));
    if (R() < 0.35) for (let k = 0; k < 4; k++) B.add(S(0.09, 6, 4), C(0xff5a4a), local(M, (R() - 0.5) * 2, 2.7 + R() * 1.2, 0.9 + R() * 0.3));
  },
  pine(ctx) {
    const { B, M, c1, c2, def, C } = ctx;
    B.add(new THREE.CylinderGeometry(0.16, 0.3, 1.8, 8), C(c2), local(M, 0, 0.9, 0));
    for (let i = 0; i < 4; i++) {
      B.add(new THREE.ConeGeometry(1.9 - i * 0.38, 1.9, 11), C(c1, 0.06), local(M, 0, 1.8 + i * 1.05, 0, 0, i * 0.5, 0));
      if (def.n === 6) B.add(new THREE.ConeGeometry(0.9 - i * 0.18, 0.7, 11), C(0xffffff, 0.02), local(M, 0, 2.5 + i * 1.05, 0));
    }
  },
  rock(ctx) {
    const { B, M, R, c1, def, C } = ctx;
    const n = 1 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const s = k === 0 ? 1 : 0.45 + R() * 0.3;
      B.add(new THREE.DodecahedronGeometry(0.9 * s, 1), C(c1), local(M, k ? (R() - 0.5) * 2.4 : 0, 0.35 * s, k ? (R() - 0.5) * 2.4 : 0, R(), R() * 3, R(), 1.3, 0.75, 1.1), { flat: true });
    }
    if (def.n <= 2) B.add(new THREE.SphereGeometry(0.75, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.5), C(0x5a9a3a), local(M, 0, 0.55, 0, 0, 0, 0, 1.2, 0.5, 1));
  },
  flower(ctx) {
    const { B, M, R, c1, c2, C, S } = ctx;
    const fc = R() < 0.5 ? c1 : c2;
    B.add(new THREE.CylinderGeometry(0.015, 0.02, 0.4, 4), C(0x3a7a2a), local(M, 0, 0.2, 0));
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; B.add(S(0.07, 6, 4), C(fc), local(M, Math.sin(a) * 0.08, 0.42, Math.cos(a) * 0.08, 0, 0, 0, 1, 0.5, 1)); }
    B.add(S(0.05, 6, 4), C(0xffffff), local(M, 0, 0.44, 0));
  },
  mushroom(ctx) {
    const { B, M, R, c1, c2, C, S } = ctx;
    for (let k = 0; k < 1 + Math.floor(R() * 3); k++) {
      const s = k ? 0.5 + R() * 0.3 : 1, ox = k ? (R() - 0.5) * 1.4 : 0, oz = k ? (R() - 0.5) * 1.4 : 0;
      B.add(new THREE.CylinderGeometry(0.13 * s, 0.2 * s, 0.9 * s, 8), C(c2), local(M, ox, 0.45 * s, oz));
      B.add(new THREE.SphereGeometry(0.6 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), C(c1), local(M, ox, 0.85 * s, oz, 0, 0, 0, 1, 0.75, 1));
      for (let j = 0; j < 5; j++) { const a = j * 1.3; B.add(S(0.07 * s, 6, 4), new THREE.Color(0xfff8e0), local(M, ox + Math.sin(a) * 0.4 * s, 1.08 * s, oz + Math.cos(a) * 0.4 * s), { glowing: true }); }
    }
  },
  cactus(ctx) {
    const { B, M, R, c1, C, S } = ctx;
    B.add(new THREE.CapsuleGeometry(0.34, 2.2, 4, 10), C(c1), local(M, 0, 1.4, 0));
    for (const s of [-1, 1]) {
      const h = 1.3 + R() * 0.6;
      B.add(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), C(c1), local(M, s * 0.45, h, 0, 0, 0, s * 1.4));
      B.add(new THREE.CapsuleGeometry(0.2, 0.6, 4, 8), C(c1), local(M, s * 0.7, h + 0.45, 0));
    }
    if (R() < 0.4) B.add(S(0.15, 8, 6), C(0xff6a9a), local(M, 0, 2.7, 0));
  },
  bones(ctx) {
    const { B, M, c1, C, S } = ctx;
    B.add(S(0.3, 10, 8), C(c1), local(M, 0.6, 0.25, 0, 0, 0, 0, 1, 0.9, 1.2));
    for (let k = 0; k < 4; k++) B.add(new THREE.TorusGeometry(0.6 - k * 0.05, 0.05, 5, 12, Math.PI), C(c1), local(M, -0.3 + k * -0.35, 0.05, 0, 0, Math.PI / 2, 0));
    B.add(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6), C(c1), local(M, -0.8, 0.1, 0, 0, 0, Math.PI / 2));
  },
  crystal(ctx) {
    const { B, M, R, c1, c2, C } = ctx;
    B.add(new THREE.DodecahedronGeometry(0.6, 0), C(0x3a3a50), local(M, 0, 0.15, 0, 0, 0, 0, 1.3, 0.5, 1.3), { flat: true });
    for (let k = 0; k < 2 + Math.floor(R() * 4); k++) {
      const cc = new THREE.Color(R() < 0.6 ? c1 : (c2 ?? c1));
      B.add(new THREE.OctahedronGeometry(0.4, 0), cc.multiplyScalar(1.1), local(M, (R() - 0.5) * 1.0, 0.8 + R() * 0.5, (R() - 0.5) * 1.0, (R() - 0.5) * 0.7, R() * 3, (R() - 0.5) * 0.7, 0.55, 2 + R() * 2.4, 0.55), { glowing: true });
    }
  },
  stalag(ctx) {
    const { B, M, R, c1, C } = ctx;
    B.add(new THREE.ConeGeometry(0.6, 3 + R() * 3, 8), C(c1), local(M, 0, 1.5, 0), { flat: true });
    B.add(new THREE.ConeGeometry(0.3, 1.5, 7), C(c1), local(M, 0.6, 0.75, 0.2), { flat: true });
  },
  lavarock(ctx) {
    const { B, M, R, c1, c2, C } = ctx;
    B.add(new THREE.DodecahedronGeometry(1, 1), C(c1), local(M, 0, 0.45, 0, R(), R(), R(), 1.4, 0.9, 1.2), { flat: true });
    for (let k = 0; k < 3; k++) B.add(new THREE.BoxGeometry(0.06, 0.06, 1.2), new THREE.Color(c2).multiplyScalar(1.4), local(M, (R() - 0.5) * 0.8, 0.5 + R() * 0.5, (R() - 0.5) * 0.5, R(), R() * 3, 0, 1, 1, 1), { glowing: true });
  },
  lavapool(ctx) {
    const { B, M, R, c1, C } = ctx;
    const r = 1.5 + R() * 2;
    B.add(new THREE.CircleGeometry(r, 16), new THREE.Color(c1).multiplyScalar(0.85), local(M, 0, 0.15, 0, -Math.PI / 2, 0, 0), { glowing: true });
    B.add(new THREE.CircleGeometry(r * 0.45, 12), new THREE.Color(0xff9a30), local(M, 0.2, 0.17, 0.1, -Math.PI / 2, 0, 0), { glowing: true });
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; B.add(new THREE.DodecahedronGeometry(0.35 + R() * 0.2, 0), C(0x2a1a1a), local(M, Math.sin(a) * r, 0.1, Math.cos(a) * r), { flat: true }); }
  },
  spike(ctx) {
    const { B, M, R, c1, C } = ctx;
    B.add(new THREE.ConeGeometry(0.5, 3 + R() * 3, 6), C(c1), local(M, 0, 1.4, 0, 0, 0, (R() - 0.5) * 0.4), { flat: true });
    B.add(new THREE.ConeGeometry(0.3, 1.6, 6), C(c1), local(M, 0.5, 0.7, 0.3, 0, 0, -0.4), { flat: true });
  },
  icespike(ctx) {
    const { B, M, R, c1, C } = ctx;
    for (let k = 0; k < 2 + Math.floor(R() * 3); k++) B.add(new THREE.ConeGeometry(0.45, 2.5 + R() * 3, 6), C(c1, 0.04), local(M, (R() - 0.5) * 1.6, 1.1, (R() - 0.5) * 1.6, (R() - 0.5) * 0.6, 0, (R() - 0.5) * 0.6), { flat: true });
    B.add(new THREE.ConeGeometry(0.15, 0.8, 6), new THREE.Color(0xd0f4ff).multiplyScalar(1.2), local(M, 0, 0.4, 0), { glowing: true });
  },
  pillar(ctx) {
    const { B, M, R, c1, C } = ctx;
    const broken = R() < 0.4, h = broken ? 1.5 + R() * 3 : 5 + R() * 4;
    B.add(new THREE.BoxGeometry(1.7, 0.5, 1.7), C(c1), local(M, 0, 0.25, 0));
    B.add(new THREE.CylinderGeometry(0.55, 0.62, h, 16), C(c1, 0.04), local(M, 0, 0.5 + h / 2, 0, broken ? 0.12 : 0, 0, 0));
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; B.add(new THREE.BoxGeometry(0.06, h * 0.92, 0.06), C(c1, 0.0).multiplyScalar(0.8), local(M, Math.sin(a) * 0.58, 0.5 + h / 2, Math.cos(a) * 0.58, 0, a, 0)); }
    if (!broken) { B.add(new THREE.BoxGeometry(1.6, 0.45, 1.6), C(c1), local(M, 0, h + 0.7, 0)); B.add(new THREE.CylinderGeometry(0.8, 0.6, 0.3, 16), C(c1), local(M, 0, h + 0.4, 0)); }
    else for (let k = 0; k < 3; k++) B.add(new THREE.DodecahedronGeometry(0.35, 0), C(c1), local(M, (R() - 0.5) * 3, 0.25, (R() - 0.5) * 3), { flat: true });
  },
  coral(ctx) {
    const { B, M, R, c1, c2, C, S } = ctx;
    const cc = R() < 0.5 ? c1 : c2;
    for (let k = 0; k < 5; k++) {
      const rx = (R() - 0.5) * 1.0, rz = (R() - 0.5) * 1.0, h = 1 + R() * 1.2;
      B.add(new THREE.CapsuleGeometry(0.08, h, 3, 6), C(cc), local(M, rx * 0.6, h / 2, rz * 0.6, rx, 0, rz));
      B.add(S(0.12, 6, 4), new THREE.Color(cc).multiplyScalar(1.4), local(M, rx * 0.6 + Math.sin(rz) * h * 0.5, h, rz * 0.6 - Math.sin(rx) * h * 0.5), { glowing: true });
    }
  },
  spire(ctx) {
    const { B, M, R, c1, c2, C, S } = ctx;
    const h = 7 + R() * 10;
    B.add(new THREE.ConeGeometry(1.3, h, 7), C(c1), local(M, 0, h / 2, 0), { flat: true });
    for (let k = 0; k < 3; k++) B.add(new THREE.TorusGeometry(1.0 - k * 0.25, 0.06, 5, 20), new THREE.Color(c2).multiplyScalar(1.3), local(M, 0, h * (0.3 + k * 0.2), 0, Math.PI / 2, 0, 0), { glowing: true });
    B.add(S(0.4, 10, 8), new THREE.Color(c2).multiplyScalar(1.8), local(M, 0, h + 0.4, 0), { glowing: true });
  },
  voidcube(ctx) {
    const { B, M, R, c1, c2, C } = ctx;
    const y = 1.5 + R() * 4;
    B.add(new THREE.BoxGeometry(1.2, 1.2, 1.2), C(c1), local(M, 0, y, 0, R() * 3, R() * 3, R() * 3));
    B.add(new THREE.OctahedronGeometry(0.3), new THREE.Color(c2).multiplyScalar(1.5), local(M, 0, y, 0), { glowing: true });
    B.add(new THREE.TorusGeometry(1.1, 0.03, 4, 24), new THREE.Color(c2).multiplyScalar(1.2), local(M, 0, y, 0, R() * 3, R() * 3, 0), { glowing: true });
  },
  // 段階2以上の群れで使う小物（低木・小石・切り株・倒木）
  bush(ctx) {
    const { B, M, R, c1, C, S } = ctx;
    const lc = new THREE.Color(c1).offsetHSL(0, 0, -0.04);
    for (let k = 0; k < 3; k++) B.add(S(0.55 + R() * 0.25, 9, 7), C(lc.clone().offsetHSL(0, 0, k === 0 ? 0.03 : 0)), local(M, (R() - 0.5) * 0.9, 0.35, (R() - 0.5) * 0.9, 0, 0, 0, 1, 0.75, 1));
  },
  pebble(ctx) {
    const { B, M, R, c1, C } = ctx;
    B.add(new THREE.DodecahedronGeometry(0.16 + R() * 0.12, 0), C(c1, 0.12), local(M, 0, 0.05, 0, R(), R() * 3, R(), 1.3, 0.6, 1), { flat: true });
  },
  stump(ctx) {
    const { B, M, c1, c2, C } = ctx;
    B.add(new THREE.CylinderGeometry(0.45, 0.6, 0.6, 10), C(c2), local(M, 0, 0.3, 0));
    B.add(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 10), C(0xc8a878), local(M, 0, 0.61, 0));
    B.add(new THREE.SphereGeometry(0.3, 8, 6), C(c1), local(M, 0.35, 0.15, 0.2, 0, 0, 0, 1, 0.4, 1));
  },
  log(ctx) {
    const { B, M, c1, c2, C } = ctx;
    B.add(new THREE.CylinderGeometry(0.35, 0.4, 3.2, 10), C(c2), local(M, 0, 0.32, 0, 0, 0, Math.PI / 2));
    B.add(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 10), C(0xc8a878), local(M, 1.61, 0.32, 0, 0, 0, Math.PI / 2));
    B.add(new THREE.SphereGeometry(0.4, 8, 6), C(c1), local(M, -0.4, 0.6, 0, 0, 0, 0, 1.6, 0.35, 0.9));
  },
  cloud(ctx) {
    const { B, M, R, c1, C, S } = ctx;
    for (let k = 0; k < 5; k++) B.add(S(0.8 + R() * 0.6, 12, 10), C(c1, 0.03), local(M, (R() - 0.5) * 3, 0.5 + R() * 0.4, (R() - 0.5) * 3, 0, 0, 0, 1, 0.7, 1));
  },
};

// 作り込み版（見た目の段階3以上）。形のばらつき・根元・陰影（下を暗く上を明るく）・苔などを足す
export const PROPS_HQ = {
  tree(ctx) {
    const { B, M, R, c1, c2, C } = ctx;
    const kind = R(), tall = kind < 0.25, wide = kind > 0.75;
    const th = tall ? 3.4 : 2.6, tw = wide ? 0.46 : 0.36;
    B.add(new THREE.CylinderGeometry(tw * 0.55, tw, th, 8), C(c2), local(M, 0, th / 2, 0, (R() - 0.5) * 0.08, 0, (R() - 0.5) * 0.08), { flat: true });
    // 根の張り出し
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + R(); B.add(new THREE.ConeGeometry(0.16, 0.9, 5), C(c2, 0.1), local(M, Math.sin(a) * tw * 0.8, 0.18, Math.cos(a) * tw * 0.8, Math.cos(a) * 1.15, 0, -Math.sin(a) * 1.15), { flat: true }); }
    // 枝
    for (let i = 0; i < 2; i++) { const a = R() * Math.PI * 2; B.add(new THREE.CylinderGeometry(0.05, 0.11, 1.3, 5), C(c2), local(M, Math.sin(a) * 0.35, th * 0.8, Math.cos(a) * 0.35, Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9), { flat: true }); }
    // 葉のかたまり: 下は暗く、上ほど明るい。形は 丸・縦長・横広
    const lc = new THREE.Color(c1), hue = (R() - 0.5) * 0.03;
    const n = 7 + Math.floor(R() * 4), base = th + 0.4;
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + R(), up = i / n, rr = (wide ? 1.35 : tall ? 0.6 : 0.95) * (1 - up * 0.45) * (0.8 + R() * 0.4);
      const y = base + up * (tall ? 2.6 : 1.6) + (R() - 0.5) * 0.3, r = (wide ? 1.0 : 0.85) * (1.1 - up * 0.35) * (0.8 + R() * 0.35);
      const col = lc.clone().offsetHSL(hue, 0.02, -0.08 + up * 0.16 + (R() - 0.5) * 0.03);
      B.add(new THREE.IcosahedronGeometry(r, 1), col, local(M, Math.sin(a) * rr, y, Math.cos(a) * rr, R(), R() * 3, R(), 1, tall ? 1.25 : 0.85, 1), { flat: true });
    }
    B.add(new THREE.IcosahedronGeometry(wide ? 1.2 : 0.9, 1), lc.clone().offsetHSL(hue, 0.03, 0.1), local(M, 0, base + (tall ? 3.1 : 2.0), 0, 0, R() * 3, 0, 1, tall ? 1.3 : 0.8, 1), { flat: true });
    if (R() < 0.3) for (let k = 0; k < 5; k++) B.add(new THREE.SphereGeometry(0.09, 6, 4), C(0xff5a4a), local(M, (R() - 0.5) * 2.2, base + R() * 1.2, (R() - 0.5) * 2.2));
  },
  rock(ctx) {
    const { B, M, R, c1, def, C } = ctx;
    const n = 1 + Math.floor(R() * 3), rc = new THREE.Color(c1);
    for (let k = 0; k < n; k++) {
      const s = k === 0 ? 1 : 0.4 + R() * 0.3, x = k ? (R() - 0.5) * 2.2 : 0, z = k ? (R() - 0.5) * 2.2 : 0, rot = [R() * 0.4, R() * 3, R() * 0.4];
      // 下半分は暗く沈め、上に明るい面を重ねて、地面から生えた重さを出す
      B.add(new THREE.DodecahedronGeometry(0.95 * s, 1), rc.clone().multiplyScalar(0.78), local(M, x, 0.15 * s, z, ...rot, 1.4, 0.55, 1.15), { flat: true });
      B.add(new THREE.DodecahedronGeometry(0.85 * s, 1), C(rc.clone().offsetHSL(0, 0, 0.03)), local(M, x + 0.08 * s, 0.45 * s, z, rot[0] + 0.3, rot[1] + 0.7, rot[2], 1.2, 0.75, 1.0), { flat: true });
      if (def.n <= 2 && R() < 0.75) B.add(new THREE.IcosahedronGeometry(0.62 * s, 1), C(0x5f9a3c, 0.1), local(M, x + 0.1 * s, 0.86 * s, z, 0, R() * 3, 0, 1.25, 0.32, 1.05), { flat: true });
    }
  },
  flower(ctx) {
    const { B, M, R, c1, c2, C, S } = ctx;
    // 1株に数本。葉を2枚、花びらは輪に6枚
    const fc = R() < 0.5 ? c1 : c2, n = 2 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const x = (R() - 0.5) * 0.4, z = (R() - 0.5) * 0.4, h = 0.3 + R() * 0.2;
      B.add(new THREE.CylinderGeometry(0.012, 0.018, h, 4), C(0x3a7a2a), local(M, x, h / 2, z));
      B.add(new THREE.ConeGeometry(0.05, 0.22, 3), C(0x4a8a32), local(M, x + 0.05, 0.08, z, 0, R() * 3, 0.9));
      for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2; B.add(S(0.055, 5, 4), C(fc, 0.1), local(M, x + Math.sin(a) * 0.07, h + 0.02, z + Math.cos(a) * 0.07, 0, 0, 0, 1, 0.45, 1)); }
      B.add(S(0.045, 5, 4), C(0xfff2a0), local(M, x, h + 0.04, z));
    }
  },
  bush(ctx) {
    const { B, M, R, c1, C } = ctx;
    const lc = new THREE.Color(c1);
    const n = 4 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const a = k * 2.3, d = k ? 0.45 : 0, up = k ? 0 : 0.15;
      B.add(new THREE.IcosahedronGeometry(0.45 + R() * 0.2, 1), C(lc.clone().offsetHSL(0, 0, -0.07 + up + (k ? 0 : 0.05)), 0.05), local(M, Math.sin(a) * d, 0.32 + up, Math.cos(a) * d, R(), R() * 3, R(), 1, 0.78, 1), { flat: true });
    }
    if (R() < 0.35) for (let k = 0; k < 4; k++) B.add(new THREE.SphereGeometry(0.06, 6, 4), new THREE.Color(R() < 0.5 ? 0xfff0f0 : 0xffe36b), local(M, (R() - 0.5) * 1.0, 0.6 + R() * 0.15, (R() - 0.5) * 1.0));
  },
};

export function makeProp(B, type, M, R, c1, c2, def, q = 1) {
  const C = (c, d = 0.08) => new THREE.Color(c).offsetHSL(0, 0, (R() - 0.5) * d);
  const S = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
  // 形は PROPS の登録表（種類ごと）。段階3以上で作り込み版があればそちら
  const table = q >= 3 && Object.hasOwn(PROPS_HQ, type) ? PROPS_HQ : PROPS;
  if (Object.hasOwn(table, type)) table[type]({ B, M, R, c1, c2, def, C, S });
}
