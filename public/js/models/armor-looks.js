// 防具の見た目の登録表。look（1〜6）ごとの関数。見た目を足すときは、ここに関数を足して、models.js の ARMOR_LOOK_NAMES と armorLook も合わせる
// k: { u（プレイヤーの部位）, c（キャラの色）, 材質 cloth / dark / leather / steel / steelD / gold / chain, onBody / onHead（付ける先）, add(付ける先, メッシュ) }
import * as THREE from 'three';
import { mesh, cone, cyl, lathe, extrude } from './kit.js';
import { toon } from '../toon.js';

export const ARMOR_LOOKS = {
  1: (k) => { // 軽装: フード（頭を覆う布と、肩までの短い肩掛け）
    const { cloth, onBody, onHead, add } = k;
    add(onHead, mesh(new THREE.SphereGeometry(0.43, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), cloth, [0, 0.04, -0.04], [-0.35, 0, 0]));
    add(onHead, mesh(cone(0.16, 0.34, 8), cloth, [0, 0.12, -0.42], [-2.2, 0, 0]));
    add(onBody, mesh(cyl(0.3, 0.42, 0.26, 16, true), cloth, [0, 1.42, 0]));
  },
  2: (k) => { // 軽装: 忍びの襟巻き（長くたなびく布と口元の覆い）
    const { dark, leather, onBody, onHead, add } = k;
    add(onHead, mesh(new THREE.SphereGeometry(0.335, 18, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.3), dark, [0, 0, 0.01]));
    add(onBody, mesh(new THREE.TorusGeometry(0.17, 0.07, 8, 16), toon(0xc03030), [0, 1.56, 0], [Math.PI / 2, 0, 0]));
    for (const s of [-1, 1]) add(onBody, mesh(new THREE.BoxGeometry(0.1, 0.75, 0.025), toon(0xc03030), [s * 0.08, 1.2, -0.3], [0.35, 0, s * 0.12]));
    add(onBody, mesh(new THREE.BoxGeometry(0.5, 0.06, 0.32), leather, [0, 1.0, 0]));
  },
  3: (k) => { // 中装: 革の肩当てと長いマント
    const { u, cloth, leather, gold, onBody, add } = k;
    for (const s of [-1, 1]) {
      add(onBody, mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), leather, [s * 0.33, 1.44, 0], [0, 0, -s * 0.45], [1.1, 0.8, 1.1]));
      add(onBody, mesh(new THREE.TorusGeometry(0.12, 0.02, 5, 12), gold, [s * 0.36, 1.4, 0], [Math.PI / 2, 0, -s * 0.45]));
    }
    add(onBody, mesh(new THREE.CylinderGeometry(0.32, 0.6, 1.35, 14, 4, true, Math.PI * 0.62, Math.PI * 0.76), cloth, [0, 0.85, -0.04]));
    u.cape.visible = false;
  },
  4: (k) => { // 中装: 鎖頭巾と胸当て
    const { steelD, chain, onBody, onHead, add } = k;
    add(onHead, mesh(new THREE.SphereGeometry(0.41, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), chain, [0, 0.02, -0.02], [-0.25, 0, 0]));
    add(onBody, mesh(cyl(0.2, 0.33, 0.22, 16), chain, [0, 1.48, 0]));
    add(onBody, mesh(lathe([[0.22, 1.08], [0.29, 1.18], [0.3, 1.32], [0.24, 1.42]], 16), steelD, null, null, [1.04, 1, 1.20]));
  },
  5: (k) => { // 重装: 騎士の兜（バイザーと羽飾り）と大きな肩当て
    const { steel, gold, onBody, onHead, add } = k;
    add(onHead, mesh(new THREE.SphereGeometry(0.4, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.7), steel, [0, 0.03, 0]));
    add(onHead, mesh(extrude([[-.21,.17],[.21,.17],[.235,-.05],[.15,-.19],[0,-.235],[-.15,-.19],[-.235,-.05]],.026,.005),steel,[0,0,.397]));
    add(onHead, mesh(new THREE.BoxGeometry(.39,.030,.024),toon(0x24313b),[0,.012,.430]));
    add(onHead, mesh(new THREE.BoxGeometry(0.05, 0.3, 0.42), toon(0xc03030), [0, 0.42, -0.05]));
    for (const s of [-1, 1]) {
      add(onBody, mesh(new THREE.SphereGeometry(0.21, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel, [s * 0.36, 1.43, 0], [0, 0, -s * 0.5], [1.2, 0.9, 1.15]));
      add(onBody, mesh(new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), gold, [s * 0.37, 1.39, 0], [0, 0, -s * 0.5], [1.25, 0.6, 1.2]));
    }
    add(onBody, mesh(lathe([[0.24, 1.0], [0.3, 1.15], [0.31, 1.32], [0.25, 1.46]], 16), steel, null, null, [1.06, 1, 1.24]));
  },
  6: (k) => { // 重装: 角兜と重いマント、腰当て
    const { u, dark, steelD, gold, onBody, onHead, add } = k;
    add(onHead, mesh(new THREE.SphereGeometry(0.4, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), steelD, [0, 0.04, 0]));
    for (const s of [-1, 1]) add(onHead, mesh(cone(0.07, 0.42, 8), toon(0xe8dcc0), [s * 0.36, 0.28, 0], [0, 0, -s * 0.9]));
    add(onHead, mesh(new THREE.BoxGeometry(0.1, 0.22, 0.05), gold, [0, 0.12, 0.38]));
    for (const s of [-1, 1]) add(onBody, mesh(new THREE.BoxGeometry(0.3, 0.12, 0.36), steelD, [s * 0.36, 1.46, 0], [0, 0, -s * 0.35]));
    add(onBody, mesh(new THREE.CylinderGeometry(0.36, 0.62, 1.3, 14, 4, true, Math.PI * 0.6, Math.PI * 0.8), dark, [0, 0.88, -0.05]));
    for (const s of [-1, 0, 1]) add(onBody, mesh(new THREE.BoxGeometry(0.2, 0.3, 0.05), steelD, [s * 0.2, 0.76, 0.27 - Math.abs(s) * 0.04], [0.15, s * 0.4, 0]));
    u.cape.visible = false;
  },
};
