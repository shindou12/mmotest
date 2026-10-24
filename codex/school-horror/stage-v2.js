import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { makeInterior } from "./interior.js";
import { makeFloorReflection } from "./floor-reflection.js";

const query = new URLSearchParams(location.search);
const W = 3.4, H = 3.05, BAY = 4.6, L = BAY * 6;
const canvas = document.querySelector("#world");
const entry = document.querySelector("#entry");
const instruction = document.querySelector(".instruction");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1018);
scene.fog = new THREE.Fog(0x0a1018, 11, 35);
const camera = new THREE.PerspectiveCamera(65, 1, 0.045, 65);
camera.position.set(0.12, 1.63, 0.25);
camera.lookAt(0, 1.48, -18);
const controls = new PointerLockControls(camera, canvas);
scene.add(new THREE.HemisphereLight(0x9eb8ce, 0x302a20, 0.48));
scene.add(new THREE.AmbientLight(0xd0c6ae, 0.12));
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.16, 0.35, 1.15));
composer.addPass(new OutputPass());

function plane(w, h, material, parent = scene) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function canvasTexture(draw, w = 512, h = 512) {
  const element = document.createElement("canvas");
  element.width = w; element.height = h;
  draw(element.getContext("2d"), w, h);
  return new THREE.CanvasTexture(element);
}
function cropAlpha(texture) {
  const { width, height } = texture.image;
  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(texture.image, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] < 180) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
  }
  const cropped = texture.clone();
  cropped.repeat.set((x1 - x0) / width, (y1 - y0) / height);
  cropped.offset.set(x0 / width, 1 - y1 / height);
  cropped.needsUpdate = true;
  return cropped;
}
function standard(map, options = {}) {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.82, ...options });
}
function cutout(map, options = {}) {
  return standard(cropAlpha(map), { alphaTest: 0.18, side: THREE.DoubleSide, ...options });
}
function tiled(map, x, y) {
  const result = map.clone();
  result.wrapS = result.wrapT = THREE.RepeatWrapping;
  result.repeat.set(x, y); result.needsUpdate = true;
  return result;
}
const trimMap = canvasTexture((ctx, w, h) => {
  ctx.fillStyle = "#343a35"; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#8b8f7b"; ctx.fillRect(0, 0, w, h * 0.12);
  ctx.fillStyle = "#171e1d"; ctx.fillRect(0, h * 0.7, w, h * 0.3);
});
trimMap.colorSpace = THREE.SRGBColorSpace;
const contactMap = canvasTexture((ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, "rgba(0,0,0,.8)"); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
});
function contact(x, z, w, h, opacity = 0.7) {
  const m = plane(w, h, new THREE.MeshBasicMaterial({ map: contactMap, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.028, z); m.renderOrder = 3;
}
function openingMask(outerW, outerH, innerW, innerH, bottom) {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "black";
    ctx.fillRect((0.5 - innerW / outerW / 2) * w, (1 - (bottom + innerH) / outerH) * h,
      innerW / outerW * w, innerH / outerH * h);
  }, 1024, 1024);
}
function reveal(parent, width, height, bottom) {
  const material = standard(trimMap, { color: 0x878c81, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const edge = plane(0.17, height, material, parent);
    edge.rotation.y = Math.PI / 2;
    edge.position.set(side * width / 2, bottom + height / 2, -0.085);
  }
  for (const y of [bottom, bottom + height]) {
    const edge = plane(width, 0.17, material, parent);
    edge.rotation.x = Math.PI / 2; edge.position.set(0, y, -0.085);
  }
}
const interiors = [], bumped = [], lamps = [];
let chair, chairMaps, ready = false;
const loader = new THREE.TextureLoader();
const names = ["wall-source", "floor-wood", "door-frame", "door-leaf", "window-frame", "night-yard", "classroom-depth", "chair-eight-v2", "ceiling-v2", "fluorescent-v2"];
try {
  const textures = await Promise.all(names.map(name => loader.loadAsync(`./assets/${name}.png`)));
  for (const texture of textures) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  const [wall, wood, frame, leaf, windowFrame, yard, room, chairs, ceiling, fixture] = textures;
  const floorMap = tiled(wood, W / 2.4, L / 2.4);
  const floorMaterial = standard(floorMap, { roughness: 0.7, bumpMap: floorMap, bumpScale: 0.012 });
  const floor = plane(W, L, floorMaterial);
  floor.rotation.x = -Math.PI / 2; floor.position.z = -L / 2;
  if (query.get("reflection") !== "0") scene.add(makeFloorReflection(W, L, floorMap, 0.85));
  const top = plane(W, L, standard(tiled(ceiling, W / 1.2, L / 1.2), { color: 0xbdbfb2 }));
  top.rotation.x = Math.PI / 2; top.position.set(0, H, -L / 2);
  const frameMaterial = cutout(frame, { roughness: 0.7, metalness: 0.16 });
  const leafMaterial = cutout(leaf, { roughness: 0.74, metalness: 0.08 });
  const windowMaterial = cutout(windowFrame, { roughness: 0.62, metalness: 0.22 });
  function door(parent, open = 0, warmth = false) {
    reveal(parent, 1.01, 2.30, 0.04);
    const jamb = plane(1.15, 2.43, frameMaterial, parent);
    jamb.position.set(0, 1.245, 0.025); jamb.castShadow = true;
    const hinge = new THREE.Group();
    hinge.position.set(-0.49, 0.04, 0.03); hinge.rotation.y = -open; parent.add(hinge);
    const slab = plane(0.99, 2.33, leafMaterial, hinge);
    slab.position.set(0.495, 1.165, 0); slab.castShadow = true;
    const interior = makeInterior(1.01, 2.30, room, { depth: query.get("depth") === "0" ? 0 : 1.2,
      brightness: warmth ? 3.5 : 3.2, tint: warmth ? 0xffc276 : 0x9caebb });
    interior.position.set(0, 1.19, -0.175); parent.add(interior); interiors.push(interior);
  }
  for (let i = 0; i < 6; i++) {
    const z = -BAY * (i + 0.5);
    for (const side of [-1, 1]) {
      const group = new THREE.Group(); group.position.set(side * W / 2, 0, z);
      group.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(group);
      const mask = side < 0 ? openingMask(BAY, H, 3.02, 1.24, 1.10) : openingMask(BAY, H, 1.01, 2.30, 0.04);
      const material = standard(wall, { alphaMap: mask, alphaTest: 0.5, bumpMap: wall,
        bumpScale: query.get("bump") === "0" ? 0 : 0.009, side: THREE.DoubleSide });
      bumped.push(material);
      const surface = plane(BAY, H, material, group); surface.position.y = H / 2; surface.castShadow = true;
      const skirting = plane(BAY, 0.115, standard(trimMap), group); skirting.position.set(0, 0.0575, 0.012);
      const cornice = plane(BAY, 0.045, standard(trimMap, { color: 0x858e83 }), group);
      cornice.position.set(0, H - 0.023, 0.012);
      if (side > 0) door(group, i === 2 ? 0.72 : 0);
      else {
        reveal(group, 3.02, 1.24, 1.10);
        const window = plane(3.2, 1.32, windowMaterial, group);
        window.position.set(0, 1.72, 0.025); window.castShadow = true;
        const moon = new THREE.SpotLight(0x99c8ff, 55, 8, 0.68, 0.36, 2);
        moon.position.set(-W / 2 - 0.65, 2.05, z + 0.4);
        moon.target.position.set(W / 2, 0.05, z - 1.6);
        moon.castShadow = i === 0 || i === 2;
        moon.shadow.mapSize.set(1024, 1024); moon.shadow.bias = -0.0003; moon.shadow.normalBias = 0.01;
        scene.add(moon, moon.target);
      }
    }
    const lit = i === 1 || i === 3 || i === 5;
    const lampImage = plane(0.24, 1.12, cutout(fixture, {
      emissive: lit ? 0xffdf9c : 0x333522, emissiveMap: cropAlpha(fixture), emissiveIntensity: lit ? 1.7 : 0.05,
    }));
    lampImage.rotation.x = Math.PI / 2; lampImage.position.set(0, H - 0.025, z);
    if (lit) {
      const light = new THREE.PointLight(0xffd79d, i === 1 ? 6 : 4, 9, 2);
      light.position.set(0, H - 0.55, z); light.userData.base = light.intensity; scene.add(light); lamps.push(light);
    }
  }
  const outdoors = plane(38, 8, new THREE.MeshBasicMaterial({ map: yard, color: 0xb8c8e0 }));
  outdoors.rotation.y = Math.PI / 2; outdoors.position.set(-6, 3.2, -L / 2);
  const end = new THREE.Group(); end.position.z = -L; scene.add(end);
  const endWall = plane(W, H, standard(wall, { alphaMap: openingMask(W, H, 1.01, 2.3, 0.04), alphaTest: 0.5 }), end);
  endWall.position.y = H / 2; door(end, 0.20, true);
  const warm = new THREE.PointLight(0xffaa50, 16, 9, 2); warm.position.set(0, 1.8, -L + 0.6); scene.add(warm);
  const back = plane(W, H, standard(wall)); back.rotation.y = Math.PI; back.position.set(0, H / 2, 1.5);

  // 方向別の画像をアトラスUVで選ぶ。カメラの首振りではなく物体から見た位置で選択。
  chairMaps = Array.from({ length: 8 }, (_, i) => {
    const map = chairs.clone(); map.repeat.set(0.25, 0.5);
    map.offset.set(i % 4 / 4, 0.5 - Math.floor(i / 4) * 0.5); map.needsUpdate = true; return map;
  });
  chair = plane(1.18, 1.18, standard(chairMaps[0], { alphaTest: 0.18, side: THREE.DoubleSide, roughness: 0.85 }));
  chair.position.set(-0.94, 0.39, -4.5); contact(-0.94, -4.5, 1.35, 1.3, 0.95);
  const paperMap = canvasTexture((ctx, w, h) => {
    ctx.fillStyle = "#bcb9a6"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#565a52";
    for (let y = 75; y < 400; y += 28) ctx.fillRect(65, y, 300 - (y % 80), 3);
  });
  paperMap.colorSpace = THREE.SRGBColorSpace;
  for (const [x, z, angle] of [[0.4, -5.1, 0.6], [-0.4, -8.4, -0.3], [0.8, -13.6, 0.8]]) {
    const paper = plane(0.21, 0.3, standard(paperMap, { side: THREE.DoubleSide }));
    paper.rotation.set(-Math.PI / 2, 0, angle); paper.position.set(x, 0.03, z);
  }
  ready = true; instruction.textContent = "クリックして歩き出す";
} catch (error) {
  console.error("校舎の読み込みに失敗", error); instruction.textContent = "素材を読み込めませんでした";
}
const shots = {
  entrance: [[0.12, 1.63, 0.25], [0, 1.48, -18]],
  window: [[0.65, 1.63, -4.4], [-1.7, 1.7, -6.9]],
  door: [[-0.55, 1.63, -10], [1.7, 1.25, -11.5]],
  "chair-front": [[0.45, 1.63, -2.7], [-0.94, 0.5, -4.5]],
  "chair-back": [[0.45, 1.63, -6.5], [-0.94, 0.5, -4.5]],
  end: [[0, 1.63, -23.8], [0, 1.4, -L]],
};
if (shots[query.get("shot")]) {
  const [position, target] = shots[query.get("shot")]; camera.position.fromArray(position); camera.lookAt(...target);
}
let active = query.has("preview"), dragging = false, lastX = 0, lastY = 0;
entry.hidden = active;
const keys = new Set();
const flashlight = new THREE.SpotLight(0xffe9be, 0, 14, 0.35, 0.65, 2);
scene.add(camera); camera.add(flashlight, flashlight.target);
flashlight.position.set(0.16, -0.16, 0); flashlight.target.position.set(0, -0.12, -8);
entry.addEventListener("click", () => { if (!ready) return; active = true; entry.hidden = true; controls.lock(); });
canvas.addEventListener("pointerdown", event => {
  active = true; dragging = true; lastX = event.clientX; lastY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
window.addEventListener("pointermove", event => {
  if (!dragging || controls.isLocked) return;
  camera.rotation.order = "YXZ";
  camera.rotation.y -= (event.clientX - lastX) * 0.0026;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - (event.clientY - lastY) * 0.0026, -1.2, 1.2);
  lastX = event.clientX; lastY = event.clientY;
});
window.addEventListener("pointerup", () => { dragging = false; });
controls.addEventListener("unlock", () => { active = query.has("preview"); entry.hidden = active; keys.clear(); });
window.addEventListener("keydown", event => {
  keys.add(event.code);
  if (event.code.startsWith("Arrow")) event.preventDefault();
  if (event.repeat) return;
  if (event.code === "KeyF") flashlight.intensity = flashlight.intensity ? 0 : 18;
  if (event.code === "KeyB") for (const material of bumped) material.bumpScale = material.bumpScale ? 0 : 0.009;
});
window.addEventListener("keyup", event => keys.delete(event.code));
window.addEventListener("blur", () => { keys.clear(); dragging = false; });
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize); resize();
let previous = performance.now(), walked = 0;
function frame(now) {
  const dt = Math.min((now - previous) / 1000, 0.05); previous = now;
  let forward = Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown"));
  let right = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
  if (active && (forward || right)) {
    const old = camera.position.clone(); const speed = 2.2 * dt / Math.hypot(forward, right);
    controls.moveForward(forward * speed); controls.moveRight(right * speed);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -W / 2 + 0.25, W / 2 - 0.25);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -L + 0.55, 0.8);
    if (Math.hypot(camera.position.x + 0.94, camera.position.z + 4.5) < 0.55) camera.position.copy(old);
    walked += dt * 7; camera.position.y = 1.63 + Math.sin(walked) * 0.014;
  }
  if (chair) {
    const angle = Math.atan2(camera.position.x - chair.position.x, camera.position.z - chair.position.z);
    const index = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
    chair.rotation.y = angle; chair.material.map = chairMaps[index];
  }
  if (!query.has("still")) lamps.forEach((lamp, i) => { lamp.intensity = lamp.userData.base * (0.97 + 0.03 * Math.sin(now * 0.002 + i)); });
  composer.render(); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
