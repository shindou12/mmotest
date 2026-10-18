// 木・針葉樹・岩の見本: 樹種・岩の型ごとに種を変えて並べる（ゲームと同じトゥーン・光・素材）
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Batch, toon } from '../toon.js';
import { seeded, local, I } from '../env/kit.js';
import { groundDetail } from '../env/textures.js';
import { addTree, addPine, addRock } from '../env/flora.js';

const q = new window.URLSearchParams(location.search), view = q.get('view') || 'trees', seed0 = Number(q.get('seed') || 1);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xbfe3ff); scene.fog = new THREE.Fog(0xbfe3ff, 60, 160);
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x3a5a2a, 1.1));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2); sun.position.set(20, 40, 10); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, far: 120 }); sun.shadow.bias = -0.0005;
scene.add(sun);
const gg = new THREE.PlaneGeometry(120, 120); gg.rotateX(-Math.PI / 2);
const uv = gg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 17, uv.getY(i) * 17);
const ground = new THREE.Mesh(gg, toon(0x5f9a45, { map: groundDetail(), noOcc: true })); ground.receiveShadow = true; scene.add(ground);

const B = new Batch(), R = seeded(seed0 * 7919);
const SP = ['oak', 'tall', 'young', 'twin', 'birch', 'old'], RK = ['boulder', 'slab', 'cluster', 'spire', 'split'];
if (view === 'trees') SP.forEach((sp, r) => { for (let c = 0; c < 5; c++) addTree(B, local(I, (c - 2) * 7.5, 0, (r - 2.5) * 7.5), R, { species: sp, fruit: 0.3 }); });
if (view === 'pines') for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) addPine(B, local(I, (c - 2.5) * 6, 0, (r - 1) * 7), R, { snow: r === 2 });
if (view === 'rocks') RK.forEach((k, r) => { for (let c = 0; c < 6; c++) addRock(B, local(I, (c - 2.5) * 5, 0, (r - 2) * 5), R, { kind: k, moss: r % 2 ? 0.7 : 0, size: 1 + (c % 3) * 0.3 }); });
if (view.startsWith('sp-')) { const sp = view.slice(3); for (let c = 0; c < 5; c++) addTree(B, local(I, (c - 2) * 6.5, 0, 0), R, { species: sp, fruit: 0.3 }); }
if (view === 'mix') for (let i = 0; i < 70; i++) {
  const x = (R() - 0.5) * 60, z = (R() - 0.5) * 50, M = local(I, x, 0, z, 0, R() * 6.28, 0), t = R();
  if (t < 0.6) addTree(B, M, R, { size: 0.8 + R() * 0.5, fruit: 0.3 }); else if (t < 0.75) addPine(B, M, R, { size: 0.8 + R() * 0.4 }); else addRock(B, M, R, { moss: 0.6, size: 0.7 + R() * 0.8 });
}
scene.add(B.build());

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);
const cam = { trees: [0, 26, 30], pines: [0, 22, 30], rocks: [0, 18, 24], mix: [0, 30, 38] }[view] || [0, 30, 34];
camera.position.set(...(view.startsWith('sp-') ? [0, 11, 21] : cam));
const ctl = new OrbitControls(camera, renderer.domElement); ctl.target.set(0, view === 'rocks' ? 0 : view.startsWith('sp-') ? 3 : 2, 0); ctl.update();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
(function loop() { renderer.render(scene, camera); requestAnimationFrame(loop); })();
window.__ready = true;
