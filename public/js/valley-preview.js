import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildArea } from './env.js';
import { VALLEY_VIEWS } from './env/valley.js';
import { AREAS, collide, arrival, obstaclesOf, insideOpen } from '../shared/areas.js';
import { FLOORS } from '../shared/data.js';
import { makePlayer, animatePlayer, setPlayerWeapon } from './models.js';

const $ = (s) => document.querySelector(s);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.15, 900);
const renderer = new THREE.WebGLRenderer({
  canvas: $('#world'),
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.info.autoReset = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const hemi = new THREE.HemisphereLight(0xc9d5cd, 0x6c7054, 1.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe0a8, 2.7);
sun.position.set(-35, 55, -28);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -58, right: 58, top: 58, bottom: -58, near: 1, far: 180 });
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.2, 0.5, 1.2);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 4;
controls.maxDistance = 190;
controls.maxPolarAngle = Math.PI * 0.475;
controls.minPolarAngle = 0.12;
const def = AREAS.f1_field;
let env,
  walking = false,
  transition = null,
  activeView = 0,
  audio = null;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const dispose = (group) => {
  const geos = new Set(),
    mats = new Set();
  group.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) geos.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material])
      if (m && !m.userData.shared) mats.add(m);
    if (o.userData.disposeMap) o.material?.map?.dispose();
  });
  for (const g of geos) g.dispose();
  for (const m of mats) m.dispose();
  group.removeFromParent();
};
function build(quality = 'high') {
  if (env) {
    env.dispose?.();
    dispose(env.group);
  }
  env = buildArea(def, FLOORS[0], { grass: quality === 'high' ? 1 : 0.4 });
  scene.add(env.group);
  scene.fog = new THREE.Fog(env.light.fog, env.light.fogNear, env.light.fogFar);
  bloom.enabled = quality === 'high';
  sun.castShadow = quality === 'high';
  renderer.setPixelRatio(quality === 'high' ? Math.min(devicePixelRatio, 1.5) : 1);
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
}
build(innerWidth < 600 ? 'low' : 'high');
$('#quality').value = innerWidth < 600 ? 'low' : 'high';
const avatar = makePlayer('#8b9a80');
setPlayerWeapon(avatar, 'sword', 2, 0);
avatar.visible = false;
scene.add(avatar);
const player = { ...arrival(def, 'f1_town'), angle: Math.PI, walkT: 0 };
const keys = new Set();
function view(index, instant = false) {
  if (walking) toggleWalk(false);
  activeView = index;
  const v = VALLEY_VIEWS[index];
  const to = new THREE.Vector3(...v.eye),
    target = new THREE.Vector3(...v.target);
  if (instant || reduced) {
    camera.position.copy(to);
    controls.target.copy(target);
    controls.update();
    transition = null;
  } else
    transition = {
      from: camera.position.clone(),
      look: controls.target.clone(),
      to,
      target,
      start: performance.now(),
    };
  document.querySelectorAll('[data-view]').forEach((b) => {
    b.classList.toggle('active', +b.dataset.view === index);
    b.setAttribute('aria-current', +b.dataset.view === index ? 'true' : 'false');
  });
  $('#location-label').textContent = v.subtitle;
}
view(0, true);
function toggleWalk(on = !walking) {
  keys.clear();
  walking = on;
  transition = null;
  avatar.visible = on;
  document.body.classList.toggle('walking', on);
  $('#walk-help').classList.toggle('hidden', !on);
  $('#walk').innerHTML = on ? '眺める <span>↗</span>' : 'この世界を歩く <span>↗</span>';
  controls.maxDistance = on ? 28 : 190;
  controls.minDistance = on ? 5 : 4;
  controls.enablePan = !on;
  if (on) {
    const y = env.heightAt(player.x, player.z);
    controls.target.set(player.x, y + 1.4, player.z);
    camera.position.set(player.x + 2, y + 4.8, player.z + 10);
    controls.update();
  } else view(activeView, true);
}
function clean() {
  document.body.classList.toggle('clean');
  $('#restore-ui').classList.toggle('hidden', !document.body.classList.contains('clean'));
}
$('#walk').onclick = () => toggleWalk();
$('#hide-ui').onclick = clean;
$('#photo').onclick = clean;
$('#restore-ui').onclick = clean;
document.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => view(+b.dataset.view)));
controls.addEventListener('start', () => {
  transition = null;
});
$('#quality').onchange = (e) => build(e.target.value);
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement) return;
  if (
    [
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Space',
    ].includes(e.code)
  ) {
    e.preventDefault();
    keys.add(e.code);
  }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.add(e.code);
  if (!e.repeat && e.code === 'KeyH') clean();
  if (e.code === 'Escape') {
    if (document.body.classList.contains('clean')) clean();
    else if (walking) toggleWalk(false);
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
document.querySelectorAll('[data-key]').forEach((button) => {
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    keys.add(button.dataset.key);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    button.addEventListener(name, () => keys.delete(button.dataset.key));
});

// Original synthesized wind and distant birds. Audio starts only after the sound button is pressed.
function ambience() {
  const ctx = new AudioContext(),
    master = ctx.createGain();
  master.gain.value = 0.28;
  master.connect(ctx.destination);
  const buffer = ctx.createBuffer(2, ctx.sampleRate * 12, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const d = buffer.getChannelData(channel);
    let previous = 0;
    for (let i = 0; i < d.length; i++) {
      previous = (previous + (Math.random() * 2 - 1) * 0.02) / 1.02;
      d[i] = previous * 2.5;
    }
  }
  const wind = ctx.createBufferSource();
  wind.buffer = buffer;
  wind.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 520;
  wind.connect(filter);
  filter.connect(master);
  wind.start();
  const birds = setInterval(() => {
    const t = ctx.currentTime;
    for (let j = 0; j < 3; j++) {
      const osc = ctx.createOscillator(),
        g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2200 + j * 160, t + j * 0.22);
      osc.frequency.exponentialRampToValueAtTime(3300, t + j * 0.22 + 0.07);
      osc.frequency.exponentialRampToValueAtTime(2300, t + j * 0.22 + 0.17);
      g.gain.setValueAtTime(0, t + j * 0.22);
      g.gain.linearRampToValueAtTime(0.04, t + j * 0.22 + 0.025);
      g.gain.exponentialRampToValueAtTime(0.001, t + j * 0.22 + 0.18);
      osc.connect(g);
      g.connect(master);
      osc.start(t + j * 0.22);
      osc.stop(t + j * 0.22 + 0.2);
    }
  }, 6200);
  return {
    close() {
      clearInterval(birds);
      ctx.close();
    },
  };
}
$('#sound').onclick = () => {
  if (audio) {
    audio.close();
    audio = null;
  } else audio = ambience();
  $('#sound').textContent = `環境音 ${audio ? 'ON' : 'OFF'}`;
  $('#sound').setAttribute('aria-pressed', String(!!audio));
};

