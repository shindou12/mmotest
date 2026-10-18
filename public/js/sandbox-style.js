// 箱庭の質感の試作（ゲーム本体では使っていない）
//   A 配色画像: 素材の種類（草・土・葉・幹・岩・漆喰・屋根・木材・金属・花・石畳）ごとの色を、場所ごとに1行ずつ並べた小さな画像。
//     モデルの頂点色から素材の種類を見分け、色はこの画像から引く。画像の行を替えると、場所の配色に丸ごと変わる
//   B パターン画像: 岩の割れ目・木の皮・葉の塊・漆喰・瓦・板・草・石畳の白黒の模様（コードで作る。手描きに差し替えできる）。
//     ワールド座標から3方向に貼る（トライプラナー）ので、モデルの展開（UV）は要らない。頂点色に明暗だけを掛ける
//   縁の明かり: 輪郭の内側を空の色で少し明るくする（形の立体感を出す。キャラにも掛かる）
import * as THREE from 'three';

// ---- 素材の種類 ----
export const CLASSES = ['草', '土', '葉', '幹', '岩', '漆喰', '屋根', '木材', '金属', '花', '石畳'];
const C = Object.fromEntries(CLASSES.map((k, i) => [k, i]));
const NCLS = 16;

// 頂点色（sRGB の色相・彩度・明度）から素材の種類を見分ける。ground: 地面のメッシュ
const hsl = { h: 0, s: 0, l: 0 }, tmpC = new THREE.Color();
export function classify(r, g, b, ground) {
  tmpC.setRGB(r, g, b).getHSL(hsl, THREE.SRGBColorSpace);
  const { h, s, l } = hsl;
  if (ground) return s < 0.12 ? C.石畳 : h > 0.17 && h < 0.47 ? C.草 : C.土;
  if (l > 0.8 && s < 0.5) return C.漆喰;
  if (l > 0.62 && s > 0.5) return C.花;
  if (s < 0.12) return l < 0.3 ? C.金属 : C.岩;
  if (h > 0.17 && h < 0.47) return C.葉;
  if (h >= 0.03 && h <= 0.17) return s < 0.3 ? C.木材 : l < 0.36 ? C.幹 : C.木材;
  return C.屋根;
}

// ---- A 配色画像（場所ごとに1行） ----
export const REGIONS = ['草原', '霧の森', '砂漠', '夕暮れ'];
const ROWS = [
  //   草        土        葉        幹        岩        漆喰      屋根      木材      金属      花  石畳
  [0x6aa84f, 0x9a7b55, 0x3f8a46, 0x6b4a32, 0x8d9196, 0xeae0c8, 0xb25a3c, 0x8f6f4a, 0x3c4250, 0, 0xa59f8f],
  [0x4f7a5a, 0x5e5444, 0x2e5a48, 0x4a3a30, 0x6f7c7a, 0xc9cdbf, 0x5a6a8a, 0x6a5a48, 0x30363e, 0, 0x7c8481],
  [0xb8a46a, 0xc69a62, 0x7c8a46, 0x7a5636, 0xc08a5a, 0xf0dcb4, 0xc06a3a, 0x9a7048, 0x4a3a34, 0, 0xd2b88c],
  [0x7a8a4a, 0x8a5a44, 0x4a6a4a, 0x5a3a3a, 0x8a7a8a, 0xf0c8a8, 0x9a3a4a, 0x7a5040, 0x3a3048, 0, 0xa08a84],
];
export function paletteTexture() {
  const W = NCLS, H = 8, data = new Uint8Array(W * H * 4);
  ROWS.forEach((row, y) => row.forEach((hex, x) => {
    const i = (y * W + x) * 4;
    data[i] = (hex >> 16) & 255; data[i + 1] = (hex >> 8) & 255; data[i + 2] = hex & 255;
    data[i + 3] = x === C.花 ? 0 : 215; // 花は元の色のまま（アルファ = 配色画像の色を混ぜる量）
  }));
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}
export const paletteRows = ROWS;

