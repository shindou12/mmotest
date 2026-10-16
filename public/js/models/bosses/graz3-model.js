// コボルド王 グラズ（作り込みの段階 3）の形。graz-model.js（段階 1）と同じ部位の名前・支点の位置にそろえてあるので、
// 技の動き（GRAZ_MOTIONS）と共通の歩き・振りがそのまま使える。光の部品は graz-fx.js が上に重ねる。
// 段階 1 との違い: 面の数を増やしたなめらかな形 / 鼻づらと顎・眉・傷のある顔 / 重なった肩当てと腹の小札 / 指で剣を握る籠手 /
//   溝と刃こぼれのある剣 / 鋲と浮き彫りの盾 / ひだと裾の破れたマント・毛皮の襟 / 爪のある足と膝当て / ふさふさの尻尾
import * as THREE from 'three';
import { toon, glow } from '../../toon.js';

function mesh(geometry, material, position, rotation, scale) {
  const part = new THREE.Mesh(geometry, material);
  if (position) part.position.set(...position);
  if (rotation) part.rotation.set(...rotation);
  if (scale) part.scale.set(...scale);
  part.castShadow = true;
  return part;
}
function shape(points, depth = 0.06, bevel = 0.012, seg = 1) {
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))), {
    depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: seg, curveSegments: 3,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}
const sphere = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const cylinder = (top, bottom, height, segments = 12) => new THREE.CylinderGeometry(top, bottom, height, segments);
const capsule = (r, height) => new THREE.CapsuleGeometry(r, height, 3, 10);
const lathe = (points, seg = 20) => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg);
// 半球の殻（肩当て・肘当て・膝当て）
const dome = (r, cut = 0.55) => new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI * cut);
// 帯の一部（腹の小札・王冠の縁）
const band = (r0, r1, h, from, len, seg = 20) => new THREE.CylinderGeometry(r0, r1, h, seg, 1, true, from, len);

// 王の大鉈: 溝（樋）と刃こぼれのある幅広の刃、巻き付けた柄、金の鍔と柄頭の宝石。刃は +Y（段階 1 と同じ向き）
export function royalCleaver(M) {
  const sword = new THREE.Group(); sword.name = 'graz-royal-cleaver';
  const blade = [[-0.15, 0.24], [0.18, 0.24], [0.24, 1.2], [0.2, 1.3], [0.245, 1.38], [0.23, 1.72], [0.17, 1.82], [0.215, 1.92], [0.14, 2.07], [-0.09, 2.2], [-0.23, 1.9], [-0.21, 0.55]];
  sword.add(mesh(shape(blade, 0.1, 0.016, 2), M.steel));
  sword.add(mesh(shape([[-0.15, 0.3], [-0.085, 0.3], [-0.115, 1.86], [-0.08, 2.14], [-0.2, 1.88]], 0.112, 0.004), M.edge)); // 刃先の明るい縁
  sword.add(mesh(shape([[-0.02, 0.42], [0.05, 0.42], [0.075, 1.7], [0.025, 1.9], [-0.04, 1.72]], 0.118, 0.004), M.steelD)); // 樋
  for (const y of [0.7, 1.05, 1.42]) sword.add(mesh(shape([[0, 0], [0.05, 0.03], [0, 0.06]], 0.12, 0), M.steelD, [0.205, y, 0])); // 峰の刻み
  // 鍔: 左右に巻いた金の腕と、中央の宝石
  sword.add(mesh(shape([[-0.4, 0.15], [-0.32, 0.27], [-0.1, 0.23], [0, 0.32], [0.12, 0.23], [0.37, 0.22], [0.42, 0.11], [0.13, 0.11], [0, 0.18], [-0.12, 0.11]], 0.15, 0.02, 2), M.gold));
  for (const s of [-1, 1]) sword.add(mesh(new THREE.TorusGeometry(0.06, 0.022, 8, 16, Math.PI * 1.5), M.gold, [s * 0.42, 0.19, 0], [0, 0, s > 0 ? 0 : Math.PI]));
  sword.add(mesh(new THREE.OctahedronGeometry(0.07), M.amber, [0, 0.21, 0.1], null, [0.85, 1.2, 0.45]));
  // 柄: 革を斜めに巻いた段と金の留め具
  sword.add(mesh(cylinder(0.058, 0.064, 0.34, 12), M.leather, [0, -0.01, 0]));
  for (let i = 0; i < 6; i++) sword.add(mesh(new THREE.TorusGeometry(0.064, 0.012, 6, 14), M.leatherL, [0, -0.15 + i * 0.055, 0], [Math.PI / 2 + 0.25, 0, 0]));
  sword.add(mesh(cylinder(0.075, 0.07, 0.04, 12), M.gold, [0, -0.19, 0]));
  sword.add(mesh(new THREE.OctahedronGeometry(0.1), M.gold, [0, -0.27, 0], null, [1, 1.25, 1]));
  sword.add(mesh(sphere(0.045, 10, 8), M.amber, [0, -0.27, 0.07], null, [1, 1, 0.5]));
  return sword;
}

