// コボルド王 グラズ（作り込みの段階 4・試作）: 毛皮の体を「なめらかな粘土」（sdf.js）で作り、鎧・剣・盾・王冠・マントは段階 3 の部品を使う。
// 体は部位（胴・頭・腕・脚・尻尾）ごとに別の塊にして、段階 1 と同じ支点に付ける（共通の歩き・振りでそのまま動く）。
// 鎧は控えめにして、筋肉質な毛皮の体を見せる（胸当てなし。肩当て・籠手・すね当て・帯・前垂れ）
import * as THREE from 'three';
import { toon } from '../../toon.js';
import { sdf } from './sdf.js';
import { royalCleaver, kingShield, gauntletHand, grazCrown, grazCape, grazMaterials } from './graz3-model.js';

const FUR = 0x986348, FUR_L = 0xc6976d, FUR_D = 0x613f32, BELLY = 0xb5835c, EAR = 0x7a4440;

function mesh(geometry, material, position, rotation, scale) {
  const part = new THREE.Mesh(geometry, material);
  if (position) part.position.set(...position);
  if (rotation) part.rotation.set(...rotation);
  if (scale) part.scale.set(...scale);
  part.castShadow = true;
  return part;
}
// 粘土の塊を、部位ごとの色をそのまま使う材質で網目にする（結合しない＝色を保つ）
function clay(S, cell) {
  const m = mesh(S.mesh(cell), toon(0xffffff, { vertexColors: true }));
  m.userData.keep = true;
  return m;
}
const dome = (r, cut = 0.55) => new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI * cut);

