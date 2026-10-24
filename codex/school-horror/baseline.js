import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const canvas = document.querySelector("#world");
canvas.tabIndex = 0;
const entry = document.querySelector("#entry");
const instruction = document.querySelector(".instruction");
const toast = document.querySelector("#toast");
const query = new URLSearchParams(window.location.search);
const previewMode = query.get("preview") === "1";
const cutoutMode = query.get("cutout") !== "0";

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#111613");
scene.fog = new THREE.Fog(0x111613, 14, 37);

const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 70);
camera.position.set(0, 1.66, 0.35);
scene.add(camera);

const controls = new PointerLockControls(camera, document.body);
controls.pointerSpeed = 0.72;
controls.minPolarAngle = 0.48;
controls.maxPolarAngle = 2.5;

scene.add(new THREE.HemisphereLight(0xa7b7ad, 0x141713, 0.36));
scene.add(new THREE.AmbientLight(0x8e9a91, 0.14));

const HALL_WIDTH = 6.4;
const HALL_HEIGHT = 3.7;
const HALL_LENGTH = 36;
const PANEL_LENGTH = 6;
const bumpScales = [0, 0.07, 0.16];
const bumpNames = ["なし", "弱", "強"];
let bumpMode = Math.max(0, Math.min(2, Number(query.get("bump") || 0)));
let flashlightEnabled = false;
let assetsReady = false;
let inputActive = previewMode;
let dragLooking = false;
let lastPointer = { x: 0, y: 0 };
let toastTimer = 0;
const bumpMaterials = [];
const ceilingLights = [];
const keys = new Set();

const flashlight = new THREE.SpotLight(0xc9d4ce, 0, 13, Math.PI / 7, 0.84, 1.7);
flashlight.position.set(0, -0.04, -0.08);
flashlight.target.position.set(0, -0.16, -8);
camera.add(flashlight, flashlight.target);

function showToast(message) {
  toast.value = message;
  toast.dataset.visible = "true";
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.dataset.visible = "false"; }, 1300);
}

function applyBumpMode() {
  for (const material of bumpMaterials) material.bumpScale = bumpScales[bumpMode];
}

function toggleBump() {
  bumpMode = (bumpMode + 1) % bumpScales.length;
  applyBumpMode();
  showToast("壁の凹凸: " + bumpNames[bumpMode]);
}

