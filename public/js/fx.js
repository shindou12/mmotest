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
    this.ground = () => 0; // 地面の高さ。emit の y は地面からの高さ（o.abs ならワールドの高さ）
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
    if (!o.abs) y += this.ground(x, z);
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
// 武器の振りの軌跡（トレイル）: 刃の根元と先端の位置を毎フレーム記録し、新しい順に帯でつなぐ。古いほど薄く、刃先ほど明るい
const TRAIL = { n: 24, life: 0.16, sub: 3, opacity: 0.6 }; // sub: 1フレームの間を補う点の数（速い振りでも角ばらない）
class WeaponTrail {
  constructor(scene, color) {
    const N = TRAIL.n, g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 2 * 3); this.alpha = new Float32Array(N * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: 'attribute float alpha; varying float vA; void main() { vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; varying float vA; void main() { gl_FragColor = vec4(uColor * (1.0 + vA), vA); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 7;
    scene.add(this.mesh);
    this.s = []; // { b: 根元, t: 先端, age }
  }
  update(base, tip, active, dt) {
    for (const p of this.s) p.age += dt;
    while (this.s.length && this.s[this.s.length - 1].age > TRAIL.life) this.s.pop();
    if (active) {
      const prev = this.s[0];
      if (prev) for (let k = 1; k < TRAIL.sub; k++) { // 前の点との間を補う
        const f = k / TRAIL.sub;
        this.s.unshift({ b: prev.b.clone().lerp(base, f), t: prev.t.clone().lerp(tip, f), age: dt * (1 - f) });
      }
      this.s.unshift({ b: base.clone(), t: tip.clone(), age: 0 });
      if (this.s.length > TRAIL.n) this.s.length = TRAIL.n;
    }
    const n = this.s.length;
    this.mesh.visible = n > 1;
    this.s.forEach((p, i) => {
      const fade = Math.max(0, 1 - p.age / TRAIL.life) * TRAIL.opacity;
      this.pos.set([p.b.x, p.b.y, p.b.z, p.t.x, p.t.y, p.t.z], i * 6);
      this.alpha[i * 2] = fade * 0.15; this.alpha[i * 2 + 1] = fade;
    });
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
    g.setDrawRange(0, Math.max(0, n - 1) * 6);
    return n > 0;
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mat.dispose(); }
}
// 武器の刃の範囲（武器の中の座標で、根元と先端）。刃は +Y 向きに作ってある
const span = new WeakMap(), tmpM = new THREE.Matrix4(), tmpB = new THREE.Box3();
function bladeSpan(weapon) {
  let s = span.get(weapon);
  if (s) return s;
  weapon.updateWorldMatrix(true, true);
  const inv = weapon.matrixWorld.clone().invert(), box = new THREE.Box3();
  weapon.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.userData.noOutline) return;
    o.geometry.computeBoundingBox();
    box.union(tmpB.copy(o.geometry.boundingBox).applyMatrix4(tmpM.multiplyMatrices(inv, o.matrixWorld)));
  });
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, len = box.max.y - box.min.y;
  s = { b: new THREE.Vector3(cx, box.min.y + len * 0.42, cz), t: new THREE.Vector3(cx, box.max.y, cz) };
  span.set(weapon, s);
  return s;
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.parts = new Particles(scene);
    this.items = [];
    this.ground = (x, z) => this.parts.ground(x, z); // setGround で地形の高さを渡す。エフェクトの y はすべて地面からの高さ
    this.trails = new Map(); // 武器 → 振りの軌跡
    this.lights = [];
    // 動的ポイントライトのプール（シェーダー再コンパイルを防ぐため固定数）
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      scene.add(l); this.lights.push({ l, t: 0, max: 1, i0: 0 });
    }
  }

  setGround(fn) { this.parts.ground = fn; }

  add(obj, life, update) { this.scene.add(obj); this.items.push({ obj, life, max: life, update }); return obj; }

  // 残像: model のその瞬間の姿勢を写した、半透明の光の像（形は共有。輪郭線・光源は写さない）
  ghost(model, color, life = 0.28, opacity = 0.35) {
    model.updateMatrixWorld();
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    const g = model.clone(true);
    g.traverse((o) => {
      if (o.isLight || (o.isMesh && (o.userData.noOutline || o.material?.side === THREE.BackSide)) || o.isPoints || o.isSprite || o.isLine) { o.visible = false; return; }
      if (o.isMesh) { o.material = mat; o.castShadow = false; o.raycast = () => {}; }
    });
    g.userData.ghost = mat;
    return this.add(g, life, (o, k) => { mat.opacity = opacity * (1 - k); });
  }

  // 武器の振りの軌跡。毎フレーム呼ぶ（active: 振っている間）。武器の持ち主のワールド行列は呼ぶ前に更新しておく
  swordTrail(weapon, active, color, dt) {
    let tr = this.trails.get(weapon);
    if (!tr) { if (!active) return; tr = new WeaponTrail(this.scene, color); this.trails.set(weapon, tr); }
    const S = bladeSpan(weapon);
    tr.mat.uniforms.uColor.value.set(color);
    const alive = tr.update(weapon.localToWorld(S.b.clone()), weapon.localToWorld(S.t.clone()), active, dt);
    if (!alive && !weapon.parent) { tr.dispose(); this.trails.delete(weapon); } // 持ち替えた武器の軌跡は消えたら片付ける
  }

  flash(x, y, z, color, intensity = 30, life = 0.25, dist = 12) {
    const L = this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    L.l.position.set(x, y + this.ground(x, z), z); L.l.color.set(color); L.l.distance = dist; L.t = life; L.max = life; L.i0 = intensity;
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
        if (it.obj.userData.ghost) it.obj.userData.ghost.dispose(); // 残像: 形は本物のモデルと共有なので、残像の材質だけ捨てる
        else it.obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
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
    // 坂でも扇が地面に埋まらないよう、扇の範囲で一番高い地面に合わせる
    let gy = this.ground(x, z);
    for (let i = 0; i < 6; i++) { const t = a + (i / 5 - 0.5) * arc; for (const f of [0.5, 1]) gy = Math.max(gy, this.ground(x + Math.sin(t) * range * f, z + Math.cos(t) * range * f)); }
    mesh.position.set(x, y + gy, z); mesh.rotation.y = a;
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
    // 地面すれすれの輪は起伏で欠けるので、地形より手前に描く（深度を見ない）
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m); mesh.position.set(x, y + this.ground(x, z), z); mesh.renderOrder = 3;
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
    const mesh = new THREE.Mesh(g, m); mesh.position.set(x, this.ground(x, z), z);
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
    const g0 = this.ground(x, z); for (const p of pts) p.y += g0;
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
    if (obj.parent) obj.parent.remove(obj);
    obj.traverse((o) => {
      if (o.userData.disposeMap && o.material?.map) o.material.map.dispose();
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.material && !o.material.userData.shared) o.material.dispose();
    });
  }
}