// 王の盾: 金の縁に鋲を並べ、鉄の面に赤い帯と王冠の浮き彫り、中央に盾の突起
export function kingShield(M) {
  const shield = new THREE.Group(); shield.name = 'graz-king-shield';
  const rim = [[-0.37, 0.4], [-0.23, 0.54], [0.23, 0.54], [0.39, 0.37], [0.34, -0.3], [0, -0.69], [-0.34, -0.3]];
  shield.add(mesh(shape(rim, 0.11, 0.02, 2), M.gold));
  shield.add(mesh(shape(rim.map(([x, y]) => [x * 0.86, y * 0.86]), 0.12, 0.01), M.iron, [0, 0, 0.015]));
  shield.add(mesh(shape([[-0.14, 0.38], [0.14, 0.38], [0.14, -0.3], [0, -0.5], [-0.14, -0.3]], 0.04, 0.006), M.red, [0, 0, 0.09]));
  shield.add(mesh(shape([[-0.19, 0.17], [-0.18, 0.33], [-0.085, 0.24], [0, 0.39], [0.085, 0.24], [0.18, 0.33], [0.19, 0.17]], 0.04, 0.006), M.gold, [0, 0, 0.125]));
  shield.add(mesh(dome(0.11, 0.5), M.gold, [0, -0.06, 0.1], [Math.PI / 2, 0, 0])); // 盾の突起
  shield.add(mesh(sphere(0.04, 10, 8), M.amber, [0, -0.06, 0.2]));
  // 縁の鋲（形に沿って等間隔）
  for (let i = 0; i < rim.length; i++) {
    const [x0, y0] = rim[i], [x1, y1] = rim[(i + 1) % rim.length];
    for (const k of [0.25, 0.75]) shield.add(mesh(sphere(0.028, 8, 6), M.edge, [(x0 + (x1 - x0) * k) * 0.93, (y0 + (y1 - y0) * k) * 0.93, 0.07], null, [1, 1, 0.5]));
  }
  // 刃の当たった傷
  for (const [x, y, a] of [[0.2, 0.15, 0.6], [-0.22, -0.12, -0.4]]) shield.add(mesh(new THREE.BoxGeometry(0.16, 0.012, 0.01), M.edge, [x, y, 0.082], [0, 0, a]));
  return shield;
}

