// 精鋭（性質つき）とネームドの見た目の飾り。普通の敵のモデルに後から足す（snapshot.js が作るときに呼ぶ）
//   精鋭: 足元の回る輪（性質の色）・縁の光・性質ごとの粒子や小物（炎の火の粉・雷の火花・号令の旗・鉄壁の岩…）
//   ネームド: 足元の紋章の輪・光る目・縁の光・立ちのぼる光・種類ごとの飾り（牙・たてがみ・王冠）。怒ると赤く
// どれも model.userData.efx(t, enraged) で動かす
import * as THREE from 'three';
import { toon } from '../toon.js';
import { glowSprite, rimMaterial, rimShell, motes, markKeep } from './bosses/fx-parts.js';
import { AFFIXES } from '../../shared/sim/elites.js';

// 足元の輪: 色の違う弧が回る（精鋭は性質の色、ネームドは紋章の模様）
function ringMaterial(colors, sigil) {
  const cs = [...colors, ...colors, ...colors].slice(0, 3).map((c) => new THREE.Color(c));
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uC0: { value: cs[0] }, uC1: { value: cs[1] }, uC2: { value: cs[2] }, uHot: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform float uHot; varying vec2 vP;
      void main(){
        float r = length(vP), a = atan(vP.y, vP.x) / 6.2832 + 0.5;
        float seg = fract(a * ${sigil ? '8.0' : '3.0'} + uTime * ${sigil ? '0.05' : '0.25'});
        int k = int(floor(fract(a + uTime * 0.08) * 3.0));
        vec3 c = k == 0 ? uC0 : k == 1 ? uC1 : uC2;
        c = mix(c, vec3(1.0, 0.3, 0.25), uHot);
        float band = smoothstep(0.0, 0.08, r - 0.78) * smoothstep(0.0, 0.08, 1.0 - r);
        float dash = ${sigil ? 'step(0.25, seg) * 0.7 + smoothstep(0.03, 0.0, abs(r - 0.86)) * 0.8' : 'smoothstep(0.0, 0.15, seg) * smoothstep(0.75, 0.6, seg)'};
        float al = band * dash * (0.75 + 0.25 * sin(uTime * 4.0));
        gl_FragColor = vec4(c * al, al);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

// モデルの大きさ（置く位置の目安。モデルの中の座標）
function measure(model) {
  const box = new THREE.Box3().setFromObject(model), s = model.scale.x || 1;
  return { h: (box.max.y - box.min.y) / s, w: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / s, front: box.max.z / s };
}
function biggestMesh(model) {
  let best = null, n = 0;
  model.traverse((o) => { if (o.isMesh && o.geometry?.attributes.position && !o.userData.keep && o.geometry.attributes.position.count > n) { n = o.geometry.attributes.position.count; best = o; } });
  return best;
}
function addRim(model, color, strength) {
  const mesh = biggestMesh(model);
  if (!mesh) return null;
  const mat = rimMaterial(color, 2.0, strength);
  const shell = rimShell(mesh.geometry, mat, 1.08);
  shell.position.copy(mesh.position); shell.rotation.copy(mesh.rotation); shell.scale.multiply(mesh.scale);
  mesh.parent.add(shell);
  return mat;
}

export function decorateElite(model, affix) {
  const M = measure(model), ups = [], cols = affix.map((id) => AFFIXES[id].color);
  const ringM = ringMaterial(cols, false);
  const ring = markKeep(new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 48), ringM)); // 模様は半径1で作り、大きさは scale で
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.scale.setScalar(M.w * 0.7); model.add(ring);
  const rim = addRim(model, cols[0], 0.9);
  const add = (o, f) => { model.add(o); if (f) ups.push(f); };
  for (const id of affix) {
    const c = AFFIXES[id].color;
    if (id === 'burning') { const p = motes(14, c, 0.25, (i, t, v) => { const k = (i * 0.17 + t * 0.6) % 1, a = i * 2.4; v.set(Math.sin(a) * M.w * 0.4, k * M.h * 0.6, Math.cos(a) * M.w * 0.4); }); add(p, (t) => p.update(t)); }
    if (id === 'thunder') { const p = motes(10, c, 0.3, (i, t, v) => { const f = Math.floor(t * 12 + i * 3.1); const a = f * 2.39, r = M.w * (0.3 + ((f * 7) % 5) * 0.06); v.set(Math.sin(a) * r, M.h * (0.3 + ((f * 3) % 7) * 0.08), Math.cos(a) * r); }); add(p, (t) => p.update(t)); }
    if (id === 'splitter') { const p = motes(10, c, 0.22, (i, t, v) => { const k = (i * 0.21 + t * 0.4) % 1, a = i * 2.1; v.set(Math.sin(a) * M.w * 0.35, M.h * 0.7 * (1 - k), Math.cos(a) * M.w * 0.35); }); add(p, (t) => p.update(t)); }
    if (id === 'regen') { const p = motes(10, c, 0.22, (i, t, v) => { const k = (i * 0.13 + t * 0.25) % 1, a = i * 2.6 + t * 0.5; v.set(Math.sin(a) * M.w * 0.45, k * M.h * 1.1, Math.cos(a) * M.w * 0.45); }); add(p, (t) => p.update(t)); }
    if (id === 'swift') { const p = motes(12, c, 0.25, (i, t, v) => { const k = (i / 12 + t * 1.5) % 1; v.set(Math.sin(i * 1.7) * M.w * 0.3, M.h * (0.2 + (i % 4) * 0.12), -M.w * 0.3 - k * M.w * 0.9); }); add(p, (t) => p.update(t)); }
    if (id === 'bulwark') {
      const g = new THREE.Group(), mat = toon(0x8a8e98);
      for (let k = 0; k < 4; k++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(M.w * 0.09, 0), mat); r.position.set(Math.sin(k * 1.57) * M.w * 0.55, M.h * 0.45, Math.cos(k * 1.57) * M.w * 0.55); g.add(r); }
      add(g, (t) => { g.rotation.y = t * 0.8; });
    }
    if (id === 'rally') {
      const g = new THREE.Group(), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, M.h * 0.8, 5), toon(0x5a3a22));
      pole.position.y = M.h * 0.4; g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(M.w * 0.35, M.h * 0.22), toon(0xd03a3a, { side: THREE.DoubleSide }));
      flag.position.set(M.w * 0.17, M.h * 0.68, 0); g.add(flag);
      g.position.set(0, M.h * 0.55, -M.w * 0.3); add(g, (t) => { flag.rotation.y = Math.sin(t * 6) * 0.3; });
    }
  }
  model.userData.efx = (t, hot) => {
    ringM.uniforms.uTime.value = t; ringM.uniforms.uHot.value = hot ? 1 : 0;
    if (rim) { rim.uniforms.uTime.value = t; rim.uniforms.uColor.value.setHex(hot ? 0xff3a5a : cols[0]); rim.uniforms.uStr.value = hot ? 1.5 : 0.9; }
    for (const f of ups) f(t);
  };
}

