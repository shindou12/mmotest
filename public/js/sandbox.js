// 見た目の箱庭（sandbox.html）: ゲームの既存アセット（地面・草・木・岩・花・町の家並み・キャラ・敵）を小さな場所に並べ、
// 陰影の段・輪郭・光・霧・Bloom・配色をその場で切り替えて見比べる。ゲーム本体には影響しない（ここで作る値はどこにも保存しない）
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FLOORS } from '../shared/data.js';
import { Batch, outlineMat } from './toon.js';
import { makePlayer, setPlayerWeapon, setPlayerArmor, makeMob, animatePlayer, animateMob } from './models.js';
import { makeProp } from './env/props.js';
import { buildTown } from './env/open.js';
import { makeSky, makeGrass } from './env/landmarks.js';
import { seeded, local, I } from './env/kit.js';
import { loadManifest, placeExternal } from './sandbox-external.js';
import { REGIONS, CLASSES, PATTERN_NAMES, paletteTexture, paletteRows, patternAtlas, makeStyleUniforms, styledToon, addRim, tagGeometry } from './sandbox-style.js';

// ---- 描画の土台（ゲームの render.js と同じ組み方） ----
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 900);
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 150 }); sun.shadow.bias = -0.0005;
sun.position.set(30, 60, 20); scene.add(sun, sun.target);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.45, 0.95); composer.addPass(bloom);
composer.addPass(new OutputPass());
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 6); controls.maxPolarAngle = Math.PI * 0.48;
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });

// ---- 見た目の設定（3つのたたき台。どれも数値だけで、モデルには手を入れない） ----
const PRESETS = {
  '現行': { steps: 4, shadow: 70, outline: 1, outlineColor: '#17121f', hemi: 1.0, sun: 1.0, warm: 0, exposure: 1.0, fog: 1.0, bloom: 0.5, sat: 1.0 },
  '陰影強め': { steps: 3, shadow: 40, outline: 1.4, outlineColor: '#2a1a14', hemi: 0.75, sun: 1.25, warm: 0.35, exposure: 0.95, fog: 0.8, bloom: 0.35, sat: 0.9 },
  'ミニマル': { steps: 2, shadow: 110, outline: 0.7, outlineColor: '#3a3448', hemi: 1.2, sun: 0.85, warm: 0.1, exposure: 1.05, fog: 1.3, bloom: 0.15, sat: 1.1 },
};
const S = { extToon: true, floor: 1, view: 'game', spot: 'town', anim: 'idle', shadows: true, look: 'now', region: 0, patStr: 1, rim: 0, ...PRESETS['現行'] };
// 質感の試作（A 配色画像 / B パターン画像 / 縁の明かり）: sandbox-style.js
const PAL = paletteTexture(), ATLAS = patternAtlas(), U = makeStyleUniforms(PAL, ATLAS.tex);
// ゲームのカメラで見る場所（町の中・町の外れ・林の中）
const SPOTS = { ext: [-22, 30, 1.0], town: [-4.5, 8, 1.3], edge: [0, 22, 1.3], woods: [20, 26, 1.3], close: [12, 12, 0.6] };

