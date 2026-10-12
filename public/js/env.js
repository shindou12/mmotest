// エリアの地形・建物・プロップ・草・空・遠景（トゥーン調）
import * as THREE from 'three';
import { CELL, AREAS, grid, exitsOf, lairOf } from '../shared/areas.js';
import { toon, glow, outline, Batch } from './toon.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const hashStr = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

function noise2(x, z) {
  return Math.sin(x * 0.11) * Math.cos(z * 0.13) + Math.sin(x * 0.037 + z * 0.05) * 1.6 + Math.sin(x * 0.31 - z * 0.27) * 0.3;
}

// エリアごとの地面の高さ関数（屋内は平ら）
export function makeHeight(def) {
  if (def.shape === 'grid') return () => 0;
  const exits = exitsOf(def), R = def.R;
  const flat = def.type === 'town' ? 0.15 : def.type === 'camp' ? 0.4 : 1;
  return (x, z) => {
    const r = Math.hypot(x, z);
    let h = noise2(x, z) * 0.35 * flat;
    if (def.gate) h *= Math.min(1, Math.hypot(x - def.gate.x, z - def.gate.z) / 12);
    for (const e of exits) h *= Math.min(1, Math.hypot(x - e.x, z - e.z) / 6);
    if (r > R) h += (r - R) * 0.6;
    return h;
  };
}

// 草の設定 [根元色, 先端色, 密度, 高さ]
const GRASS = {
  1: [0x2f6a26, 0xa8e070, 2.4, 0.9], 2: [0x183c26, 0x6aa070, 2.0, 1.1], 3: [0x7a5f30, 0xe0c884, 0.5, 0.7],
  6: [0x8aa0b8, 0xffffff, 0.5, 0.6], 7: [0x0a4a40, 0x50ffc8, 0.7, 2.2], 8: [0x23233a, 0x7a7ab0, 1.0, 0.9],
  9: [0x140824, 0xa050ff, 0.5, 0.8], 10: [0xb09040, 0xfff2c8, 1.6, 0.8],
};

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
function local(base, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  tmpP.set(x, y, z); tmpQ.setFromEuler(tmpE.set(rx, ry, rz)); tmpS.set(sx, sy, sz);
  return base.clone().multiply(tmpM.compose(tmpP, tmpQ, tmpS));
}
const I = new THREE.Matrix4();
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

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