// 籠手の手: 掌と、柄に巻きつく4本の指（握る位置 grip の中に置く）
export function gauntletHand(M, s) {
  const hand = new THREE.Group();
  hand.add(mesh(sphere(0.115, 14, 10), M.iron, null, null, [1, 0.85, 1.05]));
  for (let i = 0; i < 4; i++) hand.add(mesh(new THREE.TorusGeometry(0.075, 0.03, 6, 10, Math.PI * 1.2), M.steelD, [s * 0.02, -0.06 + i * 0.045, 0.02], [0, Math.PI / 2, -0.4]));
  hand.add(mesh(capsule(0.03, 0.06), M.steelD, [s * -0.07, 0.04, 0.07], [0.6, 0, s * 0.5])); // 親指
  return hand;
}

export function grazCrown(M) {
  // 王冠: 上下の縁を持つ金の輪と5つの尖り（先に小さな玉）、正面の大きな宝石
  const crown = new THREE.Group(); crown.name = 'graz-crown'; crown.position.set(0, 0.325, 0);
  crown.add(mesh(new THREE.CylinderGeometry(0.258, 0.272, 0.12, 24, 1, true), M.gold));
  for (const y of [-0.06, 0.06]) crown.add(mesh(new THREE.TorusGeometry(0.265, 0.018, 6, 28), M.goldD, [0, y, 0], [Math.PI / 2, 0, 0]));
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5, x = Math.sin(a) * 0.25, z = Math.cos(a) * 0.25, h = i === 0 ? 0.24 : 0.17;
    crown.add(mesh(shape([[-0.06, 0], [0.06, 0], [0.028, 0.075], [0, h], [-0.028, 0.075]], 0.035, 0.008), M.gold, [x, 0.04, z], [0, a, 0]));
    crown.add(mesh(sphere(0.022, 8, 6), i === 0 ? M.amber : M.edge, [x * 1.02, 0.04 + h + 0.01, z * 1.02]));
  }
  crown.add(mesh(new THREE.OctahedronGeometry(0.06), M.amber, [0, 0, 0.29], null, [0.9, 1.25, 0.6]));
  return crown;
}

export function grazCape(M) {
  // マント: ひだのある布（裾は破れて互い違い）、上に毛皮の襟
  const cape = new THREE.Group(); cape.name = 'graz-cape'; cape.position.set(0, 0.85, -0.05);
  const clothGeo = new THREE.CylinderGeometry(0.4, 0.68, 1.36, 28, 8, true, Math.PI * 0.68, Math.PI * 0.64);
  const p = clothGeo.attributes.position, uv = clothGeo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), u = uv.getX(i), down = (0.68 - y) / 1.36; // down: 上 0 → 裾 1
    const fold = Math.sin(u * Math.PI * 9) * 0.045 * (0.3 + down); // 縦のひだ
    const r = Math.hypot(x, z), k = (r + fold) / r;
    const tear = down > 0.95 ? (Math.floor(u * 9) % 2) * 0.12 + Math.sin(u * 40) * 0.02 : 0; // 破れた裾
    p.setXYZ(i, x * k, y + tear, z * k);
  }
  clothGeo.computeVertexNormals();
  const cloth = mesh(clothGeo, toon(0x953749, { side: THREE.DoubleSide }), [0, 0.07, -0.045]);
  cloth.userData.noOutline = true; cape.add(cloth);
  cape.add(mesh(new THREE.TorusGeometry(0.42, 0.075, 8, 20, Math.PI * 0.75), M.furLight, [0, 0.72, -0.06], [Math.PI / 2, 0, Math.PI * 1.125], [1, 0.75, 0.8]));
  return cape;
}

// 段階 3 以上のグラズで使う色（toon の材質）
export function grazMaterials(accent) {
  return {
    fur: toon(0x986348), furLight: toon(0xc6976d), furDark: toon(0x613f32),
    iron: toon(0x35444c), steel: toon(0x6f8089), steelD: toon(0x4b5962), edge: toon(0xd0dde2),
    gold: toon(0xd9aa50), goldD: toon(0xa47a32), leather: toon(0x47352e), leatherL: toon(0x6a5040), red: toon(0x953749),
    ivory: toon(0xe5d5b4), black: toon(0x231e23), ear: toon(0x6c3c3a), scar: toon(0xd8b49a),
    amber: glow(new THREE.Color(accent).multiplyScalar(1.6)),
  };
}

