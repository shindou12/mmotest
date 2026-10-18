// エリアの見た目: 地形づくりの共通の道具（決まった乱数・高さ・行列・文字の札）
import * as THREE from 'three';
import { exitsOf, boundR, angOf, obstaclesOf, hazardsOf } from '../../shared/areas.js';

export function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export const hashStr = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export function noise2(x, z) {
  return Math.sin(x * 0.11) * Math.cos(z * 0.13) + Math.sin(x * 0.037 + z * 0.05) * 1.6 + Math.sin(x * 0.31 - z * 0.27) * 0.3;
}

// エリアごとの地面の高さ関数（屋内は平ら）
export function makeHeight(def) {
  if (def.shape === 'grid') return () => 0;
  const exits = exitsOf(def);
  const flat = def.layout === 'town' || def.scene ? 0 : def.type === 'town' ? 0.15 : def.type === 'camp' ? 0.4 : 1;
  // 池はくぼみ、毒沼・流砂は平らにならす
  const sinks = [
    ...obstaclesOf(def).filter((o) => o.kind === 'pond').map((o) => ({ x: o.x, z: o.z, r: o.r, y: -0.9 })),
    ...hazardsOf(def).map((o) => ({ x: o.x, z: o.z, r: o.r, y: o.kind === 'poison' ? -0.12 : -0.04 })),
  ];
  return (x, z) => {
    const r = Math.hypot(x, z);
    let h = noise2(x, z) * 0.35 * flat;
    if (def.gate) h *= Math.min(1, Math.hypot(x - def.gate.x, z - def.gate.z) / 12);
    for (const e of exits) h *= Math.min(1, Math.hypot(x - e.x, z - e.z) / 6);
    for (const s of sinks) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < s.r + 1.5) { const k = Math.min(1, (s.r + 1.5 - d) / 2); h = h * (1 - k) + s.y * k; }
    }
    const br = boundR(def, angOf(x, z)) - 0.5;
    if (r > br) h += (r - br) * 0.6;
    return h;
  };
}

// 草の設定 [根元色, 先端色, 密度, 高さ]
export const GRASS = {
  1: [0x2f6a26, 0xa8e070, 2.4, 0.9], 2: [0x183c26, 0x6aa070, 2.0, 1.1], 3: [0x7a5f30, 0xe0c884, 0.5, 0.7],
  6: [0x8aa0b8, 0xffffff, 0.5, 0.6], 7: [0x0a4a40, 0x50ffc8, 0.7, 2.2], 8: [0x23233a, 0x7a7ab0, 1.0, 0.9],
  9: [0x140824, 0xa050ff, 0.5, 0.8], 10: [0xb09040, 0xfff2c8, 1.6, 0.8],
};

export const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();

export function local(base, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  tmpP.set(x, y, z); tmpQ.setFromEuler(tmpE.set(rx, ry, rz)); tmpS.set(sx, sy, sz);
  return base.clone().multiply(tmpM.compose(tmpP, tmpQ, tmpS));
}

export const I = new THREE.Matrix4();

export const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

// 文字のスプライト（出口の行き先やNPC名など）
export function textSprite(text, color = '#ffffff', width = 5, sub = '') {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = sub ? 128 : 80;
  const g = cv.getContext('2d');
  g.font = 'bold 44px "Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.85)';
  g.strokeText(text, 256, 40); g.fillStyle = color; g.fillText(text, 256, 40);
  if (sub) { g.font = 'bold 30px sans-serif'; g.strokeText(sub, 256, 98); g.fillStyle = '#ffffff'; g.fillText(sub, 256, 98); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xdddddd, depthTest: false, depthWrite: false, transparent: true, fog: false }));
  sp.geometry.userData.shared = true;
  sp.renderOrder = 998;
  sp.scale.set(width, width * cv.height / 512, 1);
  sp.userData.disposeMap = true;
  return sp;
}

export const propColor = (fdef, types, i, fb) => {
  const p = fdef.props.find((q) => types.includes(q[0]));
  return p ? p[2 + i] ?? fb : fb;
};
