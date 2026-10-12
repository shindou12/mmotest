// 階層ごとの地形・プロップ・空・アンビエントパーティクル
import * as THREE from 'three';
import { FIELD_RADIUS, GATE_POS, LAIR_POS, LAIR_RADIUS } from '../shared/data.js';

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

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, flatShading: true, ...o });

export function buildFloor(def) {
  const group = new THREE.Group();
  const R = seeded(def.n * 7919);

  // 空
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(def.skyTop) }, bot: { value: new THREE.Color(def.skyBot) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float k = smoothstep(-0.1, 0.6, vP.y); gl_FragColor = vec4(mix(bot, top, k), 1.0); }',
  }));
  group.add(sky);

  // 地面（頂点カラーで揺らぎ）
  const gg = new THREE.CircleGeometry(FIELD_RADIUS + 30, 96, 0, Math.PI * 2);
  gg.rotateX(-Math.PI / 2);
  // 細分化
  const ground = new THREE.PlaneGeometry((FIELD_RADIUS + 30) * 2, (FIELD_RADIUS + 30) * 2, 120, 120);
  ground.rotateX(-Math.PI / 2);
  const pos = ground.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const c1 = new THREE.Color(def.ground), c2 = new THREE.Color(def.ground2), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, groundHeight(x, z));
    const k = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2) * Math.cos(z * 0.09);
    tmp.copy(c1).lerp(c2, k * 0.8 + Math.random() * 0.2);
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  ground.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  ground.computeVertexNormals();
  const gm = new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  gm.receiveShadow = true;
  group.add(gm);
  gg.dispose();

  // 外周の崖（壁）
  const wallMat = std(new THREE.Color(def.ground).multiplyScalar(0.6));
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + R() * 0.05, r = FIELD_RADIUS + 4 + R() * 6;
    const h = 6 + R() * 14, w = 5 + R() * 5;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), wallMat);
    m.scale.set(w, h, w); m.position.set(Math.sin(a) * r, h * 0.3, Math.cos(a) * r);
    m.rotation.set(R(), R() * 6, R());
    group.add(m);
  }

  // プロップ
  const avoid = (x, z) => Math.hypot(x - GATE_POS.x, z - GATE_POS.z) < 10 || Math.hypot(x - LAIR_POS.x, z - LAIR_POS.z) < LAIR_RADIUS + 3;
  for (const [type, count, col1, col2] of def.props) {
    for (let i = 0; i < count; i++) {
      const a = R() * Math.PI * 2, r = 6 + Math.sqrt(R()) * (FIELD_RADIUS - 4);
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (avoid(x, z)) continue;
      const p = makeProp(type, col1, col2, R);
      if (!p) continue;
      p.position.set(x, groundHeight(x, z), z);
      p.rotation.y = R() * Math.PI * 2;
      group.add(p);
    }
  }

  // 転移門
  const gate = new THREE.Group();
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x9ad8ff, emissive: 0x3ac8ff, emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.3 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.28, 12, 48), ringMat);
  ring.position.y = 3.6; gate.add(ring);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(2.8, 48), new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  inner.position.y = 3.6; gate.add(inner);
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.5, 0.4, 32), std(0x5a6270, { flatShading: false }));
  plat.position.y = 0.1; plat.receiveShadow = true; gate.add(plat);
  const rune = new THREE.Mesh(new THREE.RingGeometry(4.6, 5.0, 64), new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  rune.rotation.x = -Math.PI / 2; rune.position.y = 0.32; gate.add(rune);
  for (const s of [-1, 1]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7.5, 0.7), std(0x7a8494));
    pil.position.set(s * 3.4, 3.75, 0); gate.add(pil);
  }
  gate.position.set(GATE_POS.x, 0, GATE_POS.z);
  gate.userData.anim = (t) => { ring.rotation.z = t * 0.5; inner.material.opacity = 0.1 + Math.sin(t * 2) * 0.05; rune.rotation.z = t * 0.2; };
  group.add(gate);

  // ボス部屋（柱の円環 + 魔法陣）
  const lair = new THREE.Group();
  const accent = def.boss.accent;
  const floorM = new THREE.Mesh(new THREE.CircleGeometry(LAIR_RADIUS, 64), std(new THREE.Color(def.ground).multiplyScalar(0.55), { flatShading: false, roughness: 0.6 }));
  floorM.rotation.x = -Math.PI / 2; floorM.position.y = 0.03; floorM.receiveShadow = true; lair.add(floorM);
  const circ = new THREE.Group();
  for (const [r0, r1] of [[LAIR_RADIUS - 1, LAIR_RADIUS - 0.6], [LAIR_RADIUS * 0.55, LAIR_RADIUS * 0.55 + 0.25], [3, 3.2]]) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.06; circ.add(m);
  }
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.25, LAIR_RADIUS * 1.08), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = i * Math.PI / 6 * 2 / 2 + i * 0.52; m.position.y = 0.065; circ.add(m);
  }
  lair.add(circ);
  const pilMat = std(new THREE.Color(def.ground2).lerp(new THREE.Color(0x888888), 0.5));
  const crystalMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 2 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    if (Math.abs(Math.sin(a / 2)) < 0.15) continue; // 南側の入口
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 9, 8), pilMat);
    pil.position.set(Math.sin(a) * (LAIR_RADIUS + 1), 4.5, Math.cos(a) * (LAIR_RADIUS + 1)); pil.castShadow = true;
    lair.add(pil);
    const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), crystalMat);
    cr.position.set(pil.position.x, 9.8, pil.position.z); lair.add(cr);
  }
  lair.position.set(LAIR_POS.x, 0, LAIR_POS.z);
  lair.userData.anim = (t) => { circ.rotation.y = t * 0.05; };
  group.add(lair);

  return { group, gate, lair, circ, ringMats: circ.children.map((m) => m.material) };
}

