// エリアの見た目: 飾りのプロップ（木・岩・花…）。種類ごとの登録表 PROPS
import * as THREE from 'three';
import { local } from './kit.js';
import { addTree, addPine, addRock } from './flora.js';

// プロップの登録表。種類（type）ごとの関数。プロップを足すときは、ここに関数を足して、エリアの props に名前を書く
// ctx: { B（まとめて描く入れ物）, M（置く位置の行列）, R（決まった乱数）, c1・c2（色）, def（エリア）, C（色の揺らぎ）, S（球） }
export const PROPS = {
  // 木・針葉樹・岩は env/flora.js（樹種・岩の型を種から選び、1本ずつ形を変える）
  tree(ctx) {
    const { B, M, R, c1, c2 } = ctx;
    addTree(B, M, R, { leaf: c1, bark: c2, fruit: 0.35 });
  },
  pine(ctx) {
    const { B, M, R, c1, c2, def } = ctx;
    addPine(B, M, R, { leaf: c1, bark: c2, snow: def.n === 6, size: 0.85 });
  },
  rock(ctx) {
    const { B, M, R, c1, def } = ctx;
    addRock(B, M, R, { color: c1, moss: def.n <= 2 ? 0.6 : 0, size: 0.9 });
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
  cloud(ctx) {
    const { B, M, R, c1, C, S } = ctx;
    for (let k = 0; k < 5; k++) B.add(S(0.8 + R() * 0.6, 12, 10), C(c1, 0.03), local(M, (R() - 0.5) * 3, 0.5 + R() * 0.4, (R() - 0.5) * 3, 0, 0, 0, 1, 0.7, 1));
  },
};

export function makeProp(B, type, M, R, c1, c2, def) {
  const C = (c, d = 0.08) => new THREE.Color(c).offsetHSL(0, 0, (R() - 0.5) * d);
  const S = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
  // 形は PROPS の登録表（種類ごと）
  if (Object.hasOwn(PROPS, type)) PROPS[type]({ B, M, R, c1, c2, def, C, S });
}
