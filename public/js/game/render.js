import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { AudioEngine } from '../audio.js';
import { StyledFX } from '../fx-styles.js';
import { AmbientParticles } from '../env.js';
import { settings } from './save.js';

// ======================================================================
// レンダラー
// ======================================================================
export const canvas = document.getElementById('c');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 900);
export const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
export const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.45, 0.95);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
// 仕上げ: 少しだけ彩度とコントラストを上げ、画面の四隅をやわらかく落とす（画面の色のあとに掛ける）
export const gradePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.08 }, contrast: { value: 1.04 }, vig: { value: 0.22 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat; uniform float contrast; uniform float vig; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, sat);
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;
      vec2 d = vUv - 0.5; d.x *= 1.3;
      c.rgb *= 1.0 - vig * smoothstep(0.35, 0.85, length(d));
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
    }`,
});
composer.addPass(gradePass);

export function applyQuality() {
  const q = settings.quality;
  bloomPass.enabled = q !== 'low';
  gradePass.enabled = q !== 'low';
  sun.castShadow = q !== 'low';
  renderer.setPixelRatio(q === 'high' ? Math.min(devicePixelRatio, 1.5) : 1);
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
}
applyQuality();
// 1フレームを描く。自動テスト（挙動の記録）は描画を省いて速く回す
export function renderFrame() { if (!window.__noRender) composer.render(); }

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

// カメラの状態（ズーム・注視点）と、計算用の一時ベクトル
export const cam = { zoom: 1, zoomT: 1, focus: new THREE.Vector3() };
export const tmpV = new THREE.Vector3();
// 画面の点（px）から、高さ y の地面上の点を求めて out（{x,y,z}）に入れる。地面に届かないときは out をそのままにする
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitV = new THREE.Vector3();
export function screenToGround(px, py, y, out) {
  const v = new THREE.Vector2((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1);
  raycaster.setFromCamera(v, camera);
  groundPlane.constant = -y;
  if (raycaster.ray.intersectPlane(groundPlane, hitV)) { out.x = hitV.x; out.y = hitV.y; out.z = hitV.z; }
}
// エリアの霧と、天候で日差しの色を寄せる
export function setFog(color, near, far) { scene.fog = new THREE.Fog(color, near, far); }
export function tintSun(tint, k) { sun.color.lerp(new THREE.Color(tint), k); }

// エフェクトの見た目（設定の「エフェクト」: blend A+B / anime アニメ調 / flashy 派手 / subtle 控えめ / classic 今までの見た目）
export const fx = new StyledFX(scene, settings.fx);
export function applyFxStyle() { fx.setStyle(settings.fx); bloomPass.strength = fx.bloom; }
applyFxStyle();
export const ambient = new AmbientParticles(scene);
export const weatherParts = new AmbientParticles(scene, 1600); // 天候（雨・霧・砂嵐）の粒子
export const audio = new AudioEngine();
audio.setVolumes(settings);
