// エフェクトの形違い（見比べ用の3案）: FX と同じ呼び方のまま、見た目の部品だけを差し替える。
//   anime  … アニメ調。三日月の斬撃が振りの向きに走り、白い芯と色の縁がくっきり。星形の粒と線の火花
//   flashy … 派手。太く光る斬撃、塗りつぶしの衝撃波、大きくにじむ粒と多めの火花。Bloom を強く
//   blend  … A+B。形はアニメ調（くっきりした三日月・星形の粒・2重の輪）、光の強さと粒の多さは派手寄り
//   subtle … 控えめ。細い斬撃と細い輪、小さく少ない粒。画面と敵の予兆が見やすい
// ゲームの技は fx.slash / ringWave / waveMesh / lightning / flash / parts.burst / swordTrail を組み合わせて呼んでいるので、
// ここを差し替えればすべての技の見た目が変わる（技ごとの呼び方は変えなくてよい）
import * as THREE from 'three';
import { FX } from './fx.js';

export const FX_STYLES = {
  anime: {
    name: 'A アニメ調', bloom: 0.55, flash: 1,
    parts: { shape: 'star', count: 1, size: 1.1 }, sparks: 0.7,
    slash: { width: 0.34, core: 0.32, hard: 1, gain: 1.3, opacity: 1, life: 0.26, tail: 0.75 },
    ring: { width: 0.09, fill: 0, hard: 1, gain: 1.4, double: true },
    trail: { core: 0.45, hard: 1 },
  },
  flashy: {
    name: 'B 派手', bloom: 0.85, flash: 1.25,
    parts: { shape: 'glow', count: 1.5, size: 1.25 }, sparks: 1,
    slash: { width: 0.5, core: 0.4, hard: 0, gain: 1.8, opacity: 0.9, life: 0.32, tail: 1 },
    ring: { width: 0.2, fill: 0.22, hard: 0, gain: 1.8, double: false },
    trail: { core: 0.6, hard: 0 },
  },
  blend: {
    name: 'A+B', bloom: 0.72, flash: 1.15,
    parts: { shape: 'star', count: 1.35, size: 1.2 }, sparks: 1,
    slash: { width: 0.42, core: 0.36, hard: 1, gain: 1.7, opacity: 1, life: 0.3, tail: 0.9 },
    ring: { width: 0.14, fill: 0.15, hard: 0, gain: 1.7, double: true },
    trail: { core: 0.5, hard: 1 },
  },
  subtle: {
    name: 'C 控えめ', bloom: 0.3, flash: 0.6,
    parts: { shape: 'dot', count: 0.5, size: 0.8 }, sparks: 0.1,
    slash: { width: 0.2, core: 0.2, hard: 0, gain: 1, opacity: 0.6, life: 0.2, tail: 0.6 },
    ring: { width: 0.05, fill: 0, hard: 0, gain: 1, double: false },
    trail: { core: 0.2, hard: 0 },
  },
};

// ---- 三日月の帯（斬撃・光波）: 前 = +z。両端ほど細く、真ん中が太い。uv.x 0〜1 は振りの向き、uv.y 0 内側〜1 外側 ----
function crescentGeometry(range, arc, width) {
  const N = 40, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, phi = -arc / 2 + arc * t, thick = range * width * Math.pow(Math.sin(Math.PI * t), 0.6);
    for (const [s, r] of [[0, range - thick], [1, range]]) { pos.push(Math.sin(phi) * r, 0, Math.cos(phi) * r); uv.push(t, s); }
  }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// 頭（uHead）が振りの向きへ走り、通ったあとは尾を引いて消える。uHard 1 でセル調の2段（白い芯 / 色）
const BAND_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const BAND_FS = `uniform vec3 uColor; uniform float uHead, uTail, uCore, uHard, uGain, uOpacity, uRev; varying vec2 vUv;
void main(){
  float t = mix(vUv.x, 1.0 - vUv.x, uRev), s = vUv.y;
  float behind = uHead - t;
  float sweep = step(0.0, behind) * (1.0 - smoothstep(0.0, uTail, behind));
  float soft = smoothstep(0.0, 0.5, s) * sweep, hard = step(0.12, s) * step(0.15, sweep);
  float a = mix(soft, hard, uHard);
  float core = mix(smoothstep(1.0 - uCore, 1.0, s), step(1.0 - uCore, s), uHard);
  vec3 c = mix(uColor * uGain, vec3(1.0), core * 0.85);
  gl_FragColor = vec4(c, a * uOpacity);
}`;
function bandMaterial(color, st, rev) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uHead: { value: 0 }, uTail: { value: st.tail }, uCore: { value: st.core }, uHard: { value: st.hard }, uGain: { value: st.gain }, uOpacity: { value: st.opacity }, uRev: { value: rev ? 1 : 0 } },
    vertexShader: BAND_VS, fragmentShader: BAND_FS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}