function setFlashlight(enabled) {
  flashlight.intensity = enabled ? 5.2 : 0;
  showToast("懐中電灯: " + (enabled ? "点灯" : "消灯"));
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function keepPlayerInHall() {
  camera.position.x = clamp(camera.position.x, -2.76, 2.76);
  camera.position.z = clamp(camera.position.z, -35.2, 0.72);
  camera.position.y = 1.66;
}

function movePlayer(delta) {
  if (!inputActive && !controls.isLocked) return false;
  const forward = Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown"));
  const side = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  if (!forward && !side) return false;

  const length = Math.hypot(forward, side) || 1;
  const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 3.1 : 2.1;
  const distance = speed * delta / length;
  const previous = camera.position.clone();
  if (forward) controls.moveForward(forward * distance);
  if (side) controls.moveRight(side * distance);
  keepPlayerInHall();

  const moved = camera.position.distanceToSquared(previous) > 0.000001;
  if (moved) camera.position.y += Math.sin(performance.now() * 0.008) * 0.012;
  return moved;
}

function loadTexture(url) {
  const loader = new THREE.TextureLoader();
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

function setColorTexture(texture, repeatX = 1, repeatY = 1) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  return texture;
}

function makePlane(width, height, material, name) {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  plane.name = name;
  return plane;
}

function makeWallMaterial(source, offset, apertureMap) {
  const map = source.clone();
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.offset.set(offset, 0);
  map.needsUpdate = true;

  const bumpMap = source.clone();
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.wrapS = THREE.ClampToEdgeWrapping;
  bumpMap.wrapT = THREE.ClampToEdgeWrapping;
  bumpMap.offset.set(offset, 0);
  bumpMap.needsUpdate = true;

  const material = new THREE.MeshStandardMaterial({
    map,
    bumpMap,
    alphaMap: apertureMap,
    alphaTest: apertureMap ? 0.5 : 0,
    bumpScale: bumpScales[bumpMode],
    roughness: 0.96,
    side: THREE.DoubleSide,
  });
  bumpMaterials.push(material);
  return material;
}

function makeApertureMap(kind) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const aperture = kind === "door"
    ? { width: 1.27, height: 2.49, bottom: 0.04 }
    : { width: 2.68, height: 1.18, bottom: 1.81 };
  const x = (PANEL_LENGTH - aperture.width) / 2 / PANEL_LENGTH * canvas.width;
  const y = (HALL_HEIGHT - aperture.bottom - aperture.height) / HALL_HEIGHT * canvas.height;
  const width = aperture.width / PANEL_LENGTH * canvas.width;
  const height = aperture.height / HALL_HEIGHT * canvas.height;
  ctx.fillStyle = "black";
  ctx.fillRect(x, y, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function createFixtureTexture(color) {
  const source = document.createElement("canvas");
  source.width = 128;
  source.height = 320;
  const ctx = source.getContext("2d");

  const glow = ctx.createLinearGradient(0, 0, 128, 0);
  glow.addColorStop(0, "rgba(0, 0, 0, 0)");
  glow.addColorStop(0.2, "rgba(210, 230, 219, 0.25)");
  glow.addColorStop(0.8, "rgba(210, 230, 219, 0.25)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 320);

  ctx.fillStyle = "rgba(31, 39, 36, 0.96)";
  ctx.fillRect(23, 9, 82, 302);
  ctx.fillStyle = "rgba(103, 120, 111, 0.85)";
  ctx.fillRect(29, 15, 70, 290);
  const tube = ctx.createLinearGradient(34, 0, 94, 0);
  tube.addColorStop(0, "rgba(160, 177, 166, 0.75)");
  tube.addColorStop(0.5, color);
  tube.addColorStop(1, "rgba(142, 159, 149, 0.72)");
  ctx.fillStyle = tube;
  ctx.fillRect(36, 23, 56, 274);
  ctx.strokeStyle = "rgba(226, 237, 225, 0.58)";
  ctx.lineWidth = 1;
  ctx.strokeRect(36.5, 23.5, 55, 273);

  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function addCeilingFixture(z, index, material) {
  const panel = makePlane(0.54, 1.48, material, "2D蛍光灯_" + index);
  panel.rotation.x = Math.PI / 2;
  panel.position.set(0, HALL_HEIGHT - 0.035, z);
  scene.add(panel);

  const light = new THREE.PointLight(0xc7d8ce, index % 3 === 1 ? 3.0 : 5.6, 9.2, 2.1);
  light.position.set(0, HALL_HEIGHT - 0.16, z);
  light.userData.baseIntensity = light.intensity;
  light.userData.flicker = index === 1 || index === 4;
  scene.add(light);
  ceilingLights.push(light);
}

function addWallCard(texture, side, z, width, height, bottom, name, tint = 0xffffff, alphaMap = null, inset = 0.025) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: tint,
    alphaMap,
    transparent: true,
    alphaTest: 0.025,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const card = makePlane(width, height, material, name);
  const x = side === 0 ? 0 : side * (HALL_WIDTH / 2 - inset);
  card.position.set(x, bottom + height / 2, z);
  card.rotation.y = side === 0 ? 0 : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
  scene.add(card);
  return card;
}

function addSideBackdrop(texture, side, z, width, height, bottom, name, tint = 0xb2bdc0) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: tint,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const card = makePlane(width, height, material, name);
  card.position.set(side * (HALL_WIDTH / 2 + 1.1), bottom + height / 2, z);
  card.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  scene.add(card);
  return card;
}

function buildHallway(textures) {
  const [wallSource, floorSource, doorTexture, doorLeafTexture, windowTexture, yardTexture, classroomTexture, chairTexture] = textures;
  const wallX = HALL_WIDTH / 2;
  const panelCount = Math.ceil(HALL_LENGTH / PANEL_LENGTH);
  const doorAperture = makeApertureMap("door");
  const windowAperture = makeApertureMap("window");
  const fixtureMaterial = new THREE.MeshBasicMaterial({
    map: createFixtureTexture("rgba(218, 235, 222, 0.98)"),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  for (const side of [-1, 1]) {
    for (let index = 0; index < panelCount; index++) {
      const panel = makePlane(
        PANEL_LENGTH,
        HALL_HEIGHT,
        makeWallMaterial(wallSource, (index * 0.137) % 0.32, cutoutMode ? (side > 0 ? doorAperture : windowAperture) : null),
        "2D壁面_" + side + "_" + index,
      );
      panel.position.set(side * wallX, HALL_HEIGHT / 2, -index * PANEL_LENGTH - PANEL_LENGTH / 2);
      panel.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      scene.add(panel);
    }
  }

  const floorMaterial = new THREE.MeshStandardMaterial({
    map: setColorTexture(floorSource.clone(), 1, 7),
    roughness: 0.88,
    side: THREE.DoubleSide,
  });
  const floor = makePlane(HALL_WIDTH, HALL_LENGTH, floorMaterial, "2D床面");
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.015, -HALL_LENGTH / 2);
  scene.add(floor);

  const ceilingMaterial = new THREE.MeshStandardMaterial({
    map: setColorTexture(wallSource.clone(), 1, 7),
    color: 0x28322d,
    roughness: 0.98,
    side: THREE.DoubleSide,
  });
  const ceiling = makePlane(HALL_WIDTH, HALL_LENGTH, ceilingMaterial, "2D天井面");
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, HALL_HEIGHT, -HALL_LENGTH / 2);
  scene.add(ceiling);

  const endWall = makePlane(
    HALL_WIDTH,
    HALL_HEIGHT,
    new THREE.MeshStandardMaterial({
      map: setColorTexture(wallSource.clone()),
      color: 0x737e75,
      roughness: 0.98,
      side: THREE.DoubleSide,
    }),
    "2D突き当たり",
  );
  endWall.position.set(0, HALL_HEIGHT / 2, -HALL_LENGTH - 0.02);
  scene.add(endWall);

  for (const [index, z] of [-3, -9, -15, -21, -27, -33].entries()) {
    addCeilingFixture(z, Math.round(Math.abs(z) / 6), fixtureMaterial);
    addSideBackdrop(classroomTexture, 1, z, 4.6, 3.1, 0.08, "2D教室の奥", 0xe0ded5);
    addWallCard(doorTexture, 1, z, 1.72, 2.58, 0.03, "2Dドア枠");

    const doorWidth = 1.72;
    const doorHeight = 2.58;
    const visibleLeft = 202 / 1024;
    const visibleRight = 815 / 1024;
    const visibleWidth = doorWidth * (visibleRight - visibleLeft);
    const leaf = makePlane(doorWidth, doorHeight, new THREE.MeshBasicMaterial({
      map: doorLeafTexture,
      color: 0xd6d8cf,
      transparent: true,
      alphaTest: 0.025,
      depthWrite: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    }), "2Dドア板_" + index);
    leaf.position.set(doorWidth * (0.5 - visibleLeft), doorHeight / 2, 0);

    const doorPivot = new THREE.Group();
    doorPivot.name = "2Dドア軸_" + index;
    doorPivot.position.set(wallX - 0.075, 0.04, z - visibleWidth / 2);
    doorPivot.rotation.y = -Math.PI / 2 - (index === 2 ? 0.65 : 0);
    doorPivot.add(leaf);
    scene.add(doorPivot);
  }
  for (const z of [-3, -9, -15, -21, -27, -33]) {
    addSideBackdrop(yardTexture, -1, z, 4.2, 2.36, 1.22, "2D夜の校庭");
    addWallCard(windowTexture, -1, z, 3.0, 1.5, 1.65, "2D窓枠");
  }
  addWallCard(doorLeafTexture, 0, -HALL_LENGTH + 0.03, 1.72, 2.58, 0.03, "2D奥のドア");

  const chair = makePlane(1.75, 1.16, new THREE.MeshBasicMaterial({
    map: chairTexture,
    color: 0xb8b8b0,
    transparent: true,
    alphaTest: 0.025,
    depthWrite: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  }), "2D倒れた椅子_廊下向き固定");
  chair.position.set(-1.55, 0.62, -4.0);
  scene.add(chair);

  const exit = makePlane(
    0.78,
    0.2,
    new THREE.MeshBasicMaterial({
      map: createFixtureTexture("rgba(186, 49, 39, 0.98)"),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
    "2D非常灯",
  );
  exit.rotation.y = Math.PI;
  exit.position.set(0, 3.08, -HALL_LENGTH + 0.06);
  scene.add(exit);

  const exitLight = new THREE.PointLight(0xa63d33, 2.4, 5.5, 2);
  exitLight.position.set(0, 3.0, -HALL_LENGTH + 0.25);
  scene.add(exitLight);
}

entry.addEventListener("click", () => {
  if (!assetsReady) return;
  inputActive = true;
  entry.hidden = true;
  canvas.focus();
  controls.lock();
});
canvas.addEventListener("pointerdown", (event) => {
  inputActive = true;
  dragLooking = true;
  lastPointer = { x: event.clientX, y: event.clientY };
  canvas.focus();
  canvas.setPointerCapture(event.pointerId);
});
window.addEventListener("pointermove", (event) => {
  if (!dragLooking || controls.isLocked) return;
  const deltaX = event.clientX - lastPointer.x;
  const deltaY = event.clientY - lastPointer.y;
  lastPointer = { x: event.clientX, y: event.clientY };
  camera.rotation.order = "YXZ";
  camera.rotation.y -= deltaX * 0.0026;
  camera.rotation.x = clamp(camera.rotation.x - deltaY * 0.0026, -1.05, 1.05);
});
window.addEventListener("pointerup", () => { dragLooking = false; });
window.addEventListener("pointercancel", () => { dragLooking = false; });
controls.addEventListener("lock", () => { entry.hidden = true; });
controls.addEventListener("unlock", () => {
  entry.hidden = previewMode;
  inputActive = previewMode;
  dragLooking = false;
});

window.addEventListener("keydown", (event) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
    event.preventDefault();
  }
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === "KeyB") toggleBump();
  if (event.code === "KeyF") {
    flashlightEnabled = !flashlightEnabled;
    setFlashlight(flashlightEnabled);
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => { keys.clear(); dragLooking = false; });

async function loadHallway() {
  try {
    const textures = await Promise.all([
      loadTexture("./assets/wall-source.png"),
      loadTexture("./assets/floor-wood.png"),
      loadTexture("./assets/door-frame.png"),
      loadTexture("./assets/door-leaf.png"),
      loadTexture("./assets/window-frame.png"),
      loadTexture("./assets/night-yard.png"),
      loadTexture("./assets/classroom-depth.png"),
      loadTexture("./assets/fallen-chair.png"),
    ]);
    for (const texture of textures) {
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.colorSpace = THREE.SRGBColorSpace;
    }

    buildHallway(textures);
    assetsReady = true;
    applyBumpMode();
    instruction.textContent = "クリックして歩き出す";
    if (previewMode) entry.hidden = true;
  } catch (error) {
    console.error("2D素材を読み込めませんでした", error);
    instruction.textContent = "素材を読み込めませんでした。サーバーから開き直してください。";
  }
}
loadHallway();

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

let previousTime = performance.now();
function frame(now) {
  const delta = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;
  const walking = movePlayer(delta);

  for (const [index, light] of ceilingLights.entries()) {
    if (light.userData.flicker) {
      const pulse = 0.86 + 0.14 * Math.sin((now / 1000) * (index === 1 ? 2.1 : 3.4));
      const dropout = Math.sin((now / 1000) * 7.3 + index * 3.7) > 0.995 ? 0.2 : 1;
      light.intensity = light.userData.baseIntensity * pulse * dropout;
    }
  }

  if (!walking && controls.isLocked) camera.position.y = 1.66;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
