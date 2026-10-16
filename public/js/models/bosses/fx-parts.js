// ボスのモデルに付ける光の部品（発光のにじみ・縁の光・漂う粒）。どれも加算合成で、輪郭線と結合（compact）の対象から外す。
// テクスチャは数値から作る（ブラウザのないテストでも作れるように canvas を使わない）
import * as THREE from 'three';

// 中心が明るく外へ消える丸（光のにじみ・粒の形）
let dotTex = null;
export function dotTexture() {
  if (dotTex) return dotTex;
  const N = 64, data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - N / 2 + 0.5, y - N / 2 + 0.5) / (N / 2), a = Math.max(0, 1 - d) ** 2.2;
    const i = (y * N + x) * 4; data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = Math.round(a * 255);
  }
  dotTex = new THREE.DataTexture(data, N, N); dotTex.needsUpdate = true;
  return dotTex;
}
const keep = (o) => { o.userData.keep = true; o.userData.noOutline = true; o.castShadow = false; o.raycast = () => {}; return o; };

// 光のにじみ（いつもカメラを向く板）
export function glowSprite(color, size, opacity = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  return keep(s);
}

// 縁の光: 形をひとまわり大きくした殻。視線と面が横向きになる縁ほど明るい（フレネル）
export function rimMaterial(color, power = 2.2, strength = 1.2) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPow: { value: power }, uStr: { value: strength }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uPow; uniform float uStr; uniform float uTime; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(1.0 - abs(dot(vN, vV)), uPow) * uStr * (0.85 + 0.15 * sin(uTime * 3.0)); gl_FragColor = vec4(uColor * f, f); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
}
export function rimShell(geometry, material, grow = 1.08) {
  const m = new THREE.Mesh(geometry, material);
  m.scale.setScalar(grow);
  return keep(m);
}

// 漂う光の粒: n 個の点。update(t) で動かす（動き方は呼ぶ側が place(i, t, out) で決める）
export function motes(n, color, size, place) {
  const pos = new Float32Array(n * 3), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ map: dotTexture(), color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  keep(p); p.frustumCulled = false;
  const v = new THREE.Vector3();
  p.update = (t) => { for (let i = 0; i < n; i++) { place(i, t, v); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; } g.attributes.position.needsUpdate = true; };
  p.update(0);
  return p;
}
export const markKeep = keep;