let last = performance.now(),
  time = 0;
const forward = new THREE.Vector3(),
  right = new THREE.Vector3(),
  delta = new THREE.Vector3();
function frame(now, draw = true) {
  renderer.info.reset();
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  if (!reduced) time += dt;
  if (transition) {
    const t = Math.min(1, (now - transition.start) / 1900),
      s = t * t * (3 - 2 * t);
    camera.position.lerpVectors(transition.from, transition.to, s);
    controls.target.lerpVectors(transition.look, transition.target, s);
    if (t === 1) transition = null;
  }
  let moving = false;
  if (walking) {
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();
    delta.set(0, 0, 0);
    if (keys.has('KeyW') || keys.has('ArrowUp')) delta.add(forward);
    if (keys.has('KeyS') || keys.has('ArrowDown')) delta.sub(forward);
    if (keys.has('KeyD') || keys.has('ArrowRight')) delta.add(right);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) delta.sub(right);
    moving = delta.lengthSq() > 0;
    if (moving) {
      delta
        .normalize()
        .multiplyScalar(dt * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 8 : 4));
      const oldX = player.x,
        oldZ = player.z,
        oldY = env.heightAt(player.x, player.z);
      Object.assign(player, collide(def, player.x + delta.x, player.z + delta.z, 0.6));
      const dy = env.heightAt(player.x, player.z) - oldY;
      camera.position.add(new THREE.Vector3(player.x - oldX, dy, player.z - oldZ));
      player.angle = Math.atan2(delta.x, delta.z);
      player.walkT += dt * 7;
    }
    const y = env.heightAt(player.x, player.z);
    avatar.position.set(player.x, y, player.z);
    avatar.rotation.y = player.angle;
    controls.target.set(player.x, y + 1.4, player.z);
    camera.position.y = Math.max(
      camera.position.y,
      env.heightAt(camera.position.x, camera.position.z) + 1.5,
    );
    animatePlayer(avatar, {
      t: time,
      moving,
      walkT: player.walkT,
      kind: 'sword',
      combo: 0,
      swing: -1,
      spin: -1,
      sweep: -1,
      dodge: 0,
      down: 0,
      hurt: 0,
    });
    $('#map-position').setAttribute('cx', String(80 + player.x * 0.7));
    $('#map-position').setAttribute('cy', String(80 + player.z * 0.95));
    sun.position.set(player.x - 35, 55, player.z - 28);
    sun.target.position.set(player.x, 0, player.z);
  }
  controls.update();
  env.update(time, walking ? player.x : 1e5, walking ? player.z : 1e5);
  if (draw !== false) composer.render();
}
renderer.setAnimationLoop(frame);
env.ready.then(() =>
  requestAnimationFrame(() => {
    const loading = $('#loading');
    if (loading) {
      loading.style.opacity = '0';
      setTimeout(() => loading.remove(), 800);
    }
  }),
);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});
$('#world').addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  renderer.setAnimationLoop(null);
  const p = document.createElement('p');
  p.id = 'loading';
  p.textContent = '描画を再開するにはページを再読み込みしてください。';
  document.body.append(p);
});
addEventListener('pagehide', () => {
  audio?.close();
  renderer.setAnimationLoop(null);
  env.dispose?.();
  dispose(env.group);
  dispose(avatar);
  controls.dispose();
  composer.dispose();
  renderer.dispose();
});
// Inspection hook for reproducible camera captures and movement/collision verification.
window.__valley = {
  get env() {
    return env;
  },
  get player() {
    return player;
  },
  get walking() {
    return walking;
  },
  scene,
  camera,
  renderer,
  controls,
  view,
  toggleWalk,
  frame,
  stop() {
    renderer.setAnimationLoop(null);
  },
  inspect() {
    return {
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      obstacles: obstaclesOf(def),
      inside: insideOpen(def, player.x, player.z, 0.6),
    };
  },
};
