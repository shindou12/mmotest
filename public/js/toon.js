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

// 模様つきのトゥーン: 白黒の模様（tex）をワールド座標から3方向に貼り、頂点色に掛ける（UV がいらない）
//   scale: 模様1枚が何 m か / strength: 模様の濃さ（0 で無地）
const TRI_VERT = `
  {
    vec4 tpW = modelMatrix * vec4(transformed, 1.0);
    vTpW = tpW.xyz; vTpN = normalize(mat3(modelMatrix) * objectNormal);
  }`;
const TRI_FRAG = `
  {
    vec3 tw = pow(abs(normalize(vTpN)), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
    vec3 q = vTpW / uTpScale;
    float t = texture2D(uTpTex, q.zy).r * tw.x + texture2D(uTpTex, q.xz).r * tw.y + texture2D(uTpTex, q.xy).r * tw.z;
    diffuseColor.rgb *= mix(1.0, t * 1.12, uTpStr);
  }`;
const texMats = new Map();
export function texToon(key, tex, { scale = 2, strength = 0.6 } = {}) {
  if (texMats.has(key)) return texMats.get(key);
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap() });
  const U = { uTpTex: { value: tex }, uTpScale: { value: scale }, uTpStr: { value: strength } };
  m.onBeforeCompile = (sh) => {
    injectOcc(sh);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vTpW; varying vec3 vTpN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + TRI_VERT);
    sh.fragmentShader = 'uniform sampler2D uTpTex; uniform float uTpScale; uniform float uTpStr; varying vec3 vTpW; varying vec3 vTpN;\n'
      + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>' + TRI_FRAG);
  };
  m.customProgramCacheKey = () => 'tri-occ';
  m.userData.shared = true;
  texMats.set(key, m);
  return m;
}

// 静的な背景用: ジオメトリを色付きで溜めて最後に1メッシュへ（素材 surf ごとに1メッシュ）
//   color: 色、または (面の中心, 面の法線) => 色（面ごとに塗り分ける。木の幹の根元を暗く、岩の上面を苔に、など）
//   surf: { key, tex, scale, strength }（模様つきの素材。なければ無地）
//   chunk: 0 より大きければ、置いた場所で chunk m 四方の区画に分けて別のメッシュにする（画面外・影の範囲外を描かずに済む）
export class Batch {
  constructor({ chunk = 0 } = {}) { this.solid = new Map(); this.glow = []; this.plain = []; this.m = new THREE.Matrix4(); this.chunk = chunk; }
  // plain: 輪郭線を付けない（紐のような細いもの。輪郭線だけが太く見えてしまうため）
  //   perVertex: 色の関数を頂点ごとに呼ぶ（面の法線は同じ。苔の縁などを面の中でもなめらかに変える）
  add(geo, color, matrix, { glowing = false, flat = false, plain = false, surf = null, perVertex = false } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (flat) g.computeVertexNormals();
    g.applyMatrix4(matrix);
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    if (typeof color === 'function') {
      const p = g.attributes.position, nr = g.attributes.normal, cen = new THREE.Vector3(), nor = new THREE.Vector3(), c = new THREE.Color();
      for (let f = 0; f + 2 < n; f += 3) {
        cen.set((p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3, (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3, (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3);
        nor.set(nr.getX(f) + nr.getX(f + 1) + nr.getX(f + 2), nr.getY(f) + nr.getY(f + 1) + nr.getY(f + 2), nr.getZ(f) + nr.getZ(f + 1) + nr.getZ(f + 2)).normalize();
        if (!perVertex) c.set(color(cen, nor));
        for (let k = 0; k < 3; k++) {
          if (perVertex) c.set(color(cen.set(p.getX(f + k), p.getY(f + k), p.getZ(f + k)), nor));
          arr[(f + k) * 3] = c.r; arr[(f + k) * 3 + 1] = c.g; arr[(f + k) * 3 + 2] = c.b;
        }
      }
    } else {
      const c = new THREE.Color(color);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    if (glowing) this.glow.push(g);
    else if (plain) this.plain.push(g);
    else {
      let key = surf ? surf.key : '';
      if (this.chunk) {
        g.computeBoundingBox();
        const bb = g.boundingBox;
        key += '|' + Math.floor((bb.min.x + bb.max.x) / 2 / this.chunk) + ',' + Math.floor((bb.min.z + bb.max.z) / 2 / this.chunk);
      }
      if (!this.solid.has(key)) this.solid.set(key, { surf, list: [] });
      this.solid.get(key).list.push(g);
    }
    geo.dispose();
  }
  build() {
    const group = new THREE.Group();
    for (const { surf, list } of this.solid.values()) {
      const mat = surf ? texToon(surf.key, surf.tex(), surf) : toon(0xffffff, { vertexColors: true });
      const mesh = new THREE.Mesh(mergeGeometries(list), mat);
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