// トゥーンの段: 段数と、いちばん暗い段の明るさ
function makeGradient(steps, dark) {
  const n = Math.max(2, steps), data = new Uint8Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.round(dark + (255 - dark) * (i / (n - 1)) ** 0.9);
  const tex = new THREE.DataTexture(data, n, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
  return tex;
}

// ---- 箱庭の中身: 中央に町の一角（家並み・街灯・露店）、外側に林・岩場・花畑、人と敵を少し ----
let world = null, actors = [], grass = null;
function build() {
  if (world) { scene.remove(world); world.traverse((o) => { o.geometry?.dispose?.(); }); }
  world = new THREE.Group(); actors = [];
  const fdef = { ...FLOORS[S.floor - 1], n: S.floor }, R = seeded(1234 + S.floor);
  world.add(makeSky(fdef, false));
  // 地面（なだらかな起伏と2色のまだら）
  const geo = new THREE.CircleGeometry(60, 96); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3), c1 = new THREE.Color(fdef.ground), c2 = new THREE.Color(fdef.ground2), tmp = new THREE.Color();
  const hAt = (x, z) => Math.max(0, Math.hypot(x, z) - 22) * 0.08 * (1 + Math.sin(x * 0.2) * 0.3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, hAt(x, z));
    tmp.copy(c1).lerp(c2, 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2) * Math.cos(z * 0.09));
    if (Math.hypot(x, z) < 16) tmp.lerp(new THREE.Color(0x9a958a), 0.55); // 町の石畳
    cols.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.computeVertexNormals();
  tagGeometry(geo, true);
  const ground = new THREE.Mesh(geo, styledToon(U, makeGradient(4, 70)));
  ground.receiveShadow = true; world.add(ground);
  // 町の一角: ゲームの町と同じ家並み・街灯・露店
  const B = new Batch(), anims = [];
  const townDef = { id: 'sandbox_town', type: 'town', R: 24, ell: [1, 1], wob: 0.05, npcs: [{ x: -4, z: 6, color: '#c0504a' }, { x: 5, z: -4, color: '#5aa060' }] };
  buildTown(B, townDef, R, hAt, anims, world);
  // 外側の自然: 林・岩場・花畑（階の配色の木・岩・花）
  const P = Object.fromEntries(fdef.props.map((p) => [p[0], p]));
  const put = (type, x, z, s) => { const p = P[type] || fdef.props[0]; makeProp(B, type in P ? type : p[0], local(I, x, hAt(x, z), z, 0, R() * 6.28, 0, s), R, p[2], p[3], fdef); };
  const kinds = fdef.props.map((p) => p[0]);
  for (let g = 0; g < 7; g++) {
    const a = g / 7 * Math.PI * 2 + 0.3, d = 30 + R() * 8, cx = Math.sin(a) * d, cz = Math.cos(a) * d;
    for (let i = 0; i < 9; i++) put(kinds[0], cx + (R() - 0.5) * 10, cz + (R() - 0.5) * 10, 0.8 + R() * 0.7);
  }
  for (let g = 0; g < 4; g++) {
    const a = g / 4 * Math.PI * 2 + 1.0, d = 25 + R() * 4, cx = Math.sin(a) * d, cz = Math.cos(a) * d;
    for (let i = 0; i < 4; i++) put(kinds[1] ?? 'rock', cx + (R() - 0.5) * 5, cz + (R() - 0.5) * 5, i ? 0.7 + R() * 0.5 : 1.8);
  }
  for (let g = 0; g < 3; g++) {
    const a = g / 3 * Math.PI * 2 + 2.2, d = 23, cx = Math.sin(a) * d, cz = Math.cos(a) * d;
    for (let i = 0; i < 70; i++) put(kinds[2] ?? kinds[0], cx + (R() - 0.5) * 7, cz + (R() - 0.5) * 7, 1 + R() * 0.4);
  }
  const built = B.build();
  // まとめ描きの木・岩・家にも素材の種類を付けて、質感の試作を掛けられるようにする
  built.traverse((o) => { if (o.isMesh && o.material?.isMeshToonMaterial && o.material.vertexColors && o.geometry.attributes.color) { tagGeometry(o.geometry, false); o.material = styledToon(U, makeGradient(4, 70)); } });
  world.add(built);
  grass = makeGrass(fdef, 58, hAt, R, (x, z) => Math.hypot(x, z) < 20, 1, 58);
  if (grass) world.add(grass.mesh);
  // 人（大きさの目安）と敵
  const looks = [['sword', 5, 0x448a9b], ['greatsword', 6, 0xb0483a], ['spear', 4, 0x6a8a3a], ['bow', 1, 0x8a6ad0]];
  looks.forEach(([wk, armor, col], i) => {
    const m = makePlayer(col); setPlayerWeapon(m, wk, 2 + i); setPlayerArmor(m, armor);
    m.position.set(-4.5 + i * 3, 0, 8); m.rotation.y = 0.3; world.add(m); actors.push({ m, player: true, wk, i });
  });
  fdef.mobs.slice(0, 3).forEach((md, i) => { const m = makeMob(md.t, md.color, 1, null); m.position.set(-4 + i * 4, hAt(-4 + i * 4, 20), 20); m.rotation.y = Math.PI; world.add(m); actors.push({ m, i }); });
  const b = fdef.boss, boss = makeMob(b.t, b.color, b.scale * 0.8, b.accent, true, b.appearance);
  boss.position.set(0, hAt(0, -28), -28); world.add(boss); actors.push({ m: boss, boss: true, i: 9 });
  world.userData.anims = anims;
  scene.add(world);
  showExternal();
  apply();
}

