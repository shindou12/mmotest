// エリアの見た目: プレイヤーの周りに漂う粒子
import * as THREE from 'three';

// アンビエントパーティクル（プレイヤー周辺に常時漂う）
export class AmbientParticles {
  constructor(scene, count = 500) {
    this.count = count;
    this.pos = new Float32Array(this.count * 3);
    this.vel = new Float32Array(this.count * 3);
    this.phase = new Float32Array(this.count);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.PointsMaterial({ size: 0.15, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, map: dotTexture() });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    // 雨は点ではなく、落ちる向きに伸びた線で描く
    this.streak = new Float32Array(this.count * 6);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.streak, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xc8d8f0, transparent: true, opacity: 0.45, depthWrite: false }));
    this.lines.frustumCulled = false; this.lines.visible = false;
    scene.add(this.lines);
    this.kind = null;
  }

  setKind(kind) {
    this.kind = kind;
    const cfg = {
      pollen: [0xfff6b0, 0.18, false], firefly: [0xb8ff60, 0.3, false], dust: [0xffe0a0, 0.15, false], sparkle: [0x9ae8ff, 0.2, false],
      ember: [0xff7a20, 0.25, false], snow: [0xffffff, 0.22, true], bubble: [0x9affff, 0.2, false], rain: [0xa0b8ff, 0.12, true],
      void: [0xb060ff, 0.25, false], feather: [0xfff0c0, 0.3, false],
      // 天候（[色, 大きさ, 通常合成, 不透明度]）
      downpour: [0xb8c8e8, 0.16, true, 0.7], mist: [0xe4ecee, 3.2, true, 0.12], sand: [0xd8a860, 0.28, true, 0.75],
    }[kind] || [0xffffff, 0.2, false];
    this.lines.visible = kind === 'downpour';
    this.points.visible = !!kind && !this.lines.visible;
    this.mat.color.set(cfg[0]); this.mat.size = cfg[1]; this.mat.opacity = cfg[3] ?? 0.8;
    this.mat.blending = cfg[2] ? THREE.NormalBlending : THREE.AdditiveBlending;
    this.mat.needsUpdate = true;
    for (let i = 0; i < this.count; i++) this.respawn(i, 0, 0, true);
  }

  respawn(i, cx, cz, anyY) {
    this.pos[i * 3] = cx + (Math.random() - 0.5) * 60;
    this.pos[i * 3 + 2] = cz + (Math.random() - 0.5) * 60;
    const k = this.kind;
    const fall = k === 'snow' || k === 'rain' || k === 'feather' || k === 'downpour';
    const rise = k === 'ember' || k === 'bubble';
    this.pos[i * 3 + 1] = anyY ? Math.random() * 15 : fall ? 15 : rise ? 0 : Math.random() * 6;
    this.vel[i * 3] = (Math.random() - 0.5) * 0.6; this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    this.vel[i * 3 + 1] = k === 'rain' ? -22 : k === 'downpour' ? -26 - Math.random() * 6 : k === 'snow' ? -1.2 : k === 'feather' ? -0.6 : rise ? 1 + Math.random() * 1.5 : (Math.random() - 0.5) * 0.3;
    if (k === 'rain' || k === 'downpour') this.vel[i * 3] = 3;
    // 砂嵐: 横殴りに速く流れる / 霧: 低い所を大きな塊がゆっくり漂う
    if (k === 'sand') { this.vel[i * 3] = 14 + Math.random() * 8; this.vel[i * 3 + 2] = 3 + Math.random() * 2; this.pos[i * 3 + 1] = Math.random() * 7; }
    if (k === 'mist') { this.vel[i * 3] = 0.6 + Math.random() * 0.4; this.pos[i * 3 + 1] = 0.3 + Math.random() * 3.5; }
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
    if (this.lines.visible) {
      const s = this.streak, P = this.pos, V = this.vel;
      for (let i = 0; i < this.count; i++) {
        const j = i * 3, k = i * 6;
        s[k] = P[j]; s[k + 1] = P[j + 1]; s[k + 2] = P[j + 2];
        s[k + 3] = P[j] - V[j] * 0.035; s[k + 4] = P[j + 1] - V[j + 1] * 0.035; s[k + 5] = P[j + 2] - V[j + 2] * 0.035;
      }
      this.lines.geometry.attributes.position.needsUpdate = true;
    }
    if (this.kind === 'firefly' || this.kind === 'void') this.mat.opacity = 0.6 + Math.sin(t * 3) * 0.3;
  }
}

export function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