// ---- B パターン画像（8枚を1枚にまとめる。128px × 4列 × 2行。どれも端がつながる） ----
const TS = 128, TILES = ['岩の割れ目', '木の皮', '葉の塊', '漆喰', '瓦', '板', '草', '石畳'];
export const PATTERN_NAMES = TILES;
function hash(x, y, s = 0) { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); }
// 周期 p の格子の値ノイズ（端がつながる）
function vnoise(x, y, p, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, w = (t) => t * t * (3 - 2 * t);
  const g = (a, b) => hash(((a % p) + p) % p, ((b % p) + p) % p, s);
  return g(xi, yi) * (1 - w(fx)) * (1 - w(fy)) + g(xi + 1, yi) * w(fx) * (1 - w(fy)) + g(xi, yi + 1) * (1 - w(fx)) * w(fy) + g(xi + 1, yi + 1) * w(fx) * w(fy);
}
const fbm = (u, v, p, s) => vnoise(u * p, v * p, p, s) * 0.55 + vnoise(u * p * 2, v * p * 2, p * 2, s + 1) * 0.3 + vnoise(u * p * 4, v * p * 4, p * 4, s + 2) * 0.15;
// 周期つきのボロノイ（1番目と2番目に近い点までの距離）
function voronoi(u, v, n, s) {
  let d1 = 9, d2 = 9;
  const x = u * n, y = v * n, xi = Math.floor(x), yi = Math.floor(y);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j, wx = ((cx % n) + n) % n, wy = ((cy % n) + n) % n;
    const px = cx + hash(wx, wy, s), py = cy + hash(wx, wy, s + 9), d = Math.hypot(px - x, py - y);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return [d1, d2];
}
const PAT = [
  (u, v) => { const [a, b] = voronoi(u, v, 5, 1); const edge = Math.min(1, (b - a) * 9); return 0.55 + 0.45 * edge * (0.8 + 0.2 * fbm(u, v, 4, 3)); },
  (u, v) => { const n = fbm(u * 0.25, v, 8, 5); const line = 0.5 + 0.5 * Math.sin((u * 18 + n * 3) * Math.PI * 2 / 2); return 0.6 + 0.4 * Math.pow(line, 0.6) * (0.85 + 0.15 * fbm(u, v, 6, 7)); },
  (u, v) => { const [a] = voronoi(u, v, 6, 11); const blob = Math.max(0, 1 - a * 1.6); return 0.5 + 0.5 * Math.pow(blob, 0.5) * (0.8 + 0.2 * fbm(u, v, 8, 13)); },
  (u, v) => 0.82 + 0.18 * fbm(u, v, 6, 17) - (voronoi(u, v, 3, 19)[1] - voronoi(u, v, 3, 19)[0] < 0.03 ? 0.15 : 0),
  (u, v) => { const row = Math.floor(v * 6), x = u * 5 + (row % 2) * 0.5, fx = x - Math.floor(x), fy = v * 6 - row; return 0.55 + 0.45 * Math.min(1, Math.sin(fx * Math.PI) * 1.6) * Math.min(1, (1 - fy) * 3) * (0.9 + 0.1 * fbm(u, v, 8, 23)); },
  (u, v) => { const row = Math.floor(v * 4), fy = v * 4 - row, seam = fy < 0.06 ? 0.55 : 1, grain = 0.85 + 0.15 * Math.sin((u * 3 + fbm(u, v * 0.3, 4, 29 + row) * 2) * Math.PI * 6); return seam * grain; },
  (u, v) => 0.7 + 0.3 * fbm(u, v, 16, 31) * (0.7 + 0.3 * vnoise(u * 32, v * 32, 32, 37)),
  (u, v) => { const [a, b] = voronoi(u, v, 4, 41); const gap = Math.min(1, (b - a) * 7); return 0.5 + 0.5 * gap * (1 - a * 0.35); },
];
export function patternAtlas() {
  const cv = document.createElement('canvas'); cv.width = TS * 4; cv.height = TS * 2;
  const g = cv.getContext('2d'), im = g.createImageData(cv.width, cv.height);
  PAT.forEach((f, k) => {
    const ox = (k % 4) * TS, oy = Math.floor(k / 4) * TS;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const v = Math.max(0, Math.min(1, f(x / TS, y / TS))), i = ((oy + y) * cv.width + ox + x) * 4;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = Math.round(v * 255); im.data[i + 3] = 255;
    }
  });
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false; // 上の段 = 0〜3 番の模様
  t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  return { tex: t, canvas: cv };
}
// 素材の種類 → [パターンの番号（-1 = なし）, 1m あたりの繰り返し, 強さ]
const CLASS_PAT = { 草: [6, 0.22, 0.25], 土: [0, 0.4, 0.3], 葉: [2, 0.9, 0.55], 幹: [1, 1.0, 0.6], 岩: [0, 0.55, 0.6], 漆喰: [3, 0.5, 0.35], 屋根: [4, 0.9, 0.55], 木材: [5, 0.9, 0.5], 金属: [3, 1.0, 0.15], 花: [-1, 1, 0], 石畳: [7, 0.4, 0.6] };