export function buildGrazHQ(body, accent) {
  const M = grazMaterials(accent);
  body.name = 'graz-body';
  const parts = { identity: 'graz' };

  // 胴: なめらかな胴（鉄の下着）→ 胸当て（左右の胸板と金の縁）→ 腹の小札 → 帯と金の留め具・小物入れ
  body.add(mesh(lathe([[0, 0.92], [0.34, 0.95], [0.45, 1.1], [0.5, 1.36], [0.47, 1.6], [0.33, 1.76], [0, 1.8]]), M.iron));
  for (const s of [-1, 1]) {
    const plate = [[0, 1.3], [0.05, 1.68], [0.2, 1.72], [0.38, 1.6], [0.44, 1.38], [0.36, 1.28], [0.12, 1.26]].map(([x, y]) => [s * x, y]);
    body.add(mesh(shape(plate, 0.08, 0.024, 2), M.steel, [0, 0, 0.4], [0, s * -0.18, 0]));
    body.add(mesh(shape(plate.map(([x, y]) => [x * 1.05, 1.49 + (y - 1.49) * 1.06]), 0.05, 0.01), M.gold, [0, 0, 0.37], [0, s * -0.18, 0]));
  }
  body.add(mesh(shape([[-0.05, 1.28], [0.05, 1.28], [0.035, 1.66], [0, 1.72], [-0.035, 1.66]], 0.06, 0.006), M.gold, [0, 0, 0.46])); // 胸の中央の筋
  for (let i = 0; i < 3; i++) body.add(mesh(band(0.47 - i * 0.025, 0.45 - i * 0.025, 0.1, -Math.PI * 0.42, Math.PI * 0.84), M.steelD, [0, 1.22 - i * 0.08, 0.01])); // 腹の小札
  body.add(mesh(new THREE.TorusGeometry(0.43, 0.05, 8, 28), M.leather, [0, 1.0, 0], [Math.PI / 2, 0, 0], [1, 1, 1.4]));
  body.add(mesh(shape([[-0.11, -0.08], [0.11, -0.08], [0.13, 0.08], [-0.13, 0.08]], 0.05, 0.012), M.gold, [0, 1.0, 0.43]));
  body.add(mesh(sphere(0.04, 10, 8), M.amber, [0, 1.0, 0.47], null, [1, 1, 0.5]));
  for (const s of [-1, 1]) body.add(mesh(new THREE.BoxGeometry(0.14, 0.12, 0.09), M.leatherL, [s * 0.36, 0.95, 0.24], [0, s * 0.6, 0])); // 小物入れ
  // 腰当て: 前の2枚と横の2枚。鋲付き
  for (const [x, z, ry, rz] of [[-0.18, 0.33, 0.25, 0.1], [0.18, 0.33, -0.25, -0.1], [-0.38, 0.05, 1.3, 0.18], [0.38, 0.05, -1.3, -0.18]]) {
    const g = new THREE.Group(); g.position.set(x, 0.82, z); g.rotation.set(0.12, ry, rz); body.add(g);
    g.add(mesh(shape([[-0.13, 0.12], [0.13, 0.12], [0.16, -0.24], [0, -0.3], [-0.16, -0.24]], 0.06, 0.012), M.iron));
    g.add(mesh(shape([[-0.12, -0.2], [0.12, -0.2], [0, -0.27]], 0.065, 0.004), M.gold));
    for (const dx of [-0.08, 0.08]) g.add(mesh(sphere(0.022, 8, 6), M.edge, [dx, 0.06, 0.035]));
  }
  body.add(mesh(shape([[-0.12, 0.16], [0.12, 0.16], [0.11, -0.46], [0, -0.56], [-0.11, -0.46]], 0.03, 0.005), M.red, [0, 0.78, 0.42])); // 前垂れ
  body.add(mesh(new THREE.TorusGeometry(0.32, 0.09, 8, 24), M.furLight, [0, 1.8, -0.02], [Math.PI / 2, 0, 0], [1, 0.9, 0.7])); // 首の毛皮の襟

  // 頭: 丸い頭蓋 → 前へ伸びる鼻づらと下顎（牙）→ 怒った眉・光る目・左目の傷 → 長い耳 → 王冠
  const head = new THREE.Group(); head.name = 'graz-head'; head.position.set(0, 2, 0); body.add(head);
  head.add(mesh(sphere(0.34), M.fur, [0, 0.08, 0], null, [1.05, 1.0, 0.92]));
  head.add(mesh(cylinder(0.15, 0.24, 0.36, 16), M.furLight, [0, -0.08, 0.32], [Math.PI / 2 - 0.12, 0, 0], [1.15, 1, 0.85])); // 鼻づら
  head.add(mesh(sphere(0.15, 14, 10), M.furLight, [0, -0.06, 0.48], null, [1.1, 0.8, 0.9]));
  head.add(mesh(sphere(0.085, 12, 8), M.black, [0, -0.01, 0.6], null, [1.3, 0.8, 0.8])); // 鼻
  head.add(mesh(cylinder(0.1, 0.15, 0.28, 14), M.furDark, [0, -0.22, 0.27], [Math.PI / 2 - 0.3, 0, 0], [1.05, 1, 0.6])); // 下顎
  head.add(mesh(shape([[-0.1, 0], [0, -0.025], [0.1, 0], [0.07, -0.035], [0, -0.05], [-0.07, -0.035]], 0.02, 0.003), M.black, [0, -0.16, 0.44], [0.3, 0, 0]));
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.ConeGeometry(0.03, 0.12, 8), M.ivory, [s * 0.09, -0.2, 0.4], [Math.PI - 0.25, 0, s * 0.15])); // 上の牙
    head.add(mesh(new THREE.ConeGeometry(0.022, 0.08, 8), M.ivory, [s * 0.07, -0.25, 0.37], [-0.2, 0, -s * 0.1])); // 下の牙
    // 眉（内側が下がった怒り顔）と目
    head.add(mesh(shape([[-0.1, 0.02], [0.09, 0.05], [0.1, 0.0], [-0.09, -0.04]].map(([x, y]) => [s * x, y]), 0.08, 0.012), M.furDark, [s * 0.15, 0.15, 0.27], [0.2, s * 0.3, -s * 0.25]));
    head.add(mesh(shape([[-0.075, -0.035], [0.06, -0.015], [0.07, 0.055], [-0.07, 0.02]].map(([x, y]) => [s * x, y]), 0.025, 0.003), M.black, [s * 0.16, 0.07, 0.29], [0, s * 0.28, 0]));
    head.add(mesh(shape([[-0.045, -0.02], [0.044, -0.013], [0.048, 0.024], [-0.042, 0.005]].map(([x, y]) => [s * x, y]), 0.027, 0.001), M.amber, [s * 0.16, 0.07, 0.305], [0, s * 0.28, 0]));
    // 頬の毛束
    for (let i = 0; i < 3; i++) head.add(mesh(new THREE.ConeGeometry(0.06, 0.2, 6), i ? M.furLight : M.fur, [s * (0.26 + i * 0.02), -0.06 - i * 0.07, 0.1 - i * 0.03], [0, 0, s * (1.9 - i * 0.2)]));
    // 耳: 外側の毛と内側。右の耳は欠けている
    const ear = new THREE.Group(); ear.position.set(s * 0.25, 0.3, -0.04); ear.rotation.set(-0.1, 0, -s * 0.3); head.add(ear);
    const outer = s > 0 ? [[-0.11, -0.12], [0.105, -0.12], [0.07, 0.24], [0.02, 0.26], [0.04, 0.33], [-0.09, 0.16]] : [[-0.11, -0.12], [0.105, -0.12], [0.05, 0.38], [-0.095, 0.16]];
    ear.add(mesh(shape(outer, 0.09, 0.016, 2), M.fur));
    ear.add(mesh(shape([[-0.06, -0.06], [0.06, -0.06], [0.025, 0.26]], 0.03, 0.004), M.ear, [0, 0, 0.05]));
  }
  head.add(mesh(new THREE.BoxGeometry(0.02, 0.2, 0.015), M.scar, [-0.17, 0.08, 0.31], [0, -0.28, 0.35])); // 左目の傷
  head.add(grazCrown(M));
  parts.head = head;

  // 脚: 毛の太もも → 腿当て → 膝当て（棘）→ すね当て（金の帯）→ 爪のある足と甲の板
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.name = s < 0 ? 'graz-leg-left' : 'graz-leg-right'; leg.position.set(s * 0.17, 0.95, 0);
    leg.add(mesh(capsule(0.15, 0.24), M.fur, [s * 0.045, -0.2, 0]));
    leg.add(mesh(shape([[-0.12, 0.1], [0.12, 0.1], [0.11, -0.16], [-0.11, -0.16]], 0.05, 0.012), M.steel, [s * 0.045, -0.2, 0.15]));
    leg.add(mesh(dome(0.13), M.gold, [s * 0.045, -0.41, 0.07], [Math.PI / 2 - 0.2, 0, 0]));
    leg.add(mesh(new THREE.ConeGeometry(0.03, 0.1, 8), M.edge, [s * 0.045, -0.41, 0.2], [Math.PI / 2 - 0.2, 0, 0]));
    leg.add(mesh(cylinder(0.14, 0.17, 0.32), M.iron, [s * 0.045, -0.62, 0.015]));
    leg.add(mesh(shape([[-0.11, 0.13], [0, 0.2], [0.11, 0.13], [0.095, -0.13], [-0.095, -0.13]], 0.05, 0.012), M.steel, [s * 0.045, -0.6, 0.15]));
    leg.add(mesh(cylinder(0.175, 0.175, 0.035), M.gold, [s * 0.045, -0.5, 0.015]));
    leg.add(mesh(sphere(0.175, 14, 10), M.furDark, [s * 0.045, -0.84, 0.095], null, [1.05, 0.43, 1.45]));
    leg.add(mesh(shape([[-0.1, 0], [0.1, 0], [0.08, 0.14], [-0.08, 0.14]], 0.04, 0.01), M.iron, [s * 0.045, -0.8, 0.15], [-1.2, 0, 0]));
    for (const dx of [-0.08, 0, 0.08]) leg.add(mesh(new THREE.ConeGeometry(0.03, 0.12, 8), M.ivory, [s * 0.045 + dx, -0.86, 0.32], [Math.PI / 2 + 0.3, 0, 0]));
    body.add(leg); legs.push(leg);
  }
  parts.legs2 = legs;

  // 剣の腕: 重なった肩当て（3枚・金の縁）→ 毛の上腕 → 肘当て → 籠手（金の帯）→ 握る手
  const arm = new THREE.Group(); arm.name = 'graz-sword-arm'; arm.position.set(0.55, 1.55, 0); body.add(arm);
  arm.add(mesh(capsule(0.13, 0.22), M.fur, [0.065, -0.17, 0]));
  for (let i = 0; i < 3; i++) { // 3枚の板を少しずつずらして重ねる。下に金の層を敷いて縁取りにする
    const at = [0.04 + i * 0.03, 0.05 - i * 0.09, 0], rot = [0, 0, -0.5 - i * 0.15];
    arm.add(mesh(dome(0.27 - i * 0.04), i === 0 ? M.steel : M.steelD, at, rot, [1.1, 0.75, 1.05]));
    arm.add(mesh(dome(0.272 - i * 0.04, 0.5), M.gold, [at[0], at[1] - 0.02, at[2]], rot, [1.1, 0.75, 1.05])); // 板の縁からわずかにのぞく金
  }
  arm.add(mesh(dome(0.11), M.gold, [0.065, -0.33, -0.05], [-Math.PI / 2 - 0.3, 0, 0])); // 肘当て
  arm.add(mesh(cylinder(0.13, 0.155, 0.24), M.iron, [0.065, -0.45, 0]));
  for (const y of [-0.37, -0.53]) arm.add(mesh(cylinder(0.158, 0.158, 0.035), M.gold, [0.065, y, 0]));
  const grip = new THREE.Group(); grip.name = 'graz-sword-grip'; grip.position.set(0.065, -0.62, 0); arm.add(grip);
  grip.add(gauntletHand(M, 1));
  const sword = royalCleaver(M); sword.rotation.set(Math.PI / 2, Math.PI / 2, 0); grip.add(sword);
  parts.arm = arm; parts.grip = grip; parts.weaponModel = sword;

  // 盾の腕: 毛皮の肩掛け（牙の飾り）→ 毛の上腕 → 籠手 → 盾
  const guardArm = new THREE.Group(); guardArm.name = 'graz-shield-arm'; guardArm.position.set(-0.55, 1.55, 0); body.add(guardArm);
  guardArm.add(mesh(capsule(0.135, 0.22), M.fur, [-0.07, -0.19, 0]));
  guardArm.add(mesh(sphere(0.27, 16, 12), M.ivory, [-0.035, 0.045, 0], null, [1.15, 0.68, 1.05]));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    guardArm.add(mesh(new THREE.ConeGeometry(0.08, 0.2, 6), i % 2 ? M.ivory : M.furLight, [-0.035 + Math.sin(a) * 0.24, -0.06, Math.cos(a) * 0.22], [Math.PI, 0, Math.sin(a) * 0.4]));
  }
  for (const [x, z] of [[-0.25, 0.1], [-0.18, -0.15]]) guardArm.add(mesh(new THREE.ConeGeometry(0.03, 0.14, 8), M.ivory, [x, 0.12, z], [0, 0, 1.0])); // 牙の飾り
  guardArm.add(mesh(cylinder(0.14, 0.155, 0.24), M.iron, [-0.065, -0.45, 0.06]));
  guardArm.add(mesh(cylinder(0.158, 0.158, 0.035), M.gold, [-0.065, -0.37, 0.06]));
  const shield = kingShield(M); shield.position.set(-0.245, -0.32, 0.21); shield.rotation.y = -0.35; guardArm.add(shield);
  parts.shield = shield; parts.guardArm = guardArm;

  const cape = grazCape(M); body.add(cape);
  parts.cape = cape;
  for (const s of [-1, 1]) {
    body.add(mesh(cylinder(0.065, 0.065, 0.03, 14), M.gold, [s * 0.27, 1.64, 0.21], [Math.PI / 2, 0, 0]));
    body.add(mesh(sphere(0.03, 8, 6), M.amber, [s * 0.27, 1.64, 0.23]));
  }

  // 尻尾: 根元から先へ太くなる毛の房
  const tail = new THREE.Group(); tail.name = 'graz-tail'; tail.position.set(0.15, 0.19, -0.48); body.add(tail);
  tail.add(mesh(capsule(0.06, 0.2), M.fur, [0, 0.1, -0.13], [Math.PI / 2 + 0.25, 0, 0]));
  tail.add(mesh(sphere(0.1, 14, 10), M.fur, [0, 0.07, -0.29], null, [1, 1, 1.25]));
  tail.add(mesh(sphere(0.085, 14, 10), M.furLight, [0, 0.06, -0.42], null, [1, 1, 1.2]));
  parts.tail = tail;
  return parts;
}
