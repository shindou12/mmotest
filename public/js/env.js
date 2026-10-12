// 階層ごとの地形・プロップ・草・空・遠景（トゥーン調）
import * as THREE from 'three';
import { FIELD_RADIUS, GATE_POS, LAIR_POS, LAIR_RADIUS } from '../shared/data.js';
import { toon, glow, outline, Batch } from './toon.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function noise2(x, z) {
  return Math.sin(x * 0.11) * Math.cos(z * 0.13) + Math.sin(x * 0.037 + z * 0.05) * 1.6 + Math.sin(x * 0.31 - z * 0.27) * 0.3;
}
export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = noise2(x, z) * 0.35;
  const dg = Math.hypot(x - GATE_POS.x, z - GATE_POS.z), dl = Math.hypot(x - LAIR_POS.x, z - LAIR_POS.z);
  h *= Math.min(1, dg / 12) * Math.min(1, Math.max(0, dl - LAIR_RADIUS) / 8);
  if (r > FIELD_RADIUS) h += (r - FIELD_RADIUS) * 0.6;
  return h;
}
// 転移門→ボス部屋へ続く小道
const pathX = (z) => Math.sin(z * 0.08) * 5;
function onPath(x, z, w = 2.2) {
  return z > LAIR_POS.z + LAIR_RADIUS - 2 && z < GATE_POS.z && Math.abs(x - pathX(z)) < w;
}

// 草の設定 [根元色, 先端色, 密度, 高さ]
const GRASS = {
  1: [0x2f6a26, 0xa8e070, 2.4, 0.9], 2: [0x183c26, 0x6aa070, 2.0, 1.1], 3: [0x7a5f30, 0xe0c884, 0.5, 0.7],
  6: [0x8aa0b8, 0xffffff, 0.5, 0.6], 7: [0x0a4a40, 0x50ffc8, 0.7, 2.2], 8: [0x23233a, 0x7a7ab0, 1.0, 0.9],
  9: [0x140824, 0xa050ff, 0.5, 0.8], 10: [0xb09040, 0xfff2c8, 1.6, 0.8],
};

const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
function local(base, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  tmpP.set(x, y, z); tmpQ.setFromEuler(tmpE.set(rx, ry, rz)); tmpS.set(sx, sy, sz);
  return base.clone().multiply(tmpM.compose(tmpP, tmpQ, tmpS));
}

