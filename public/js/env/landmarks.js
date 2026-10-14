// エリアの見た目: 空・転移門・ワープポイント・入口・ボスの部屋・草・遠景
import * as THREE from 'three';
import { toon, glow, outline, Batch } from '../toon.js';
import { GRASS, local, I, at, textSprite } from './kit.js';

export function makeSky(fdef, dark) {
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

export function makeGate() {
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

// ワープポイント（触れると解放。解放前は暗く、解放後は水晶が青く光って回る）
export function makeWaypoint() {
  const g = new THREE.Group();
  const stone = toon(0x8a93a6), stoneD = toon(0x4a5264);
  const offMat = toon(0x5a6a7a), onMat = glow(new THREE.Color(0x6ad8ff).multiplyScalar(1.5));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 0.4, 6), stoneD), 0, 0.2, 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.75, 2.2, 6), stone), 0, 1.5, 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 0.35, 6), stoneD), 0, 2.75, 0));
  const crystal = at(new THREE.Mesh(new THREE.OctahedronGeometry(0.55), offMat), 0, 3.7, 0);
  crystal.scale.y = 1.6; g.add(crystal);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.1, 6), new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.45; g.add(ring);
  g.traverse((o) => { if (o.isMesh && o !== ring) o.castShadow = true; });
  outline(g, 1);
  const label = at(textSprite('ワープポイント', '#9ae8ff', 2.6, '触れると解放'), 0, 5.4, 0);
  g.add(label);
  let on = false;
  g.userData.setOn = (v) => { on = v; crystal.material = v ? onMat : offMat; ring.material.opacity = v ? 0.7 : 0; label.visible = !v; };
  g.userData.anim = (t) => { crystal.rotation.y = t * (on ? 1.6 : 0.3); crystal.position.y = 3.7 + Math.sin(t * 2) * (on ? 0.15 : 0.03); ring.rotation.z = t * 0.3; };
  return g;
}

// エリア間の出口（光る門）
export function makePortal(label, color = 0x9ad8ff) {
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
export function makeLair(lair, accent, groundCol) {
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
export function makeGrass(fdef, R, heightAt, R_, avoid, density, areaR = R) {
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
  const count = Math.min(36000, Math.round(Math.PI * areaR * areaR * dens * density));
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
  for (let tries = 0; n < count && tries < count * 5; tries++) {
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
export function makeFar(fdef, R) {
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
