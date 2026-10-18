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
