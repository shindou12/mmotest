// エリアの見た目: Blender で作って並べた一角（def.scene。例: shared/glade-layout.js と tools/blender/cottage_glade.py）
//   GLB を読み、材質名ごとにトゥーンの材質へ置き換え（「発光_」で始まる材質は光る材質）、同じ材質を1つにまとめて輪郭線を付ける。
//   一番上の物は、置いた位置の地面の高さへ持ち上げる。煙突の煙・角灯のにじみは、配置データの位置にゲーム側で足す
//   style のある一角（'ro3' = 木漏れ日の小屋の RO3 風の比較版、'pbr' = 陽だまりの森の家）は、GLB の材質（テクスチャ・頂点の色・発光）を
//   そのまま使う（トゥーン・輪郭線にしない）。比較版は URL に ?glade=ro3 を付けると、同じエリア・同じ当たり判定のまま見た目だけ入れ替わる
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, glow, outline } from '../toon.js';
import { GLADE } from '../../shared/glade-layout.js';
import { GLADE_RO3 } from '../../shared/glade-layout-ro3.js';

const VARIANTS = new Map([[GLADE, { ro3: GLADE_RO3 }]]);
const wanted = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('glade') : null;
// エリアの一角を、URL で選んだ比較版に入れ替える（なければそのまま）
export const pickScene = (sc) => (sc && VARIANTS.get(sc)?.[wanted]) || sc;

const loader = new GLTFLoader();
const cache = new Map();
const load = (url) => { if (!cache.has(url)) cache.set(url, loader.loadAsync(url)); return cache.get(url); };

// 材質ごとにまとめた形（エリアに入るたびに作り、出るときに捨てる）
function merged(gltf, heightAt, textured) {
  const buckets = new Map();
  gltf.scene.updateMatrixWorld(true);
  for (const top of gltf.scene.children) {
    const lift = heightAt(top.position.x, top.position.z);
    top.traverse((o) => {
      if (!o.isMesh) return;
      for (const [i, m] of [].concat(o.material).entries()) {
        let g = o.geometry;
        if (Array.isArray(o.material)) { // 1つの形に複数の材質（GLTFLoader は普通は分けて読むので念のため）
          const grp = g.groups[i]; if (!grp) continue;
          g = g.clone(); g.setIndex(g.index.array.slice(grp.start, grp.start + grp.count)); g.clearGroups();
        } else g = g.clone();
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(textured && (k === 'uv' || k === 'color'))) g.deleteAttribute(k);
        g.applyMatrix4(o.matrixWorld);
        if (lift) g.translate(0, lift, 0);
        if (!buckets.has(m.name)) buckets.set(m.name, { m, geos: [] });
        buckets.get(m.name).geos.push(g.index ? g.toNonIndexed() : g);
      }
    });
  }
  const root = new THREE.Group();
  for (const [name, { m, geos }] of buckets) {
    if (textured) { root.add(texturedMesh(name, m, geos)); continue; }
    const lit = name.startsWith('発光');
    const mat = lit ? glow(m.color.clone().multiplyScalar(1.5)) : toon(m.color.clone());
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    for (const g of geos) g.dispose();
    mesh.castShadow = !lit; mesh.receiveShadow = true;
    if (lit) mesh.userData.noOutline = true;
    root.add(mesh);
  }
  return textured ? root : outline(root, 1);
}

// 両面で、法線を Blender でそろえてある葉（立体の葉・草・花）。裏から見ても法線を裏返さない
const NO_FLIP = new Set(['葉', '針葉', '草', '花']);

// テクスチャ付き: GLB の材質のまま。葉や草の板（カード_）は両面・切り抜きで、影も切り抜く
function texturedMesh(name, m, geos) {
  if (geos.some((g) => !g.attributes.uv)) for (const g of geos) if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  // 頂点の色は形ごとに型（8/16 bit・RGBA）が違うことがあるので、まとめる前に RGB の小数へそろえる（色のない形は白）
  const colored = geos.some((g) => g.attributes.color);
  if (colored) for (const g of geos) {
    const c = g.attributes.color, n = g.attributes.position.count, out = new Float32Array(n * 3).fill(1);
    if (c) for (let i = 0; i < n; i++) { out[i * 3] = c.getX(i); out[i * 3 + 1] = c.getY(i); out[i * 3 + 2] = c.getZ(i); }
    g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  }
  const mat = m.clone();
  mat.vertexColors = colored;
  if (name.startsWith('カード_') || NO_FLIP.has(name)) {
    if (name.startsWith('カード_')) { mat.alphaTest = 0.5; mat.transparent = false; }
    mat.side = THREE.DoubleSide;
    // 板の法線は Blender で茂みの外向き・上向きにそろえてある。裏から見ても裏返さない（裏が真っ黒にならないように）
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'));
    };
    mat.customProgramCacheKey = () => 'card';
  }
  mat.roughness = Math.max(mat.roughness ?? 1, 0.85); mat.metalness = 0;
  if (mat.emissive && mat.emissive.getHex() !== 0) mat.emissiveIntensity = 2.5;
  const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
  for (const g of geos) g.dispose();
  mesh.castShadow = name !== '地面' && name !== '草' && name !== '花'; mesh.receiveShadow = true;
  return mesh;
}

// 煙突の煙: 丸い煙の玉が昇りながら大きく薄くなる
function smoke(group, anims, [x, y, z]) {
  const puffs = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), new THREE.MeshBasicMaterial({ color: 0xe8e4dc, transparent: true, opacity: 0.5, depthWrite: false }));
    m.userData.noOutline = true;
    group.add(m); puffs.push(m);
  }
  anims.push((t) => puffs.forEach((m, i) => {
    const k = (t * 0.22 + i / puffs.length) % 1;
    m.position.set(x + Math.sin(t * 0.7 + i) * 0.25 + k * 0.9, y + k * 3.2, z - k * 0.4);
    m.scale.setScalar(0.5 + k * 1.6);
    m.material.opacity = 0.5 * Math.min(1, k * 6) * (1 - k);
  }));
}

// 角灯・窓のにじみ: 明かりのまわりの淡い光の玉（ゆっくり揺らぐ）
function halo(group, anims, [x, y, z], i) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.userData.noOutline = true; m.position.set(x, y, z);
  group.add(m);
  anims.push((t) => { const s = 1 + Math.sin(t * 3.1 + i * 1.7) * 0.06 + Math.sin(t * 7.3 + i) * 0.03; m.scale.setScalar(s); });
}

export function placeScene(scene, group, heightAt, anims) {
  for (const p of scene.smoke || []) smoke(group, anims, [p[0], p[1] + heightAt(p[0], p[2]), p[2]]);
  scene.lights?.forEach((p, i) => halo(group, anims, [p[0], p[1] + heightAt(p[0], p[2]), p[2]], i));
  load('./assets/models/' + scene.model).then((gltf) => {
    if (!group.parent) return; // 読み終わる前にエリアを出た
    group.add(merged(gltf, heightAt, !!scene.style));
  }).catch((e) => console.warn('一角のモデルを読めませんでした', scene.model, e));
}

// 小道（折れ線）からの距離
export function pathDist(path, x, z) {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}