// ---- 予兆（地面の赤いエリア） ----
// 地面の起伏に沿うよう、細かく分割した形を頂点ごとに地面の高さへ貼り付ける。
// 塗りの進み具合はシェーダーで描く（属性 p: 0〜1 の進行方向の座標）
const LIFT = 0.14;

const TELE_VS = `attribute float p; varying float vP;
void main(){ vP = p; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const TELE_FS = `uniform vec3 uColor; uniform float uProg; uniform float uPulse; varying float vP;
void main(){
  float fill = step(vP, uProg);
  float front = smoothstep(0.06, 0.0, abs(vP - uProg)) * step(0.001, uProg);
  float a = 0.16 + uPulse * 0.08 + fill * 0.3 + front * 0.45;
  gl_FragColor = vec4(uColor * (1.0 + front * 0.6), a);
}`;

// 局所座標（前方 = +z）→ ワールド座標（向き a で回転、中心 s.x/s.z）
function toWorld(s, lx, lz, rot) {
  const c = Math.cos(rot), n = Math.sin(rot);
  return [s.x + lx * c + lz * n, s.z - lx * n + lz * c];
}

// 極座標のグリッド（円・リング・扇）を作る
function polarGrid(s, r0, r1, a0, a1, rot, heightAt, progOf) {
  const rs = Math.max(4, Math.ceil((r1 - r0) / 0.8)), as = Math.max(12, Math.ceil(Math.abs(a1 - a0) * Math.max(r1, 1) / 0.9));
  const pos = [], pr = [], idx = [];
  for (let i = 0; i <= rs; i++) {
    const r = r0 + (r1 - r0) * i / rs;
    for (let j = 0; j <= as; j++) {
      const t = a0 + (a1 - a0) * j / as;
      const [x, z] = toWorld(s, Math.sin(t) * r, Math.cos(t) * r, rot);
      pos.push(x, heightAt(x, z) + LIFT, z); pr.push(progOf(r));
    }
  }
  for (let i = 0; i < rs; i++) for (let j = 0; j < as; j++) {
    const a = i * (as + 1) + j, b = a + as + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { pos, pr, idx };
}

function teleGeometry(s, heightAt) {
  let d;
  switch (s.k) {
    case 'circle': d = polarGrid(s, 0, s.r, 0, Math.PI * 2, 0, heightAt, (r) => r / s.r); break;
    case 'ring': d = polarGrid(s, Math.max(0.01, s.r0), s.r1, 0, Math.PI * 2, 0, heightAt, (r) => (r - s.r0) / Math.max(0.01, s.r1 - s.r0)); break;
    case 'cone': d = polarGrid(s, 0, s.len, -s.arc / 2, s.arc / 2, s.a, heightAt, (r) => r / s.len); break;
    case 'line': {
      const ls = Math.max(2, Math.ceil(s.len / 0.8)), ws = Math.max(2, Math.ceil(s.w / 0.8));
      const pos = [], pr = [], idx = [];
      for (let i = 0; i <= ls; i++) for (let j = 0; j <= ws; j++) {
        const [x, z] = toWorld(s, -s.w / 2 + s.w * j / ws, s.len * i / ls, s.a);
        pos.push(x, heightAt(x, z) + LIFT, z); pr.push(i / ls);
      }
      for (let i = 0; i < ls; i++) for (let j = 0; j < ws; j++) {
        const a = i * (ws + 1) + j, b = a + ws + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
      d = { pos, pr, idx };
      break;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
  g.setAttribute('p', new THREE.Float32BufferAttribute(d.pr, 1));
  g.setIndex(d.idx);
  return g;
}

// 外枠（地面に沿った線）。草や起伏に隠れないよう常に手前に描く
function teleOutline(s, heightAt) {
  const pts = [];
  const seg = (list) => { for (let i = 0; i < list.length - 1; i++) pts.push(list[i], list[i + 1]); };
  const P = (lx, lz, rot) => { const [x, z] = toWorld(s, lx, lz, rot); return new THREE.Vector3(x, heightAt(x, z) + LIFT + 0.02, z); };
  const arc = (r, a0, a1, rot) => {
    const n = Math.max(16, Math.ceil(Math.abs(a1 - a0) * r / 0.6));
    return Array.from({ length: n + 1 }, (_, i) => { const t = a0 + (a1 - a0) * i / n; return P(Math.sin(t) * r, Math.cos(t) * r, rot); });
  };
  const straight = (x0, z0, x1, z1, rot) => {
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.6));
    return Array.from({ length: n + 1 }, (_, i) => P(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, rot));
  };
  switch (s.k) {
    case 'circle': seg(arc(s.r, 0, Math.PI * 2, 0)); break;
    case 'ring': seg(arc(s.r1, 0, Math.PI * 2, 0)); if (s.r0 > 0.3) seg(arc(s.r0, 0, Math.PI * 2, 0)); break;
    case 'cone': {
      const h = s.arc / 2;
      seg(arc(s.len, -h, h, s.a));
      seg(straight(0, 0, Math.sin(-h) * s.len, Math.cos(-h) * s.len, s.a));
      seg(straight(0, 0, Math.sin(h) * s.len, Math.cos(h) * s.len, s.a));
      break;
    }
    case 'line': {
      const w = s.w / 2;
      seg(straight(-w, 0, -w, s.len, s.a)); seg(straight(w, 0, w, s.len, s.a));
      seg(straight(-w, 0, w, 0, s.a)); seg(straight(-w, s.len, w, s.len, s.a));
      break;
    }
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

export function makeTelegraph(s, color, heightAt = () => 0) {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uProg: { value: 0 }, uPulse: { value: 0 } },
    vertexShader: TELE_VS, fragmentShader: TELE_FS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  const area = new THREE.Mesh(teleGeometry(s, heightAt), mat);
  area.renderOrder = 5;
  const edge = new THREE.LineSegments(teleOutline(s, heightAt), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }));
  edge.renderOrder = 6;
  group.add(area, edge);
  group.userData = { s };
  group.setProgress = (k) => {
    mat.uniforms.uProg.value = k;
    mat.uniforms.uPulse.value = Math.max(0, Math.sin(k * 30)) * k;
  };
  return group;
}
