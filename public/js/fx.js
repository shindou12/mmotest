// ビジュアルエフェクト: パーティクル / 斬撃 / 光柱 / 雷 / 衝撃波 / 予兆
import * as THREE from 'three';

const PART_VS = `
attribute float size; attribute float alpha; attribute vec3 color;
varying float vA; varying vec3 vC;
void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = size * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;
const PART_FS = `
varying float vA; varying vec3 vC;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if(d>0.5) discard;
  float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * (1.0 + a), a * vA); }`;

export class Particles {
  constructor(scene, max = 6000) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.c = new Float32Array(max * 3); this.s = new Float32Array(max); this.a = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    this.s0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.a, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: PART_VS, fragmentShader: PART_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, o = {}) {
    if (this.n >= this.max) return;
    const i = this.n++, c = new THREE.Color(o.color ?? 0xffffff);
    const sp = o.speed ?? 3, sp2 = o.spread ?? 1;
    const dir = o.dir;
    this.p[i * 3] = x + (Math.random() - 0.5) * (o.jitter ?? 0); this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z + (Math.random() - 0.5) * (o.jitter ?? 0);
    if (dir) {
      this.v[i * 3] = dir[0] * sp + (Math.random() - 0.5) * sp2; this.v[i * 3 + 1] = dir[1] * sp + (Math.random() - 0.5) * sp2; this.v[i * 3 + 2] = dir[2] * sp + (Math.random() - 0.5) * sp2;
    } else {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), s = sp * (0.3 + Math.random() * 0.7);
      this.v[i * 3] = Math.sin(ph) * Math.cos(th) * s; this.v[i * 3 + 1] = Math.abs(Math.cos(ph)) * s * (o.up ?? 1); this.v[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * s;
    }
    this.c[i * 3] = c.r; this.c[i * 3 + 1] = c.g; this.c[i * 3 + 2] = c.b;
    this.s0[i] = (o.size ?? 0.5) * (0.6 + Math.random() * 0.8);
    this.life[i] = this.maxLife[i] = (o.life ?? 0.8) * (0.6 + Math.random() * 0.8);
    this.grav[i] = o.gravity ?? -6; this.drag[i] = o.drag ?? 2;
  }

  burst(x, y, z, count, o) { for (let i = 0; i < count; i++) this.emit(x, y, z, o); }

  update(dt) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); i--; continue; }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.v[i * 3] *= d; this.v[i * 3 + 1] = this.v[i * 3 + 1] * d + this.grav[i] * dt; this.v[i * 3 + 2] *= d;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      const k = this.life[i] / this.maxLife[i];
      this.a[i] = Math.min(1, k * 2.5); this.s[i] = this.s0[i] * (0.4 + 0.6 * k);
    }
    this.geo.setDrawRange(0, this.n);
    for (const k of ['position', 'color', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (const [arr, w] of [[this.p, 3], [this.v, 3], [this.c, 3]]) for (let k = 0; k < w; k++) arr[i * w + k] = arr[j * w + k];
    for (const arr of [this.s, this.a, this.life, this.maxLife, this.grav, this.drag, this.s0]) arr[i] = arr[j];
  }
}

// 一時的なメッシュエフェクト管理
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.parts = new Particles(scene);
    this.items = [];
    this.lights = [];
    // 動的ポイントライトのプール（シェーダー再コンパイルを防ぐため固定数）
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      scene.add(l); this.lights.push({ l, t: 0, max: 1, i0: 0 });
    }
  }

  add(obj, life, update) { this.scene.add(obj); this.items.push({ obj, life, max: life, update }); return obj; }

  flash(x, y, z, color, intensity = 30, life = 0.25, dist = 12) {
    const L = this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    L.l.position.set(x, y, z); L.l.color.set(color); L.l.distance = dist; L.t = life; L.max = life; L.i0 = intensity;
  }

  update(dt) {
    this.parts.update(dt);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const k = 1 - Math.max(0, it.life) / it.max;
      if (it.update) it.update(it.obj, k, dt);
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        it.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        this.items.splice(i, 1);
      }
    }
    for (const L of this.lights) {
      L.t = Math.max(0, L.t - dt);
      L.l.intensity = L.max > 0 ? L.i0 * (L.t / L.max) : 0;
    }
  }

  // 斬撃の軌跡（扇形のリボン）
  slash(x, z, a, range, arcDeg, color, y = 1.0, reverse = false) {
    const arc = THREE.MathUtils.degToRad(arcDeg);
    const g = new THREE.RingGeometry(range * 0.35, range, 32, 1, -Math.PI / 2 - arc / 2, arc);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z); mesh.rotation.y = a;
    mesh.rotation.z = reverse ? 0.25 : -0.25;
    this.add(mesh, 0.22, (o, k) => { o.material.opacity = 0.9 * (1 - k); o.scale.setScalar(0.85 + k * 0.25); });
    for (let i = 0; i < 10; i++) {
      const t = (Math.random() - 0.5) * arc + a;
      const r = range * (0.5 + Math.random() * 0.5);
      this.parts.emit(x + Math.sin(t) * r, y, z + Math.cos(t) * r, { color, size: 0.35, life: 0.35, speed: 2, gravity: 0 });
    }
  }

  ringWave(x, z, color, maxR = 6, life = 0.45, y = 0.15, width = 0.6) {
    const g = new THREE.RingGeometry(0.8, 1, 48); g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y, z);
    this.add(mesh, life, (o, k) => { const r = 0.5 + maxR * Math.sqrt(k); o.scale.set(r, 1, r); o.material.opacity = 1 - k; });
    void width;
  }

  // 光の柱（ドロップ・レベルアップ）
  beam(x, z, color, height = 14, radius = 0.45, life = Infinity) {
    const g = new THREE.CylinderGeometry(radius, radius * 1.4, height, 16, 1, true);
    g.translate(0, height / 2, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uFade: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uFade; varying vec2 vUv;
        void main(){ float a = pow(1.0 - vUv.y, 1.6) * (0.6 + 0.4 * sin(vUv.y * 20.0 - uTime * 6.0));
        gl_FragColor = vec4(uColor * 1.6, a * uFade); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, m); mesh.position.set(x, 0, z);
    if (life === Infinity) { this.scene.add(mesh); return mesh; }
    return this.add(mesh, life, (o, k, dt) => { o.material.uniforms.uTime.value += dt; o.material.uniforms.uFade.value = 1 - k; o.scale.x = o.scale.z = 1 + k * 1.5; });
  }

  lightning(x, z, color = 0xbfd8ff) {
    const pts = [];
    let px = x + (Math.random() - 0.5) * 2, pz = z + (Math.random() - 0.5) * 2;
    for (let y = 18; y >= 0; y -= 1.5) {
      pts.push(new THREE.Vector3(px, y, pz));
      px += (Math.random() - 0.5) * 1.4; pz += (Math.random() - 0.5) * 1.4;
      if (y < 3) { px = px * 0.5 + x * 0.5; pz = pz * 0.5 + z * 0.5; }
    }
    pts.push(new THREE.Vector3(x, 0, z));
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending }));
    this.add(line, 0.25, (o, k) => { o.material.opacity = Math.random() > 0.3 ? 1 - k : 0.2; });
    this.flash(x, 4, z, color, 60, 0.25, 20);
    this.parts.burst(x, 0.3, z, 30, { color, size: 0.5, speed: 8, life: 0.4 });
    this.ringWave(x, z, color, 3.5, 0.35);
  }

  // 飛んでいく光の斬撃波（見た目のみ。ヒット判定は main 側）
  waveMesh(color) {
    const g = new THREE.RingGeometry(0.9, 1.5, 24, 1, -Math.PI / 2 - 0.9, 1.8); g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m); this.scene.add(mesh); return mesh;
  }

  dispose(obj) {
    this.scene.remove(obj);
    obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
}

// ---- 予兆（地面の赤いエリア） ----
function shapeGeo(s) {
  let g;
  switch (s.k) {
    case 'circle': g = new THREE.CircleGeometry(s.r, 48); break;
    case 'ring': g = new THREE.RingGeometry(s.r0, s.r1, 64); break;
    case 'cone': g = new THREE.CircleGeometry(s.len, 32, -Math.PI / 2 - s.arc / 2, s.arc); break;
    case 'line': g = new THREE.PlaneGeometry(s.w, s.len); g.translate(0, -s.len / 2, 0); break;
  }
  g.rotateX(-Math.PI / 2);
  return g;
}

export function makeTelegraph(s, color) {
  const group = new THREE.Group();
  const geo = shapeGeo(s);
  const base = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
  const fill = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 1), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  fill.position.y = 0.01; edge.position.y = 0.02;
  group.add(base, fill, edge);
  group.position.set(s.x, 0.06, s.z);
  if (s.k === 'cone' || s.k === 'line') group.rotation.y = s.a;
  group.userData = { s, fill, base };
  group.setProgress = (k) => {
    if (s.k === 'circle') fill.scale.set(k, 1, k);
    else if (s.k === 'cone') fill.scale.set(k, 1, k);
    else if (s.k === 'line') fill.scale.set(1, 1, k);
    else fill.material.opacity = 0.1 + k * 0.4;
    base.material.opacity = 0.18 + 0.12 * Math.sin(k * 30) * k;
  };
  return group;
}
