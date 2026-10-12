// トゥーン（セル）シェーディング共通部品: 階調マテリアル / 輪郭線 / メッシュ結合
import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let grad = null;
export function gradientMap() {
  if (!grad) {
    grad = new THREE.DataTexture(new Uint8Array([70, 150, 215, 255]), 4, 1, THREE.RedFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter;
    grad.needsUpdate = true;
  }
  return grad;
}

export const toon = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...o });
export const glow = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });

// 背面法線押し出しによる輪郭線。画面上でほぼ一定の太さになるよう深度で補正する
const outlineMats = new Map();
export function outlineMat(width = 1, color = 0x17121f) {
  const key = width + ':' + color;
  if (outlineMats.has(key)) return outlineMats.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      mvPosition = modelViewMatrix * mvPosition;
      vec3 oN = normalize(normalMatrix * normal);
      mvPosition.xyz += oN * ${(0.0021 * width).toFixed(5)} * -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => 'outline' + width;
  m.userData.shared = true;
  outlineMats.set(key, m);
  return m;
}

const hullCache = new WeakMap();
export function hullGeo(geo) {
  if (hullCache.has(geo)) return hullCache.get(geo);
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.attributes.position.clone());
  if (geo.index) g.setIndex(geo.index.clone());
  g = mergeVertices(g, 1e-3);
  g.computeVertexNormals();
  g.userData.shared = true;
  hullCache.set(geo, g);
  return g;
}

export function outline(root, width = 1) {
  const list = [];
  root.traverse((o) => {
    if (o.isMesh && !o.userData.noOutline && !o.material.transparent && o.material.isMeshToonMaterial) list.push(o);
  });
  for (const o of list) {
    const h = new THREE.Mesh(hullGeo(o.geometry), outlineMat(width));
    h.userData.noOutline = true;
    h.raycast = () => {};
    o.add(h);
  }
  return root;
}

// グループ直下の静的メッシュをマテリアルごとに1つへ結合（描画コール削減）
function plainGeo(mesh) {
  mesh.updateMatrix();
  let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  g.applyMatrix4(mesh.matrix);
  return g;
}
export function compact(group) {
  const buckets = new Map();
  for (const c of [...group.children]) {
    if (c.isMesh && c.children.length === 0 && !c.userData.keep) {
      if (!buckets.has(c.material)) buckets.set(c.material, []);
      buckets.get(c.material).push(c);
    } else if (!c.isMesh && c.children.length) compact(c);
  }
  for (const [mat, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const merged = new THREE.Mesh(mergeGeometries(meshes.map(plainGeo)), mat);
    merged.userData.noOutline = meshes[0].userData.noOutline;
    merged.castShadow = true;
    for (const m of meshes) { group.remove(m); m.geometry.dispose(); }
    group.add(merged);
  }
  return group;
}

// 静的な背景用: ジオメトリを色付きで溜めて最後に1メッシュへ
export class Batch {
  constructor() { this.solid = []; this.glow = []; this.m = new THREE.Matrix4(); }
  add(geo, color, matrix, { glowing = false, flat = false } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (flat) g.computeVertexNormals();
    g.applyMatrix4(matrix);
    const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    (glowing ? this.glow : this.solid).push(g);
    geo.dispose();
  }
  build() {
    const group = new THREE.Group();
    if (this.solid.length) {
      const mesh = new THREE.Mesh(mergeGeometries(this.solid), toon(0xffffff, { vertexColors: true }));
      mesh.castShadow = mesh.receiveShadow = true;
      outline(mesh, 0.9);
      group.add(mesh);
    }
    if (this.glow.length) {
      group.add(new THREE.Mesh(mergeGeometries(this.glow), glow(0xffffff, { vertexColors: true })));
    }
    return group;
  }
}
