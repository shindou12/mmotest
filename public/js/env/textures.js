// エリアの見た目: コードで描く繰り返し模様（地面の細かいムラ・石畳）。どれも一度だけ作って使い回す
import * as THREE from 'three';
import { seeded } from './kit.js';

const cache = {};
function canvasTex(key, size, draw) {
  if (cache[key]) return cache[key];
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.shared = true;
  return (cache[key] = t);
}
// 端でつながるように、はみ出した分は反対側にも描く
function wrapped(size, x, y, r, f) { for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) if (Math.abs(x + dx - size / 2) < size / 2 + r && Math.abs(y + dy - size / 2) < size / 2 + r) f(x + dx, y + dy); }

// 地面の細かいムラ（ほぼ白。頂点色に掛けて、のっぺりした面に土と草の粒を足す）
export function groundDetail() {
  return canvasTex('ground', 256, (g, S) => {
    const R = seeded(11);
    g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) { // 大きめのムラ
      const x = R() * S, y = R() * S, r = 10 + R() * 26, v = 215 + R() * 50;
      wrapped(S, x, y, r, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, `rgba(${v},${v},${v},0.35)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2); });
    }
    for (let i = 0; i < 1400; i++) { // 粒
      const x = R() * S, y = R() * S, r = 0.8 + R() * 1.8, v = R() < 0.75 ? 175 + R() * 40 : 255, rot = R() * 3;
      wrapped(S, x, y, r, (px, py) => { g.fillStyle = `rgba(${v},${v},${v - 6},0.55)`; g.beginPath(); g.ellipse(px, py, r * 1.4, r, rot, 0, Math.PI * 2); g.fill(); });
    }
  });
}

// 石畳（不ぞろいな石を、少し暗い目地でつなぐ）。1枚 = 約5m四方
export function cobbles() {
  return canvasTex('cobble', 512, (g, S) => {
    const R = seeded(23);
    g.fillStyle = '#857e73'; g.fillRect(0, 0, S, S);
    const rows = 8, h = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = (r % 2) * h * 0.5 - h;
      while (x < S) {
        const w = h * (0.8 + R() * 0.7), cx = x + w / 2, cy = r * h + h / 2;
        const v = 168 + R() * 26, warm = R() * 10, n = 9, js = Array.from({ length: n }, () => 0.86 + R() * 0.14);
        wrapped(S, cx, cy, w, (px, py) => {
          // 角を丸めた、少しゆがんだ石
          g.fillStyle = `rgb(${v + warm},${v + warm * 0.6},${v - 4})`;
          g.beginPath();
          const rx = w / 2 - 2.5, ry = h / 2 - 2.5;
          for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2, j = js[k % n]; g.lineTo(px + Math.cos(a) * rx * j * (Math.abs(Math.cos(a)) > 0.5 ? 1.08 : 1), py + Math.sin(a) * ry * j); }
          g.fill();
          g.fillStyle = 'rgba(255,255,255,0.05)'; g.beginPath(); g.ellipse(px - rx * 0.15, py - ry * 0.2, rx * 0.6, ry * 0.45, 0, 0, Math.PI * 2); g.fill();
        });
        x += w;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// 素材の模様（白黒。明るさだけを使い、頂点色に掛ける）。Batch.add(…, { surf: SURF.bark }) のように使う
// ---------------------------------------------------------------------------
function grayTex(key, draw) {
  if (cache[key]) return cache[key];
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
  draw(cv.getContext('2d'), S, seeded(hashKey(key)));
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  t.userData.shared = true;
  return (cache[key] = t);
}
const hashKey = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const blob = (g, S, x, y, r, v, a = 0.4) => wrapped(S, x, y, r, (px, py) => {
  const gr = g.createRadialGradient(px, py, 0, px, py, r);
  gr.addColorStop(0, `rgba(${v},${v},${v},${a})`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
  g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
});
// 端でつながる折れ線（縦に1周する）
function wavyLine(g, S, x0, w, v, amp, R, vertical = true) {
  const pts = [], n = 16, ph = R() * 6.28, f = 1 + Math.floor(R() * 3);
  for (let k = 0; k <= n; k++) pts.push([x0 + Math.sin(k / n * 6.28 * f + ph) * amp + (R() - 0.5) * amp * 0.6 * (k % n ? 1 : 0), k / n * S]);
  g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = w; g.lineCap = 'round';
  for (const d of [-S, 0, S]) {
    g.beginPath();
    pts.forEach(([a, b], k) => { const X = (vertical ? a : b) + (vertical ? d : 0), Y = (vertical ? b : a) + (vertical ? 0 : d); if (k) g.lineTo(X, Y); else g.moveTo(X, Y); });
    g.stroke();
  }
}

const TEX = {
  // 木の皮: 縦の深い割れ目と、短い横のひび
  bark: () => grayTex('bark', (g, S, R) => {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) blob(g, S, R() * S, R() * S, 14 + R() * 20, 150 + R() * 100, 0.35);
    for (let i = 0; i < 22; i++) wavyLine(g, S, R() * S, 3 + R() * 5, 95 + R() * 40, 4 + R() * 6, R);
    for (let i = 0; i < 26; i++) wavyLine(g, S, R() * S, 1.5, 245, 3 + R() * 4, R);
    for (let i = 0; i < 60; i++) { const x = R() * S, y = R() * S, l = 4 + R() * 8; wrapped(S, x, y, l, (px, py) => { g.strokeStyle = 'rgba(90,90,90,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px - l / 2, py); g.lineTo(px + l / 2, py + (R() - 0.5) * 2); g.stroke(); }); }
  }),
  // 葉の茂み: 向きのそろわない葉の形をたくさん重ねる（明るい葉・影の葉）
  leaf: () => grayTex('leaf', (g, S, R) => {
    g.fillStyle = '#b4b4b4'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      const x = R() * S, y = R() * S, r = 4 + R() * 6, v = R() < 0.45 ? 120 + R() * 40 : 205 + R() * 50, rot = R() * 6.28;
      wrapped(S, x, y, r * 1.6, (px, py) => { g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.ellipse(px, py, r * 1.6, r * 0.75, rot, 0, Math.PI * 2); g.fill(); });
    }
    for (let i = 0; i < 30; i++) blob(g, S, R() * S, R() * S, 20 + R() * 25, 90, 0.3);
  }),
  // 岩: まだらと細いひび
  stone: () => grayTex('stone', (g, S, R) => {
    g.fillStyle = '#d4d4d4'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) blob(g, S, R() * S, R() * S, 10 + R() * 30, 150 + R() * 105, 0.4);
    for (let i = 0; i < 500; i++) { const x = R() * S, y = R() * S, v = R() < 0.5 ? 150 : 250; wrapped(S, x, y, 2, (px, py) => { g.fillStyle = `rgba(${v},${v},${v},0.6)`; g.fillRect(px, py, 1.5, 1.5); }); }
    for (let i = 0; i < 7; i++) wavyLine(g, S, R() * S, 1.6, 110, 18, R, R() < 0.5);
  }),
  // 漆喰: ごく弱いまだらと粒
  plaster: () => grayTex('plaster', (g, S, R) => {
    g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 60; i++) blob(g, S, R() * S, R() * S, 15 + R() * 35, 190 + R() * 65, 0.35);
    for (let i = 0; i < 900; i++) { const x = R() * S, y = R() * S, v = R() < 0.6 ? 195 : 255; wrapped(S, x, y, 2, (px, py) => { g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(px, py, 1.3, 1.3); }); }
  }),
  // 板・木材: 木目（横の細い線）と節
  wood: () => grayTex('wood', (g, S, R) => {
    g.fillStyle = '#d6d6d6'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 46; i++) wavyLine(g, S, R() * S, 1 + R() * 2.2, 140 + R() * 70, 2 + R() * 3, R, false);
    for (let i = 0; i < 4; i++) blob(g, S, R() * S, R() * S, 5 + R() * 4, 90, 0.7);
    for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(80,80,80,0.55)'; g.fillRect(0, k * S / 4, S, 2); } // 板の継ぎ目
  }),
  // 屋根: 段ごとにずらした板瓦
  roof: () => grayTex('roof', (g, S, R) => {
    g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, S, S);
    const rows = 8, h = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = (r % 2) * 16 - 32;
      while (x < S) {
        const w = 26 + R() * 14, v = 185 + R() * 60;
        g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + 1.5, r * h + 1, w - 3, h - 3);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 1.5, r * h + h - 7, w - 3, 5);
        x += w;
      }
    }
  }),
  // 石積み: 不ぞろいな切り石を目地でつなぐ（壁・土台・塔）
  masonry: () => grayTex('masonry', (g, S, R) => {
    g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, S, S);
    const rows = 6, h = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = (r % 2) * 22 - 44;
      while (x < S) {
        const w = 34 + R() * 30, v = 180 + R() * 65;
        g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + 2, r * h + 2, w - 4, h - 4);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 2, r * h + 2, w - 4, 4);
        x += w;
      }
    }
    for (let i = 0; i < 300; i++) { const x = R() * S, y = R() * S; g.fillStyle = 'rgba(120,120,120,0.4)'; g.fillRect(x, y, 2, 2); }
  }),
};
// 素材: 模様・1枚の大きさ（m）・濃さ
export const SURF = {
  bark: { key: 'bark', tex: TEX.bark, scale: 1.1, strength: 0.75 },
  birch: { key: 'birch', tex: TEX.bark, scale: 0.9, strength: 0.22 },
  leaf: { key: 'leaf', tex: TEX.leaf, scale: 1.4, strength: 0.55 },
  stone: { key: 'stone', tex: TEX.stone, scale: 2.2, strength: 0.6 },
  plaster: { key: 'plaster', tex: TEX.plaster, scale: 2.5, strength: 0.5 },
  wood: { key: 'wood', tex: TEX.wood, scale: 1.6, strength: 0.55 },
  roof: { key: 'roof', tex: TEX.roof, scale: 1.8, strength: 0.6 },
  masonry: { key: 'masonry', tex: TEX.masonry, scale: 2.4, strength: 0.6 },
};
