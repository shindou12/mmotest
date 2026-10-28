import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { installPartialFoliage } from './foliage.js';

const q = new URLSearchParams(location.search);
const source = q.get('source') || 'designed';
const modelName = q.get('model') || 'palm2_a';
const supportedModels = ['palm2_a', 'palm2_b', 'palm2_low', 'palm2_a_before_round', 'palm_round_v1', 'palm_round_v2', 'palm2_a_liked_frond_v1', 'palm2_a_liked_frond_v2', 'palm2_a_liked_frond_v3', 'palm2_a_liked_frond_v4'];
if (!['current', 'designed'].includes(source) || !supportedModels.includes(modelName)) throw new Error('未対応のヤシです');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.LinearToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#647552');
scene.add(new THREE.HemisphereLight('#cfe0ee', '#6f7468', 1.6));
const sun = new THREE.DirectionalLight('#fff0d4', 3);
sun.position.set(-4, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: .1, far: 30 });
sun.shadow.normalBias = .025;
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: '#7f8e55' }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const camera = new THREE.PerspectiveCamera(27, innerWidth / innerHeight, .1, 100);
const pb = { camera: { value: new THREE.Vector3() }, follow: { value: Number(q.get('follow') || 0) } };
// 風の比較ページだけで有効。既存のヤシ比較の既定は変えない。
const wind = q.has('wind') ? {
  module: await import('../palm-wind/wind.js?v=curved-frond-v1'),
  config: await (await fetch('../palm-wind/config.json')).json(),
  time: { value: Number(q.get('time') || 0) },
  strength: { value: THREE.MathUtils.clamp(Number(q.get('wind')), 0, 1) },
  externalClock: false,
} : null;
const painted = q.get('paint');
const paintProfiles = painted ? await (await fetch('../palm-textures/profiles.json')).json() : null;
if (painted && !paintProfiles[painted]) throw new Error('未対応の葉材質です');
const paintProfile = paintProfiles?.[painted];
const paintMaps = paintProfile ? await Promise.all([paintProfile.leaf, paintProfile.bark].map(async (name, index) => {
  const texture = await new THREE.TextureLoader().loadAsync(`../palm-textures/assets/${name}`);
  texture.colorSpace = THREE.SRGBColorSpace;
  // glTFのUVに合わせる。樹皮は元の木目アトラスの左半分UVを全幅へ広げる。
  texture.flipY = false;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (index === 1) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 1);
  }
  return texture;
})) : null;
const report = await (await fetch('./assets/cards.json')).json();
const modelReport = report.models[modelName] || report.models.palm2_a;
const gltf = await new GLTFLoader().loadAsync(`./assets/${source === 'current' ? 'current' : modelName}.glb`);
gltf.scene.updateMatrixWorld(true);
gltf.scene.traverse(ob => {
  if (!ob.isMesh) return;
  const original = ob.material;
  const leafy = /leaf|frond/.test(original.name);
  const material = new THREE.MeshLambertMaterial({ name: original.name, map: paintMaps ? paintMaps[leafy ? 0 : 1] : original.map,
    vertexColors: true, side: leafy ? THREE.DoubleSide : THREE.FrontSide, alphaTest: leafy ? .5 : 0 });
  material.alphaToCoverage = leafy;
  // 前回と同様に、葉の照明法線をカメラの追従から切り離す。
  if (leafy) material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('normal = normal * faceDirection;', '');
  };
  const mesh = new THREE.InstancedMesh(ob.geometry, material, 1);
  mesh.setMatrixAt(0, ob.matrixWorld);
  mesh.castShadow = true;
  mesh.receiveShadow = !leafy;
  if (leafy) {
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking,
      map: material.map, alphaTest: .5, side: THREE.DoubleSide });
    if (source === 'designed') {
      if (wind) wind.module.prepareWindGeometry(mesh.geometry, modelReport);
      installPartialFoliage(mesh, modelReport, pb);
      if (wind) wind.module.installWind(mesh, wind, wind.config);
    }
  }
  mesh.frustumCulled = false;
  scene.add(mesh);
});

let state = { view: 'B01', yaw: 0, follow: pb.follow.value };
function apply(next) {
  state = { ...state, ...next };
  const pitch = state.view === 'overhead' ? 90 : state.view === 'side' ? 18 : state.view === 'top' ? 75 : 40;
  const yaw = THREE.MathUtils.degToRad(state.yaw + (state.view === 'oblique' ? 45 : 0));
  const p = THREE.MathUtils.degToRad(pitch);
  const low = modelName === 'palm2_low';
  const target = new THREE.Vector3(.3, low ? .65 : 2.0, 0);
  const distance = (state.view === 'near' ? 8.8 : THREE.MathUtils.clamp(Number(q.get('distance') || 12.8), 8, 20)) * (low ? .7 : 1);
  camera.position.copy(target).add(new THREE.Vector3(Math.sin(yaw) * Math.cos(p), Math.sin(p), Math.cos(yaw) * Math.cos(p)).multiplyScalar(distance));
  if (state.view === 'overhead') camera.up.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  else camera.up.set(0, 1, 0);
  camera.lookAt(target);
  pb.camera.value.copy(camera.position);
  pb.follow.value = THREE.MathUtils.clamp(Number(state.follow), 0, 1);
  if (wind && Number.isFinite(Number(state.wind))) wind.strength.value = THREE.MathUtils.clamp(Number(state.wind), 0, 1);
}
addEventListener('message', event => {
  if (event.origin === location.origin && event.source === parent && event.data?.kind === 'leaf-state') apply(event.data.state);
  if (wind && event.origin === location.origin && event.source === parent && event.data?.kind === 'wind-clock' && Number.isFinite(event.data.time)) {
    wind.time.value = event.data.time; wind.externalClock = true;
  }
});
let dragging = false, lastX = 0;
renderer.domElement.addEventListener('pointerdown', event => {
  dragging = true; lastX = event.clientX; renderer.domElement.setPointerCapture(event.pointerId);
});
for (const name of ['pointerup', 'pointercancel']) renderer.domElement.addEventListener(name, () => { dragging = false; });
renderer.domElement.addEventListener('pointermove', event => {
  if (!dragging) return;
  const delta = (event.clientX - lastX) * .3; lastX = event.clientX;
  if (parent === window) apply({ yaw: state.yaw + delta });
  else parent.postMessage({ kind: 'leaf-orbit', delta }, location.origin);
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});
let shaderFailed = false;
renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
  shaderFailed = true;
  console.error('PALM_SHADER_ERROR', gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertexShader), gl.getShaderInfoLog(fragmentShader));
  parent.postMessage({ kind: 'leaf-error', message: '葉の描画に失敗しました' }, location.origin);
};
apply(state);
renderer.compile(scene, camera);
renderer.render(scene, camera);
const windStart = performance.now();
renderer.setAnimationLoop(() => {
  if (wind && !wind.externalClock && !q.has('time')) wind.time.value = (performance.now() - windStart) / 1000;
  renderer.render(scene, camera);
});
if (!shaderFailed) parent.postMessage({ kind: 'leaf-ready' }, location.origin);
