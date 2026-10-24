import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { makeFloorReflection } from "../school-horror/floor-reflection.js";
import { createInterface } from "./ui.js";

const query = new URLSearchParams(location.search);
const flat = query.get("flat") === "1";
const canvas = document.querySelector("#world");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = !flat;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7b86ab);
if (!flat) scene.fog = new THREE.Fog(0x747fa3, 23, 82);
const camera = new THREE.PerspectiveCamera(62, 1, 0.055, 190);
camera.position.set(0.4, 1.68, 2);
camera.lookAt(0, 2.6, -30);
scene.add(camera);
const controls = new PointerLockControls(camera, canvas);
const ui = createInterface(document.querySelector("#root"), { preview: query.has("preview"), start: () => controls.lock() });
scene.add(new THREE.HemisphereLight(0xa3b7e4, 0x474131, 1.15));
scene.add(new THREE.AmbientLight(0xc8a790, 0.24));
const sunset = new THREE.DirectionalLight(0xffd2a2, 2.2);
sunset.position.set(-9, 16, -15); sunset.target.position.set(0, 0, -15);
sunset.castShadow = !flat;
sunset.shadow.mapSize.set(2048, 2048);
Object.assign(sunset.shadow.camera, { left: -25, right: 25, top: 32, bottom: -25, near: 0.1, far: 70 });
sunset.shadow.bias = -0.0002; sunset.shadow.normalBias = 0.025;
sunset.shadow.radius = 3;
scene.add(sunset, sunset.target);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(1280, 720), flat ? 0 : 0.22, 0.4, 1.1));
composer.addPass(new OutputPass());