// ---- 衝撃波の輪: 円盤に描く（uv の中心からの距離）。外周に明るい縁、uFill で内側を塗る ----
const RING_FS = `uniform vec3 uColor; uniform float uK, uWidth, uFill, uHard, uGain; varying vec2 vUv;
void main(){
  float r = length(vUv - 0.5) * 2.0;
  float band = mix(1.0 - smoothstep(0.0, uWidth, abs(1.0 - uWidth - r)), step(abs(1.0 - uWidth - r), uWidth), uHard);
  float fill = uFill * smoothstep(0.2, 1.0, r) * step(r, 1.0);
  float a = (band + fill) * (1.0 - uK);
  vec3 c = mix(uColor * uGain, vec3(1.0), band * (1.0 - uK) * 0.4);
  gl_FragColor = vec4(c, a);
}`;

// ---- 線の火花: 速さの向きに伸びた短い線。当たった・弾いた瞬間の「キン」とした感じ ----
const SPARK_VS = 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SPARK_FS = 'uniform vec3 uTint; varying float vA; void main(){ gl_FragColor = vec4(mix(uTint, vec3(1.0), 0.5) * 1.6, vA); }';
class Sparks {
  constructor(scene, max = 1200) {
    this.max = max; this.list = [];
    this.pos = new Float32Array(max * 6); this.alpha = new Float32Array(max * 2);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ uniforms: { uTint: { value: new THREE.Color(0xffffff) } }, vertexShader: SPARK_VS, fragmentShader: SPARK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.lines = new THREE.LineSegments(g, this.mat); this.lines.frustumCulled = false; this.lines.renderOrder = 8;
    scene.add(this.lines);
  }
  emit(x, y, z, speed, color) {
    if (this.list.length >= this.max) return;
    const th = Math.random() * Math.PI * 2, up = Math.random() * 0.9, s = speed * (0.6 + Math.random() * 0.8);
    this.list.push({ x, y, z, vx: Math.cos(th) * s, vy: up * s, vz: Math.sin(th) * s, life: 0.18 + Math.random() * 0.14, max: 0.32 });
    this.mat.uniforms.uTint.value.set(color);
  }
  update(dt) {
    this.list = this.list.filter((p) => (p.life -= dt) > 0);
    this.list.forEach((p, i) => {
      p.vy -= 18 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = 0.045; // 線の長さ（速さ × 秒）
      this.pos.set([p.x, p.y, p.z, p.x - p.vx * k, p.y - p.vy * k, p.z - p.vz * k], i * 6);
      const a = Math.min(1, p.life / 0.12); this.alpha[i * 2] = a; this.alpha[i * 2 + 1] = 0;
    });
    const g = this.lines.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
    g.setDrawRange(0, this.list.length * 2);
  }
}

// ---- 光の粒の形 ----
const PART_FS = {
  // 星形（ひし形 + 十字の光）。芯は白
  star: `varying float vA; varying vec3 vC;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = abs(c.x) + abs(c.y);
  float cross = max(smoothstep(0.06, 0.0, abs(c.x)), smoothstep(0.06, 0.0, abs(c.y))) * smoothstep(0.5, 0.1, length(c));
  float a = max(step(d, 0.32), cross); if (a <= 0.0) discard;
  gl_FragColor = vec4(mix(vC, vec3(1.0), smoothstep(0.2, 0.0, d)) * 1.4, a * vA); }`,
  // 大きくにじむ光
  glow: `varying float vA; varying vec3 vC;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
  float a = exp(-d * d * 14.0); gl_FragColor = vec4(vC * (1.0 + 2.0 * a) + vec3(pow(a, 6.0)), a * vA); }`,
  // 小さな点
  dot: `varying float vA; varying vec3 vC;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.3) discard;
  float a = smoothstep(0.3, 0.1, d); gl_FragColor = vec4(vC * 1.2, a * vA * 0.9); }`,
};

