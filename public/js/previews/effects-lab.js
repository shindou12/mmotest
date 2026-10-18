// エフェクトの見比べ（effects-lab.html）: 現行と案（アニメ調・派手・A+B）の4画面に、同じ場面を同じ時間で流す。?c で控えめ（C）も見られる
// 場面はゲームの呼び方そのまま（fx.slash / ringWave / parts.burst / lightning / waveMesh / 予兆）。ゲーム本体には影響しない
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FX, makeTelegraph } from '../fx.js';
import { FX_STYLES, StyledFX } from '../fx-styles.js';
import { makePlayer, setPlayerWeapon, makeMob, animatePlayer, animateMob } from '../models.js';

const COLOR = 0xb070ff; // 武器の色（レアリティの色の代わり）
const LIGHT = 0xa8e4ff, GOLD = 0xffd84a, RED = 0xff3a3a;
const DUMMY = { x: 0, z: 3.2 };

// 場面: [始まり, 終わり, 名前]。時間はループの中の秒
const SCENES = [
  [0, 1.7, '通常攻撃3段（2段目は会心）'],
  [1.7, 3.6, '溜め → 強攻撃（兜割り）'],
  [3.6, 4.5, '光波'],
  [4.5, 5.3, '会心の落雷'],
  [5.3, 6.5, '回転斬り（サイクロン）'],
  [6.5, 8.4, 'ボスの予兆 → 着弾'],
];
const LOOP = SCENES.at(-1)[1];

// その時刻に起きること（エフェクトの呼び出し）。at: 起きる時刻 / run(fx): 4画面それぞれの FX で呼ぶ
const hit = (fx, crit) => { fx.parts.burst(DUMMY.x, 1.2, DUMMY.z, crit ? 18 : 8, { color: crit ? GOLD : COLOR, speed: crit ? 9 : 6, size: crit ? 0.5 : 0.35, life: 0.4 }); if (crit) fx.flash(DUMMY.x, 1.2, DUMMY.z, GOLD, 20, 0.2); };
const EVENTS = [
  ...[0, 0.55, 1.1].map((t, i) => ({ at: t + 0.06, run: (fx) => { fx.slash(0, 0, 0, 3.4, 160, COLOR, 1.0, i % 2 === 1); } })),
  ...[0, 0.55, 1.1].map((t, i) => ({ at: t + 0.12, run: (fx) => hit(fx, i === 1) })),
  { at: 2.6, run: (fx) => { fx.slash(0, 0, 0, 4.2, 90, COLOR, 2.2); fx.flash(0, 1.5, 0, COLOR, 30, 0.3); } },
  { at: 2.72, run: (fx) => {
    fx.ringWave(DUMMY.x, DUMMY.z - 0.2, COLOR, 4.8, 0.4);
    fx.parts.burst(DUMMY.x, 0.3, DUMMY.z - 0.2, 40, { color: 0xc8b090, speed: 7, size: 0.5, life: 0.6, up: 2 });
    hit(fx, true);
  } },
  { at: 3.65, run: (fx, v) => { v.wave(fx); fx.flash(0, 1.5, 0, LIGHT, 35, 0.3); } },
  { at: 4.6, run: (fx) => { fx.lightning(DUMMY.x, DUMMY.z); hit(fx, true); } },
  ...[0, 1, 2].map((i) => ({ at: 5.4 + i * 0.15, run: (fx) => { fx.slash(0, 0, i * 2.1, 4.6, 200, COLOR, 1.0, i % 2 === 1); fx.ringWave(0, 0, COLOR, 4.6, 0.3); } })),
  { at: 6.6, run: (fx, v) => v.tele(fx) },
  { at: 7.8, run: (fx) => {
    fx.ringWave(DUMMY.x, DUMMY.z, RED, 4, 0.45);
    fx.parts.burst(DUMMY.x, 0.4, DUMMY.z, 50, { color: 0xff7a4a, speed: 8, size: 0.6, life: 0.6, up: 2 });
    fx.flash(DUMMY.x, 1, DUMMY.z, 0xff6a3a, 40, 0.3);
  } },
];

// 自キャラの動き（その時刻の姿勢）
function pose(t) {
  for (const [i, s] of [0, 0.55, 1.1].entries()) if (t >= s && t < s + 0.5) return { swing: (t - s) / 0.5, combo: i };
  if (t >= 1.7 && t < 2.6) { const c = (t - 1.7) / 0.9; return { charging: true, charge: c, swing: c > 0.25 ? 0.02 : -1 }; }
  if (t >= 2.6 && t < 3.1) return { heavy: true, swing: (t - 2.6) / 0.5, combo: 2 };
  if (t >= 3.6 && t < 4.05) return { swing: (t - 3.6) / 0.45, combo: 2 };
  if (t >= 5.3 && t < 5.85) return { spin: (t - 5.3) / 0.55 };
  return {};
}