// ---- 設定を画面へ反映 ----
const baseFog = () => FLOORS[S.floor - 1];
function apply() {
  const fd = baseFog(), grad = makeGradient(S.steps, S.shadow);
  const oc = new THREE.Color(S.outlineColor).getHex();
  scene.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const m of [].concat(o.material)) if (m.isMeshToonMaterial) { m.gradientMap = grad; addRim(m, U); m.needsUpdate = true; }
    if (o.userData.noOutline && o.material.side === THREE.BackSide && o.material.isMeshBasicMaterial) {
      o.visible = S.outline > 0.05;
      if (o.visible) o.material = outlineMat(Math.round(S.outline * 10) / 10, oc);
    }
  });
  const sunC = new THREE.Color(fd.sun).lerp(new THREE.Color(0xffb070), S.warm);
  hemi.color.set(fd.hemi[0]); hemi.groundColor.set(fd.hemi[1]).lerp(new THREE.Color(0x3a2a4a), S.warm * 0.5);
  hemi.intensity = 1.1 * S.hemi; sun.intensity = fd.sunI * S.sun; sun.color.copy(sunC); sun.castShadow = S.shadows;
  scene.fog = new THREE.Fog(fd.fog, fd.fogNear * S.fog, fd.fogFar * S.fog);
  renderer.toneMappingExposure = S.exposure;
  bloom.strength = S.bloom;
  renderer.domElement.style.filter = S.sat === 1 ? '' : `saturate(${S.sat})`;
  U.uPalOn.value = S.look === 'now' ? 0 : 1; U.uPatOn.value = S.look === 'ab' ? 1 : 0;
  U.uRegion.value = S.region; U.uPatStr.value = S.patStr; U.uRim.value = S.rim;
  U.uRimC.value.set(fd.hemi[0]);
  // 草（別描きの葉）も配色に寄せる
  if (grass) grass.mesh.material.color.set(S.look === 'now' ? 0xffffff : [0xffffff, 0x9ab4a4, 0xe8d49a, 0xd8b898][S.region]);
}

// ---- 操作盤 ----
const ui = document.getElementById('ui');
function row(label, key, min, max, step) {
  const d = document.createElement('div'); d.className = 'row';
  d.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
  const inp = d.querySelector('input'), out = d.querySelector('output');
  const sync = () => { inp.value = S[key]; out.textContent = S[key]; };
  inp.oninput = () => { S[key] = +inp.value; out.textContent = S[key]; apply(); };
  sync(); ui.append(d); return sync;
}
function buttons(items, cur, on) {
  const d = document.createElement('div'); d.className = 'btns';
  const bs = items.map(([label, v]) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { on(v); bs.forEach((x, i) => x.classList.toggle('on', items[i][1] === v)); }; d.append(b); return b; });
  bs.forEach((x, i) => x.classList.toggle('on', items[i][1] === cur()));
  ui.append(d);
}
const h = (tag, text) => { const e = document.createElement(tag); e.textContent = text; ui.append(e); };
const syncs = [];
h('h1', '見た目の箱庭');
h('h2', 'たたき台');
buttons(Object.keys(PRESETS).map((k) => [k, k]), () => '現行', (k) => { Object.assign(S, PRESETS[k]); syncs.forEach((f) => f()); apply(); });
h('h2', '場所（階の配色）');
buttons([['1層 草原', 1], ['2層 霧の森', 2], ['3層 砂漠', 3]], () => S.floor, (v) => { S.floor = v; build(); });
h('h2', '視点');
buttons([['ゲームのカメラ', 'game'], ['自由に回す', 'free']], () => S.view, (v) => { S.view = v; });
buttons([['町の中', 'town'], ['町の外れ', 'edge'], ['林', 'woods'], ['寄る', 'close'], ['外部モデル', 'ext']], () => S.spot, (v) => { S.spot = v; S.view = 'game'; });
h('h2', 'キャラの動き');
buttons([['待機', 'idle'], ['歩き', 'walk'], ['攻撃', 'attack']], () => S.anim, (v) => { S.anim = v; });
h('h2', '質感（A 配色画像・B パターン画像）');
buttons([['今のまま', 'now'], ['A', 'a'], ['A＋B', 'ab']], () => S.look, (v) => { S.look = v; apply(); });
buttons(REGIONS.map((r, i) => [r, i]), () => S.region, (v) => { S.region = v; apply(); });
syncs.push(row('模様の強さ', 'patStr', 0, 2, 0.05), row('縁の明かり', 'rim', 0, 1.5, 0.05));
{ // 配色画像と模様の見本
  const box = document.createElement('div'); box.style.cssText = 'display:grid;grid-template-columns:1fr;gap:6px;margin:6px 0';
  const pal = document.createElement('canvas'); pal.width = CLASSES.length * 16; pal.height = paletteRows.length * 14; pal.style.cssText = 'width:100%;image-rendering:pixelated;border-radius:4px';
  const g = pal.getContext('2d');
  paletteRows.forEach((row, y) => row.slice(0, CLASSES.length).forEach((hex, x) => { g.fillStyle = hex ? '#' + hex.toString(16).padStart(6, '0') : '#444'; g.fillRect(x * 16, y * 14, 16, 14); }));
  const cap = document.createElement('div'); cap.style.cssText = 'color:var(--sub);font-size:11px'; cap.textContent = `配色画像: 行=場所（${REGIONS.join('・')}）/ 列=${CLASSES.join('・')}`;
  const atl = ATLAS.canvas; atl.style.cssText = 'width:100%;border-radius:4px';
  const cap2 = document.createElement('div'); cap2.style.cssText = 'color:var(--sub);font-size:11px'; cap2.textContent = `模様: ${PATTERN_NAMES.join('・')}`;
  box.append(pal, cap, atl, cap2); ui.append(box);
}
h('h2', '外部モデル（assets/models/manifest.json）');
const extInfo = document.createElement('div'); extInfo.style.cssText = 'color:var(--sub);font-size:11px'; extInfo.textContent = '読み込み中…'; ui.append(extInfo);
buttons([['トゥーン化', true], ['元の質感', false]], () => S.extToon, (v) => { S.extToon = v; showExternal(); });
h('h2', '陰影');
syncs.push(row('段の数', 'steps', 2, 6, 1), row('影の明るさ', 'shadow', 0, 160, 5));
h('h2', '輪郭線');
syncs.push(row('太さ', 'outline', 0, 3, 0.1));
buttons([['ほぼ黒', '#17121f'], ['焦げ茶', '#2a1a14'], ['紺', '#18203a'], ['紫灰', '#3a3448']], () => S.outlineColor, (v) => { S.outlineColor = v; apply(); });
h('h2', '光と空気');
syncs.push(row('空の光', 'hemi', 0.3, 1.8, 0.05), row('太陽', 'sun', 0.3, 1.8, 0.05), row('暖かさ', 'warm', 0, 1, 0.05), row('露出', 'exposure', 0.6, 1.5, 0.05), row('霧の距離', 'fog', 0.3, 2.5, 0.05), row('Bloom', 'bloom', 0, 1.5, 0.05), row('彩度', 'sat', 0.4, 1.6, 0.05));
buttons([['影あり', true], ['影なし', false]], () => S.shadows, (v) => { S.shadows = v; apply(); });

