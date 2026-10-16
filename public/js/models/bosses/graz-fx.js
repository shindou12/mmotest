// コボルド王 グラズの作り込み版（作り込みの段階 3）。形は graz3-model.js（部位と支点は段階 1 と同じなので、技の動き GRAZ_MOTIONS がそのまま使える）。上に重ねる光の部品:
//   剣の刃を走る光の筋と峰のルーン / 首と肩のたてがみ（毛束をまとめて1回で描く）/ 王冠の宝石と目の光のにじみ /
//   マントの専用の質感（深紅の移り変わりと金の刺繍の帯）/ 体の縁の金の光（激昂で赤） / 足元の王の紋章の輪 / 立ちのぼる火の粉
import * as THREE from 'three';
import { toon } from '../../toon.js';
import { buildGrazHQ } from './graz3-model.js';
import { glowSprite, rimMaterial, rimShell, motes, markKeep } from './fx-parts.js';

// 刃の上を斜めに走る光の筋（刃の形の上に重ねる加算の板）
function bladeGlintMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vP;
      void main() {
        float s = fract(uTime * 0.35) * 3.4 - 0.7;
        float g = smoothstep(0.18, 0.0, abs(vP.y + vP.x * 0.8 - s));
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * g, g);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}
// マント: 上は深紅、裾へ行くほど暗く。裾の近くに金の刺繍の帯（小さなひし形が並ぶ）
function capeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; void main() { vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; varying vec3 vN;
      void main() {
        vec3 top = vec3(0.62, 0.16, 0.24), bot = vec3(0.30, 0.06, 0.12);
        vec3 c = mix(bot, top, vUv.y);
        float band = step(0.12, vUv.y) * step(vUv.y, 0.22);
        vec2 q = vec2(fract(vUv.x * 14.0) - 0.5, (vUv.y - 0.17) * 14.0);
        float dia = step(abs(q.x) + abs(q.y), 0.32);
        c = mix(c, vec3(0.86, 0.66, 0.30), band * (0.35 + 0.65 * dia));
        float light = 0.6 + 0.4 * abs(vN.y * 0.5 + vN.z * 0.5);
        gl_FragColor = vec4(c * light, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}
// 足元の王の紋章の輪: 金の二重の輪と、間でゆっくり回る王冠の形の模様
function sigilMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHot: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform float uHot; varying vec2 vP;
      void main() {
        float r = length(vP), a = atan(vP.y, vP.x) + uTime * 0.2;
        float rings = smoothstep(0.05, 0.0, abs(r - 1.45)) + smoothstep(0.05, 0.0, abs(r - 2.25));
        float f = fract(a * 6.0 / 6.2832);
        float crown = step(abs(r - 1.85), 0.08 + 0.14 * step(abs(f - 0.5), 0.12)) * step(abs(f - 0.5), 0.3);
        float al = (rings * 0.8 + crown * 0.6) * (1.0 - smoothstep(2.3, 2.5, r));
        vec3 col = mix(vec3(1.0, 0.78, 0.35), vec3(1.0, 0.35, 0.25), uHot);
        gl_FragColor = vec4(col * al, al);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

export function buildGraz3(body, accent) {
  const u = buildGrazHQ(body, accent);
  const fx = { shaders: [], motes: [], rim: null, sigil: null };
  const amber = new THREE.Color(accent);

  // 剣: 刃の形に光の筋を重ね、峰にルーンを光らせる
  const sword = u.weaponModel, blade = sword.children[0];
  const glint = markKeep(new THREE.Mesh(blade.geometry, bladeGlintMaterial())); glint.scale.set(1, 1, 1.25); sword.add(glint); fx.shaders.push(glint.material);
  for (let i = 0; i < 5; i++) {
    const rune = glowSprite(amber, 0.16, 0.9); rune.position.set(0.02, 0.6 + i * 0.26, 0.07); sword.add(rune);
  }
  // 頭: 王冠の宝石と目の光のにじみ
  const crown = u.head.getObjectByName('graz-crown');
  const gem = glowSprite(amber, 0.55, 0.8); gem.position.set(0, 0, 0.3); crown.add(gem);
  for (const s of [-1, 1]) { const e = glowSprite(amber, 0.22, 0.75); e.position.set(s * 0.17, 0.072, 0.31); u.head.add(e); }

  // たてがみ: 首まわりと肩に、地の毛色の短い毛束を密に並べる（顔を隠さないよう、首の下から外・下向きに）
  const tuftGeo = new THREE.ConeGeometry(0.075, 0.17, 5); tuftGeo.translate(0, 0.085, 0);
  const n = 70, mane = new THREE.InstancedMesh(tuftGeo, toon(0xffffff), n); // 色は毛束ごと（setColorAt）
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996, ring = i % 3;
    const r = 0.38 + ring * 0.05, y = 1.74 - ring * 0.06;
    d.set(Math.sin(a), -0.15 - ring * 0.2, Math.cos(a)).normalize();
    q.setFromUnitVectors(up, d);
    m4.compose(new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r * 0.85), q, new THREE.Vector3(1, 0.8 + ((i * 7) % 5) * 0.1, 1));
    mane.setMatrixAt(i, m4);
    mane.setColorAt(i, c.setHex(i % 4 === 0 ? 0xc6976d : i % 3 === 0 ? 0x613f32 : 0x986348));
  }
  body.add(markKeep(mane));

  // マント: 専用の質感へ
  const cloth = u.cape.children[0];
  cloth.material = capeMaterial(); cloth.userData.keep = true;

  // 体の縁の金の光（激昂で赤くなる）
  fx.rim = rimMaterial(0xffc860, 1.8, 1.0);
  const torso = body.children[0];
  const rim = rimShell(torso.geometry, fx.rim, 1.07); rim.position.copy(torso.position); body.add(rim);
  // 足元の王の紋章の輪
  const ring = markKeep(new THREE.Mesh(new THREE.RingGeometry(1.2, 2.5, 72), sigilMaterial())); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
  body.add(ring); fx.sigil = ring.material; fx.shaders.push(ring.material);
  // 立ちのぼる火の粉（激昂で増える）
  const embers = motes(40, 0xffa040, 0.14, (i, t, v) => {
    const a = i * 2.39996, r = 0.5 + (i % 6) * 0.22, k = (i * 0.11 + t * 0.3) % 1;
    v.set(Math.sin(a + k * 1.5) * r, 0.2 + k * 2.6, Math.cos(a + k * 1.5) * r);
  });
  body.add(embers); fx.motes.push(embers); fx.embers = embers;
  return { ...u, identity: 'graz3', fx };
}

export function animateGraz3(u, s) {
  const t = s.t, F = u.fx;
  for (const sh of F.shaders) sh.uniforms.uTime.value = t;
  for (const m of F.motes) m.update(t);
  const hot = s.enraged ? 1 : 0;
  F.rim.uniforms.uTime.value = t;
  F.rim.uniforms.uColor.value.setHex(hot ? 0xff5a3a : 0xffc860);
  F.rim.uniforms.uStr.value = hot ? 1.6 : 0.9;
  F.sigil.uniforms.uHot.value = hot;
  F.embers.material.opacity = hot ? 1 : 0.6;
  F.embers.material.size = hot ? 0.2 : 0.14;
}
