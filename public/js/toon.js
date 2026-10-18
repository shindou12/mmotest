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

// ---------------------------------------------------------------------------
// 近景の透過: カメラと自キャラの間にあるもの（敵・木・岩・壁）や、カメラに近すぎるものを
// ディザで抜いて、自キャラと周りが見えるようにする。main が毎フレーム uniform を更新する
// ---------------------------------------------------------------------------
export const OCC = {
  uOccCam: { value: new THREE.Vector3() },
  uOccTgt: { value: new THREE.Vector3() },
  uOccR: { value: 0 },
  // カメラからこの距離より手前のものは消す（外周の岩の中にカメラが入ったとき、輪郭線の裏側で画面が黒くならないように）
  uOccNear: { value: 0 },
};
const OCC_VERT = `
  {
    vec4 occW = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      occW = instanceMatrix * occW;
    #endif
    vOccW = (modelMatrix * occW).xyz;
  }`;
const OCC_FRAG = `
uniform vec3 uOccCam; uniform vec3 uOccTgt; uniform float uOccR; uniform float uOccNear; varying vec3 vOccW;
void occClip() {
  float k = 0.0;
  if (uOccR > 0.0) {
    vec3 seg = uOccTgt - uOccCam; float L2 = dot(seg, seg);
    float t = clamp(dot(vOccW - uOccCam, seg) / max(L2, 1e-4), 0.0, 1.0);
    float d = length(vOccW - (uOccCam + seg * t));
    // 線分の手前側（自キャラの直前までは）だけ抜く
    k = smoothstep(uOccR, uOccR * 0.45, d) * smoothstep(0.93, 0.8, t);
  }
  // カメラに近すぎるもの
  if (uOccNear > 0.0) k = max(k, smoothstep(uOccNear, uOccNear * 0.7, length(vOccW - uOccCam)));
  if (k <= 0.0) return;
  vec2 p = mod(floor(gl_FragCoord.xy), 4.0);
  float th = (mod(p.x, 2.0) * 2.0 + mod(p.y, 2.0) + floor(p.x / 2.0) * 0.5 + floor(p.y / 2.0) * 0.25) / 4.0 + 0.06;
  if (k * 0.85 > th) discard;
}
`;
function injectOcc(sh) {
  Object.assign(sh.uniforms, OCC);
  sh.vertexShader = 'varying vec3 vOccW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>' + OCC_VERT);
  sh.fragmentShader = OCC_FRAG + sh.fragmentShader.replace('void main() {', 'void main() {\n  occClip();');
}
function withOcc(m, on) {
  if (on) { m.onBeforeCompile = injectOcc; m.customProgramCacheKey = () => 'occ'; }
  return m;
}

export const toon = (color, { noOcc = false, ...o } = {}) => withOcc(new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...o }), !noOcc);
export const glow = (color, { noOcc = false, ...o } = {}) => withOcc(new THREE.MeshBasicMaterial({ color, ...o }), !noOcc && !o.transparent);

// 背面法線押し出しによる輪郭線。画面上でほぼ一定の太さになるよう深度で補正する
const outlineMats = new Map();
export function outlineMat(width = 1, color = 0x17121f) {
  const key = width + ':' + color;
  if (outlineMats.has(key)) return outlineMats.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, OCC);
    sh.vertexShader = 'varying vec3 vOccW;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      mvPosition = modelViewMatrix * mvPosition;
      vec3 oN = normalize(normalMatrix * normal);
      mvPosition.xyz += oN * ${(0.0021 * width).toFixed(5)} * -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;` + OCC_VERT);
    sh.fragmentShader = OCC_FRAG + sh.fragmentShader.replace('void main() {', 'void main() {\n  occClip();');
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
  constructor() { this.solid = []; this.glow = []; this.plain = []; this.m = new THREE.Matrix4(); }
  // plain: 輪郭線を付けない（紐のような細いもの。輪郭線だけが太く見えてしまうため）
  add(geo, color, matrix, { glowing = false, flat = false, plain = false } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (flat) g.computeVertexNormals();
    g.applyMatrix4(matrix);
    const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    (glowing ? this.glow : plain ? this.plain : this.solid).push(g);
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
    if (this.plain.length) {
      const mesh = new THREE.Mesh(mergeGeometries(this.plain), toon(0xffffff, { vertexColors: true }));
      mesh.castShadow = true;
      group.add(mesh);
    }
    if (this.glow.length) {
      group.add(new THREE.Mesh(mergeGeometries(this.glow), glow(0xffffff, { vertexColors: true })));
    }
    return group;
  }
}