export function buildGrazSculpt(body, accent) {
  const M = grazMaterials(accent);
  body.name = 'graz-body';
  const parts = { identity: 'graz' };

  // 胴: 胸・背中の盛り上がり・腹・腰・首。胸元から腹は明るい毛
  const T = sdf();
  T.add(T.ellipsoid([0, 1.4, 0.02], [0.5, 0.42, 0.4]), FUR, 0.12)
    .add(T.ellipsoid([0, 1.5, -0.14], [0.44, 0.36, 0.3]), FUR, 0.15)
    .add(T.ellipsoid([0, 1.08, 0.04], [0.4, 0.3, 0.34]), BELLY, 0.14)
    .add(T.ellipsoid([0, 0.92, 0], [0.36, 0.2, 0.3]), FUR_D, 0.12)
    .add(T.cone([0, 1.6, 0], [0, 1.95, 0.04], 0.26, 0.2), FUR, 0.12)
    .add(T.ellipsoid([0, 1.33, 0.3], [0.26, 0.36, 0.12]), FUR_L, 0.12);
  for (const s of [-1, 1]) {
    T.add(T.ellipsoid([s * 0.2, 1.52, 0.27], [0.2, 0.15, 0.12], [0, 0, s * 0.2]), FUR, 0.1); // 胸の筋肉
    T.add(T.ellipsoid([s * 0.4, 1.62, 0], [0.2, 0.16, 0.2]), FUR, 0.12); // 肩の付け根
  }
  body.add(clay(T, 0.035)); // body.children[0]（光の部品が体の縁の光に使う）

  // 帯・留め具・前垂れ・小物入れ（毛皮の体に締める）
  body.add(mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 28), M.leather, [0, 0.98, 0.02], [Math.PI / 2, 0, 0], [1, 0.95, 1.4]));
  body.add(mesh(new THREE.BoxGeometry(0.24, 0.16, 0.05), M.gold, [0, 0.98, 0.42]));
  body.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), M.amber, [0, 0.98, 0.45], null, [1, 1, 0.5]));
  body.add(mesh(new THREE.BoxGeometry(0.22, 0.5, 0.03), M.red, [0, 0.66, 0.38], [0.12, 0, 0]));
  body.add(mesh(new THREE.BoxGeometry(0.22, 0.05, 0.035), M.gold, [0, 0.43, 0.41], [0.12, 0, 0]));
  for (const s of [-1, 1]) body.add(mesh(new THREE.BoxGeometry(0.14, 0.12, 0.09), M.leatherL, [s * 0.36, 0.93, 0.22], [0, s * 0.6, 0]));
  // 胸を斜めに横切る革の吊り帯（剣の肩から盾の側の腰へ）
  body.add(mesh(new THREE.BoxGeometry(0.1, 1.05, 0.03), M.leather, [0.02, 1.3, 0.36], [0.15, 0, 0.62]));
  body.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 14), M.gold, [0.2, 1.52, 0.4], [Math.PI / 2, 0, 0]));

  // 頭: 頭蓋・眉・鼻づら・顎・頬毛・耳。目のくぼみと口は削る
  const head = new THREE.Group(); head.name = 'graz-head'; head.position.set(0, 2, 0); body.add(head);
  const H = sdf();
  H.add(H.ellipsoid([0, 0.1, -0.02], [0.33, 0.31, 0.32]), FUR, 0.08)
    .add(H.cone([0, -0.02, 0.16], [0, -0.06, 0.5], 0.17, 0.1), FUR_L, 0.1)
    .add(H.cone([0, -0.17, 0.12], [0, -0.2, 0.42], 0.13, 0.07), FUR_L, 0.06);
  for (const s of [-1, 1]) {
    H.add(H.ellipsoid([s * 0.14, 0.17, 0.24], [0.13, 0.065, 0.09], [0, 0, -s * 0.38]), FUR_D, 0.05); // 怒った眉
    H.add(H.ellipsoid([s * 0.26, -0.08, 0.06], [0.14, 0.18, 0.14], [0, 0, s * 0.2]), FUR, 0.1); // 頬毛
    H.add(H.ellipsoid([s * 0.25, 0.44, -0.04], [0.1, 0.25, 0.045], [-0.1, 0, -s * 0.35]), FUR, 0.06); // 耳
    H.add(H.ellipsoid([s * 0.26, 0.42, 0.0], [0.055, 0.17, 0.03], [-0.1, 0, -s * 0.35]), EAR, 0.02); // 耳の内側
    H.cut(H.sphere([s * 0.15, 0.08, 0.27], 0.055), 0.03); // 目のくぼみ
  }
  H.cut(H.cone([-0.08, -0.13, 0.33], [0.08, -0.13, 0.33], 0.018), 0.02); // 口の切れ込み
  head.add(clay(H, 0.022));
  for (const s of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.04, 12, 8), M.amber, [s * 0.15, 0.08, 0.265], null, [1.3, 0.7, 0.5])); // 光る目
    head.add(mesh(new THREE.ConeGeometry(0.028, 0.11, 8), M.ivory, [s * 0.08, -0.19, 0.44], [Math.PI - 0.2, 0, s * 0.12])); // 牙
  }
  head.add(mesh(new THREE.SphereGeometry(0.075, 14, 10), M.black, [0, -0.02, 0.555], null, [1.25, 0.85, 0.85])); // 鼻（色を混ぜないよう別の部品）
  head.add(mesh(new THREE.BoxGeometry(0.02, 0.2, 0.015), M.scar, [-0.16, 0.09, 0.29], [0, -0.3, 0.35])); // 左目の傷
  head.add(grazCrown(M));
  parts.head = head;

  // 脚: 太もも → すね → 足（粘土）に、膝当て・すね当て・爪
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.name = s < 0 ? 'graz-leg-left' : 'graz-leg-right'; leg.position.set(s * 0.17, 0.95, 0);
    const L = sdf();
    L.add(L.cone([s * 0.03, -0.02, 0], [s * 0.045, -0.42, 0.03], 0.18, 0.13), FUR, 0.08)
      .add(L.cone([s * 0.045, -0.42, 0.03], [s * 0.045, -0.78, 0], 0.13, 0.1), FUR, 0.06)
      .add(L.ellipsoid([s * 0.045, -0.86, 0.1], [0.15, 0.08, 0.22]), FUR_D, 0.06);
    leg.add(clay(L, 0.03));
    leg.add(mesh(dome(0.13), M.gold, [s * 0.045, -0.42, 0.08], [Math.PI / 2 - 0.2, 0, 0]));
    leg.add(mesh(new THREE.CylinderGeometry(0.135, 0.12, 0.26, 14), M.iron, [s * 0.045, -0.62, 0.015]));
    leg.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.035, 14), M.gold, [s * 0.045, -0.52, 0.015]));
    for (const dx of [-0.08, 0, 0.08]) leg.add(mesh(new THREE.ConeGeometry(0.03, 0.12, 8), M.ivory, [s * 0.045 + dx, -0.88, 0.32], [Math.PI / 2 + 0.3, 0, 0]));
    body.add(leg); legs.push(leg);
  }
  parts.legs2 = legs;

  // 腕（粘土）: 肩の筋肉 → 上腕 → 前腕 → 手
  const armClay = (s) => {
    const A = sdf();
    A.add(A.sphere([s * 0.04, 0, 0], 0.23), FUR, 0.08)
      .add(A.cone([s * 0.06, -0.05, 0], [s * 0.07, -0.36, 0], 0.15, 0.12), FUR, 0.08)
      .add(A.cone([s * 0.07, -0.38, 0], [s * 0.065, -0.58, 0], 0.13, 0.1), FUR, 0.06);
    return clay(A, 0.03);
  };
  // 剣の腕: 重なった肩当て・籠手・握る手と剣
  const arm = new THREE.Group(); arm.name = 'graz-sword-arm'; arm.position.set(0.55, 1.55, 0); body.add(arm);
  arm.add(armClay(1));
  for (let i = 0; i < 3; i++) {
    const at = [0.05 + i * 0.03, 0.07 - i * 0.09, 0], rot = [0, 0, -0.5 - i * 0.15];
    arm.add(mesh(dome(0.28 - i * 0.04), i === 0 ? M.steel : M.steelD, at, rot, [1.1, 0.75, 1.05]));
    arm.add(mesh(dome(0.282 - i * 0.04, 0.5), M.gold, [at[0], at[1] - 0.02, at[2]], rot, [1.1, 0.75, 1.05]));
  }
  arm.add(mesh(new THREE.CylinderGeometry(0.125, 0.14, 0.2, 14), M.iron, [0.065, -0.5, 0]));
  arm.add(mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.035, 14), M.gold, [0.065, -0.42, 0]));
  const grip = new THREE.Group(); grip.name = 'graz-sword-grip'; grip.position.set(0.065, -0.62, 0); arm.add(grip);
  grip.add(gauntletHand(M, 1));
  const sword = royalCleaver(M); sword.rotation.set(Math.PI / 2, Math.PI / 2, 0); grip.add(sword);
  parts.arm = arm; parts.grip = grip; parts.weaponModel = sword;

  // 盾の腕: 毛皮の肩掛け・籠手・盾
  const guardArm = new THREE.Group(); guardArm.name = 'graz-shield-arm'; guardArm.position.set(-0.55, 1.55, 0); body.add(guardArm);
  guardArm.add(armClay(-1));
  const P = sdf(); // 毛皮の肩掛け（白い毛皮の塊）
  P.add(P.ellipsoid([-0.04, 0.06, 0], [0.31, 0.19, 0.29]), 0xe5d5b4, 0.06);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; P.add(P.cone([-0.04 + Math.sin(a) * 0.2, 0.0, Math.cos(a) * 0.18], [-0.04 + Math.sin(a) * 0.3, -0.18, Math.cos(a) * 0.27], 0.07, 0.02), i % 2 ? 0xe5d5b4 : 0xd2bc96, 0.05); }
  guardArm.add(clay(P, 0.022));
  guardArm.add(mesh(new THREE.CylinderGeometry(0.13, 0.145, 0.22, 14), M.iron, [-0.065, -0.47, 0.03]));
  guardArm.add(mesh(new THREE.CylinderGeometry(0.148, 0.148, 0.035, 14), M.gold, [-0.065, -0.38, 0.03]));
  const shield = kingShield(M); shield.position.set(-0.245, -0.32, 0.21); shield.rotation.y = -0.35; guardArm.add(shield);
  parts.shield = shield; parts.guardArm = guardArm;

  // マントと肩の留め具
  const cape = grazCape(M); body.add(cape); parts.cape = cape;
  for (const s of [-1, 1]) body.add(mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.03, 14), M.gold, [s * 0.3, 1.7, 0.18], [Math.PI / 2, 0, 0]));

  // 尻尾（粘土）: 根元から先へふくらむ毛の房
  const tail = new THREE.Group(); tail.name = 'graz-tail'; tail.position.set(0.15, 0.19, -0.48); body.add(tail);
  const Q = sdf();
  Q.add(Q.cone([0, 0.1, 0.02], [0, 0.08, -0.26], 0.06, 0.11), FUR, 0.06).add(Q.sphere([0, 0.07, -0.36], 0.1), FUR_L, 0.08);
  tail.add(clay(Q, 0.025));
  parts.tail = tail;
  return parts;
}