export class StyledFX extends FX {
  constructor(scene, style) {
    super(scene);
    this.st = typeof style === 'string' ? FX_STYLES[style] : style;
    const P = this.st.parts, parts = this.parts;
    parts.points.material.fragmentShader = PART_FS[P.shape];
    parts.points.material.needsUpdate = true;
    this.sparks = new Sparks(scene);
    // 粒の数と大きさ。速く飛び散る粒（当たり・弾き）には線の火花も添える
    const emit = parts.emit.bind(parts);
    parts.burst = (x, y, z, count, o = {}) => {
      const n = Math.max(1, Math.round(count * P.count));
      for (let i = 0; i < n; i++) emit(x, y, z, { ...o, size: (o.size ?? 0.5) * P.size });
      if ((o.speed ?? 3) >= 5 && this.st.sparks > 0) {
        const gy = o.abs ? y : y + this.ground(x, z);
        for (let i = 0; i < Math.round(count * this.st.sparks); i++) this.sparks.emit(x, gy, z, (o.speed ?? 6) * 1.6, o.color ?? 0xffffff);
      }
    };
  }

  update(dt) { super.update(dt); this.sparks.update(dt); }

  flash(x, y, z, color, intensity = 30, life = 0.25, dist = 12) { super.flash(x, y, z, color, intensity * this.st.flash, life, dist); }

  // 斬撃: 三日月が振りの向きへ走って消える
  slash(x, z, a, range, arcDeg, color, y = 1.0, reverse = false) {
    const S = this.st.slash, arc = THREE.MathUtils.degToRad(arcDeg);
    const mat = bandMaterial(color, S, reverse);
    const mesh = new THREE.Mesh(crescentGeometry(range, arc, S.width), mat);
    let gy = this.ground(x, z);
    for (let i = 0; i < 6; i++) { const t = a + (i / 5 - 0.5) * arc; for (const f of [0.5, 1]) gy = Math.max(gy, this.ground(x + Math.sin(t) * range * f, z + Math.cos(t) * range * f)); }
    mesh.position.set(x, y + gy, z); mesh.rotation.y = a; mesh.rotation.z = reverse ? 0.25 : -0.25; mesh.renderOrder = 7;
    this.add(mesh, S.life, (o, k) => { mat.uniforms.uHead.value = k * (1 + S.tail) * 1.15; o.scale.setScalar(0.92 + k * 0.12); });
    for (let i = 0; i < 10; i++) {
      const t = (Math.random() - 0.5) * arc + a, r = range * (0.7 + Math.random() * 0.3);
      this.parts.emit(x + Math.sin(t) * r, y, z + Math.cos(t) * r, { color, size: 0.35 * this.st.parts.size, life: 0.35, speed: 2, gravity: 0 });
    }
  }

  // 衝撃波: 縁の光る輪（アニメ調は少し遅れてもう1本）
  ringWave(x, z, color, maxR = 6, life = 0.45, y = 0.15) {
    const R = this.st.ring;
    const one = (delay, scale) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uK: { value: 0 }, uWidth: { value: R.width }, uFill: { value: R.fill }, uHard: { value: R.hard }, uGain: { value: R.gain } },
        vertexShader: BAND_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const g = new THREE.PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(g, mat); mesh.position.set(x, y + this.ground(x, z), z); mesh.renderOrder = 3; mesh.visible = false;
      this.add(mesh, life + delay, (o, k) => {
        const t = Math.max(0, (k * (life + delay) - delay) / life);
        o.visible = t > 0;
        const r = 0.5 + maxR * scale * Math.sqrt(t); o.scale.set(r, 1, r); mat.uniforms.uK.value = t;
      });
    };
    one(0, 1);
    if (R.double) one(life * 0.25, 0.7);
  }

  // 飛ぶ光波: 三日月をそのまま（頭が端まで走りきった形）
  waveMesh(color) {
    const S = { ...this.st.slash, tail: 9 };
    const mat = bandMaterial(color, S, false); mat.uniforms.uHead.value = 1;
    const mesh = new THREE.Mesh(crescentGeometry(1.5, 1.8, S.width * 1.4), mat);
    this.scene.add(mesh); return mesh;
  }

  lightning(x, z, color = 0xbfd8ff) {
    super.lightning(x, z, color);
    if (this.st.sparks > 0) for (let i = 0; i < 24 * this.st.sparks; i++) this.sparks.emit(x, 0.3 + this.ground(x, z), z, 12, color);
  }

  // 振りの軌跡: 刃先側に白い芯
  makeTrail(color) {
    const tr = super.makeTrail(color), T = this.st.trail;
    tr.mat.uniforms.uCore = { value: T.core }; tr.mat.uniforms.uHard = { value: T.hard };
    tr.mat.fragmentShader = `uniform vec3 uColor; uniform float uCore, uHard; varying float vA; varying float vE;
void main(){ float core = mix(smoothstep(1.0 - uCore, 1.0, vE), step(1.0 - uCore, vE), uHard);
  gl_FragColor = vec4(mix(uColor * (1.0 + vA), vec3(1.0), core * 0.8), vA); }`;
    return tr;
  }
}