// ネームド: 種類ごとの飾り（look）
const LOOKS = {
  tusks(model, M, add) { // 鼻先から前上へ反った大きな牙（根元は太く、先は細く）
    const ivory = toon(0xf4ead2);
    for (const sgn of [-1, 1]) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(M.h * 0.05, M.h * 0.065, M.h * 0.16, 7), ivory); base.position.y = M.h * 0.08; g.add(base);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(M.h * 0.05, M.h * 0.24, 7), ivory); tip.position.set(0, M.h * 0.26, M.h * 0.04); tip.rotation.x = 0.45; g.add(tip);
      g.position.set(sgn * M.h * 0.12, M.h * 0.52, M.front * 1.0); g.rotation.set(0.6, 0, -sgn * 0.35);
      add(g);
    }
  },
  mane(model, M, add) { // 首まわりの白銀のたてがみ
    const geo = new THREE.ConeGeometry(M.w * 0.05, M.w * 0.22, 5), n = 40, inst = new THREE.InstancedMesh(geo, toon(0xe0e8f0), n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996, r = M.w * 0.22;
      d.set(Math.sin(a) * 0.8, 0.5, Math.cos(a) * 0.4 - 0.6).normalize(); q.setFromUnitVectors(up, d);
      m4.compose(new THREE.Vector3(Math.sin(a) * r, M.h * (0.55 + (i % 3) * 0.06), M.front * 0.45 + Math.cos(a) * r * 0.5), q, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(i, m4);
    }
    add(markKeep(inst));
  },
  crown(model, M, add) { // 頭上の岩の王冠（金の縁と光る石）
    const g = new THREE.Group(), gold = toon(0xd8b050);
    const band = new THREE.Mesh(new THREE.TorusGeometry(M.w * 0.2, M.w * 0.035, 6, 18), gold); band.rotation.x = Math.PI / 2; g.add(band);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, sp = new THREE.Mesh(new THREE.ConeGeometry(M.w * 0.045, M.w * 0.16, 5), gold); sp.position.set(Math.sin(a) * M.w * 0.2, M.w * 0.08, Math.cos(a) * M.w * 0.2); g.add(sp); }
    g.add(glowSprite(0xffa040, M.w * 0.25, 0.9));
    g.position.y = M.h * 1.02; add(g);
  },
};

export function decorateNamed(model, look, accent = 0xff60d0) {
  const M = measure(model), ups = [];
  const ringM = ringMaterial([accent, 0xffd0f0, accent], true);
  const ring = markKeep(new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 64), ringM));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.scale.setScalar(M.w * 0.72); model.add(ring);
  const rim = addRim(model, accent, 1.0);
  const eyes = [-1, 1].map((s) => { const e = glowSprite(0xffe0ff, M.w * 0.12, 0.95); e.position.set(s * M.w * 0.12, M.h * 0.62, M.front * 0.95); model.add(e); return e; });
  const rise = motes(18, accent, 0.3, (i, t, v) => { const k = (i * 0.11 + t * 0.3) % 1, a = i * 2.4 + t * 0.4; v.set(Math.sin(a) * M.w * 0.6, k * M.h * 1.4, Math.cos(a) * M.w * 0.6); });
  model.add(rise); ups.push((t) => rise.update(t));
  (LOOKS[look] || (() => {}))(model, M, (o) => model.add(o));
  model.userData.efx = (t, hot) => {
    ringM.uniforms.uTime.value = t; ringM.uniforms.uHot.value = hot ? 1 : 0;
    if (rim) { rim.uniforms.uTime.value = t; rim.uniforms.uColor.value.setHex(hot ? 0xff3a3a : accent); rim.uniforms.uStr.value = hot ? 1.6 : 1.0; }
    for (const e of eyes) e.material.color.setHex(hot ? 0xff5a4a : 0xffe0ff);
    rise.material.color.setHex(hot ? 0xff5a4a : accent);
    for (const f of ups) f(t);
  };
}