export function buildFloor(def, opts = {}) {
  const group = new THREE.Group();
  const R = seeded(def.n * 7919);
  const fogC = new THREE.Color(def.fog);

  // ---- 空（グラデーション＋太陽） ----
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(def.skyTop) }, bot: { value: new THREE.Color(def.skyBot) }, sunC: { value: new THREE.Color(def.sun) }, sunDir: { value: new THREE.Vector3(0.45, 0.35, -0.82).normalize() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform vec3 sunC; uniform vec3 sunDir; varying vec3 vP;
      void main(){ float k = smoothstep(-0.05, 0.55, vP.y); vec3 c = mix(bot, top, k);
      float s = max(dot(vP, sunDir), 0.0);
      c += sunC * (smoothstep(0.9975, 0.999, s) * 1.2 + pow(s, 24.0) * 0.35);
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  group.add(sky);

  // ---- 地面 ----
  const size = (FIELD_RADIUS + 30) * 2;
  const ground = new THREE.PlaneGeometry(size, size, 150, 150);
  ground.rotateX(-Math.PI / 2);
  const pos = ground.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const c1 = new THREE.Color(def.ground), c2 = new THREE.Color(def.ground2), cp = c1.clone().lerp(new THREE.Color(0x8a7458), 0.55), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, groundHeight(x, z));
    const k = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2) * Math.cos(z * 0.09);
    tmp.copy(c1).lerp(c2, k * 0.85 + Math.random() * 0.15);
    if (onPath(x, z, 2.8)) tmp.lerp(cp, onPath(x, z, 1.8) ? 0.85 : 0.45);
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  ground.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  ground.computeVertexNormals();
  const gm = new THREE.Mesh(ground, toon(0xffffff, { vertexColors: true }));
  gm.receiveShadow = true;
  group.add(gm);

  // ---- 外周の崖とプロップ（1メッシュに結合） ----
  const B = new Batch();
  const I = new THREE.Matrix4();
  const wallC = new THREE.Color(def.ground).multiplyScalar(0.55);
  for (let i = 0; i < 80; i++) {
    const a = (i / 80) * Math.PI * 2 + R() * 0.05, r = FIELD_RADIUS + 4 + R() * 7;
    const h = 7 + R() * 15, w = 5 + R() * 5;
    B.add(new THREE.DodecahedronGeometry(1, 1), wallC.clone().offsetHSL(0, 0, (R() - 0.5) * 0.06), local(I, Math.sin(a) * r, h * 0.3, Math.cos(a) * r, R(), R() * 6, R(), w, h, w), { flat: true });
  }
  // 小道の飛び石
  for (let z = LAIR_POS.z + LAIR_RADIUS; z < GATE_POS.z - 6; z += 1.6 + R()) {
    const x = pathX(z) + (R() - 0.5) * 1.6;
    B.add(new THREE.CylinderGeometry(0.5, 0.55, 0.12, 7), cp.clone().offsetHSL(0, 0, 0.05 + R() * 0.05), local(I, x, groundHeight(x, z) + 0.03, z, 0, R() * 3, 0, 0.7 + R() * 0.5, 1, 0.6 + R() * 0.4), { flat: true });
  }
  const avoid = (x, z) => Math.hypot(x - GATE_POS.x, z - GATE_POS.z) < 10 || Math.hypot(x - LAIR_POS.x, z - LAIR_POS.z) < LAIR_RADIUS + 3 || onPath(x, z, 3);
  for (const [type, count, col1, col2] of def.props) {
    for (let i = 0; i < count; i++) {
      const a = R() * Math.PI * 2, r = 6 + Math.sqrt(R()) * (FIELD_RADIUS - 4);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (avoid(x, z)) continue;
      const base = local(I, x, groundHeight(x, z), z, 0, R() * Math.PI * 2, 0, 0.7 + R() * 0.8);
      makeProp(B, type, base, R, col1, col2, def);
    }
  }
  group.add(B.build());

  // ---- 遠景: 浮遊する島と雲（霧の影響を受けず空に溶ける色に） ----
  const far = new Batch();
  const tint = (c, k = 0.45) => new THREE.Color(c).lerp(fogC, k);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + R() * 0.4, r = 170 + R() * 120, y = 15 + R() * 70, s = 6 + R() * 14;
    const base = local(I, Math.sin(a) * r, y, Math.cos(a) * r, 0, R() * 6, 0, s);
    far.add(new THREE.ConeGeometry(1, 1.8, 9), tint(def.ground, 0.55), local(base, 0, -0.9, 0, Math.PI, 0, 0), { flat: true });
    far.add(new THREE.CylinderGeometry(1.02, 1, 0.18, 12), tint(def.ground2), local(base, 0, 0.05, 0));
    for (let k = 0; k < 4; k++) far.add(new THREE.SphereGeometry(0.22, 8, 6), tint(def.props[0][2] ?? 0x3f8f3a), local(base, (R() - 0.5) * 1.2, 0.3, (R() - 0.5) * 1.2, 0, 0, 0, 1, 1.3, 1));
    if (R() < 0.4) far.add(new THREE.CylinderGeometry(0.06, 0.08, 0.8, 8), tint(0xd8d0c0, 0.3), local(base, 0.3, 0.55, 0.1));
  }
  const cloudC = tint(def.n === 9 ? 0x3a2050 : def.n === 5 ? 0x5a3028 : 0xffffff, 0.25);
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, r = 120 + R() * 200, y = 35 + R() * 60;
    const base = local(I, Math.sin(a) * r, y, Math.cos(a) * r, 0, R() * 6, 0, 6 + R() * 10);
    for (let k = 0; k < 5; k++) far.add(new THREE.SphereGeometry(0.6 + R() * 0.5, 10, 8), cloudC, local(base, (k - 2) * 0.7, R() * 0.3, (R() - 0.5) * 0.8, 0, 0, 0, 1, 0.6, 1));
  }
  const farG = far.build();
  farG.traverse((o) => { if (o.material && !o.material.userData.shared) { o.material.fog = false; o.castShadow = false; o.receiveShadow = false; } });
  group.add(farG);

  // ---- 草（インスタンス描画＋風と踏み分け） ----
  let grassU = null;
  const gcfg = GRASS[def.n];
  if (gcfg && (opts.grass ?? 1) > 0) {
    const [cb, ct, dens, hgt] = gcfg;
    const blade = new THREE.BufferGeometry();
    const hs = [0, 0.35, 0.7, 1], ws = [0.07, 0.055, 0.03, 0];
    const vp = [], vc = [], idx = [];
    const cB = new THREE.Color(cb), cT = new THREE.Color(ct);
    hs.forEach((h, i) => {
      for (const s of [-1, 1]) { vp.push(s * ws[i], h, 0); const c = cB.clone().lerp(cT, h); vc.push(c.r, c.g, c.b); }
    });
    for (let i = 0; i < 3; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
    blade.setAttribute('normal', new THREE.Float32BufferAttribute(vp.map(() => 0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    blade.setAttribute('color', new THREE.Float32BufferAttribute(vc, 3));
    blade.setIndex(idx);
    const count = Math.min(42000, Math.round(Math.PI * FIELD_RADIUS * FIELD_RADIUS * dens * (opts.grass ?? 1)));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    grassU = { uTime: { value: 0 }, uPlayer: { value: new THREE.Vector2() } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, grassU);
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
    let n = 0;
    for (let tries = 0; n < count && tries < count * 3; tries++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * (FIELD_RADIUS - 1);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (Math.hypot(x - GATE_POS.x, z - GATE_POS.z) < 7 || Math.hypot(x - LAIR_POS.x, z - LAIR_POS.z) < LAIR_RADIUS + 0.5 || onPath(x, z, 1.6)) continue;
      // まとまって生える
      const clump = 0.5 + 0.5 * Math.sin(x * 0.4 + Math.sin(z * 0.3) * 2) * Math.cos(z * 0.35);
      if (R() > 0.35 + clump * 0.65) continue;
      const s = hgt * (0.55 + R() * 0.6) * (0.7 + clump * 0.5);
      inst.setMatrixAt(n, local(I, x, groundHeight(x, z) - 0.02, z, 0, R() * Math.PI, 0, 1 + R() * 0.6, s, 1));
      inst.setColorAt(n, col.setHSL(0, 0, 0.82 + R() * 0.3));
      n++;
    }
    inst.count = n;
    inst.frustumCulled = false;
    group.add(inst);
  }

  // ---- 転移門 ----
  const gate = new THREE.Group();
  const stone = toon(0x8a93a6), stoneD = toon(0x5a6274), gold = toon(0xe0b84a);
  const ringMat = glow(new THREE.Color(0x7ae0ff).multiplyScalar(1.4));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.22, 12, 64), ringMat);
  ring.position.y = 3.8; gate.add(ring);
  const runes = new THREE.Group(); runes.position.y = 3.8; gate.add(runes);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const r = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), ringMat); r.position.set(Math.cos(a) * 3.55, Math.sin(a) * 3.55, 0); runes.add(r); }
  const inner = new THREE.Mesh(new THREE.CircleGeometry(2.8, 48), new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  inner.position.y = 3.8; gate.add(inner);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.6, 0.45, 40), stoneD); plat.position.y = 0.1; plat.receiveShadow = true; gate.add(plat);
  const plat2 = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.25, 40), stone); plat2.position.y = 0.4; plat2.receiveShadow = true; gate.add(plat2);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const st = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.9), stone); st.position.set(Math.sin(a) * 5.2, 0.38, Math.cos(a) * 5.2); st.rotation.y = a; gate.add(st); }
  const rune = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.85, 64), new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  rune.rotation.x = -Math.PI / 2; rune.position.y = 0.54; gate.add(rune);
  for (const s of [-1, 1]) {
    gate.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 1.0), stoneD), s * 3.6, 0.75, 0));
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 7, 16), stone); col.position.set(s * 3.6, 4.4, 0); gate.add(col);
    gate.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.9), gold), s * 3.6, 7.95, 0));
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), ringMat); orb.position.set(s * 3.6, 8.45, 0); gate.add(orb);
  }
  gate.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  outline(gate, 1);
  gate.position.set(GATE_POS.x, 0, GATE_POS.z);
  gate.userData.anim = (t) => { ring.rotation.z = t * 0.4; runes.rotation.z = -t * 0.25; inner.material.opacity = 0.1 + Math.sin(t * 2) * 0.05; rune.rotation.z = t * 0.2; };
  group.add(gate);

  // ---- ボス部屋 ----
  const lair = new THREE.Group();
  const accent = def.boss.accent;
  const floorM = new THREE.Mesh(new THREE.CircleGeometry(LAIR_RADIUS, 64), toon(new THREE.Color(def.ground).lerp(new THREE.Color(0x707080), 0.5).multiplyScalar(0.6)));
  floorM.rotation.x = -Math.PI / 2; floorM.position.y = 0.03; floorM.receiveShadow = true; lair.add(floorM);
  const tileM = toon(new THREE.Color(def.ground).lerp(new THREE.Color(0x707080), 0.5).multiplyScalar(0.75));
  for (let r = 3.5; r < LAIR_RADIUS; r += 3.2) {
    const n = Math.floor(r * 1.6);
    for (let i = 0; i < n; i++) {
      if (R() < 0.15) continue;
      const a = (i + (r % 2) * 0.5) / n * Math.PI * 2;
      const t = new THREE.Mesh(new THREE.BoxGeometry(r * 6.28 / n * 0.9, 0.06, 2.9), tileM);
      t.position.set(Math.sin(a) * (r + 1.5), 0.06, Math.cos(a) * (r + 1.5)); t.rotation.y = a; t.receiveShadow = true;
      lair.add(t);
    }
  }
  const circ = new THREE.Group();
  const ringMats = [];
  const addRing = (r0, r1, op) => {
    const mm = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96), mm);
    m.rotation.x = -Math.PI / 2; m.position.y = 0.12; circ.add(m); ringMats.push(mm);
  };
  addRing(LAIR_RADIUS - 1, LAIR_RADIUS - 0.6, 0.55); addRing(LAIR_RADIUS * 0.55, LAIR_RADIUS * 0.55 + 0.25, 0.55); addRing(2.6, 2.9, 0.6);
  for (let i = 0; i < 6; i++) {
    const mm = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const a0 = i / 6 * Math.PI * 2, a1 = (i + 2) / 6 * Math.PI * 2, rr = LAIR_RADIUS * 0.55;
    const p0 = new THREE.Vector3(Math.sin(a0) * rr, 0, Math.cos(a0) * rr), p1 = new THREE.Vector3(Math.sin(a1) * rr, 0, Math.cos(a1) * rr);
    const len = p0.distanceTo(p1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, len), mm);
    m.rotation.x = -Math.PI / 2; m.position.copy(p0.clone().add(p1).multiplyScalar(0.5)).setY(0.13);
    m.rotation.z = -Math.atan2(p1.x - p0.x, p1.z - p0.z) + Math.PI;
    circ.add(m); ringMats.push(mm);
  }
  lair.add(circ);
  const pilM = toon(new THREE.Color(def.ground2).lerp(new THREE.Color(0x9a9aa8), 0.55)), pilD = toon(new THREE.Color(def.ground2).lerp(new THREE.Color(0x6a6a78), 0.6));
  const crystalMat = glow(new THREE.Color(accent).multiplyScalar(1.5));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    if (Math.abs(Math.sin(a / 2)) < 0.15) continue; // 南側の入口
    const px = Math.sin(a) * (LAIR_RADIUS + 1), pz = Math.cos(a) * (LAIR_RADIUS + 1);
    const broken = R() < 0.25, h = broken ? 3 + R() * 3 : 9;
    const p = new THREE.Group(); p.position.set(px, 0, pz);
    p.add(at(new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 2), pilD), 0, 0.3, 0));
    p.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, h, 12), pilM), 0, h / 2 + 0.6, 0));
    if (!broken) {
      p.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.9), pilD), 0, h + 0.85, 0));
      const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), crystalMat); cr.position.y = h + 1.9; cr.scale.y = 1.6; p.add(cr);
    } else {
      for (let k = 0; k < 3; k++) { const rb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + R() * 0.3, 0), pilM); rb.position.set((R() - 0.5) * 3, 0.3, (R() - 0.5) * 3); p.add(rb); }
    }
    p.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    lair.add(p);
  }
  outline(lair, 1);
  lair.position.set(LAIR_POS.x, 0, LAIR_POS.z);
  lair.userData.anim = (t) => { circ.rotation.y = t * 0.05; };
  group.add(lair);

  return {
    group, gate, lair, ringMats,
    update(t, px, pz) { if (grassU) { grassU.uTime.value = t; grassU.uPlayer.value.set(px, pz); } },
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
      for (const [x, y, z, r] of clumps) {
        B.add(S(r), C(lc.clone().offsetHSL(0, 0, y > 3.5 ? 0.06 : -0.02)), local(M, x, y, z, 0, 0, 0, 1, 0.85, 1));
      }
      if (R() < 0.35) for (let k = 0; k < 4; k++) B.add(S(0.09, 6, 4), C(0xff5a4a), local(M, (R() - 0.5) * 2, 2.7 + R() * 1.2, 0.9 + R() * 0.3), { glowing: false });
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
