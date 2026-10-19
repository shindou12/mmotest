// RO風の見た目（実験）: 筆で描いたような地面の模様（草・土・川岸）と、それを場所ごとに混ぜる地面の材質
//   模様はコードで描く（画像のアセットはいらない）。どれも端でつながる繰り返し模様
import * as THREE from 'three';
import { seeded } from '../env/kit.js';

const cache = {};
function paint(key, size, draw) {
  if (cache[key]) return cache[key];
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size, seeded(key.length * 977 + key.charCodeAt(0)));
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (cache[key] = t);
}
// 端でつながるように、はみ出した分は反対側にも描く
function wrap(S, x, y, r, f) { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) if (Math.abs(x + dx - S / 2) < S / 2 + r && Math.abs(y + dy - S / 2) < S / 2 + r) f(x + dx, y + dy); }
const pick = (R, a) => a[Math.floor(R() * a.length)];
function blobs(g, S, R, n, r0, r1, cols, alpha) {
  for (let i = 0; i < n; i++) {
    const x = R() * S, y = R() * S, r = r0 + R() * (r1 - r0), c = pick(R, cols);
    wrap(S, x, y, r, (px, py) => { const gr = g.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, c + alpha); gr.addColorStop(1, c + '00'); g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2); });
  }
}
function pebbles(g, S, R, n, r0, r1, cols) {
  for (let i = 0; i < n; i++) {
    const x = R() * S, y = R() * S, rx = r0 + R() * (r1 - r0), ry = rx * (0.55 + R() * 0.3), rot = R() * 3, c = pick(R, cols);
    wrap(S, x, y, rx + 2, (px, py) => {
      g.fillStyle = 'rgba(60,45,35,0.35)'; g.beginPath(); g.ellipse(px + 1, py + 1.5, rx, ry, rot, 0, 7); g.fill(); // 落ちる影
      g.fillStyle = c; g.beginPath(); g.ellipse(px, py, rx, ry, rot, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,250,235,0.35)'; g.beginPath(); g.ellipse(px - rx * 0.25, py - ry * 0.3, rx * 0.5, ry * 0.4, rot, 0, 7); g.fill(); // 上の明るい面
    });
  }
}

export const PAINT = {
  // 草: 明暗のまだらの上に、根元が暗く先が明るい草の房を筆で置き、ところどころに小花
  grass: () => paint('ro-grass', 512, (g, S, R) => {
    g.fillStyle = '#84b84c'; g.fillRect(0, 0, S, S);
    blobs(g, S, R, 70, 40, 90, ['#6a9e40', '#9cc85a', '#acd066', '#76a644'], '66');
    for (let i = 0; i < 1100; i++) {
      const x = R() * S, y = R() * S, n = 3 + Math.floor(R() * 3), h = 6 + R() * 7, light = R();
      const base = light < 0.5 ? '#4e8237' : '#5d923f', tip = light < 0.3 ? '#8fc35e' : light < 0.8 ? '#a5d070' : '#c2e08a';
      wrap(S, x, y, h + 4, (px, py) => {
        for (let k = 0; k < n; k++) {
          const a = -Math.PI / 2 + (k - (n - 1) / 2) * 0.32 + (R() - 0.5) * 0.25, L = h * (0.7 + R() * 0.4);
          const ex = px + Math.cos(a) * L, ey = py + Math.sin(a) * L;
          const gr = g.createLinearGradient(px, py, ex, ey); gr.addColorStop(0, base); gr.addColorStop(1, tip);
          g.strokeStyle = gr; g.lineWidth = 2.2; g.lineCap = 'round';
          g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + (ex - px) * 0.3, py + (ey - py) * 0.6, ex, ey); g.stroke();
        }
      });
    }
    for (let i = 0; i < 26; i++) { // 小花の集まり
      const cx = R() * S, cy = R() * S, c = pick(R, ['#fff8e8', '#ffe27a', '#f6a8c0', '#d8c8ff']);
      for (let k = 0; k < 4 + R() * 4; k++) {
        const x = cx + (R() - 0.5) * 18, y = cy + (R() - 0.5) * 12;
        wrap(S, x, y, 4, (px, py) => { g.fillStyle = 'rgba(40,70,30,0.35)'; g.beginPath(); g.arc(px + 0.8, py + 1.2, 2.4, 0, 7); g.fill(); g.fillStyle = c; g.beginPath(); g.arc(px, py, 2.2, 0, 7); g.fill(); });
      }
    }
  }),
  // 土の道: 暖かい黄土色に、踏み固めた明るいすじと小石
  dirt: () => paint('ro-dirt', 512, (g, S, R) => {
    g.fillStyle = '#d2b47c'; g.fillRect(0, 0, S, S);
    blobs(g, S, R, 60, 30, 80, ['#c0a068', '#e2c890', '#b89660'], '70');
    for (let i = 0; i < 500; i++) {
      const x = R() * S, y = R() * S, L = 8 + R() * 22, c = R() < 0.6 ? 'rgba(232,206,160,0.45)' : 'rgba(150,110,70,0.35)';
      wrap(S, x, y, L, (px, py) => { g.strokeStyle = c; g.lineWidth = 1.5 + R() * 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(px, py); g.lineTo(px + L, py + (R() - 0.5) * 4); g.stroke(); });
    }
    pebbles(g, S, R, 160, 2, 6, ['#a89880', '#9a8c78', '#b8a890', '#8c7c68']);
  }),
  // 川岸: 湿った砂に、丸い石が多め
  bank: () => paint('ro-bank', 512, (g, S, R) => {
    g.fillStyle = '#a89878'; g.fillRect(0, 0, S, S);
    blobs(g, S, R, 70, 30, 70, ['#968664', '#bcae8c', '#8a7c60'], '80');
    pebbles(g, S, R, 260, 3, 10, ['#a8a49a', '#9a968c', '#b8b4a8', '#8c887e', '#a49478']);
  }),
};

// RO風の地面: 草・土・川岸の模様を、頂点ごとの割合（splat: 草, 土, 岸）で混ぜる。境目は筆のようにぎざぎざに
//   陰影は段にせず、やわらかい拡散光。shade: 場所ごとの色の掛け算（森の下の暗さなど）
export function roGroundMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const U = { tGrass: { value: PAINT.grass() }, tDirt: { value: PAINT.dirt() }, tBank: { value: PAINT.bank() } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute vec3 splat; attribute vec3 shade; varying vec3 vSplat; varying vec3 vShade; varying vec2 vWXZ;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSplat = splat; vShade = shade; vWXZ = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = 'uniform sampler2D tGrass; uniform sampler2D tDirt; uniform sampler2D tBank; varying vec3 vSplat; varying vec3 vShade; varying vec2 vWXZ;\n'
      + sh.fragmentShader.replace('#include <map_fragment>', `
      vec3 g = mix(texture2D(tGrass, vWXZ / 7.0).rgb, texture2D(tGrass, vWXZ / 19.0 + 0.37).rgb, 0.35);
      vec3 d = texture2D(tDirt, vWXZ / 6.0).rgb;
      vec3 b = texture2D(tBank, vWXZ / 6.5).rgb;
      float n = (texture2D(tGrass, vWXZ / 3.1).g - 0.45) * 0.9; // 境目を草の模様で崩す
      float wd = smoothstep(0.35, 0.65, vSplat.y + n), wb = smoothstep(0.35, 0.65, vSplat.z + n * 0.8);
      vec3 col = mix(mix(g, b, wb), d, wd);
      diffuseColor.rgb *= col * vShade;`);
  };
  return m;
}