// ---------------------------------------------------------------------------
// 共通パーツ
// ---------------------------------------------------------------------------
function makeSky(fdef, dark) {
  return new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(fdef.skyTop).multiplyScalar(dark ? 0.15 : 1) }, bot: { value: new THREE.Color(fdef.skyBot).multiplyScalar(dark ? 0.15 : 1) },
      sunC: { value: new THREE.Color(fdef.sun).multiplyScalar(dark ? 0 : 1) }, sunDir: { value: new THREE.Vector3(0.45, 0.35, -0.82).normalize() },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform vec3 sunC; uniform vec3 sunDir; varying vec3 vP;
      void main(){ float k = smoothstep(-0.05, 0.55, vP.y); vec3 c = mix(bot, top, k);
      float s = max(dot(vP, sunDir), 0.0);
      c += sunC * (smoothstep(0.9975, 0.999, s) * 1.2 + pow(s, 24.0) * 0.35);
      gl_FragColor = vec4(c, 1.0); }`,
  }));
}

function makeGate() {
  const gate = new THREE.Group();
  const stone = toon(0x8a93a6), stoneD = toon(0x5a6274), gold = toon(0xe0b84a);
  const ringMat = glow(new THREE.Color(0x7ae0ff).multiplyScalar(1.4));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.22, 12, 64), ringMat);
  ring.position.y = 3.8; gate.add(ring);
  const runes = new THREE.Group(); runes.position.y = 3.8; gate.add(runes);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; runes.add(at(new THREE.Mesh(new THREE.OctahedronGeometry(0.16), ringMat), Math.cos(a) * 3.55, Math.sin(a) * 3.55, 0)); }
  const inner = new THREE.Mesh(new THREE.CircleGeometry(2.8, 48), new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  inner.position.y = 3.8; gate.add(inner);
  const plat = at(new THREE.Mesh(new THREE.CylinderGeometry(6, 6.6, 0.45, 40), stoneD), 0, 0.1, 0); plat.receiveShadow = true; gate.add(plat);
  const plat2 = at(new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.25, 40), stone), 0, 0.4, 0); plat2.receiveShadow = true; gate.add(plat2);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const st = at(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.9), stone), Math.sin(a) * 5.2, 0.38, Math.cos(a) * 5.2); st.rotation.y = a; gate.add(st); }
  const rune = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.85, 64), new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  rune.rotation.x = -Math.PI / 2; rune.position.y = 0.54; gate.add(rune);
  for (const s of [-1, 1]) {
    gate.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 1.0), stoneD), s * 3.6, 0.75, 0));
    gate.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 7, 16), stone), s * 3.6, 4.4, 0));
    gate.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.9), gold), s * 3.6, 7.95, 0));
    gate.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), ringMat), s * 3.6, 8.45, 0));
  }
  gate.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  outline(gate, 1);
  gate.add(at(textSprite('転移門', '#9ae8ff', 4, '[F] 階層移動'), 0, 10, 0));
  gate.userData.anim = (t) => { ring.rotation.z = t * 0.4; runes.rotation.z = -t * 0.25; inner.material.opacity = 0.1 + Math.sin(t * 2) * 0.05; rune.rotation.z = t * 0.2; };
  return gate;
}

// エリア間の出口（光る門）
function makePortal(label, color = 0x9ad8ff) {
  const g = new THREE.Group();
  const stone = toon(0x7a8090);
  for (const s of [-1, 1]) {
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.2, 0.6), stone), s * 2.1, 2.1, 0));
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.9), stone), s * 2.1, 0.15, 0));
  }
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 0.7), stone), 0, 4.4, 0));
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 4), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  veil.position.y = 2.1; g.add(veil);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.08; g.add(pad);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  outline(g, 1);
  g.add(at(textSprite('▶ ' + label, '#bfe6ff', 5), 0, 5.6, 0));
  g.userData.anim = (t) => { veil.material.opacity = 0.25 + Math.sin(t * 2.5) * 0.1; };
  return g;
}

// ボス部屋の魔法陣
function makeLair(lair, accent, groundCol) {
  const g = new THREE.Group();
  const circ = new THREE.Group();
  const ringMats = [];
  const R = lair.r;
  const addRing = (r0, r1, op) => {
    const mm = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96), mm);
    m.rotation.x = -Math.PI / 2; m.position.y = 0.12; circ.add(m); ringMats.push(mm);
  };
  addRing(R - 1, R - 0.6, 0.55); addRing(R * 0.55, R * 0.55 + 0.25, 0.55); addRing(2.6, 2.9, 0.6);
  for (let i = 0; i < 6; i++) {
    const mm = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const a0 = i / 6 * Math.PI * 2, a1 = (i + 2) / 6 * Math.PI * 2, rr = R * 0.55;
    const p0 = new THREE.Vector3(Math.sin(a0) * rr, 0, Math.cos(a0) * rr), p1 = new THREE.Vector3(Math.sin(a1) * rr, 0, Math.cos(a1) * rr);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, p0.distanceTo(p1)), mm);
    m.rotation.x = -Math.PI / 2; m.position.copy(p0.clone().add(p1).multiplyScalar(0.5)).setY(0.13);
    m.rotation.z = -Math.atan2(p1.x - p0.x, p1.z - p0.z) + Math.PI;
    circ.add(m); ringMats.push(mm);
  }
  g.add(circ);
  const crystalMat = glow(new THREE.Color(accent).multiplyScalar(1.5));
  const pilM = toon(new THREE.Color(groundCol).lerp(new THREE.Color(0x9a9aa8), 0.55));
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, x = Math.sin(a) * (R - 2.5), z = Math.cos(a) * (R - 2.5);
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 4, 10), pilM), x, 2, z));
    const cr = at(new THREE.Mesh(new THREE.OctahedronGeometry(0.5), crystalMat), x, 4.7, z); cr.scale.y = 1.6; g.add(cr);
  }
  g.traverse((o) => { if (o.isMesh && o.material.isMeshToonMaterial) o.castShadow = true; });
  outline(g, 1);
  g.position.set(lair.x, 0, lair.z);
  g.userData.anim = (t) => { circ.rotation.y = t * 0.05; };
  return { group: g, ringMats };
}

// 草（インスタンス描画＋風と踏み分け）
function makeGrass(fdef, R, heightAt, R_, avoid, density) {
  const gcfg = GRASS[fdef.n];
  if (!gcfg || density <= 0) return null;
  const [cb, ct, dens, hgt] = gcfg;
  const blade = new THREE.BufferGeometry();
  const hs = [0, 0.35, 0.7, 1], ws = [0.07, 0.055, 0.03, 0];
  const vp = [], vc = [], idx = [];
  const cB = new THREE.Color(cb), cT = new THREE.Color(ct);
  hs.forEach((h, i) => { for (const s of [-1, 1]) { vp.push(s * ws[i], h, 0); const c = cB.clone().lerp(cT, h); vc.push(c.r, c.g, c.b); } });
  for (let i = 0; i < 3; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  blade.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
  blade.setAttribute('normal', new THREE.Float32BufferAttribute(vp.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  blade.setAttribute('color', new THREE.Float32BufferAttribute(vc, 3));
  blade.setIndex(idx);
  const count = Math.min(36000, Math.round(Math.PI * R * R * dens * density));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const U = { uTime: { value: 0 }, uPlayer: { value: new THREE.Vector2() } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'uniform float uTime; uniform vec2 uPlayer;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 ip = instanceMatrix * vec4(transformed, 1.0);
      float h = position.y;
      vec2 bp = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      float sway = sin(uTime * 1.7 + bp.x * 0.3 + bp.y * 0.22) * 0.16 + sin(uTime * 3.3 + bp.x * 1.3) * 0.04;
      ip.x += sway * h * h; ip.z += sway * 0.6 * h * h;
      vec2 d = bp - uPlayer; float dl = length(d) + 0.001;
      float push = smoothstep(1.6, 0.2, dl) * h;
      ip.xz += d / dl * push * 0.8; ip.y -= push * 0.35;
      vec4 mvPosition = modelViewMatrix * ip;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  const inst = new THREE.InstancedMesh(blade, mat, count);
  const col = new THREE.Color();
  const Rn = R_;
  let n = 0;
  for (let tries = 0; n < count && tries < count * 3; tries++) {
    const a = Rn() * Math.PI * 2, r = Math.sqrt(Rn()) * (R - 1);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (avoid(x, z)) continue;
    const clump = 0.5 + 0.5 * Math.sin(x * 0.4 + Math.sin(z * 0.3) * 2) * Math.cos(z * 0.35);
    if (Rn() > 0.35 + clump * 0.65) continue;
    const s = hgt * (0.55 + Rn() * 0.6) * (0.7 + clump * 0.5);
    inst.setMatrixAt(n, local(I, x, heightAt(x, z) - 0.02, z, 0, Rn() * Math.PI, 0, 1 + Rn() * 0.6, s, 1));
    inst.setColorAt(n, col.setHSL(0, 0, 0.82 + Rn() * 0.3));
    n++;
  }
  inst.count = n;
  inst.frustumCulled = false;
  return { mesh: inst, U };
}

// 遠景: 浮遊する島と雲
function makeFar(fdef, R) {
  const far = new Batch();
  const fogC = new THREE.Color(fdef.fog);
  const tint = (c, k = 0.45) => new THREE.Color(c).lerp(fogC, k);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + R() * 0.4, r = 170 + R() * 120, y = 15 + R() * 70, s = 6 + R() * 14;
    const base = local(I, Math.sin(a) * r, y, Math.cos(a) * r, 0, R() * 6, 0, s);
    far.add(new THREE.ConeGeometry(1, 1.8, 9), tint(fdef.ground, 0.55), local(base, 0, -0.9, 0, Math.PI, 0, 0), { flat: true });
    far.add(new THREE.CylinderGeometry(1.02, 1, 0.18, 12), tint(fdef.ground2), local(base, 0, 0.05, 0));
    for (let k = 0; k < 4; k++) far.add(new THREE.SphereGeometry(0.22, 8, 6), tint(fdef.props[0][2] ?? 0x3f8f3a), local(base, (R() - 0.5) * 1.2, 0.3, (R() - 0.5) * 1.2, 0, 0, 0, 1, 1.3, 1));
  }
  const cloudC = tint(fdef.n === 9 ? 0x3a2050 : fdef.n === 5 ? 0x5a3028 : 0xffffff, 0.25);
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, r = 120 + R() * 200, y = 35 + R() * 60;
    const base = local(I, Math.sin(a) * r, y, Math.cos(a) * r, 0, R() * 6, 0, 6 + R() * 10);
    for (let k = 0; k < 5; k++) far.add(new THREE.SphereGeometry(0.6 + R() * 0.5, 10, 8), cloudC, local(base, (k - 2) * 0.7, R() * 0.3, (R() - 0.5) * 0.8, 0, 0, 0, 1, 0.6, 1));
  }
  const g = far.build();
  g.traverse((o) => { if (o.material && !o.material.userData.shared) { o.material.fog = false; o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

// ---------------------------------------------------------------------------
// エリアの組み立て
// ---------------------------------------------------------------------------
export function buildArea(def, fdef, opts = {}) {
  const fd = { ...fdef, n: def.floor };
  return def.shape === 'grid' ? buildGrid(def, fd) : buildOpen(def, fd, opts);
}

function buildOpen(def, fdef, opts) {
  const group = new THREE.Group();
  const R = seeded(hashStr(def.id));
  const heightAt = makeHeight(def);
  const anims = [];
  group.add(makeSky(fdef, false));

  // 地面
  const size = (def.R + 30) * 2;
  const ground = new THREE.PlaneGeometry(size, size, 120, 120);
  ground.rotateX(-Math.PI / 2);
  const pos = ground.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const c1 = new THREE.Color(fdef.ground), c2 = new THREE.Color(fdef.ground2), tmp = new THREE.Color();
  const stoneC = new THREE.Color(0xa8a49a).lerp(c1, 0.15), pathC = c1.clone().lerp(new THREE.Color(0x8a7458), 0.55);
  const plaza = def.type === 'town' ? def.R * 0.62 : def.type === 'camp' ? 9 : 0;
  const exits = exitsOf(def);
  const onPath = (x, z, w) => exits.some((e) => {
    // 中心から各出口への小道
    const L = Math.hypot(e.x, e.z), ux = e.x / L, uz = e.z / L;
    const along = x * ux + z * uz, side = Math.abs(x * uz - z * ux + Math.sin(along * 0.12) * 2.5);
    return along > 0 && along < L && side < w;
  });
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    const k = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2) * Math.cos(z * 0.09);
    tmp.copy(c1).lerp(c2, k * 0.85 + Math.random() * 0.15);
    const r = Math.hypot(x, z);
    if (r < plaza) tmp.copy(stoneC).offsetHSL(0, 0, ((Math.floor(x * 0.8) + Math.floor(z * 0.8)) % 2) * 0.03 + Math.random() * 0.02);
    else if (onPath(x, z, 2.6)) tmp.lerp(pathC, onPath(x, z, 1.7) ? 0.85 : 0.45);
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  ground.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  ground.computeVertexNormals();
  const gm = new THREE.Mesh(ground, toon(0xffffff, { vertexColors: true }));
  gm.receiveShadow = true;
  group.add(gm);

  // 外周の崖とプロップ
  const B = new Batch();
  const wallC = new THREE.Color(fdef.ground).multiplyScalar(0.55);
  const nWall = Math.round(def.R * 1.3);
  for (let i = 0; i < nWall; i++) {
    const a = (i / nWall) * Math.PI * 2 + R() * 0.05, r = def.R + 4 + R() * 6;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (exits.some((e) => Math.hypot(e.x - x, e.z - z) < 7)) continue;
    const h = 7 + R() * 14, w = 4 + R() * 5;
    B.add(new THREE.DodecahedronGeometry(1, 1), wallC.clone().offsetHSL(0, 0, (R() - 0.5) * 0.06), local(I, x, h * 0.3, z, R(), R() * 6, R(), w, h, w), { flat: true });
  }
  const avoid = (x, z, pad = 3) => Math.hypot(x, z) < plaza + pad || exits.some((e) => Math.hypot(e.x - x, e.z - z) < 7) || (def.gate && Math.hypot(x - def.gate.x, z - def.gate.z) < 10) || onPath(x, z, 3) || (def.npcs || []).some((n) => Math.hypot(n.x - x, n.z - z) < 3);
  const scale = (def.R / 68) ** 2 * (def.type === 'hunt' ? 0.6 : def.type === 'field' ? 1.1 : 0.7);
  for (const [type, count, col1, col2] of fdef.props) {
    for (let i = 0; i < Math.round(count * scale); i++) {
      const a = R() * Math.PI * 2, r = 4 + Math.sqrt(R()) * (def.R - 3);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (avoid(x, z)) continue;
      makeProp(B, type, local(I, x, heightAt(x, z), z, 0, R() * Math.PI * 2, 0, 0.7 + R() * 0.8), R, col1, col2, fdef);
    }
  }
  if (def.type === 'town') buildTown(B, def, R, heightAt, anims, group);
  if (def.type === 'camp') buildCamp(B, def, R, heightAt, anims, group);
  if (def.type === 'hunt') {
    // 狩場: 木の柵と獣よけの杭
    for (let i = 0; i < 40; i++) {
      const a = R() * Math.PI * 2, r = def.R * (0.35 + R() * 0.55);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (avoid(x, z, 0)) continue;
      const m = local(I, x, heightAt(x, z), z, 0, a + Math.PI / 2, 0);
      for (const s of [-1, 0, 1]) B.add(new THREE.CylinderGeometry(0.12, 0.14, 1.4, 6), 0x7a5a3a, local(m, s * 1.1, 0.7, 0));
      B.add(new THREE.BoxGeometry(2.6, 0.14, 0.12), 0x8a6a48, local(m, 0, 1.0, 0));
      B.add(new THREE.BoxGeometry(2.6, 0.14, 0.12), 0x8a6a48, local(m, 0, 0.55, 0));
    }
  }
  group.add(B.build());
  group.add(makeFar(fdef, R));

  // 草
  const grassAvoid = (x, z) => Math.hypot(x, z) < plaza + 1 || (def.gate && Math.hypot(x - def.gate.x, z - def.gate.z) < 7) || onPath(x, z, 1.6) || exits.some((e) => Math.hypot(e.x - x, e.z - z) < 3);
  const grass = makeGrass(fdef, def.R, heightAt, R, grassAvoid, (opts.grass ?? 1) * (def.type === 'town' ? 0.5 : 1));
  if (grass) group.add(grass.mesh);

  // 転移門・出口
  let gate = null;
  if (def.gate) { gate = makeGate(); gate.position.set(def.gate.x, 0, def.gate.z); group.add(gate); anims.push(gate.userData.anim); }
  const portals = exits.map((e) => {
    const p = makePortal(AREAS[e.to].name);
    p.position.set(e.x, heightAt(e.x, e.z), e.z);
    p.rotation.y = Math.atan2(e.x, e.z);
    group.add(p); anims.push(p.userData.anim);
    return { ...e, obj: p };
  });

  return {
    group, gate, portals, heightAt, ringMats: [], lair: null,
    light: { hemi: 1.1, sun: fdef.sunI, fogNear: fdef.fogNear, fogFar: fdef.fogFar, fog: fdef.fog },
    update(t, px, pz) { for (const a of anims) a(t); if (grass) { grass.U.uTime.value = t; grass.U.uPlayer.value.set(px, pz); } },
  };
}

function buildTown(B, def, R, heightAt, anims, group) {
  // 家並み（北の出口側は空ける）
  const roofs = [0xb0483a, 0x3a6ab0, 0x7a5a3a, 0x4a8a5a, 0x8a4a8a];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) / n * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), -Math.cos(a))) > Math.PI - 0.5) continue; // 北
    const r = def.R - 7, x = Math.sin(a) * r, z = Math.cos(a) * r;
    const m = local(I, x, heightAt(x, z), z, 0, a, 0, 0.9 + R() * 0.3);
    const w = 5 + R() * 2, d = 4.5, h = 3.2 + R() * 1.2;
    B.add(new THREE.BoxGeometry(w, h, d), 0xeee6d4, local(m, 0, h / 2, 0));
    B.add(new THREE.BoxGeometry(w + 0.3, 0.4, d + 0.3), 0x8a7a64, local(m, 0, 0.2, 0));
    const roof = new THREE.CylinderGeometry(0.01, d * 0.78, 2.4, 4, 1);
    B.add(roof, roofs[i % roofs.length], local(m, 0, h + 1.2, 0, 0, Math.PI / 4, 0, w / d * 1.0, 1, 1));
    B.add(new THREE.BoxGeometry(1.1, 1.9, 0.1), 0x6a4428, local(m, 0, 0.95, -d / 2 - 0.02));
    for (const s of [-1, 1]) B.add(new THREE.BoxGeometry(0.8, 0.8, 0.08), 0xffd88a, local(m, s * w * 0.3, h * 0.6, -d / 2 - 0.03), { glowing: true });
    B.add(new THREE.BoxGeometry(0.6, 1.6, 0.6), 0x8a6a5a, local(m, w * 0.3, h + 1.4, d * 0.1));
  }
  // 街灯
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.2, r = 13, x = Math.sin(a) * r, z = Math.cos(a) * r;
    B.add(new THREE.CylinderGeometry(0.1, 0.14, 3.2, 8), 0x3a3a44, local(I, x, 1.6, z));
    B.add(new THREE.SphereGeometry(0.28, 10, 8), 0xffe0a0, local(I, x, 3.3, z), { glowing: true });
  }
  // 露店（NPCの近く）
  for (const npc of def.npcs || []) {
    const m = local(I, npc.x + 1.5, heightAt(npc.x, npc.z), npc.z - 2, 0, 0.3, 0);
    for (const s of [-1, 1]) B.add(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), 0x6a4a2a, local(m, s * 1.4, 1.2, 0));
    B.add(new THREE.BoxGeometry(3.2, 0.9, 1.4), 0x9a7a52, local(m, 0, 0.45, 0));
    B.add(new THREE.BoxGeometry(3.4, 0.12, 1.8), new THREE.Color(npc.color).lerp(new THREE.Color(0xffffff), 0.3), local(m, 0, 2.4, 0, 0.15, 0, 0));
    for (let k = 0; k < 3; k++) B.add(new THREE.SphereGeometry(0.22, 8, 6), [0xd04a3a, 0xe0c040, 0x6ab04a][k], local(m, -0.9 + k * 0.9, 1.05, 0));
  }
  void group; void anims;
}

function buildCamp(B, def, R, heightAt, anims, group) {
  // テントと焚き火
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * 0.3 + i * Math.PI * 0.45, r = 12, x = Math.sin(a) * r, z = Math.cos(a) * r;
    const m = local(I, x, heightAt(x, z), z, 0, a + Math.PI, 0);
    B.add(new THREE.CylinderGeometry(0.01, 2.2, 2.6, 4), [0xc8b490, 0x8aa08a, 0xb08a6a, 0x9a9ab8][i], local(m, 0, 1.3, 0, 0, Math.PI / 4, 0, 1, 1, 1.4));
    B.add(new THREE.BoxGeometry(0.8, 1.2, 0.05), 0x3a2a1a, local(m, 0, 0.6, 1.55));
  }
  const fx = 6, fz = 6;
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; B.add(new THREE.DodecahedronGeometry(0.35, 0), 0x6a6a6a, local(I, fx + Math.sin(a) * 1, 0.15, fz + Math.cos(a) * 1), { flat: true }); }
  for (let k = 0; k < 3; k++) B.add(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), 0x5a3a20, local(I, fx, 0.2, fz, Math.PI / 2, k * 1.05, 0));
  const fire = new THREE.Group();
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 8), glow(new THREE.Color(0xff8a20).multiplyScalar(1.6)));
  const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 8), glow(new THREE.Color(0xffe060).multiplyScalar(1.6)));
  f1.position.y = 0.6; f2.position.y = 0.5; fire.add(f1, f2);
  fire.position.set(fx, 0, fz);
  group.add(fire);
  anims.push((t) => { const s = 1 + Math.sin(t * 13) * 0.12; f1.scale.set(1, s, 1); f2.scale.set(1, 2 - s, 1); });
  for (let k = 0; k < 4; k++) B.add(new THREE.BoxGeometry(1, 1, 1), 0x9a7a4a, local(I, -8 + (k % 2) * 1.1, 0.5 + Math.floor(k / 2) * 1.0, 6 + (k % 2) * 0.2, 0, k * 0.3, 0));
}

function buildGrid(def, fdef) {
  const group = new THREE.Group();
  const g = grid(def);
  const R = seeded(hashStr(def.id));
  const anims = [];
  const isLab = def.type === 'labyrinth';
  group.add(makeSky(fdef, true));
  const floorC = new THREE.Color(fdef.ground).lerp(new THREE.Color(0x6a6a72), 0.7).multiplyScalar(0.8);
  const wallC = new THREE.Color(fdef.ground2).lerp(new THREE.Color(isLab ? 0x9a96a4 : 0x8a8274), 0.8).multiplyScalar(isLab ? 0.85 : 0.7);
  const topC = wallC.clone().multiplyScalar(0.7);
  const B = new Batch();
  const H = 3.2;
  const open = (c, r) => r >= 0 && c >= 0 && r < g.H && c < g.W && g.rows[r][c] !== '#';
  for (let r = 0; r < g.H; r++) {
    for (let c = 0; c < g.W; c++) {
      const ch = g.rows[r][c];
      const x = (c - g.W / 2 + 0.5) * CELL, z = (r - g.H / 2 + 0.5) * CELL;
      if (ch === '#') {
        if (![[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dc, dr]) => open(c + dc, r + dr))) continue;
        B.add(new THREE.BoxGeometry(CELL, H, CELL), wallC.clone().offsetHSL(0, 0, (R() - 0.5) * 0.05), local(I, x, H / 2, z), { flat: true });
        B.add(new THREE.BoxGeometry(CELL + 0.1, 0.3, CELL + 0.1), topC, local(I, x, H + 0.15, z), { flat: true });
        // 松明
        if (R() < 0.1) {
          const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dc, dr]) => open(c + dc, r + dr));
          if (dir) {
            const tx = x + dir[0] * (CELL / 2 + 0.15), tz = z + dir[1] * (CELL / 2 + 0.15);
            B.add(new THREE.CylinderGeometry(0.08, 0.06, 0.8, 6), 0x4a3020, local(I, tx, 2.0, tz, dir[1] * 0.4, 0, -dir[0] * 0.4));
            B.add(new THREE.SphereGeometry(0.2, 8, 6), new THREE.Color(0xffa040).multiplyScalar(1.5), local(I, tx + dir[0] * 0.15, 2.5, tz + dir[1] * 0.15), { glowing: true });
          }
        }
        continue;
      }
      const fc = floorC.clone().offsetHSL(0, 0, ((c + r) % 2) * 0.025 + (R() - 0.5) * 0.03);
      if (ch === 'T' || ch === 't') {
        fc.lerp(new THREE.Color(0x6a3a2a), 0.4);
        for (let k = 0; k < 4; k++) B.add(new THREE.ConeGeometry(0.15, 0.35, 5), 0x9a9aa4, local(I, x + (k % 2 - 0.5) * 1.6, 0.17, z + (Math.floor(k / 2) - 0.5) * 1.6), { flat: true });
      }
      B.add(new THREE.BoxGeometry(CELL, 0.2, CELL), fc, local(I, x, -0.1, z), { flat: true });
      if (ch === '.' && R() < 0.05) B.add(new THREE.DodecahedronGeometry(0.3, 0), wallC, local(I, x + (R() - 0.5) * 2, 0.15, z + (R() - 0.5) * 2, R(), R(), R()), { flat: true });
    }
  }
  group.add(B.build());

  // 出口
  const portals = exitsOf(def).map((e) => {
    const p = makePortal(AREAS[e.to].name);
    p.position.set(e.x, 0, e.z);
    group.add(p); anims.push(p.userData.anim);
    return { ...e, obj: p };
  });

  // 扉
  let door = null;
  for (const d of g.pts.D || []) {
    door = new THREE.Group();
    const bar = toon(0x5a5a64);
    for (let k = 0; k < 6; k++) door.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, H, 6), bar), -1.6 + k * 0.64, H / 2, 0));
    door.add(at(new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.3, 0.3), bar), 0, H - 0.3, 0));
    door.add(at(new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.3, 0.3), bar), 0, 0.5, 0));
    const seal = at(new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), glow(new THREE.Color(fdef.boss.accent).multiplyScalar(1.4), { side: THREE.DoubleSide })), 0, H / 2, 0.2);
    door.add(seal);
    door.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    outline(door, 1);
    door.position.set(d.x, 0, d.z);
    group.add(door);
  }

  // レバー
  let lever = null;
  for (const L of g.pts.L || []) {
    lever = new THREE.Group();
    lever.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.8), toon(0x6a6a74)), 0, 0.3, 0));
    const stick = new THREE.Group(); stick.position.y = 0.6; lever.add(stick);
    stick.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 8), toon(0x8a6a4a)), 0, 0.65, 0));
    stick.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), toon(0xd04a3a)), 0, 1.3, 0));
    stick.rotation.z = 0.6;
    lever.userData.stick = stick;
    lever.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    outline(lever, 1);
    lever.add(at(textSprite('レバー', '#ffd27a', 3, '[F] 引く'), 0, 2.8, 0));
    lever.position.set(L.x, 0, L.z);
    group.add(lever);
  }

  // 宝箱
  let chest = null;
  for (const C of g.pts.C || []) {
    chest = new THREE.Group();
    const wood = toon(0x8a5a2a), gold = toon(0xe8b84a);
    chest.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 1.1), wood), 0, 0.5, 0));
    const lid = new THREE.Group(); lid.position.set(0, 1.0, -0.55); chest.add(lid);
    const lidMesh = at(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.8, 12, 1, false, 0, Math.PI), wood), 0, 0, 0.55);
    lidMesh.rotation.z = Math.PI / 2;
    lid.add(lidMesh);
    for (const s of [-1, 1]) chest.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 1.15), gold), s * 0.7, 0.52, 0));
    chest.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.1), gold), 0, 0.85, 0.58));
    const shine = at(new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })), 0, 1.2, 0);
    chest.add(shine);
    chest.traverse((o) => { if (o.isMesh && o.material.isMeshToonMaterial) o.castShadow = true; });
    outline(chest, 1);
    chest.add(at(textSprite('宝箱', '#ffd27a', 3, '[F] 開ける'), 0, 2.6, 0));
    chest.userData = { lid, shine };
    chest.position.set(C.x, 0, C.z);
    group.add(chest);
    anims.push((t) => { shine.scale.setScalar(1 + Math.sin(t * 3) * 0.15); });
  }

  // 感圧板
  const plates = (g.pts.P || []).map((P) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.15, 24), new THREE.MeshToonMaterial({ color: 0x8a8aa0, emissive: 0x40c0ff, emissiveIntensity: 0 }));
    m.position.set(P.x, 0.08, P.z); m.receiveShadow = true;
    group.add(m);
    const lab = at(textSprite('感圧板', '#9ae8ff', 3), P.x, 2.2, P.z); group.add(lab);
    return m;
  });

  // ボス部屋
  const lair = lairOf(def);
  let ringMats = [];
  if (lair) {
    const L = makeLair(lair, fdef.boss.accent, fdef.ground);
    group.add(L.group); ringMats = L.ringMats; anims.push(L.group.userData.anim);
  }

  return {
    group, gate: null, portals, door, lever, chest, plates, lair, ringMats, heightAt: () => 0,
    light: { hemi: 0.75, sun: fdef.sunI * 0.45, fogNear: 14, fogFar: 60, fog: new THREE.Color(fdef.fog).multiplyScalar(0.25).getHex() },
    update(t) { for (const a of anims) a(t); },
  };
}

// ---------------------------------------------------------------------------
// プロップ（バッチに追加）
// ---------------------------------------------------------------------------
function makeProp(B, type, M, R, c1, c2, def) {
  const C = (c, d = 0.08) => new THREE.Color(c).offsetHSL(0, 0, (R() - 0.5) * d);
  const S = (r, w = 12, h = 10) => new THREE.SphereGeometry(r, w, h);
  switch (type) {
    case 'tree': {
      B.add(new THREE.CylinderGeometry(0.22, 0.38, 2.6, 9), C(c2), local(M, 0, 1.3, 0));
      for (let i = 0; i < 3; i++) B.add(new THREE.ConeGeometry(0.16, 1.0, 6), C(c2), local(M, 0, 0.15, 0, 1.25, i * 2.1, 0, 1, 1, 1).multiply(local(new THREE.Matrix4(), 0, 0.4, 0)));
      B.add(new THREE.CylinderGeometry(0.06, 0.1, 1.0, 6), C(c2), local(M, 0.35, 2.2, 0, 0, 0, -0.8));
      const lc = new THREE.Color(c1);
      const clumps = [[0, 3.3, 0, 1.35], [0.8, 2.9, 0.3, 0.95], [-0.75, 3.0, -0.2, 1.0], [0.2, 4.1, -0.2, 0.95], [-0.2, 2.9, 0.75, 0.85], [0.3, 2.8, -0.8, 0.85]];
      for (const [x, y, z, r] of clumps) B.add(S(r), C(lc.clone().offsetHSL(0, 0, y > 3.5 ? 0.06 : -0.02)), local(M, x, y, z, 0, 0, 0, 1, 0.85, 1));
      if (R() < 0.35) for (let k = 0; k < 4; k++) B.add(S(0.09, 6, 4), C(0xff5a4a), local(M, (R() - 0.5) * 2, 2.7 + R() * 1.2, 0.9 + R() * 0.3));
      break;
    }
    case 'pine': {
      B.add(new THREE.CylinderGeometry(0.16, 0.3, 1.8, 8), C(c2), local(M, 0, 0.9, 0));
      for (let i = 0; i < 4; i++) {
        B.add(new THREE.ConeGeometry(1.9 - i * 0.38, 1.9, 11), C(c1, 0.06), local(M, 0, 1.8 + i * 1.05, 0, 0, i * 0.5, 0));
        if (def.n === 6) B.add(new THREE.ConeGeometry(0.9 - i * 0.18, 0.7, 11), C(0xffffff, 0.02), local(M, 0, 2.5 + i * 1.05, 0));
      }
      break;
    }
    case 'rock': {
      const n = 1 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        const s = k === 0 ? 1 : 0.45 + R() * 0.3;
        B.add(new THREE.DodecahedronGeometry(0.9 * s, 1), C(c1), local(M, k ? (R() - 0.5) * 2.4 : 0, 0.35 * s, k ? (R() - 0.5) * 2.4 : 0, R(), R() * 3, R(), 1.3, 0.75, 1.1), { flat: true });
      }
      if (def.n <= 2) B.add(new THREE.SphereGeometry(0.75, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.5), C(0x5a9a3a), local(M, 0, 0.55, 0, 0, 0, 0, 1.2, 0.5, 1));
      break;
    }
    case 'flower': {
      const fc = R() < 0.5 ? c1 : c2;
      B.add(new THREE.CylinderGeometry(0.015, 0.02, 0.4, 4), C(0x3a7a2a), local(M, 0, 0.2, 0));
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; B.add(S(0.07, 6, 4), C(fc), local(M, Math.sin(a) * 0.08, 0.42, Math.cos(a) * 0.08, 0, 0, 0, 1, 0.5, 1)); }
      B.add(S(0.05, 6, 4), C(0xffffff), local(M, 0, 0.44, 0));
      break;
    }
    case 'mushroom': {
      for (let k = 0; k < 1 + Math.floor(R() * 3); k++) {
        const s = k ? 0.5 + R() * 0.3 : 1, ox = k ? (R() - 0.5) * 1.4 : 0, oz = k ? (R() - 0.5) * 1.4 : 0;
        B.add(new THREE.CylinderGeometry(0.13 * s, 0.2 * s, 0.9 * s, 8), C(c2), local(M, ox, 0.45 * s, oz));
        B.add(new THREE.SphereGeometry(0.6 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), C(c1), local(M, ox, 0.85 * s, oz, 0, 0, 0, 1, 0.75, 1));
        for (let j = 0; j < 5; j++) { const a = j * 1.3; B.add(S(0.07 * s, 6, 4), new THREE.Color(0xfff8e0), local(M, ox + Math.sin(a) * 0.4 * s, 1.08 * s, oz + Math.cos(a) * 0.4 * s), { glowing: true }); }
      }
      break;
    }
    case 'cactus': {
      B.add(new THREE.CapsuleGeometry(0.34, 2.2, 4, 10), C(c1), local(M, 0, 1.4, 0));
      for (const s of [-1, 1]) {
        const h = 1.3 + R() * 0.6;
        B.add(new THREE.CapsuleGeometry(0.2, 0.5, 4, 8), C(c1), local(M, s * 0.45, h, 0, 0, 0, s * 1.4));
        B.add(new THREE.CapsuleGeometry(0.2, 0.6, 4, 8), C(c1), local(M, s * 0.7, h + 0.45, 0));
      }
      if (R() < 0.4) B.add(S(0.15, 8, 6), C(0xff6a9a), local(M, 0, 2.7, 0));
      break;
    }
    case 'bones': {
      B.add(S(0.3, 10, 8), C(c1), local(M, 0.6, 0.25, 0, 0, 0, 0, 1, 0.9, 1.2));
      for (let k = 0; k < 4; k++) B.add(new THREE.TorusGeometry(0.6 - k * 0.05, 0.05, 5, 12, Math.PI), C(c1), local(M, -0.3 + k * -0.35, 0.05, 0, 0, Math.PI / 2, 0));
      B.add(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6), C(c1), local(M, -0.8, 0.1, 0, 0, 0, Math.PI / 2));
      break;
    }
    case 'crystal': {
      B.add(new THREE.DodecahedronGeometry(0.6, 0), C(0x3a3a50), local(M, 0, 0.15, 0, 0, 0, 0, 1.3, 0.5, 1.3), { flat: true });
      for (let k = 0; k < 2 + Math.floor(R() * 4); k++) {
        const cc = new THREE.Color(R() < 0.6 ? c1 : (c2 ?? c1));
        B.add(new THREE.OctahedronGeometry(0.4, 0), cc.multiplyScalar(1.1), local(M, (R() - 0.5) * 1.0, 0.8 + R() * 0.5, (R() - 0.5) * 1.0, (R() - 0.5) * 0.7, R() * 3, (R() - 0.5) * 0.7, 0.55, 2 + R() * 2.4, 0.55), { glowing: true });
      }
      break;
    }
    case 'stalag': {
      B.add(new THREE.ConeGeometry(0.6, 3 + R() * 3, 8), C(c1), local(M, 0, 1.5, 0), { flat: true });
      B.add(new THREE.ConeGeometry(0.3, 1.5, 7), C(c1), local(M, 0.6, 0.75, 0.2), { flat: true });
      break;
    }
    case 'lavarock': {
      B.add(new THREE.DodecahedronGeometry(1, 1), C(c1), local(M, 0, 0.45, 0, R(), R(), R(), 1.4, 0.9, 1.2), { flat: true });
      for (let k = 0; k < 3; k++) B.add(new THREE.BoxGeometry(0.06, 0.06, 1.2), new THREE.Color(c2).multiplyScalar(1.4), local(M, (R() - 0.5) * 0.8, 0.5 + R() * 0.5, (R() - 0.5) * 0.5, R(), R() * 3, 0, 1, 1, 1), { glowing: true });
      break;
    }
    case 'lavapool': {
      const r = 1.5 + R() * 2;
      B.add(new THREE.CircleGeometry(r, 16), new THREE.Color(c1).multiplyScalar(0.85), local(M, 0, 0.15, 0, -Math.PI / 2, 0, 0), { glowing: true });
      B.add(new THREE.CircleGeometry(r * 0.45, 12), new THREE.Color(0xff9a30), local(M, 0.2, 0.17, 0.1, -Math.PI / 2, 0, 0), { glowing: true });
      for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; B.add(new THREE.DodecahedronGeometry(0.35 + R() * 0.2, 0), C(0x2a1a1a), local(M, Math.sin(a) * r, 0.1, Math.cos(a) * r), { flat: true }); }
      break;
    }
    case 'spike': {
      B.add(new THREE.ConeGeometry(0.5, 3 + R() * 3, 6), C(c1), local(M, 0, 1.4, 0, 0, 0, (R() - 0.5) * 0.4), { flat: true });
      B.add(new THREE.ConeGeometry(0.3, 1.6, 6), C(c1), local(M, 0.5, 0.7, 0.3, 0, 0, -0.4), { flat: true });
      break;
    }
    case 'icespike': {
      for (let k = 0; k < 2 + Math.floor(R() * 3); k++) B.add(new THREE.ConeGeometry(0.45, 2.5 + R() * 3, 6), C(c1, 0.04), local(M, (R() - 0.5) * 1.6, 1.1, (R() - 0.5) * 1.6, (R() - 0.5) * 0.6, 0, (R() - 0.5) * 0.6), { flat: true });
      B.add(new THREE.ConeGeometry(0.15, 0.8, 6), new THREE.Color(0xd0f4ff).multiplyScalar(1.2), local(M, 0, 0.4, 0), { glowing: true });
      break;
    }
    case 'pillar': {
      const broken = R() < 0.4, h = broken ? 1.5 + R() * 3 : 5 + R() * 4;
      B.add(new THREE.BoxGeometry(1.7, 0.5, 1.7), C(c1), local(M, 0, 0.25, 0));
      B.add(new THREE.CylinderGeometry(0.55, 0.62, h, 16), C(c1, 0.04), local(M, 0, 0.5 + h / 2, 0, broken ? 0.12 : 0, 0, 0));
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; B.add(new THREE.BoxGeometry(0.06, h * 0.92, 0.06), C(c1, 0.0).multiplyScalar(0.8), local(M, Math.sin(a) * 0.58, 0.5 + h / 2, Math.cos(a) * 0.58, 0, a, 0)); }
      if (!broken) { B.add(new THREE.BoxGeometry(1.6, 0.45, 1.6), C(c1), local(M, 0, h + 0.7, 0)); B.add(new THREE.CylinderGeometry(0.8, 0.6, 0.3, 16), C(c1), local(M, 0, h + 0.4, 0)); }
      else for (let k = 0; k < 3; k++) B.add(new THREE.DodecahedronGeometry(0.35, 0), C(c1), local(M, (R() - 0.5) * 3, 0.25, (R() - 0.5) * 3), { flat: true });
      break;
    }
    case 'coral': {
      const cc = R() < 0.5 ? c1 : c2;
      for (let k = 0; k < 5; k++) {
        const rx = (R() - 0.5) * 1.0, rz = (R() - 0.5) * 1.0, h = 1 + R() * 1.2;
        B.add(new THREE.CapsuleGeometry(0.08, h, 3, 6), C(cc), local(M, rx * 0.6, h / 2, rz * 0.6, rx, 0, rz));
        B.add(S(0.12, 6, 4), new THREE.Color(cc).multiplyScalar(1.4), local(M, rx * 0.6 + Math.sin(rz) * h * 0.5, h, rz * 0.6 - Math.sin(rx) * h * 0.5), { glowing: true });
      }
      break;
    }
    case 'spire': {
      const h = 7 + R() * 10;
      B.add(new THREE.ConeGeometry(1.3, h, 7), C(c1), local(M, 0, h / 2, 0), { flat: true });
      for (let k = 0; k < 3; k++) B.add(new THREE.TorusGeometry(1.0 - k * 0.25, 0.06, 5, 20), new THREE.Color(c2).multiplyScalar(1.3), local(M, 0, h * (0.3 + k * 0.2), 0, Math.PI / 2, 0, 0), { glowing: true });
      B.add(S(0.4, 10, 8), new THREE.Color(c2).multiplyScalar(1.8), local(M, 0, h + 0.4, 0), { glowing: true });
      break;
    }
    case 'voidcube': {
      const y = 1.5 + R() * 4;
      B.add(new THREE.BoxGeometry(1.2, 1.2, 1.2), C(c1), local(M, 0, y, 0, R() * 3, R() * 3, R() * 3));
      B.add(new THREE.OctahedronGeometry(0.3), new THREE.Color(c2).multiplyScalar(1.5), local(M, 0, y, 0), { glowing: true });
      B.add(new THREE.TorusGeometry(1.1, 0.03, 4, 24), new THREE.Color(c2).multiplyScalar(1.2), local(M, 0, y, 0, R() * 3, R() * 3, 0), { glowing: true });
      break;
    }
    case 'cloud': {
      for (let k = 0; k < 5; k++) B.add(S(0.8 + R() * 0.6, 12, 10), C(c1, 0.03), local(M, (R() - 0.5) * 3, 0.5 + R() * 0.4, (R() - 0.5) * 3, 0, 0, 0, 1, 0.7, 1));
      break;
    }
  }
}

// アンビエントパーティクル（プレイヤー周辺に常時漂う）
export class AmbientParticles {
  constructor(scene) {
    this.count = 500;
    this.pos = new Float32Array(this.count * 3);
    this.vel = new Float32Array(this.count * 3);
    this.phase = new Float32Array(this.count);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.PointsMaterial({ size: 0.15, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, map: dotTexture() });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.kind = null;
  }

  setKind(kind) {
    this.kind = kind;
    const cfg = {
      pollen: [0xfff6b0, 0.18, false], firefly: [0xb8ff60, 0.3, false], dust: [0xffe0a0, 0.15, false], sparkle: [0x9ae8ff, 0.2, false],
      ember: [0xff7a20, 0.25, false], snow: [0xffffff, 0.22, true], bubble: [0x9affff, 0.2, false], rain: [0xa0b8ff, 0.12, true],
      void: [0xb060ff, 0.25, false], feather: [0xfff0c0, 0.3, false],
    }[kind] || [0xffffff, 0.2, false];
    this.mat.color.set(cfg[0]); this.mat.size = cfg[1];
    this.mat.blending = cfg[2] ? THREE.NormalBlending : THREE.AdditiveBlending;
    this.mat.needsUpdate = true;
    for (let i = 0; i < this.count; i++) this.respawn(i, 0, 0, true);
  }

  respawn(i, cx, cz, anyY) {
    this.pos[i * 3] = cx + (Math.random() - 0.5) * 60;
    this.pos[i * 3 + 2] = cz + (Math.random() - 0.5) * 60;
    const k = this.kind;
    const fall = k === 'snow' || k === 'rain' || k === 'feather';
    const rise = k === 'ember' || k === 'bubble';
    this.pos[i * 3 + 1] = anyY ? Math.random() * 15 : fall ? 15 : rise ? 0 : Math.random() * 6;
    this.vel[i * 3] = (Math.random() - 0.5) * 0.6; this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    this.vel[i * 3 + 1] = k === 'rain' ? -22 : k === 'snow' ? -1.2 : k === 'feather' ? -0.6 : rise ? 1 + Math.random() * 1.5 : (Math.random() - 0.5) * 0.3;
    if (k === 'rain') this.vel[i * 3] = 3;
    this.phase[i] = Math.random() * 10;
  }

  update(dt, cx, cz, t) {
    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      this.pos[j] += (this.vel[j] + Math.sin(t + this.phase[i]) * 0.3) * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += (this.vel[j + 2] + Math.cos(t * 0.7 + this.phase[i]) * 0.3) * dt;
      if (this.pos[j + 1] < 0 || this.pos[j + 1] > 16 || Math.abs(this.pos[j] - cx) > 32 || Math.abs(this.pos[j + 2] - cz) > 32) this.respawn(i, cx, cz, false);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    if (this.kind === 'firefly' || this.kind === 'void') this.mat.opacity = 0.6 + Math.sin(t * 3) * 0.3;
  }
}

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