function plane(width, height, material, parent = scene) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function material(map, options = {}) {
  if (flat) return new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, ...options });
  return new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: 0.87, ...options });
}
// 元画像の画素は変えず、指定領域の不透明部分をUVで切り出す。
function part(texture, box) {
  const { width, height } = texture.image;
  const sample = document.createElement("canvas"); sample.width = width; sample.height = height;
  const context = sample.getContext("2d", { willReadFrequently: true });
  context.drawImage(texture.image, 0, 0);
  const pixels = context.getImageData(0, 0, width, height).data;
  let [x0, y0, x1, y1] = box, a = x1, b = y1, c = x0, d = y0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (pixels[(y * width + x) * 4 + 3] < 180) continue;
    a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x + 1); d = Math.max(d, y + 1);
  }
  if (c <= a || d <= b) throw new Error("素材の領域が空です");
  const result = texture.clone();
  result.repeat.set((c - a) / width, (d - b) / height);
  result.offset.set(a / width, 1 - d / height); result.needsUpdate = true;
  result.userData.crop = { x: a, y: b, width: c - a, height: d - b };
  return result;
}
function cutout(map, glow = false) {
  const result = material(map, { alphaTest: 0.3 });
  if (glow && !flat) result.onBeforeCompile = shader => {
    // 窓の琥珀色だけを発光させる。窓の外を照らす光源は別に置く。
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `
      #include <emissivemap_fragment>
      float amber = smoothstep(0.22, 0.6, diffuseColor.r) *
        (1.0 - smoothstep(0.35, 0.65, diffuseColor.b / max(diffuseColor.g, 0.001)));
      totalEmissiveRadiance += diffuseColor.rgb * amber * 0.9;
    `);
  };
  return result;
}
function card(map, width, height, x, z, angle = 0, y = 0, parent = scene, glow = false) {
  const mesh = plane(width, height, cutout(map, glow), parent);
  mesh.position.set(x, y + height / 2, z); mesh.rotation.y = angle;
  mesh.castShadow = !flat; return mesh;
}
const lamps = [];
try {
  const loader = new THREE.TextureLoader();
  const [architecture, props, stone, distance] = await Promise.all(
    ["architecture", "props", "cobblestone", "distance"].map(name => loader.loadAsync(`./assets/${name}.png`)));
  for (const texture of [architecture, props, stone, distance]) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  const cottage = part(architecture, [0, 0, 790, 548]);
  const side = part(architecture, [935, 252, 1360, 536]);
  const redRoof = part(architecture, [1030, 125, 1310, 218]);
  const blueRoof = part(architecture, [340, 607, 475, 654]);
  const fascia = part(architecture, [945, 250, 1340, 271]);
  const inn = part(architecture, [0, 548, 790, 1024]);
  const canopy = part(architecture, [790, 548, 1536, 1024]);
  const gate = part(props, [0, 0, 760, 532]);
  const flowers = part(props, [770, 0, 1536, 532]);
  const lantern = part(props, [0, 532, 760, 1024]);
  const barrels = part(props, [770, 532, 1536, 1024]);

  const groundMap = stone.clone(); groundMap.wrapS = groundMap.wrapT = THREE.RepeatWrapping;
  groundMap.repeat.set(150, 150); groundMap.needsUpdate = true;
  const ground = plane(300, 300, material(groundMap, { color: 0x596557 }));
  ground.rotation.x = -Math.PI / 2; ground.position.z = -15;
  const laneMap = stone.clone(); laneMap.wrapS = laneMap.wrapT = THREE.RepeatWrapping;
  laneMap.repeat.set(3.5, 50); laneMap.needsUpdate = true;
  const laneMaterial = material(laneMap, flat ? {} : { roughness: 0.68, bumpMap: laneMap, bumpScale: 0.025 });
  const lane = plane(7, 100, laneMaterial); lane.rotation.x = -Math.PI / 2; lane.position.set(0, 0.013, -15);
  if (!flat && query.get("reflection") !== "0") {
    const reflection = makeFloorReflection(7, 100, laneMap, 0.55);
    reflection.material.uniforms.tileCount.value.copy(laneMap.repeat);
    reflection.position.z = -15; scene.add(reflection);
  }
  // 背景も固定した画像面。側方は城を含まない領域を使う。
  for (const [x, z, rotation, crop] of [[0, -95, 0, false], [-95, 0, Math.PI / 2, true], [95, 0, -Math.PI / 2, true], [0, 95, Math.PI, true]]) {
    const map = distance.clone();
    if (crop) { map.repeat.x = 0.32; map.needsUpdate = true; }
    const backgroundMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: map }, repeat: { value: map.repeat.clone() } },
      vertexShader: `varying vec2 backgroundUV; void main(){backgroundUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform sampler2D map; uniform vec2 repeat; varying vec2 backgroundUV;
        void main(){vec3 color=texture2D(map,backgroundUV*repeat).rgb;
          float alpha=smoothstep(0.0,0.24,1.0-backgroundUV.y)*smoothstep(0.0,0.10,backgroundUV.x)*smoothstep(0.0,0.10,1.0-backgroundUV.x)*smoothstep(0.24,0.34,backgroundUV.y);
          gl_FragColor=vec4(color,alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const background = plane(260, 104, backgroundMaterial);
    background.renderOrder = -10;
    background.position.set(x, 27, z); background.rotation.y = rotation;
  }
  // 山より手前に森の層を分け、街路の外周をつなぐ。
  const forestMaskCanvas = document.createElement("canvas"); forestMaskCanvas.width = 32; forestMaskCanvas.height = 256;
  const forestContext = forestMaskCanvas.getContext("2d");
  const forestFade = forestContext.createLinearGradient(0, 0, 0, 256);
  forestFade.addColorStop(0, "black"); forestFade.addColorStop(0.22, "white");
  forestContext.fillStyle = forestFade; forestContext.fillRect(0, 0, 32, 256);
  const forestMask = new THREE.CanvasTexture(forestMaskCanvas);
  for (const [x, z, angle] of [[0, -63, 0], [0, 63, Math.PI], [-63, 0, Math.PI / 2], [63, 0, -Math.PI / 2]]) {
    const forestMap = distance.clone(); forestMap.repeat.set(1, 0.27); forestMap.needsUpdate = true;
    const forest = plane(150, 11, new THREE.MeshBasicMaterial({ map: forestMap, alphaMap: forestMask, transparent: true, depthWrite: false }));
    forest.position.set(x, 5.5, z); forest.rotation.y = angle; forest.renderOrder = -5;
  }
  function house(x, z, angle, large = false) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = angle; scene.add(group);
    const width = large ? 9.0 : 7.0, height = large ? 5.6 : 6.8;
    const facade = card(large ? inn : cottage, width, height, 0, 0, 0, 0, group, true);
    card(large ? inn : cottage, width, height, 0, -4.9, Math.PI, 0, group, true);
    if (!large && query.get("recess") !== "0") {
      const maskCanvas = document.createElement("canvas"); maskCanvas.width = maskCanvas.height = 1024;
      const context = maskCanvas.getContext("2d"); context.fillStyle = "white"; context.fillRect(0, 0, 1024, 1024);
      const crop = cottage.userData.crop;
      const depth = query.get("recess") === "deep" ? 0.18 : 0.06;
      for (const [left, top, right, bottom] of [[263, 403, 306, 461], [518, 403, 560, 461], [393, 207, 434, 269]]) {
        const u = (left - crop.x) / crop.width, v = (top - crop.y) / crop.height;
        const uw = (right - left) / crop.width, vh = (bottom - top) / crop.height;
        const cx = u * 1024, cy = v * 1024, cw = uw * 1024, ch = vh * 1024;
        context.fillStyle = "black"; context.beginPath();
        context.moveTo(cx, cy + ch); context.lineTo(cx, cy + cw * 0.45);
        context.quadraticCurveTo(cx, cy, cx + cw / 2, cy);
        context.quadraticCurveTo(cx + cw, cy, cx + cw, cy + cw * 0.45);
        context.lineTo(cx + cw, cy + ch); context.closePath(); context.fill();
        const glassMap = architecture.clone();
        glassMap.repeat.set((right - left) / architecture.image.width, (bottom - top) / architecture.image.height);
        glassMap.offset.set(left / architecture.image.width, 1 - bottom / architecture.image.height); glassMap.needsUpdate = true;
        const w = uw * width, h = vh * height, px = (u + uw / 2 - 0.5) * width, py = (1 - v - vh / 2) * height;
        const glass = plane(w, h, cutout(glassMap, true), group); glass.position.set(px, py, -depth);
        const edgeMaterial = material(redRoof, { color: 0x5e4936,
          ...(!flat ? { emissive: 0xffa45e, emissiveIntensity: 0.08 } : {}) });
        for (const sign of [-1, 1]) {
          const edge = plane(depth, h, edgeMaterial, group);
          edge.rotation.y = Math.PI / 2; edge.position.set(px + sign * w / 2, py, -depth / 2);
        }
        const sill = plane(w, depth, edgeMaterial, group); sill.rotation.x = -Math.PI / 2;
        sill.position.set(px, py - h / 2, -depth / 2);
      }
      facade.material.alphaMap = new THREE.CanvasTexture(maskCanvas); facade.material.needsUpdate = true;
    }
    for (const sign of [-1, 1]) {
      card(side, 4.9, height * 0.535, sign * width * 0.36, -2.0, sign * Math.PI / 2, 0, group, true);
      // 屋根は画像を貼った傾斜面。側面画像の煙突を重ねない。
      const roof = plane(1, 1, material(large ? blueRoof : redRoof), group);
      const edge = sign * width * 0.48;
      const vertices = roof.geometry.attributes.position;
      vertices.setXYZ(0, edge, height * 0.55, -0.3);
      vertices.setXYZ(1, 0, height * 0.88, -0.3);
      vertices.setXYZ(2, edge, height * 0.55, -4.9);
      vertices.setXYZ(3, 0, height * 0.88, -4.9);
      roof.geometry.computeVertexNormals(); roof.geometry.computeBoundingSphere(); roof.castShadow = !flat;
      card(fascia, 4.9, 0.14, edge, -2.6, sign * Math.PI / 2, height * 0.55 - 0.14, group);
    }
    const awning = card(canopy, 2.0, 0.65, 0, 0.55, 0, 1.68, group);
    awning.rotation.x = -0.3;
    const storage = card(barrels, 1.25, 0.95, width * 0.32, 0.48, -0.25, 0, group);
    storage.receiveShadow = true;
    card(lantern, 0.85, 1.05, -width * 0.32, 0.48, 0, 1.8, group, true);
    const light = new THREE.PointLight(0xffb75c, flat ? 0 : 22, 9, 2);
    light.position.set(-width * 0.32 + 0.18, 2.18, 0.85);
    light.castShadow = !flat && lamps.length < 2;
    light.shadow.mapSize.set(512, 512); light.shadow.bias = -0.0003;
    light.shadow.normalBias = 0.02;
    group.add(light); lamps.push(light);
    // 画像に描かれた窓にも、同じ場所の道を照らす暖色の光を置く。
    const windowLight = new THREE.SpotLight(0xffbf79, flat ? 0 : 26, 7, 1.05, 0.8, 2);
    windowLight.position.set(width * 0.24, 1.5, 0.15);
    windowLight.target.position.set(width * 0.24, 0.1, 3.5);
    group.add(windowLight, windowLight.target);
  }
  house(-5.7, -6.5, 0.12);
  house(6.3, -13, -0.17, true);
  house(-5.6, -21, 0.07, true);
  house(5.8, -29, -0.14);
  house(-7.5, -38, 0.25);
  house(-5.9, 8, Math.PI - 0.1);
  house(6.4, 14, Math.PI + 0.14, true);

  for (let i = 0; i < 22; i++) {
    const sign = i % 2 ? 1 : -1;
    const x = sign * (2.65 + (i % 3) * 0.2), z = -1.5 - i * 1.8;
    const height = 0.5 + (i % 4) * 0.13;
    card(flowers, height * 1.6, height, x, z, sign * 0.3, 0);
    // 草の房の奥を固定した別の画像面へ分ける。
    if (query.get("layers") !== "0") {
      card(flowers, height * 1.3, height * 0.86, x + sign * 0.12, z - 0.12, sign * 1.0, 0);
      card(flowers, height * 1.2, height * 0.80, x - sign * 0.08, z - 0.18, -sign * 0.9, 0);
    }
  }
  card(gate, 8.8, 6.6, 0, -34, 0, 0);
  if (query.get("layers") !== "0") card(gate, 8.8, 6.6, 0, -34.32, 0, 0);
  for (const x of [-2.9, 2.9]) {
    const magic = new THREE.PointLight(0x77c7ff, flat ? 0 : 12, 7, 2);
    magic.position.set(x, 2.4, -33.5); scene.add(magic);
  }
  // 点も2Dの小さな光の絵として描く。位置を固定し、首振りへ追随させない。
  const positions = [];
  for (let i = 0; i < 46; i++) positions.push(Math.sin(i * 17.23) * 2.8, 0.3 + (i % 9) * 0.24, -2 - (i * 3.31) % 37);
  const motes = new THREE.BufferGeometry(); motes.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const moteMaterial = new THREE.PointsMaterial({ color: 0xffdaa0, size: 0.035, transparent: true, opacity: 0.62, depthWrite: false });
  moteMaterial.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_particle_fragment>", `
      #include <map_particle_fragment>
      diffuseColor.a *= 1.0-smoothstep(0.1,0.5,length(gl_PointCoord-0.5));
      if(diffuseColor.a<0.01) discard;
    `);
  };
  scene.add(new THREE.Points(motes, moteMaterial));
  // 今回の遮蔽物と影を落とす光源は固定。カメラ移動だけでは影を作り直さない。
  renderer.shadowMap.needsUpdate = true;
  ui.ready();
} catch (error) { console.error("街路の読み込みに失敗", error); ui.fail(); }

const shots = {
  entrance: [[0.4, 1.68, 2], [0, 2.6, -30]],
  street: [[-0.7, 1.68, -9], [1.1, 2.6, -24]],
  house: [[0.8, 1.68, -2.5], [-4.8, 2.8, -7]],
  window: [[-1.3, 1.65, -4.2], [-4.4, 1.4, -6.4]],
  gate: [[0.25, 1.68, -25], [0, 3.0, -34]],
  reverse: [[1.1, 1.68, -18], [-2, 2.6, -4]],
};
if (shots[query.get("shot")]) { const [position, target] = shots[query.get("shot")]; camera.position.fromArray(position); camera.lookAt(...target); }
let dragging = false, lastX = 0, lastY = 0;
const keys = new Set();
const handLight = new THREE.PointLight(0xffce84, 0, 7, 2); handLight.position.set(0.25, -0.35, -0.25); camera.add(handLight);
canvas.addEventListener("pointerdown", event => { ui.activate(); dragging = true; lastX = event.clientX; lastY = event.clientY; canvas.setPointerCapture(event.pointerId); });
window.addEventListener("pointermove", event => {
  if (!dragging || controls.isLocked) return;
  camera.rotation.reorder("YXZ");
  camera.rotation.y -= (event.clientX - lastX) * 0.0026;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - (event.clientY - lastY) * 0.0026, -1.1, 1.1);
  lastX = event.clientX; lastY = event.clientY;
});
window.addEventListener("pointerup", () => { dragging = false; });
window.addEventListener("keydown", event => { keys.add(event.code); if (event.code.startsWith("Arrow")) event.preventDefault(); if (!event.repeat && event.code === "KeyF") handLight.intensity = handLight.intensity ? 0 : 12; });
window.addEventListener("keyup", event => keys.delete(event.code));
window.addEventListener("blur", () => { keys.clear(); dragging = false; });
controls.addEventListener("unlock", () => { ui.unlock(); keys.clear(); });
function resize() { renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
window.addEventListener("resize", resize); resize();
let previous = performance.now(), walked = 0;
function frame(now) {
  const dt = Math.min((now - previous) / 1000, 0.05); previous = now;
  const forward = Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown"));
  const right = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
  if (ui.active && (forward || right)) {
    const old = camera.position.clone(), speed = 2.5 * dt / Math.hypot(forward, right);
    controls.moveForward(forward * speed); controls.moveRight(right * speed);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -2.1, 2.1);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -38, 4);
    if (Math.abs(camera.position.z + 34) < 0.6 && Math.abs(camera.position.x) > 1.7) camera.position.copy(old);
    walked += dt * 7; camera.position.y = 1.68 + Math.sin(walked) * 0.012;
  }
  if (!query.has("still")) lamps.forEach((light, i) => { light.intensity = flat ? 0 : 22 * (0.98 + 0.02 * Math.sin(now * 0.002 + i)); });
  composer.render(); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
