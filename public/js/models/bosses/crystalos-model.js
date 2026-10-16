// 水晶巨兵 クリスタロス: 角ばった岩の巨体から、六角柱の水晶が生えている。胸の結晶核と目が光る。
// 作り込みの段階（tier）を3つ持つ（作業量と見た目の比較用。ゲームで使うのは BOSS_MODELS の登録で選ぶ）
//   1: 基本の形 ＋ 核と目の光のにじみ
//   2: 1 ＋ 二重の水晶（内側が光り、外側が半透明）・でこぼこの岩・体の縁の光・漂う光の粒
//   3: 2 ＋ 水晶の専用の質感（色の移り変わりと走る光）・岩に埋まった小さな結晶・足元の霜の輪と氷の棘・立ちのぼる冷気・核から肩への稲妻
// 歩き・腕の振りは animateMob の共通の部位（arms・legs2）が動かす。ここでは光の部品と頭のまわりの欠片を動かす
import * as THREE from 'three';
import { toon, glow } from '../../toon.js';
import { mesh } from './boss-model-geometry.js';
import { glowSprite, rimMaterial, rimShell, motes, markKeep } from './fx-parts.js';

// 六角柱の水晶（根元から先端へ尖る）。h: 柱の長さ / tip: 尖りの長さ
const crystalGeo = (r, h, tip) => new THREE.LatheGeometry([[0, 0], [r * 0.82, 0], [r, h * 0.12], [r * 0.92, h], [0, h + tip]].map(([x, y]) => new THREE.Vector2(x, y)), 6);
// 岩の塊。rough > 0 なら頂点を決まった乱れ方でずらして、でこぼこにする
function rockGeo(r, detail = 0, rough = 0) {
  const g = new THREE.DodecahedronGeometry(r, detail);
  if (!rough) return g;
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const h = Math.sin(v.x * 12.9 + v.y * 78.2 + v.z * 37.7) * 43758.5, k = 1 + (h - Math.floor(h) - 0.5) * rough;
    p.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

// 水晶の専用の質感（3段目）: 根元は深い青、先端は白。表面を光の筋が走る
function crystalShader() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() {
        vY = position.y;
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
        #endif
        vec4 w = m * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w;
        vN = normalize(mat3(viewMatrix) * mat3(m) * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform float uTime; varying float vY; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() {
        float k = clamp(vY / 1.1, 0.0, 1.0);
        vec3 c = mix(vec3(0.10, 0.28, 0.62), vec3(0.55, 0.90, 1.0), k);
        c = mix(c, vec3(1.0), smoothstep(0.75, 1.0, k) * 0.7);
        float rim = pow(1.0 - abs(dot(normalize(vN), vV)), 2.0);
        float band = smoothstep(0.92, 1.0, sin(vW.y * 3.0 - uTime * 2.4 + vW.x * 1.7));
        float face = 0.55 + 0.45 * abs(dot(normalize(vN), normalize(vec3(0.4, 0.8, 0.45))));
        gl_FragColor = vec4(c * face + rim * vec3(0.5, 0.85, 1.0) + band * 0.6, 1.0);
      }`,
  });
}
// 足元の霜の輪（3段目）: 地面に貼る輪。角度に沿って模様がゆっくり回る
function frostRingMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vP;
      void main() {
        float r = length(vP), a = atan(vP.y, vP.x);
        float ring = smoothstep(1.2, 1.5, r) * (1.0 - smoothstep(2.4, 2.9, r));
        float rune = step(0.6, fract(a * 4.77 + uTime * 0.15)) * smoothstep(1.85, 1.95, r) * (1.0 - smoothstep(2.15, 2.25, r));
        float a2 = ring * 0.35 + rune * 0.8;
        gl_FragColor = vec4(vec3(0.55, 0.88, 1.0) * a2, a2);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

function makeCrystal(M, tier) {
  // 根元 at から、向き（rx: 前後の倒れ / rz: 左右の倒れ）に水晶を1本立てる。light: 明るい色の水晶
  return function crystal(parent, at, r, h, rx = 0, rz = 0, ry = 0, light = false) {
    const g = new THREE.Group(); g.position.set(...at); g.rotation.set(rx, ry, rz);
    if (tier >= 3) g.add(mesh(crystalGeo(r, h, r * 1.6), M.crystalFx));
    else if (tier === 2) {
      g.add(mesh(crystalGeo(r, h, r * 1.6), light ? M.shellL : M.shell)); // 外側: 半透明の殻
      g.add(mesh(crystalGeo(r * 0.5, h * 0.85, r * 0.9), M.inner)); // 内側: 光る芯
    } else g.add(mesh(crystalGeo(r, h, r * 1.6), light ? M.iceL : M.ice));
    parent.add(g);
    return g;
  };
}
// 根元から放射状に何本か生えた水晶の房
function cluster(crystal, parent, at, size, n, spread, lean = [0, 0]) {
  const g = new THREE.Group(); g.position.set(...at); parent.add(g);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + i * 0.7, k = i === 0 ? 1 : 0.55 + ((i * 37) % 10) / 22;
    crystal(g, [Math.sin(a) * size * 0.25, 0, Math.cos(a) * size * 0.25], size * 0.18 * k, size * k, lean[0] + Math.cos(a) * spread * (i ? 1 : 0.2), lean[1] - Math.sin(a) * spread * (i ? 1 : 0.2), a);
  }
  return g;
}

function build(body, accent, tier) {
  const ac = new THREE.Color(accent);
  const rough = tier >= 2 ? 0.22 : 0, det = tier >= 2 ? 1 : 0;
  const M = {
    rock: toon(0x66709a, { flatShading: true }), rockD: toon(0x454c6e, { flatShading: true }), rockL: toon(0x8a93ba, { flatShading: true }),
    ice: toon(0x7fd8ff, { flatShading: true, emissive: new THREE.Color(0x2a7fb0), emissiveIntensity: 0.35 }),
    iceL: toon(0xc8f2ff, { flatShading: true, emissive: new THREE.Color(0x5ab0e0), emissiveIntensity: 0.3 }),
    core: glow(ac.clone().multiplyScalar(2.2)), eye: glow(new THREE.Color(0x9af4ff).multiplyScalar(2.0)),
    vein: glow(new THREE.Color(0x9af4ff).multiplyScalar(1.6)),
  };
  if (tier === 2) {
    M.shell = toon(0x8fdcff, { flatShading: true, transparent: true, opacity: 0.55, emissive: new THREE.Color(0x2a7fb0), emissiveIntensity: 0.4, depthWrite: false });
    M.shellL = toon(0xd8f6ff, { flatShading: true, transparent: true, opacity: 0.5, emissive: new THREE.Color(0x5ab0e0), emissiveIntensity: 0.4, depthWrite: false });
    M.inner = glow(new THREE.Color(0x7fe8ff).multiplyScalar(2.4)); // 光る芯（にじむ明るさ）
  }
  if (tier >= 3) M.crystalFx = crystalShader();
  const fx = { rims: [], motes: [], shaders: tier >= 3 ? [M.crystalFx] : [], arcs: [] };
  const crystal = makeCrystal(M, tier);
  body.name = 'crystalos-body';

  // 胴: 前かがみの大きな岩の胸と、細い腰
  const chestGeo = rockGeo(0.95, det, rough);
  body.add(mesh(chestGeo, M.rock, [0, 1.75, -0.05], [0.25, 0.3, 0], [1.3, 1.0, 0.95]));
  body.add(mesh(rockGeo(0.55, det, rough), M.rockD, [0, 1.02, 0], [0, 0.6, 0], [1.25, 0.8, 0.95]));
  body.add(mesh(rockGeo(0.42, det, rough), M.rockL, [0, 2.25, 0.32], [0.4, 0.2, 0.1], [1.4, 0.55, 0.8])); // 胸の上の張り出し
  // 胸の結晶核（ひし形の光る結晶を、岩の枠で囲む）
  const core = new THREE.Group(); core.position.set(0, 1.72, 0.92); body.add(core); // 脈打たせる入れ物
  core.add(mesh(new THREE.OctahedronGeometry(0.28), M.core, null, null, [1, 1.35, 0.7]));
  core.add(glowSprite(ac, tier >= 2 ? 2.4 : 1.6, 0.7)); // 核の光のにじみ（全段）
  for (const s of [-1, 1]) body.add(mesh(rockGeo(0.2), M.rockD, [s * 0.34, 1.72, 0.84], [0.3, s * 0.5, 0], [0.8, 1.5, 0.7]));
  // 核から広がる光るひび
  for (const [x, y, a, l] of [[-0.42, 1.95, 0.7, 0.42], [0.45, 1.98, -0.6, 0.38], [-0.3, 1.38, -0.9, 0.34], [0.36, 1.4, 1.0, 0.3], [0.05, 2.12, 0.1, 0.25]]) {
    body.add(mesh(new THREE.BoxGeometry(0.045, l, 0.03), M.vein, [x, y, 0.9 - Math.abs(x) * 0.25], [0.25, 0, a]));
  }
  // 体の縁の光（2段目から）: 胸の岩をひとまわり大きくした殻
  if (tier >= 2) {
    const rim = rimMaterial(0x7fd8ff, 1.6, 1.5); fx.rims.push(rim);
    const sh = rimShell(chestGeo, rim, 1); sh.position.set(0, 1.75, -0.05); sh.rotation.set(0.25, 0.3, 0); sh.scale.set(1.3 * 1.06, 1.06, 0.95 * 1.06);
    body.add(sh);
  }

  // 頭: 肩に埋もれた低い頭。横一文字の光る目
  const head = new THREE.Group(); head.position.set(0, 2.62, 0.55); body.add(head);
  head.add(mesh(rockGeo(0.36, det, rough), M.rockL, [0, 0, 0], [0.2, 0.7, 0], [1.3, 0.85, 1.05]));
  head.add(mesh(new THREE.BoxGeometry(0.46, 0.06, 0.05), M.eye, [0, 0.02, 0.33]));
  const eyeGlow = glowSprite(0x9af4ff, 0.9, 0.55); eyeGlow.position.set(0, 0.02, 0.4); head.add(eyeGlow); // 目の光のにじみ（全段）
  crystal(head, [0, 0.22, -0.05], 0.09, 0.35, -0.25, 0, 0, true); // 額の角

  // 背中と肩の水晶の房（いちばん目立つ輪郭）
  cluster(crystal, body, [0, 2.35, -0.55], 1.25, tier >= 3 ? 7 : 5, 0.45, [-0.35, 0]);
  const shoulders = [];
  for (const s of [-1, 1]) {
    shoulders.push(cluster(crystal, body, [s * 1.0, 2.45, -0.1], 0.95, tier >= 3 ? 5 : 4, 0.4, [-0.1, -s * 0.45]));
    crystal(body, [s * 0.55, 1.2, -0.6], 0.12, 0.55, -0.6, -s * 0.3, 0, true); // 腰の小さな水晶
  }

  // 腕: 肩の岩 → 上腕 → 水晶の籠手と大きな拳（arms は animateMob が振る）
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.name = s < 0 ? 'crystalos-arm-left' : 'crystalos-arm-right';
    arm.position.set(s * 1.3, 2.2, 0.05); body.add(arm);
    arm.add(mesh(rockGeo(0.48, det, rough), M.rockD, [0, 0, 0], [0.3, 0.5, 0]));
    arm.add(mesh(rockGeo(0.32, det, rough), M.rock, [s * 0.08, -0.62, 0.05], [0.4, 0.1, 0], [1, 1.35, 1]));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      crystal(arm, [s * 0.1 + Math.sin(a) * 0.2, -1.15, 0.12 + Math.cos(a) * 0.2], 0.1, 0.45, Math.cos(a) * 0.5, -Math.sin(a) * 0.5);
    }
    arm.add(mesh(rockGeo(0.5, det, rough), M.rockL, [s * 0.1, -1.45, 0.2], [0.6, 0.3, 0.2], [1.1, 0.9, 1.1])); // 拳
    crystal(arm, [s * 0.1, -1.7, 0.45], 0.12, 0.3, 2.1, 0, 0, true); // 拳の先の突起
    arms.push(arm);
  }

  // 脚: 太く短い岩の脚（legs2 は animateMob が振る）
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.5, 0.95, 0); body.add(leg);
    leg.add(mesh(rockGeo(0.36, det, rough), M.rockD, [0, -0.25, 0], [0.2, 0.4, 0], [1, 1.3, 1]));
    leg.add(mesh(rockGeo(0.38, det, rough), M.rock, [0, -0.78, 0.1], [0.1, 0.2, 0], [1.25, 0.6, 1.45]));
    crystal(leg, [s * 0.25, -0.35, -0.1], 0.08, 0.35, -0.3, -s * 0.6);
    legs.push(leg);
  }

  // 頭のまわりを回る水晶の欠片
  const halo = new THREE.Group(); halo.position.set(0, 3.0, 0.1); body.add(halo);
  const shards = [];
  for (let i = 0; i < 5; i++) {
    const sh = mesh(new THREE.OctahedronGeometry(0.11), i % 2 ? M.iceL : M.core, null, null, [0.7, 1.6, 0.7]);
    halo.add(sh); shards.push(sh);
  }

  // 漂う光の粒（2段目から）: 体のまわりをゆっくり回る
  if (tier >= 2) {
    const m = motes(tier >= 3 ? 36 : 26, 0x9af4ff, 0.3, (i, t, v) => {
      const a = t * 0.35 + i * 2.4, r = 1.5 + (i % 5) * 0.18;
      v.set(Math.sin(a) * r, 0.6 + ((i * 0.37 + t * 0.25) % 2.8), Math.cos(a) * r);
    });
    body.add(m); fx.motes.push(m);
  }

  if (tier >= 3) {
    // 岩に埋まった小さな結晶（まとめて1回で描く）
    const n = 40, inst = new THREE.InstancedMesh(crystalGeo(0.05, 0.16, 0.08), M.crystalFx, n);
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const u = ((i * 0.618) % 1) * Math.PI * 2, w = Math.acos(1 - 2 * ((i + 0.5) / n));
      d.set(Math.sin(w) * Math.cos(u), Math.cos(w), Math.sin(w) * Math.sin(u));
      if (d.z < -0.2 && d.y > 0.3) d.z *= -0.5; // 背中は大きな房があるので、前と横に寄せる
      q.setFromUnitVectors(up, d.clone().normalize());
      m4.compose(new THREE.Vector3(d.x * 1.15, 1.75 + d.y * 0.9, d.z * 0.85 - 0.05), q, new THREE.Vector3(1, 1 + (i % 3) * 0.4, 1));
      inst.setMatrixAt(i, m4);
    }
    body.add(markKeep(inst));
    // 足元の霜の輪と氷の棘
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 3.0, 64), frostRingMaterial()); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
    body.add(markKeep(ring)); fx.shaders.push(ring.material);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, r = 1.6 + (i % 3) * 0.35;
      crystal(body, [Math.sin(a) * r, 0, Math.cos(a) * r], 0.07 + (i % 2) * 0.04, 0.25 + (i % 3) * 0.15, Math.cos(a) * 0.35, -Math.sin(a) * 0.35);
    }
    // 立ちのぼる冷気
    const mist = motes(48, 0xcff4ff, 0.32, (i, t, v) => {
      const a = i * 2.39996, r = 0.6 + (i % 7) * 0.25, k = (i * 0.13 + t * 0.18) % 1;
      v.set(Math.sin(a) * r * (1 + k * 0.4), k * 2.2, Math.cos(a) * r * (1 + k * 0.4));
    });
    mist.material.opacity = 0.45; body.add(mist); fx.motes.push(mist);
    // 核から両肩の房へ走る稲妻（毎フレーム形を変える）
    for (const sh of shoulders) {
      const pts = new Float32Array(8 * 3), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const line = markKeep(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })));
      line.frustumCulled = false; body.add(line);
      fx.arcs.push({ line, pts, from: new THREE.Vector3(0, 1.72, 0.92), to: sh.position.clone().add(new THREE.Vector3(0, 0.3, 0)) });
    }
  }
  return { identity: tier === 1 ? 'crystalos' : 'crystalos' + tier, head, arms, legs2: legs, core, halo, shards, fx };
}

export const buildCrystalos = (body, accent) => build(body, accent, 1);
export const buildCrystalos2 = (body, accent) => build(body, accent, 2);
export const buildCrystalos3 = (body, accent) => build(body, accent, 3);

export function animateCrystalos(u, s) {
  const t = s.t, wind = s.st === 2;
  u.shards.forEach((sh, i) => {
    const a = t * (wind ? 2.4 : 0.8) + (i / u.shards.length) * Math.PI * 2;
    sh.position.set(Math.sin(a) * 0.95, Math.sin(t * 1.7 + i) * 0.15, Math.cos(a) * 0.95);
    sh.rotation.y = a * 2;
  });
  u.core.scale.setScalar(1 + Math.sin(t * (wind ? 9 : 2.5)) * 0.08); // 胸の結晶核が脈打つ（溜め中は速く）
  const F = u.fx;
  for (const r of F.rims) { r.uniforms.uTime.value = t; r.uniforms.uStr.value = wind ? 2.2 : 1.5; }
  for (const m of F.motes) m.update(t);
  for (const sh of F.shaders) sh.uniforms.uTime.value = t;
  for (const A of F.arcs) {
    const on = wind || Math.sin(t * 5.3 + A.to.x) > 0.6; // ときどき走る（溜め中はずっと）
    A.line.visible = on;
    if (!on) continue;
    for (let i = 0; i < 8; i++) {
      const k = i / 7, j = i === 0 || i === 7 ? 0 : 0.18;
      A.pts[i * 3] = A.from.x + (A.to.x - A.from.x) * k + (Math.random() - 0.5) * j;
      A.pts[i * 3 + 1] = A.from.y + (A.to.y - A.from.y) * k + (Math.random() - 0.5) * j + Math.sin(k * Math.PI) * 0.3;
      A.pts[i * 3 + 2] = A.from.z + (A.to.z - A.from.z) * k + (Math.random() - 0.5) * j;
    }
    A.line.geometry.attributes.position.needsUpdate = true;
  }
}
