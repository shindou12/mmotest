// 水晶巨兵 クリスタロス: 角ばった岩の巨体から、六角柱の水晶が生えている。胸の結晶核と目の光が弱点のように光る。
// 歩き・腕の振りは animateMob の共通の部位（arms・legs2）が動かす。ここでは頭のまわりの浮かぶ欠片だけ動かす
import * as THREE from 'three';
import { toon, glow } from '../../toon.js';
import { mesh } from './boss-model-geometry.js';

// 六角柱の水晶（根元から先端へ尖る）。h: 柱の長さ / tip: 尖りの長さ
const crystalGeo = (r, h, tip) => new THREE.LatheGeometry([[0, 0], [r * 0.82, 0], [r, h * 0.12], [r * 0.92, h], [0, h + tip]].map(([x, y]) => new THREE.Vector2(x, y)), 6);
// 岩の塊（角ばった多面体）
const rockGeo = (r, detail = 0) => new THREE.DodecahedronGeometry(r, detail);

// 根元 at から、向き（rx: 前後の倒れ / rz: 左右の倒れ）に水晶を1本立てる
function crystal(parent, mat, at, r, h, rx = 0, rz = 0, ry = 0) {
  const g = new THREE.Group(); g.position.set(...at); g.rotation.set(rx, ry, rz);
  g.add(mesh(crystalGeo(r, h, r * 1.6), mat));
  parent.add(g);
  return g;
}
// 根元から放射状に何本か生えた水晶の房
function cluster(parent, mat, at, size, n, spread, lean = [0, 0]) {
  const g = new THREE.Group(); g.position.set(...at); parent.add(g);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + i * 0.7, k = i === 0 ? 1 : 0.55 + ((i * 37) % 10) / 22;
    crystal(g, mat, [Math.sin(a) * size * 0.25, 0, Math.cos(a) * size * 0.25], size * 0.18 * k, size * k, lean[0] + Math.cos(a) * spread * (i ? 1 : 0.2), lean[1] - Math.sin(a) * spread * (i ? 1 : 0.2), a);
  }
  return g;
}