function makeProp(type, c1, c2, R) {
  const g = new THREE.Group();
  const s = 0.7 + R() * 0.8;
  switch (type) {
    case 'tree': {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 2.4, 6), std(c2));
      trunk.position.y = 1.2; g.add(trunk);
      for (let i = 0; i < 3; i++) {
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 - i * 0.25, 0), std(new THREE.Color(c1).offsetHSL(0, 0, (R() - 0.5) * 0.1)));
        leaf.position.set((R() - 0.5) * 0.8, 2.8 + i * 0.8, (R() - 0.5) * 0.8); g.add(leaf);
      }
      break;
    }
    case 'pine': {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.6, 6), std(c2));
      trunk.position.y = 0.8; g.add(trunk);
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.8 - i * 0.45, 2.2, 7), std(c1));
        cone.position.y = 2 + i * 1.3; g.add(cone);
      }
      break;
    }
    case 'rock': {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), std(c1));
      m.scale.set(1 + R(), 0.6 + R() * 0.6, 1 + R()); m.position.y = 0.3; g.add(m);
      break;
    }
    case 'flower': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 4), new THREE.MeshStandardMaterial({ color: R() < 0.5 ? c1 : c2, emissive: R() < 0.5 ? c1 : c2, emissiveIntensity: 0.3 }));
      m.position.y = 0.25; g.add(m);
      return g;
    }
    case 'mushroom': {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 6), std(c2)); st.position.y = 0.4; g.add(st);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: c1, emissive: c1, emissiveIntensity: 0.4 }));
      cap.position.y = 0.75; g.add(cap);
      break;
    }
    case 'cactus': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 2.6, 7), std(c1)); body.position.y = 1.3; g.add(body);
      for (const sd of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1, 6), std(c1));
        arm.position.set(sd * 0.6, 1.6 + R() * 0.5, 0); g.add(arm);
      }
      break;
    }
    case 'bones': {
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 4), std(c1));
        b.rotation.set(Math.PI / 2, R() * 3, 0); b.position.set((R() - 0.5), 0.1, (R() - 0.5)); g.add(b);
      }
      return g;
    }
    case 'crystal': {
      const mat = new THREE.MeshStandardMaterial({ color: R() < 0.5 ? c1 : c2, emissive: R() < 0.5 ? c1 : c2, emissiveIntensity: 1.2, transparent: true, opacity: 0.85, roughness: 0.1 });
      for (let i = 0; i < 1 + Math.floor(R() * 3); i++) {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), mat);
        m.scale.set(0.6, 2 + R() * 2, 0.6); m.position.set((R() - 0.5) * 1.2, 1, (R() - 0.5) * 1.2);
        m.rotation.set((R() - 0.5) * 0.5, 0, (R() - 0.5) * 0.5); g.add(m);
      }
      break;
    }
    case 'stalag': {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3 + R() * 3, 6), std(c1)); m.position.y = 1.5; g.add(m);
      break;
    }
    case 'lavarock': {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: c1, emissive: c2, emissiveIntensity: 0.25, flatShading: true }));
      m.scale.set(1 + R(), 0.7 + R(), 1 + R()); m.position.y = 0.4; g.add(m);
      break;
    }
    case 'lavapool': {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1.5 + R() * 2, 12), new THREE.MeshStandardMaterial({ color: c1, emissive: c1, emissiveIntensity: 1.4 }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.05; g.add(m);
      return g;
    }
    case 'spike': {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3 + R() * 3, 5), std(c1));
      m.position.y = 1.5; m.rotation.z = (R() - 0.5) * 0.4; g.add(m);
      break;
    }
    case 'icespike': {
      const mat = new THREE.MeshStandardMaterial({ color: c1, emissive: c1, emissiveIntensity: 0.3, transparent: true, opacity: 0.8, roughness: 0.05, metalness: 0.2, flatShading: true });
      for (let i = 0; i < 1 + Math.floor(R() * 3); i++) {
        const m = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.5 + R() * 3, 5), mat);
        m.position.set((R() - 0.5) * 1.5, 1.2, (R() - 0.5) * 1.5); m.rotation.set((R() - 0.5) * 0.6, 0, (R() - 0.5) * 0.6); g.add(m);
      }
      break;
    }
    case 'pillar': {
      const h = 3 + R() * 6;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, h, 10), std(c1, { flatShading: false }));
      m.position.y = h / 2; g.add(m);
      if (R() < 0.5) { const cap = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 1.8), std(c1)); cap.position.y = h; g.add(cap); }
      if (R() < 0.3) m.rotation.z = 0.3;
      break;
    }
    case 'coral': {
      const mat = new THREE.MeshStandardMaterial({ color: R() < 0.5 ? c1 : c2, emissive: R() < 0.5 ? c1 : c2, emissiveIntensity: 0.6 });
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.15, 1.5 + R(), 5), mat);
        m.position.set((R() - 0.5) * 0.8, 0.7, (R() - 0.5) * 0.8); m.rotation.set((R() - 0.5), 0, (R() - 0.5)); g.add(m);
      }
      break;
    }
    case 'spire': {
      const h = 6 + R() * 10;
      const m = new THREE.Mesh(new THREE.ConeGeometry(1.2, h, 6), std(c1)); m.position.y = h / 2; g.add(m);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshStandardMaterial({ color: c2, emissive: c2, emissiveIntensity: 3 }));
      orb.position.y = h + 0.3; g.add(orb);
      break;
    }
    case 'voidcube': {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: c1, emissive: c2, emissiveIntensity: 0.6, flatShading: true }));
      m.position.y = 1.5 + R() * 4; m.rotation.set(R() * 3, R() * 3, R() * 3); g.add(m);
      g.userData.float = R() * 6;
      break;
    }
    case 'cloud': {
      const mat = new THREE.MeshStandardMaterial({ color: c1, emissive: 0xffffff, emissiveIntensity: 0.15, transparent: true, opacity: 0.85 });
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + R(), 1), mat);
        m.position.set((R() - 0.5) * 3, 0.4, (R() - 0.5) * 3); g.add(m);
      }
      break;
    }
    default: return null;
  }
  g.scale.setScalar(s);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
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
