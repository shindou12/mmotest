// 武器のモデル（形）の登録表。kind ごとに base（基本の形 = style 0）と styles（形違い 1・2、伝説・神器の専用形 3）
// 武器の種類や形を足すときは、ここに関数を足す（makeWeapon が kind と style で選ぶ。ない kind は sword の形）
// k: 材質と道具 { g（入れ物）, steel, gold, grip, gem, edge(輪郭の光), handle(柄), rc(レア度の色), rarity(飾りの段階), glowM, blade }。prep は形違いの前に作る道具
import * as THREE from 'three';
import { mesh, sphere, cone, cyl, extrude, bowString } from './kit.js';
import { toon } from '../toon.js';

export const WEAPON_MODELS = {
  sword: {
    base(k) {
      const { g, steel, gold, gem, edge, handle } = k;
      const w = 0.075, L = 1.3;
      const pts = [[-w, 0], [w, 0], [w, L - 0.22], [0, L], [-w, L - 0.22]];
      edge(pts, 0.035);
      g.add(mesh(extrude(pts, 0.035), steel, [0, 0.12, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.022, L * 0.7, 0.05), toon(0x9aa4b4), [0, 0.12 + L * 0.4, 0]));
      const guard = mesh(new THREE.TorusGeometry(0.26, 0.03, 6, 16, Math.PI * 0.7), gold, [0, -0.05, 0], [0, 0, Math.PI * 0.15]);
      g.add(guard);
      g.add(mesh(sphere(0.05, 10, 8), gem, [0, 0.1, 0.04]));
      handle(0.42);
    },
    styles: {
      1: (k) => { // 刀: 反りのある片刃
        const { g, gold, handle, blade } = k;
        const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10, y = t * 1.35, x = Math.sin(t * 1.2) * 0.12; pts.push([x + 0.045, y]); }
        for (let i = 10; i >= 0; i--) { const t = i / 10, y = t * 1.35, x = Math.sin(t * 1.2) * 0.12; pts.push([x - (t > 0.92 ? 0 : 0.03), y]); }
        blade(pts, 0.03);
        g.add(mesh(cyl(0.1, 0.1, 0.03, 14), gold, [0, 0.1, 0], [Math.PI / 2, 0, 0]));
        handle(0.5, 0.032);
      },
      2: (k) => { // 幅広の葉形
        const { g, gold, gem, handle, blade } = k;
        blade([[-0.06, 0], [0.06, 0], [0.13, 0.55], [0.1, 0.95], [0, 1.25], [-0.1, 0.95], [-0.13, 0.55]], 0.04);
        g.add(mesh(new THREE.BoxGeometry(0.42, 0.07, 0.09), gold, [0, 0.08, 0]));
        g.add(mesh(sphere(0.05, 10, 8), gem, [0, 0.08, 0.05]));
        handle(0.38);
      },
      3: (k) => { // 専用: 光の結晶の刃と翼の鍔
        const { g, steel, gold, gem, handle, glowM, blade } = k;
        const pts = [[-0.07, 0], [0.07, 0], [0.09, 0.8], [0.04, 1.3], [0, 1.5], [-0.04, 1.3], [-0.09, 0.8]];
        blade(pts, 0.03, 0.12, glowM(1.3));
        g.add(mesh(extrude(pts.map(([x, y]) => [x * 0.55, y * 0.96]), 0.045), steel, [0, 0.14, 0]));
        for (const s of [-1, 1]) g.add(mesh(extrude([[0, 0], [0.42, 0.18], [0.36, 0.05], [0.5, -0.02], [0.2, -0.06]].map(([x, y]) => [x * s, y]), 0.03), gold, [0, 0.08, 0]));
        g.add(mesh(new THREE.OctahedronGeometry(0.08), gem, [0, 0.1, 0.03]));
        handle(0.42);
      },
    },
  },
  greatsword: {
    base(k) {
      const { g, steel, gold, gem, edge, handle } = k;
      const w = 0.17, L = 2.2;
      const pts = [[-w, 0], [w, 0], [w * 1.1, L * 0.55], [w * 0.8, L - 0.35], [0, L], [-w * 0.8, L - 0.35], [-w * 1.1, L * 0.55]];
      edge(pts, 0.06);
      g.add(mesh(extrude(pts, 0.06), steel, [0, 0.12, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.05, L * 0.7, 0.075), toon(0x9aa4b4), [0, 0.12 + L * 0.38, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.78, 0.1, 0.14), gold, [0, 0.1, 0]));
      for (const s of [-1, 1]) g.add(mesh(cone(0.06, 0.22, 6), gold, [s * 0.45, 0.13, 0], [0, 0, -s * 1.3]));
      g.add(mesh(sphere(0.07, 10, 8), gem, [0, 0.1, 0.07]));
      handle(0.55, 0.045);
    },
    styles: {
      1: (k) => { // 大包丁: 四角い幅広の刃
        const { g, gold, handle, blade } = k;
        blade([[-0.18, 0], [0.18, 0], [0.24, 1.8], [-0.05, 2.0], [-0.24, 1.75]], 0.07);
        g.add(mesh(cyl(0.05, 0.05, 0.08, 12), gold, [0.1, 1.6, 0], [Math.PI / 2, 0, 0]));
        g.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.16), gold, [0, 0.08, 0]));
        handle(0.6, 0.05);
      },
      2: (k) => { // ツヴァイハンダー: 細長い刃と返し
        const { g, steel, gold, handle, blade } = k;
        blade([[-0.1, 0], [0.1, 0], [0.11, 2.1], [0, 2.45], [-0.11, 2.1]], 0.05);
        for (const s of [-1, 1]) g.add(mesh(cone(0.04, 0.2, 6), steel, [s * 0.16, 0.5, 0], [0, 0, -s * 1.57]));
        g.add(mesh(new THREE.BoxGeometry(0.95, 0.07, 0.1), gold, [0, 0.08, 0]));
        handle(0.75, 0.042);
      },
      3: (k) => { // 専用: 波打つ炎の刃（フランベルジュ）
        const { g, gold, gem, handle, glowM, blade } = k;
        const L = 2.3, pts = [];
        for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([0.17 + Math.sin(t * 18) * 0.04 - t * 0.08, t * L]); }
        pts.push([0, L + 0.25]);
        for (let i = 12; i >= 0; i--) { const t = i / 12; pts.push([-(0.17 + Math.sin(t * 18 + 1) * 0.04 - t * 0.08), t * L]); }
        blade(pts, 0.06);
        g.add(mesh(new THREE.BoxGeometry(0.05, L * 0.8, 0.08), glowM(1.4), [0, 0.12 + L * 0.42, 0]));
        g.add(mesh(new THREE.TorusGeometry(0.32, 0.05, 6, 16, Math.PI), gold, [0, 0.0, 0], [0, 0, Math.PI]));
        g.add(mesh(sphere(0.08, 10, 8), gem, [0, 0.1, 0.07]));
        handle(0.6, 0.048);
      },
    },
  },
  spear: {
    base(k) {
      const { g, steel, gold, gem, edge, rc, rarity } = k;
      g.add(mesh(cyl(0.035, 0.04, 2.9, 8), toon(0x6a4428), [0, 0.95, 0]));
      for (const y of [0.1, 0.55, 2.3]) g.add(mesh(new THREE.TorusGeometry(0.045, 0.014, 5, 10), gold, [0, y, 0], [Math.PI / 2, 0, 0]));
      const pts = [[0, 0], [0.11, 0.18], [0.07, 0.55], [0, 0.78], [-0.07, 0.55], [-0.11, 0.18]];
      edge(pts.map(([x, y]) => [x, y + 2.42]), 0.04);
      g.add(mesh(extrude(pts, 0.04), steel, [0, 2.42, 0]));
      g.add(mesh(sphere(0.06, 10, 8), gem, [0, 2.4, 0]));
      const tassel = mesh(cone(0.08, 0.35, 8), toon(rarity >= 2 ? rc : 0xb03030), [0, 2.18, 0], [Math.PI, 0, 0]);
      g.add(tassel);
    },
    prep(k) { // 形違いの前に作る道具・材質（形違いのときだけ）
      const { g } = k;
      const shaft = (len, col = 0x6a4428) => g.add(mesh(cyl(0.035, 0.04, len, 8), toon(col), [0, len / 2 - 0.5, 0]));
      return { shaft };
    },
    styles: {
      1: (k) => { // ハルバード: 斧頭と突起
        const { g, steel, gold, blade, shaft } = k;
        shaft(2.9);
        blade([[0, 0], [0.06, 0.25], [0, 0.6], [-0.06, 0.25]].map(([x, y]) => [x, y]), 0.04, 2.4);
        blade([[0.03, -0.18], [0.42, -0.3], [0.48, 0], [0.42, 0.3], [0.03, 0.18]], 0.05, 2.2);
        g.add(mesh(cone(0.04, 0.22, 6), steel, [-0.13, 2.2, 0], [0, 0, 1.57]));
        g.add(mesh(new THREE.TorusGeometry(0.05, 0.016, 5, 10), gold, [0, 2.0, 0], [Math.PI / 2, 0, 0]));
      },
      2: (k) => { // 三叉槍
        const { g, gold, gem, blade, shaft } = k;
        shaft(2.8, 0x4a4a58);
        for (const s of [-1, 0, 1]) blade([[-0.035, 0], [0.035, 0], [0, s ? 0.45 : 0.6]], 0.03, 2.35 + (s ? 0 : 0.05)).position.x = s * 0.15;
        g.add(mesh(new THREE.BoxGeometry(0.4, 0.07, 0.07), gold, [0, 2.33, 0]));
        g.add(mesh(sphere(0.06, 10, 8), gem, [0, 2.26, 0]));
      },
      3: (k) => { // 専用: 翼のある光の槍
        const { g, gold, gem, glowM, blade, shaft } = k;
        shaft(3.1, 0xe8e0d0);
        blade([[0, 0], [0.12, 0.25], [0.06, 0.8], [0, 1.0], [-0.06, 0.8], [-0.12, 0.25]], 0.04, 2.45, glowM(1.3));
        for (const s of [-1, 1]) g.add(mesh(extrude([[0, 0], [0.4, 0.3], [0.3, 0.1], [0.45, 0.05], [0.1, -0.1]].map(([x, y]) => [x * s, y]), 0.025), gold, [0, 2.35, 0]));
        g.add(mesh(new THREE.OctahedronGeometry(0.08), gem, [0, 2.38, 0]));
      },
    },
  },
  axe: {
    base(k) {
      const { g, steel, gold, gem, edge } = k;
      g.add(mesh(cyl(0.05, 0.06, 1.9, 8), toon(0x5a3a22), [0, 0.65, 0]));
      for (const y of [0.0, 1.45]) g.add(mesh(new THREE.TorusGeometry(0.06, 0.015, 5, 10), gold, [0, y, 0], [Math.PI / 2, 0, 0]));
      // 三日月形の刃（両刃）
      const blade = [[0, -0.32], [0.18, -0.36], [0.5, -0.55], [0.62, -0.1], [0.62, 0.1], [0.5, 0.55], [0.18, 0.36], [0, 0.32]];
      edge(blade.map(([x, y]) => [x + 0.04, y + 1.45]), 0.07);
      g.add(mesh(extrude(blade, 0.07), steel, [0.04, 1.45, 0]));
      g.add(mesh(extrude(blade.map(([x, y]) => [x * 0.6, y * 0.7]), 0.07), steel, [-0.04, 1.45, 0], [0, Math.PI, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.42, 0.12), gold, [0, 1.45, 0]));
      g.add(mesh(cone(0.06, 0.3, 6), steel, [0, 1.75, 0]));
      g.add(mesh(sphere(0.06, 8, 6), gem, [0, 1.45, 0.07]));
    },
    prep(k) { // 形違いの前に作る道具・材質（形違いのときだけ）
      const { g } = k;
      const haft = (len) => g.add(mesh(cyl(0.05, 0.06, len, 8), toon(0x5a3a22), [0, len / 2 - 0.3, 0]));
      return { haft };
    },
    styles: {
      1: (k) => { // 髭斧: 片刃で下に伸びる刃
        const { g, gold, blade, haft } = k;
        haft(1.9);
        blade([[0, 0.2], [0.35, 0.3], [0.6, 0.1], [0.55, -0.45], [0.3, -0.6], [0.25, -0.2], [0, -0.1]], 0.07, 1.4);
        g.add(mesh(new THREE.BoxGeometry(0.14, 0.36, 0.12), gold, [0, 1.42, 0]));
      },
      2: (k) => { // 戦鎚
        const { g, steel, gold, rarity, glowM, haft } = k;
        haft(1.8);
        g.add(mesh(new THREE.BoxGeometry(0.62, 0.34, 0.34), steel, [0, 1.45, 0]));
        for (const s of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.4), gold, [s * 0.32, 1.45, 0]));
        g.add(mesh(cone(0.08, 0.3, 6), steel, [0, 1.75, 0]));
        if (rarity >= 3) g.add(mesh(new THREE.BoxGeometry(0.64, 0.06, 0.36), glowM(1.2), [0, 1.45, 0]));
      },
      3: (k) => { // 専用: ルーンの大三日月
        const { g, gem, glowM, blade, haft } = k;
        haft(2.0);
        const b = [[0, -0.42], [0.3, -0.55], [0.75, -0.8], [0.85, 0], [0.75, 0.8], [0.3, 0.55], [0, 0.42]];
        blade(b, 0.07, 1.45);
        blade(b.map(([x, y]) => [-x, y]), 0.07, 1.45);
        for (let i = 0; i < 3; i++) g.add(mesh(new THREE.BoxGeometry(0.05, 0.16, 0.09), glowM(1.5), [0.45, 1.45 + (i - 1) * 0.22, 0]));
        g.add(mesh(new THREE.OctahedronGeometry(0.1), gem, [0, 1.45, 0.06]));
      },
    },
  },
  bow: {
    base(k) {
      const { g, gold, grip, gem, rc, rarity } = k;
      const wood = toon(rarity >= 3 ? new THREE.Color(0x6a4428).lerp(rc, 0.3) : 0x6a4428);
      const R = 0.8, arc = Math.PI * 0.72;
      const limb = new THREE.TorusGeometry(R, 0.045, 6, 28, arc);
      limb.rotateZ(-arc / 2); limb.translate(-R, 0, 0);
      g.add(mesh(limb, wood));
      const tip = Math.sin(arc / 2) * R, sx = Math.cos(arc / 2) * R - R;
      bowString(g, tip, sx, rarity >= 2 ? rc : 0xeeeeee);
      g.add(mesh(cyl(0.06, 0.06, 0.28, 8), grip, [0, 0, 0]));
      for (const s of [-1, 1]) g.add(mesh(sphere(0.06, 8, 6), gold, [sx, s * tip, 0]));
      g.add(mesh(sphere(0.05, 8, 6), gem, [0.05, 0, 0]));
    },
    prep(k) { // 形違いの前に作る道具・材質（形違いのときだけ）
      const { g, rc, rarity } = k;
      const wood = toon(rarity >= 3 ? new THREE.Color(0x6a4428).lerp(rc, 0.3) : 0x6a4428);
      const string = (tip, sx) => bowString(g, tip, sx, rarity >= 2 ? rc : 0xeeeeee);
      return { wood, string };
    },
    styles: {
      1: (k) => { // 1: リカーブ（先端が反る） 2: ロングボウ（長い）
        const { g, grip, gem, wood, string, style } = k;
        const R = style === 2 ? 1.25 : 0.75, arc = style === 2 ? Math.PI * 0.62 : Math.PI * 0.66;
        const limb = new THREE.TorusGeometry(R, style === 2 ? 0.04 : 0.05, 6, 28, arc); limb.rotateZ(-arc / 2); limb.translate(-R, 0, 0);
        g.add(mesh(limb, wood));
        const tip = Math.sin(arc / 2) * R, sx = Math.cos(arc / 2) * R - R;
        if (style === 1) for (const s of [-1, 1]) g.add(mesh(new THREE.TorusGeometry(0.12, 0.035, 5, 10, Math.PI * 0.8), wood, [sx + 0.1, s * tip, 0], [0, 0, s > 0 ? 0.3 : Math.PI - 0.3]));
        string(tip, sx);
        g.add(mesh(cyl(0.06, 0.06, 0.28, 8), grip));
        g.add(mesh(sphere(0.05, 8, 6), gem, [0.05, 0, 0]));
      },
      2: (k) => WEAPON_MODELS.bow.styles[1](k), // 1 と同じ作り（style で長さが変わる）
      3: (k) => { // 専用: 三日月と刃の翼
        const { g, gold, gem, glowM, string } = k;
        const R = 0.85, arc = Math.PI * 0.8;
        const limb = new THREE.TorusGeometry(R, 0.05, 6, 32, arc); limb.rotateZ(-arc / 2); limb.translate(-R, 0, 0);
        g.add(mesh(limb, toon(0xe8e0d0)));
        const tip = Math.sin(arc / 2) * R, sx = Math.cos(arc / 2) * R - R;
        for (const s of [-1, 1]) g.add(mesh(extrude([[0, 0], [0.18, 0.1 * s], [0.35, 0.45 * s], [0.12, 0.25 * s]], 0.025), glowM(1.3), [0.02, s * 0.2, 0]));
        string(tip, sx);
        g.add(mesh(cyl(0.06, 0.06, 0.3, 8), gold));
        g.add(mesh(new THREE.OctahedronGeometry(0.08), gem, [0.06, 0, 0]));
      },
    },
  },
  dagger: {
    base(k) {
      const { g, steel, gold, gem, edge, handle } = k;
      const pts = [[-0.06, 0], [0.065, 0], [0.07, 0.4], [0.02, 0.72], [-0.04, 0.5]];
      edge(pts, 0.03);
      g.add(mesh(extrude(pts, 0.03), steel, [0, 0.12, 0]));
      g.add(mesh(new THREE.TorusGeometry(0.1, 0.022, 6, 12, Math.PI), gold, [0, 0.1, 0]));
      g.add(mesh(sphere(0.035, 8, 6), gem, [0, 0.11, 0.03]));
      handle(0.3, 0.03);
    },
    styles: {
      1: (k) => { // クナイ: 菱形の刃と輪の柄頭
        const { g, gold, grip, blade } = k;
        blade([[0, 0], [0.07, 0.25], [0, 0.65], [-0.07, 0.25]], 0.035);
        g.add(mesh(cyl(0.028, 0.028, 0.3, 8), grip, [0, -0.08, 0]));
        g.add(mesh(new THREE.TorusGeometry(0.06, 0.015, 5, 12), gold, [0, -0.28, 0]));
      },
      2: (k) => { // クリス: 波打つ刃
        const { g, gold, handle, blade } = k;
        const pts = [];
        for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([0.05 + Math.sin(t * 14) * 0.025 - t * 0.04, t * 0.7]); }
        pts.push([0, 0.78]);
        for (let i = 8; i >= 0; i--) { const t = i / 8; pts.push([-(0.05 + Math.sin(t * 14 + 1.2) * 0.025 - t * 0.04), t * 0.7]); }
        blade(pts, 0.03);
        g.add(mesh(new THREE.BoxGeometry(0.2, 0.05, 0.06), gold, [0, 0.1, 0]));
        handle(0.28, 0.028);
      },
      3: (k) => { // 専用: 月の形の双刃
        const { g, steel, gem, handle, glowM, blade } = k;
        blade([[-0.03, 0], [0.04, 0], [0.16, 0.3], [0.12, 0.62], [0.02, 0.78], [0.06, 0.5], [0.02, 0.25]], 0.03, 0.12, glowM(1.2));
        g.add(mesh(extrude([[-0.03, 0], [0.04, 0], [0.16, 0.3], [0.12, 0.62], [0.02, 0.78], [0.06, 0.5], [0.02, 0.25]].map(([x, y]) => [-x * 0.7, y * 0.8]), 0.025), steel, [0, 0.12, 0]));
        g.add(mesh(new THREE.OctahedronGeometry(0.05), gem, [0, 0.1, 0.03]));
        handle(0.3, 0.03);
      },
    },
  },
};