// ---- 毎フレーム ----
const clock = new THREE.Clock(), fpsEl = document.getElementById('fps');
let frames = 0, fpsT = 0;
function loop() {
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  frames++; fpsT += dt; if (fpsT > 0.5) { fpsEl.textContent = `${Math.round(frames / fpsT)} fps`; frames = 0; fpsT = 0; }
  for (const a of actors) {
    if (a.player) {
      const swing = S.anim === 'attack' ? ((t * 1.6 + a.i * 0.3) % 1) : -1;
      animatePlayer(a.m, { t, moving: S.anim === 'walk', walkT: t, kind: a.wk, combo: Math.floor(t * 1.6) % 3, swing, spin: -1, sweep: -1, dodge: 0, down: 0, hurt: 0, motion: '' });
    } else animateMob(a.m, { t: t + a.i, st: S.anim === 'walk' ? 1 : 0, flash: 0, enraged: false });
  }
  for (const f of world?.userData.anims || []) f(t);
  if (grass) grass.U.uTime.value = t;
  if (S.view === 'game') {
    // ゲームと同じ見下ろし（ズーム 1.3 相当）。自キャラの位置を見る
    const [fx, fz, zoom] = SPOTS[S.spot], pitch = 0.62 + 0.3 * ((zoom - 0.55) / 1.05), dist = 19.5 * zoom;
    camera.position.set(fx, 1.2 + Math.sin(pitch) * dist, fz + Math.cos(pitch) * dist); camera.lookAt(fx, 1.2, fz);
    controls.target.set(fx, 1.2, fz);
  } else controls.update();
  composer.render();
  requestAnimationFrame(loop);
}
build();
loop();
window.sandbox = { S, apply, build, PRESETS }; // 確認用

// 外部モデルの列（町の外れ、南西）。manifest がなければ何も置かない
var extGroup = null, manifest; // var: build() がこの行より先に呼ぶため
async function showExternal() {
  if (manifest === undefined) manifest = await loadManifest();
  if (extGroup) { extGroup.parent?.remove(extGroup); extGroup = null; }
  if (!manifest) { extInfo.textContent = 'まだありません（public/assets/models/ に GLB と manifest.json を置くと、町の外れに並びます）'; return; }
  extGroup = await placeExternal(manifest, { toon: S.extToon, gradientMap: makeGradient(S.steps, S.shadow) });
  world.add(extGroup);
  extInfo.textContent = `${manifest.source ?? ''} ${manifest.items.length}点（視点「外部モデル」で見る）`;
  apply();
}
