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
    g.fillStyle = '#79ad52'; g.fillRect(0, 0, S, S);
    blobs(g, S, R, 70, 40, 90, ['#5f9443', '#8cbd5c', '#9cc46a', '#6a9a46'], '66');
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
    g.fillStyle = '#c29a68'; g.fillRect(0, 0, S, S);
    blobs(g, S, R, 60, 30, 80, ['#b08658', '#d4ae7c', '#a87e52'], '70');
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

// 絵の木（板の木）: 筆の点を重ねて描いた木の絵。光は左上から。kind: 'broad'（広葉樹）| 'pine'（針葉樹）
//   返す texture は下端が根元。aspect = 幅 / 高さ
const TREE_PAL = {
  broad: [['#2c5a2c', '#3c7434', '#549440', '#74b04e', '#9ccc68', '#c4e286'], ['#3a5e28', '#4e7a30', '#6a983c', '#8cb44c', '#b2cc66', '#d6e48a'], ['#24543a', '#326c44', '#468a52', '#62a662', '#8cc47a', '#b6dc98']],
  pine: [['#183a2e', '#22503a', '#2e6646', '#447e54', '#62986a', '#86b47e'], ['#1c3c34', '#285446', '#366c54', '#4c8462', '#6c9e74', '#92ba8c']],
};
export function paintedTree(kind, variant = 0) {
  const W = kind === 'pine' ? 192 : 256, H = 320;
  const key = `ro-tree-${kind}-${variant}`;
  if (cache[key]) return { tex: cache[key], aspect: W / H };
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), R = seeded(variant * 7919 + (kind === 'pine' ? 31 : 7));
  const pal = TREE_PAL[kind][variant % TREE_PAL[kind].length];
  const shadeAt = (x, y, cx, cy, rad) => { // 左上が明るく、右下と下側が暗い
    const t = (-(x - cx) * 0.6 - (y - cy) * 0.8) / rad;
    return Math.max(0, Math.min(pal.length - 1, Math.round((t * 0.5 + 0.5) * (pal.length - 1.6) + (R() - 0.3) * 1.6)));
  };
  // 幹
  const trunk = (x0, y0, x1, y1, w0, w1) => {
    const ang = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2, c = Math.cos(ang), s = Math.sin(ang);
    const poly = (k0, k1, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x0 + c * w0 * k0, y0 + s * w0 * k0); g.lineTo(x1 + c * w1 * k0, y1 + s * w1 * k0); g.lineTo(x1 + c * w1 * k1, y1 + s * w1 * k1); g.lineTo(x0 + c * w0 * k1, y0 + s * w0 * k1); g.fill(); };
    poly(-1, 1, '#6a4a2e'); poly(0.25, 1, '#4c3420'); poly(-1, -0.45, '#8c6844');
  };
  if (kind === 'broad') {
    const cx = W / 2, cy = 118, rad = 100;
    trunk(cx, H - 2, cx + (R() - 0.5) * 10, 170, 15, 8);
    trunk(cx, 215, cx - 34, 160, 6, 3); trunk(cx + 2, 200, cx + 38, 150, 6, 3);
    // 地面に落ちる影（根元）
    g.fillStyle = 'rgba(30,50,20,0.35)'; g.beginPath(); g.ellipse(cx + 6, H - 4, 34, 6, 0, 0, 7); g.fill();
    // 茂みの形: 丸を数個重ねる
    const lobes = [[cx, cy, 70]];
    for (let i = 0; i < 6; i++) { const a = R() * Math.PI * 2; lobes.push([cx + Math.cos(a) * (40 + R() * 22), cy + Math.sin(a) * (34 + R() * 18) * 0.85, 40 + R() * 22]); }
    const inside = (x, y) => lobes.some(([lx, ly, lr]) => (x - lx) ** 2 + (y - ly) ** 2 < lr * lr);
    g.fillStyle = pal[0]; for (const [lx, ly, lr] of lobes) { g.beginPath(); g.arc(lx + 3, ly + 5, lr + 3, 0, 7); g.fill(); }
    g.fillStyle = pal[1]; for (const [lx, ly, lr] of lobes) { g.beginPath(); g.arc(lx, ly, lr, 0, 7); g.fill(); }
    for (let i = 0; i < 1600; i++) {
      const x = cx + (R() - 0.5) * 2 * rad * 1.15, y = cy + (R() - 0.5) * 2 * rad;
      if (!inside(x, y)) continue;
      g.fillStyle = pal[shadeAt(x, y, cx, cy - 10, rad)];
      g.beginPath(); g.ellipse(x, y, 5 + R() * 6, 3.5 + R() * 3, R() * 3.14, 0, 7); g.fill();
    }
    if (variant === 1) for (let i = 0; i < 14; i++) { // 実
      const x = cx + (R() - 0.5) * 150, y = cy + (R() - 0.3) * 120; if (!inside(x, y)) continue;
      g.fillStyle = '#c8402e'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); g.fillStyle = '#ff9a7a'; g.beginPath(); g.arc(x - 1.2, y - 1.2, 1.4, 0, 7); g.fill();
    }
  } else {
    const cx = W / 2;
    trunk(cx, H - 2, cx, 230, 10, 7);
    g.fillStyle = 'rgba(20,40,20,0.35)'; g.beginPath(); g.ellipse(cx + 6, H - 4, 26, 5, 0, 0, 7); g.fill();
    const tiers = 5;
    for (let t = 0; t < tiers; t++) {
      const yb = 262 - t * 46, yt = yb - 92, hw = 82 - t * 13;
      const tri = (dx, dy, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(cx + dx, yt + dy); g.quadraticCurveTo(cx - hw * 0.5 + dx, yb - 30 + dy, cx - hw + dx, yb + dy); g.quadraticCurveTo(cx + dx, yb - 14 + dy, cx + hw + dx, yb + dy); g.quadraticCurveTo(cx + hw * 0.5 + dx, yb - 30 + dy, cx + dx, yt + dy); g.fill(); };
      tri(3, 5, pal[0]); tri(0, 0, pal[1]);
      for (let i = 0; i < 260; i++) {
        const v = R(), y = yt + (yb - yt) * Math.sqrt(v), w = hw * Math.sqrt(v) * 0.92, x = cx + (R() - 0.5) * 2 * w;
        g.fillStyle = pal[shadeAt(x, y, cx, (yt + yb) / 2, hw)];
        g.beginPath(); g.ellipse(x, y, 5 + R() * 4, 2.5 + R() * 2, (x < cx ? 0.5 : -0.5) + (R() - 0.5) * 0.4, 0, 7); g.fill();
      }
    }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  cache[key] = t;
  return { tex: t, aspect: W / H };
}
