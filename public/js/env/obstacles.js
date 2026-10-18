// エリアの見た目: ぶつかる障害物（種類ごとの登録表 OBSTACLES）・危険地帯・宝箱・共有ボックス
import * as THREE from 'three';
import { toon, glow, outline } from '../toon.js';
import { local, I, at, textSprite, propColor } from './kit.js';
import { makeProp } from './props.js';
import { addTree, addRock } from './flora.js';

// 障害物の登録表。種類（o.kind）ごとの関数。障害物を足すときは、ここに関数を足す
// ctx: { B, o（障害物）, fdef（階層）, heightAt, R, group, anims, y（地面の高さ）, M（置く位置の行列）, C（色の揺らぎ） }
export const OBSTACLES = {
  rock(ctx) {
    const { B, o, fdef, R, M } = ctx;
    const col = propColor(fdef, ['rock'], 0, 0x8a8a8a);
    addRock(B, M, R, { color: col, moss: fdef.n <= 2 ? 0.7 : 0, size: o.r * 0.95, kind: ['boulder', 'cluster', 'split', 'slab'][Math.floor(R() * 4)] });
  },
  tree(ctx) {
    const { B, o, fdef, R, M } = ctx;
    // 大樹: 太い幹の樹種を大きく
    const trunk = propColor(fdef, ['tree', 'pine'], 1, 0x6a4a2a), leaf = propColor(fdef, ['tree', 'pine'], 0, 0x3f8f3a);
    addTree(B, M, R, { leaf, bark: trunk, size: o.r * 0.62, species: ['old', 'oak', 'twin'][Math.floor(R() * 3)] });
  },
  ruin(ctx) {
    const { B, o, fdef, R, M, C } = ctx;
    // 崩れた石壁と柱
    const col = new THREE.Color(0xb8ab90).lerp(new THREE.Color(fdef.ground), 0.25);
    const n = 4 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 1.5 + R() * 0.2, h = 0.8 + R() * 2.6;
      B.add(new THREE.BoxGeometry(o.r * 0.75, h, 0.7), C(col), local(M, Math.sin(a) * o.r * 0.75, h / 2, Math.cos(a) * o.r * 0.75, 0, a + Math.PI / 2, (R() - 0.5) * 0.1), { flat: true });
    }
    makeProp(B, 'pillar', local(M, 0, 0, 0), R, col.getHex(), col.getHex(), fdef);
    for (let k = 0; k < 4; k++) B.add(new THREE.DodecahedronGeometry(0.4 + R() * 0.3, 0), C(col), local(M, (R() - 0.5) * o.r * 1.4, 0.2, (R() - 0.5) * o.r * 1.4, R(), R(), R()), { flat: true });
  },
  crystal(ctx) {
    const { B, o, fdef, R, M } = ctx;
    const c1 = propColor(fdef, ['crystal'], 0, 0x7ae0ff), c2 = propColor(fdef, ['crystal'], 1, 0xb07aff);
    makeProp(B, 'crystal', local(M, 0, 0, 0, 0, 0, 0, o.r * 1.1), R, c1, c2, fdef);
  },
  pond(ctx) {
    const { B, o, fdef, heightAt, R, group, anims, C } = ctx;
    // 水面（くぼみの上に置く）と縁の石・葦
    const water = new THREE.Mesh(new THREE.CircleGeometry(o.r + 0.9, 48), new THREE.MeshToonMaterial({
      color: fdef.n === 3 ? 0x3ab0b0 : 0x3a8ad0, transparent: true, opacity: 0.82, gradientMap: null,
    }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(o.x, -0.25, o.z);
    water.userData.noOutline = true;
    group.add(water);
    const shine = new THREE.Mesh(new THREE.RingGeometry(o.r * 0.3, o.r * 0.34, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
    shine.rotation.x = -Math.PI / 2; shine.position.set(o.x, -0.22, o.z); group.add(shine);
    anims.push((t) => { const s = 1 + (t * 0.25 % 1) * 2; shine.scale.setScalar(s); shine.material.opacity = 0.3 * (1 - (s - 1) / 2); });
    const n = Math.round(o.r * 2.2);
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + R() * 0.2, rr = o.r + 0.8 + R() * 0.6;
      const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      if (R() < 0.55) B.add(new THREE.DodecahedronGeometry(0.35 + R() * 0.3, 0), C(0x8a8a80), local(I, o.x + x, heightAt(o.x + x, o.z + z), o.z + z, R(), R(), R()), { flat: true });
      else for (let j = 0; j < 3; j++) B.add(new THREE.ConeGeometry(0.05, 1.2 + R() * 0.6, 4), C(0x6a8a3a), local(I, o.x + x + (R() - 0.5) * 0.4, heightAt(o.x + x, o.z + z) + 0.6, o.z + z + (R() - 0.5) * 0.4, (R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3));
    }
  },
};

export function makeObstacle(B, o, fdef, heightAt, R, group, anims) {
  const y = heightAt(o.x, o.z);
  const M = local(I, o.x, o.kind === 'pond' ? 0 : y, o.z, 0, R() * Math.PI * 2, 0);
  const C = (c, d = 0.08) => new THREE.Color(c).offsetHSL(0, 0, (R() - 0.5) * d);
  // 形は OBSTACLES の登録表（種類ごと）
  if (Object.hasOwn(OBSTACLES, o.kind)) OBSTACLES[o.kind]({ B, o, fdef, heightAt, R, group, anims, y, M, C });
}

// 毒沼（泡が立つ）と流砂（渦を巻く）
export function makeHazard(h, heightAt) {
  const poison = h.kind === 'poison';
  const U = { uTime: { value: 0 }, uR: { value: h.r } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; uniform float uR; varying vec2 vP;
      void main(){
        float r = length(vP) / uR; if (r > 1.0) discard;
        float a = atan(vP.y, vP.x);
        ${poison
    ? `vec3 c = mix(vec3(0.42,0.16,0.55), vec3(0.25,0.75,0.25), 0.5 + 0.5 * sin(a * 3.0 + r * 9.0 - uTime * 1.3));
        c *= 0.75 + 0.25 * sin(r * 20.0 - uTime * 2.0);`
    : `float s = 0.5 + 0.5 * sin(a * 3.0 + r * 14.0 + uTime * 2.4);
        vec3 c = mix(vec3(0.72,0.58,0.36), vec3(0.95,0.84,0.6), s);
        c = mix(c, vec3(0.45,0.34,0.2), smoothstep(0.35, 0.0, r));`}
        float edge = smoothstep(1.0, 0.85, r);
        gl_FragColor = vec4(c, edge * ${poison ? '0.88' : '0.8'});
      }`,
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(h.r, 40), mat);
  m.rotation.x = -Math.PI / 2;
  const g = new THREE.Group();
  g.add(m);
  m.position.y = (poison ? -0.12 : -0.04) + 0.06;
  // 泡
  const bubbles = [];
  if (poison) {
    const bm = new THREE.MeshBasicMaterial({ color: 0x9aff7a, transparent: true, opacity: 0.8 });
    for (let k = 0; k < 6; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), bm);
      const a = Math.random() * 6.28, rr = Math.random() * h.r * 0.7;
      b.position.set(Math.sin(a) * rr, 0, Math.cos(a) * rr);
      b.userData.ph = Math.random() * 3;
      g.add(b); bubbles.push(b);
    }
  }
  g.position.set(h.x, 0, h.z);
  g.userData.anim = (t) => {
    U.uTime.value = t;
    for (const b of bubbles) { const p = (t * 0.6 + b.userData.ph) % 1; b.position.y = -0.05 + p * 0.25; b.scale.setScalar(p < 0.85 ? 0.4 + p : 0.01); }
  };
  void heightAt;
  return g;
}

// 宝箱（big: ダンジョン最奥の大きな宝箱）
export function makeChest(big) {
  const chest = new THREE.Group();
  const body = new THREE.Group(); chest.add(body);
  const wood = toon(big ? 0x8a5a2a : 0x7a5a3a), gold = toon(big ? 0xe8b84a : 0xb0b0b8);
  body.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 1.1), wood), 0, 0.5, 0));
  const lid = new THREE.Group(); lid.position.set(0, 1.0, -0.55); body.add(lid);
  const lidMesh = at(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.8, 12, 1, false, 0, Math.PI), wood), 0, 0, 0.55);
  lidMesh.rotation.z = Math.PI / 2;
  lid.add(lidMesh);
  for (const s of [-1, 1]) body.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 1.15), gold), s * 0.7, 0.52, 0));
  body.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.1), gold), 0, 0.85, 0.58));
  if (!big) body.scale.setScalar(0.75);
  const shine = at(new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), new THREE.MeshBasicMaterial({ color: big ? 0xffe08a : 0xbfe6ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })), 0, big ? 1.2 : 0.9, 0);
  chest.add(shine);
  chest.traverse((o) => { if (o.isMesh && o.material.isMeshToonMaterial) o.castShadow = true; });
  outline(chest, 1);
  chest.add(at(textSprite('宝箱', big ? '#ffd27a' : '#cfe6ff', 3, '[F] 開ける'), 0, big ? 2.6 : 2.1, 0));
  chest.userData = { lid, shine, anim: (t) => { shine.scale.setScalar(1 + Math.sin(t * 3) * 0.15); } };
  return chest;
}

// 共有ボックス（町・野営地。全員で中身を共有）
export function makeBox() {
  const g = new THREE.Group();
  const wood = toon(0x5a6a8a), trim = toon(0xd0d8e8), rune = glow(new THREE.Color(0x7ae0ff).multiplyScalar(1.5));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 1.5), wood), 0, 0.65, 0));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.25, 1.65), trim), 0, 1.38, 0));
  for (const s of [-1, 1]) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.35, 1.6), trim), s * 0.95, 0.67, 0));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 1.7), toon(0x3a4256)), 0, 0.1, 0));
  const gem = at(new THREE.Mesh(new THREE.OctahedronGeometry(0.28), rune), 0, 0.8, 0.8);
  g.add(gem);
  g.traverse((o) => { if (o.isMesh && o.material.isMeshToonMaterial) o.castShadow = true; });
  outline(g, 1);
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.1, 40), new THREE.MeshBasicMaterial({ color: 0x7ae0ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.08; g.add(halo);
  g.add(at(textSprite('共有ボックス', '#9ae8ff', 4, '[F] 開く'), 0, 3, 0));
  g.userData.anim = (t) => { gem.rotation.y = t * 1.5; gem.position.y = 0.8 + Math.sin(t * 2) * 0.05; halo.material.opacity = 0.35 + Math.sin(t * 2) * 0.15; };
  return g;
}