export function buildCrystalos(body, accent) {
  const ac = new THREE.Color(accent);
  const M = {
    rock: toon(0x66709a, { flatShading: true }), rockD: toon(0x454c6e, { flatShading: true }), rockL: toon(0x8a93ba, { flatShading: true }),
    ice: toon(0x7fd8ff, { flatShading: true, emissive: new THREE.Color(0x2a7fb0), emissiveIntensity: 0.35 }),
    iceL: toon(0xc8f2ff, { flatShading: true, emissive: new THREE.Color(0x5ab0e0), emissiveIntensity: 0.3 }),
    core: glow(ac.clone().multiplyScalar(1.4)), eye: glow(new THREE.Color(0x9af4ff).multiplyScalar(1.6)),
  };
  body.name = 'crystalos-body';

  // 胴: 前かがみの大きな岩の胸と、細い腰
  body.add(mesh(rockGeo(0.95), M.rock, [0, 1.75, -0.05], [0.25, 0.3, 0], [1.3, 1.0, 0.95]));
  body.add(mesh(rockGeo(0.55), M.rockD, [0, 1.02, 0], [0, 0.6, 0], [1.25, 0.8, 0.95]));
  body.add(mesh(rockGeo(0.42), M.rockL, [0, 2.25, 0.32], [0.4, 0.2, 0.1], [1.4, 0.55, 0.8])); // 胸の上の張り出し
  // 胸の結晶核（ひし形の光る結晶を、岩の枠で囲む）
  const core = new THREE.Group(); core.position.set(0, 1.72, 0.92); body.add(core); // 脈打たせる入れ物
  core.add(mesh(new THREE.OctahedronGeometry(0.28), M.core, null, null, [1, 1.35, 0.7]));
  for (const s of [-1, 1]) body.add(mesh(rockGeo(0.2), M.rockD, [s * 0.34, 1.72, 0.84], [0.3, s * 0.5, 0], [0.8, 1.5, 0.7]));
  // 核から広がる光るひび
  const vein = glow(new THREE.Color(0x9af4ff).multiplyScalar(1.2));
  for (const [x, y, a, l] of [[-0.42, 1.95, 0.7, 0.42], [0.45, 1.98, -0.6, 0.38], [-0.3, 1.38, -0.9, 0.34], [0.36, 1.4, 1.0, 0.3], [0.05, 2.12, 0.1, 0.25]]) {
    body.add(mesh(new THREE.BoxGeometry(0.045, l, 0.03), vein, [x, y, 0.9 - Math.abs(x) * 0.25], [0.25, 0, a]));
  }

  // 頭: 肩に埋もれた低い頭。横一文字の光る目
  const head = new THREE.Group(); head.position.set(0, 2.62, 0.55); body.add(head);
  head.add(mesh(rockGeo(0.36), M.rockL, [0, 0, 0], [0.2, 0.7, 0], [1.3, 0.85, 1.05]));
  head.add(mesh(new THREE.BoxGeometry(0.46, 0.06, 0.05), M.eye, [0, 0.02, 0.33]));
  crystal(head, M.iceL, [0, 0.22, -0.05], 0.09, 0.35, -0.25); // 額の角

  // 背中と肩の水晶の房（いちばん目立つ輪郭）
  cluster(body, M.ice, [0, 2.35, -0.55], 1.25, 5, 0.45, [-0.35, 0]);
  for (const s of [-1, 1]) {
    cluster(body, M.ice, [s * 1.0, 2.45, -0.1], 0.95, 4, 0.4, [-0.1, -s * 0.45]);
    crystal(body, M.iceL, [s * 0.55, 1.2, -0.6], 0.12, 0.55, -0.6, -s * 0.3); // 腰の小さな水晶
  }

  // 腕: 肩の岩 → 上腕 → 水晶の籠手と大きな拳（arms は animateMob が振る）
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.name = s < 0 ? 'crystalos-arm-left' : 'crystalos-arm-right';
    arm.position.set(s * 1.3, 2.2, 0.05); body.add(arm);
    arm.add(mesh(rockGeo(0.48), M.rockD, [0, 0, 0], [0.3, 0.5, 0]));
    arm.add(mesh(rockGeo(0.32), M.rock, [s * 0.08, -0.62, 0.05], [0.4, 0.1, 0], [1, 1.35, 1]));
    // 籠手: 前腕を包む水晶
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      crystal(arm, M.ice, [s * 0.1 + Math.sin(a) * 0.2, -1.15, 0.12 + Math.cos(a) * 0.2], 0.1, 0.45, Math.cos(a) * 0.5, -Math.sin(a) * 0.5);
    }
    arm.add(mesh(rockGeo(0.5, 0), M.rockL, [s * 0.1, -1.45, 0.2], [0.6, 0.3, 0.2], [1.1, 0.9, 1.1])); // 拳
    crystal(arm, M.iceL, [s * 0.1, -1.7, 0.45], 0.12, 0.3, 2.1); // 拳の先の突起
    arms.push(arm);
  }

  // 脚: 太く短い岩の脚（legs2 は animateMob が振る）
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.5, 0.95, 0); body.add(leg);
    leg.add(mesh(rockGeo(0.36), M.rockD, [0, -0.25, 0], [0.2, 0.4, 0], [1, 1.3, 1]));
    leg.add(mesh(rockGeo(0.38), M.rock, [0, -0.78, 0.1], [0.1, 0.2, 0], [1.25, 0.6, 1.45]));
    crystal(leg, M.ice, [s * 0.25, -0.35, -0.1], 0.08, 0.35, -0.3, -s * 0.6);
    legs.push(leg);
  }

  // 頭のまわりを回る水晶の欠片
  const halo = new THREE.Group(); halo.position.set(0, 3.0, 0.1); body.add(halo);
  const shards = [];
  for (let i = 0; i < 5; i++) {
    const sh = mesh(new THREE.OctahedronGeometry(0.11), i % 2 ? M.iceL : M.core, null, null, [0.7, 1.6, 0.7]);
    halo.add(sh); shards.push(sh);
  }
  return { identity: 'crystalos', head, arms, legs2: legs, core, halo, shards };
}

export function animateCrystalos(u, s) {
  const t = s.t, wind = s.st === 2;
  u.shards.forEach((sh, i) => {
    const a = t * (wind ? 2.4 : 0.8) + (i / u.shards.length) * Math.PI * 2;
    sh.position.set(Math.sin(a) * 0.95, Math.sin(t * 1.7 + i) * 0.15, Math.cos(a) * 0.95);
    sh.rotation.y = a * 2;
  });
  u.core.scale.setScalar(1 + Math.sin(t * (wind ? 9 : 2.5)) * 0.08); // 胸の結晶核が脈打つ（溜め中は速く）
}
