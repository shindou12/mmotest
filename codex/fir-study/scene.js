import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const q = new URLSearchParams(location.search);
const model = q.get('model') || 'current';
if (!['current', 'fir_soft_v1', 'fir_soft_v2', 'fir_soft_v3', 'fir_soft_v4', 'fir_soft_v5'].includes(model)) throw new Error('未対応の木です');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.LinearToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#c8cdb0');
scene.add(new THREE.HemisphereLight('#d6e0e4', '#747c5e', 1.4));
const sun = new THREE.DirectionalLight('#fff0d4', 3.0);
sun.position.set(-4, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 9, bottom: -7, near: .1, far: 30 });
sun.shadow.normalBias = .035;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: '#aab28b' }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const camera = new THREE.PerspectiveCamera(27, innerWidth / innerHeight, .1, 100);
const gltf = await new GLTFLoader().loadAsync(model === 'current' ? '/public/worldart/assets/fir4_c.glb' : `./assets/${model}.glb`);
gltf.scene.updateMatrixWorld(true);
let triangles = 0;
gltf.scene.traverse(object => {
  if (!object.isMesh) return;
  const src = object.material;
  const leaf = /leaf|frond/.test(src.name);
  if (leaf && q.get('skeleton') === '1') return;
  const material = new THREE.MeshLambertMaterial({ map: src.map, vertexColors: !!object.geometry.attributes.color,
    side: leaf ? THREE.DoubleSide : THREE.FrontSide, alphaTest: leaf ? .35 : 0, alphaToCoverage: leaf });
  material.name = src.name;
  if (leaf) material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('normal = normal * faceDirection;', '');
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_lambert_pars_fragment>', THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
      'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
      'float dotNL = saturate( (dot( geometryNormal, directLight.direction ) + 0.35) / 1.35 );'));
  };
  const mesh = new THREE.Mesh(object.geometry, material);
  mesh.applyMatrix4(object.matrixWorld);
  mesh.castShadow = true;
  mesh.receiveShadow = !leaf;
  if (leaf) mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: src.map, alphaTest: .35, side: THREE.DoubleSide });
  scene.add(mesh);
  triangles += object.geometry.index ? object.geometry.index.count / 3 : object.geometry.attributes.position.count / 3;
});
let state = { view: 'standard', yaw: 0 };
function apply(next) {
  state = { ...state, ...next };
  const pitch = THREE.MathUtils.degToRad(state.view === 'top' ? 90 : state.view === 'side' ? 18 : 35);
  const yaw = THREE.MathUtils.degToRad(state.yaw);
  const target = new THREE.Vector3(0, 2.65, 0);
  camera.position.copy(target).add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(15.8));
  if (state.view === 'top') camera.up.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  else camera.up.set(0, 1, 0);
  camera.lookAt(target);
}
apply(state);
addEventListener('message', event => {
  if (event.origin === location.origin && event.source === parent && event.data?.kind === 'tree-state') apply(event.data.state);
});
let dragging = false, lastX = 0;
renderer.domElement.addEventListener('pointerdown', event => {
  dragging = true; lastX = event.clientX; renderer.domElement.setPointerCapture(event.pointerId);
});
for (const type of ['pointerup', 'pointercancel']) renderer.domElement.addEventListener(type, () => { dragging = false; });
renderer.domElement.addEventListener('pointermove', event => {
  if (!dragging) return;
  const delta = (event.clientX - lastX) * .3; lastX = event.clientX;
  if (parent === window) apply({ yaw: state.yaw + delta });
  else parent.postMessage({ kind: 'tree-orbit', delta }, location.origin);
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});
renderer.debug.onShaderError = () => { console.error('FIR_SHADER_ERROR'); parent.postMessage({ kind: 'tree-error' }, location.origin); };
renderer.compile(scene, camera);
renderer.render(scene, camera);
renderer.setAnimationLoop(() => { if (!window.__treeFreeze) renderer.render(scene, camera); });
window.__tree = { renderer, scene, camera, model, triangles };
window.__treeRender = () => renderer.render(scene, camera);
window.__treeReady = true;
parent.postMessage({ kind: 'tree-ready' }, location.origin);