// ---- 4画面 ----
const grid = document.getElementById('grid');
const SHOWN = ['anime', 'flashy', new URLSearchParams(location.search).has('c') ? 'subtle' : 'blend'];
const panels = [['現行', null], ...SHOWN.map((k) => [FX_STYLES[k].name, k])].map(([label, key]) => makePanel(label, key));

function makePanel(label, key) {
  const cell = document.createElement('div'); cell.className = 'cell';
  const canvas = document.createElement('canvas'); const cap = document.createElement('div'); cap.className = 'cap'; cap.textContent = label;
  cell.append(canvas, cap); grid.append(cell);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x5d8a4a);
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x3a5a2a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2); sun.position.set(6, 12, 4); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: 0x4c8a3a })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 11, -8.5); camera.lookAt(0, 0.8, 2.2); // ゲームと同じく斜め上から（自キャラの後ろ寄り）
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), key ? FX_STYLES[key].bloom : 0.5, 0.45, 0.95));
  composer.addPass(new OutputPass());
  const fx = key ? new StyledFX(scene, key) : new FX(scene);
  const player = makePlayer('#448a9b'); setPlayerWeapon(player, 'greatsword', 4, 0); scene.add(player);
  const dummy = makeMob('knight', 0x8a6a40); dummy.position.set(DUMMY.x, 0, DUMMY.z); dummy.rotation.y = Math.PI; scene.add(dummy);
  const P = { cell, renderer, composer, camera, scene, fx, player, dummy, waves: [], teles: [] };
  // 光波（飛んでいく）と予兆（1.2秒で満ちる）
  P.wave = (f) => { const m = f.waveMesh(LIGHT); m.position.set(0, 1, 0.5); P.waves.push({ m, t: 0 }); };
  P.tele = () => { const g = makeTelegraph({ k: 'circle', x: DUMMY.x, z: DUMMY.z, r: 3 }, RED); scene.add(g); P.teles.push({ g, t: 0 }); };
  return P;
}

function resize() {
  for (const P of panels) {
    const w = P.cell.clientWidth, h = P.cell.clientHeight;
    P.renderer.setSize(w, h, false); P.composer.setSize(w, h); P.camera.aspect = w / h; P.camera.updateProjectionMatrix();
  }
}
addEventListener('resize', resize); resize();

// ---- 時間を進める ----
let time = 0, speed = 1, only = -1; // only: 1つの場面だけを繰り返す（-1 は全部）
const range = () => (only < 0 ? [0, LOOP] : SCENES[only].slice(0, 2));
function step(dt) {
  const [t0, t1] = range();
  let next = time + dt;
  if (next >= t1 || time < t0) { next = t0; time = t0 - 1e-6; }
  for (const e of EVENTS) if (e.at > time && e.at <= next) for (const P of panels) e.run(P.fx, P);
  time = next;
  const s = pose(time);
  for (const P of panels) {
    animatePlayer(P.player, { t: time, moving: false, walkT: 0, kind: 'greatsword', combo: 0, swing: -1, spin: -1, sweep: -1, dodge: 0, down: 0, hurt: 0, motion: '', ...s });
    if (s.spin >= 0) P.player.rotation.y = s.spin * Math.PI * 4; else P.player.rotation.y = 0;
    animateMob(P.dummy, { t: time, st: 0, flash: 0, enraged: false });
    P.player.updateMatrixWorld();
    if (P.player.userData.weaponModel) P.fx.swordTrail(P.player.userData.weaponModel, s.swing >= 0 && s.swing < 0.6 && !s.charging || s.spin >= 0, COLOR, dt);
    for (const w of P.waves) { w.t += dt; w.m.position.z = 0.5 + w.t * 22; }
    P.waves = P.waves.filter((w) => { if (w.t < 0.6) return true; P.fx.dispose(w.m); return false; });
    for (const T of P.teles) { T.t += dt; T.g.setProgress(Math.min(1, T.t / 1.2)); }
    P.teles = P.teles.filter((T) => { if (T.t < 1.2) return true; P.fx.dispose(T.g); return false; });
    P.fx.update(dt);
  }
  document.getElementById('now').textContent = SCENES.find(([a, b]) => time >= a && time < b)?.[2] || '';
}
const render = () => { for (const P of panels) P.composer.render(); };

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  step(dt * speed); render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- 操作 ----
const nav = document.getElementById('scenes');
const sceneBtns = [['すべて', -1], ...SCENES.map((s, i) => [s[2], i])].map(([label, i]) => {
  const b = document.createElement('button'); b.textContent = label;
  b.onclick = () => { only = i; time = range()[0] - 1e-6; sceneBtns.forEach((x) => x.classList.toggle('on', x === b)); };
  nav.append(b); return b;
});
sceneBtns[0].classList.add('on');
const slow = document.getElementById('slow');
slow.onclick = () => { speed = speed === 1 ? 0.25 : 1; slow.classList.toggle('on', speed < 1); };

// 画像の記録用: ある時刻まで 1/60 秒ずつ進めて止める
window.__seek = (t) => { speed = 0; time = -1e-6; for (let k = 0; k < Math.round(t * 60); k++) step(1 / 60); render(); };