// ---- 共通の uniform（全部の質感で共有。操作盤から書き換える） ----
export function makeStyleUniforms(pal, atlas) {
  const tile = new Array(NCLS).fill(-1), scl = new Array(NCLS).fill(1), str = new Array(NCLS).fill(0);
  CLASSES.forEach((k, i) => { [tile[i], scl[i], str[i]] = CLASS_PAT[k]; });
  return {
    uPal: { value: pal }, uRegion: { value: 0 }, uPalOn: { value: 0 },
    uAtlas: { value: atlas }, uPatOn: { value: 0 }, uPatStr: { value: 1 },
    uTile: { value: tile }, uScl: { value: scl }, uStr: { value: str },
    uRim: { value: 0 }, uRimC: { value: new THREE.Color(0xcfe8ff) },
  };
}

// 頂点色つきのトゥーン（地面・木・岩・家）に A・B を足す
export function styledToon(U, gradientMap) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = `attribute float aCls; attribute float aShade; varying float vCls; varying vec3 vWP; varying vec3 vWN;
      uniform sampler2D uPal; uniform float uRegion; uniform float uPalOn;\n` + sh.vertexShader
      .replace('#include <color_vertex>', `#include <color_vertex>
        vCls = aCls;
        if (uPalOn > 0.5) { vec4 pc = texture2D(uPal, vec2((aCls + 0.5) / ${NCLS}.0, (uRegion + 0.5) / 8.0)); vColor.rgb = mix(vColor.rgb, pc.rgb * aShade, pc.a); }`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = `varying float vCls; varying vec3 vWP; varying vec3 vWN; uniform sampler2D uAtlas; uniform float uPatOn; uniform float uPatStr;
      uniform float uTile[${NCLS}]; uniform float uScl[${NCLS}]; uniform float uStr[${NCLS}]; uniform float uRim; uniform vec3 uRimC;
      float patAt(vec2 p, float tile) { vec2 o = vec2(mod(tile, 4.0), floor(tile / 4.0)); vec2 f = fract(p); f = clamp(f, 0.004, 0.996); return texture2D(uAtlas, (o + f) / vec2(4.0, 2.0)).r; }
      float detail() {
        int k = int(vCls + 0.5); float tile = uTile[k]; if (tile < 0.0 || uPatOn < 0.5) return 1.0;
        vec3 w = pow(abs(normalize(vWN)), vec3(4.0)); w /= (w.x + w.y + w.z);
        vec3 p = vWP * uScl[k];
        float v = patAt(p.zy, tile) * w.x + patAt(p.xz, tile) * w.y + patAt(p.xy, tile) * w.z;
        return mix(1.0, v * 1.18, uStr[k] * uPatStr);
      }\n` + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= detail();')
      .replace('#include <opaque_fragment>', '  outgoingLight += uRimC * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0) * uRim * 0.6;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'sbx-styled';
  m.userData.sbxRim = true; // 縁の明かりは自分で持っている
  return m;
}

// キャラ・敵など、ほかのトゥーンには縁の明かりだけ足す（もとの onBeforeCompile も呼ぶ）
export function addRim(m, U) {
  if (m.userData.sbxRim) return;
  m.userData.sbxRim = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey?.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    Object.assign(sh.uniforms, { uRim: U.uRim, uRimC: U.uRimC });
    sh.fragmentShader = 'uniform float uRim; uniform vec3 uRimC;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', '  outgoingLight += uRimC * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0) * uRim * 0.6;\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'sbx-rim-' + (prevKey ? prevKey() : '');
  m.needsUpdate = true;
}

// 頂点色から素材の種類（aCls）と、元の色の濃淡（aShade: 同じ種類の平均との比）を作る
export function tagGeometry(geo, ground) {
  const col = geo.attributes.color;
  if (!col) return;
  const n = col.count, cls = new Float32Array(n), shade = new Float32Array(n), sum = new Float32Array(NCLS), cnt = new Float32Array(NCLS), lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = col.getX(i), g = col.getY(i), b = col.getZ(i);
    cls[i] = classify(r, g, b, ground); lum[i] = 0.3 * r + 0.59 * g + 0.11 * b;
    sum[cls[i]] += lum[i]; cnt[cls[i]]++;
  }
  for (let i = 0; i < n; i++) { const avg = sum[cls[i]] / Math.max(1, cnt[cls[i]]); shade[i] = Math.max(0.6, Math.min(1.4, avg > 0 ? 1 + (lum[i] / avg - 1) * 1.6 : 1)); } // 元のまだらを少し強めて残す
  geo.setAttribute('aCls', new THREE.BufferAttribute(cls, 1));
  geo.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
}
