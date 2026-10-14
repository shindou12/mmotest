import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AudioEngine } from '../audio.js';
import { FX } from '../fx.js';
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

export function applyQuality() {
  const q = settings.quality;
  bloomPass.enabled = q !== 'low';
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

export const fx = new FX(scene);
export const ambient = new AmbientParticles(scene);
export const weatherParts = new AmbientParticles(scene, 1600); // 天候（雨・霧・砂嵐）の粒子
export const audio = new AudioEngine();
audio.setVolumes(settings);
