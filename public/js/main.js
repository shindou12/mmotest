import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  FLOORS, WEAPONS, RARITIES, AFFIXES, UNIQUE_FX, MAX_LEVEL, FIELD_RADIUS, GATE_POS, LAIR_POS, LAIR_RADIUS,
  xpToNext, baseAtk, baseHp, inShape, starterWeapon,
} from '../shared/data.js';
import { AudioEngine } from './audio.js';
import { FX, makeTelegraph } from './fx.js';
import { buildFloor, groundHeight, AmbientParticles } from './env.js';
import { makePlayer, setPlayerWeapon, animatePlayer, makeMob, animateMob, makeLootOrb } from './models.js';
import { Net } from './net.js';

const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => performance.now() / 1000;
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ======================================================================
// セーブデータ
// ======================================================================
const SAVE_KEY = 'eterna_char_v1';
let char = null;
function loadChar() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } }
function saveChar() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(char)); } catch { /* */ } }

// ======================================================================
// レンダラー
// ======================================================================
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 900);
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

// ?low で軽量モード（ブルーム・影なし）
const LOW = new URLSearchParams(location.search).has('low');
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
if (!LOW) composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.82));
composer.addPass(new OutputPass());
if (LOW) { renderer.shadowMap.enabled = false; renderer.setPixelRatio(1); }

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

const fx = new FX(scene);
const ambient = new AmbientParticles(scene);
const audio = new AudioEngine();

// ======================================================================
// ゲーム状態
// ======================================================================
const me = {
  id: 0, x: GATE_POS.x, z: GATE_POS.z + 3, a: Math.PI, hp: 100, dead: false, deadT: 0,
  swingT: 9, swingDur: 0.4, combo: 0, lastSwing: 0, sw: 0, sk: 0,
  dodgeT: 0, dodgeCd: 0, dodgeDir: [0, 1], iframe: 0,
  skillCd: 0, skillT: -1, skillKind: '', dashT: 0,
  potions: 3, potCd: 0, lastHurt: -99, buffT: 0, walkT: 0, moving: false, stepT: 0,
  model: null,
};
let world = { floor: 1, unlocked: 1, bossState: 'idle' };
let env = null;
let S = null; // 計算済みステータス
const mobs = new Map();
const others = new Map();
const teles = [];
const drops = [];
const waves = [];
const pending = []; // 遅延ヒット
let roster = [];
let started = false;
let shake = 0;
let camZoom = 1;
const keys = new Set();
const mouse = { x: 0, y: 0, l: false, r: false, world: new THREE.Vector3() };

// ======================================================================
// ステータス計算
// ======================================================================
function calcStats() {
  const eq = char.eq;
  const items = [eq.weapon, eq.armor, eq.acc].filter(Boolean);
  const aff = {};
  for (const it of items) for (const [k, v] of it.affixes) aff[k] = (aff[k] || 0) + v;
  const fxs = new Set(items.flatMap((i) => i.fx || []));
  const wk = eq.weapon ? eq.weapon.kind : 'sword';
  const atk = (baseAtk(char.lv) + (eq.weapon?.atk || 0) + (eq.acc?.atk || 0)) * (1 + (aff.atkp || 0) / 100);
  const mhp = (baseHp(char.lv) + (eq.armor?.hp || 0) + (eq.acc?.hp || 0)) * (1 + (aff.hpp || 0) / 100);
  S = {
    wk, W: WEAPONS[wk], atk, mhp: Math.round(mhp), fx: fxs,
    crit: 5 + (aff.crit || 0), critd: 150 + (aff.critd || 0), aspd: aff.aspd || 0, move: aff.move || 0,
    vamp: (aff.vamp || 0) + (fxs.has('vamp') ? 4 : 0), cdr: Math.min(60, (aff.cdr || 0) + (fxs.has('star') ? 35 : 0)),
    def: Math.min(60, aff.def || 0), wr: eq.weapon ? eq.weapon.rarity : 0,
  };
  me.hp = Math.min(me.hp, S.mhp);
  if (me.model) setPlayerWeapon(me.model, S.wk, S.wr);
  $('skill-name').textContent = S.W.skill.name;
}

function itemPower(it) {
  if (!it) return 0;
  let p = (it.atk || 0) * 3 + (it.hp || 0) * 0.5;
  for (const [, v] of it.affixes) p += v * (it.atk || 10) * 0.15 + v * 0.5;
  if (it.fx) p *= 1 + it.fx.length * 0.25;
  return Math.round(p);
}

// ======================================================================
// 入力
// ======================================================================
const chatIn = $('chat-in');
addEventListener('keydown', (e) => {
  if (!started) return;
  if (document.activeElement === chatIn) {
    if (e.key === 'Enter') { const t = chatIn.value.trim(); if (t) net.send({ t: 'chat', text: t }); chatIn.value = ''; chatIn.blur(); }
    if (e.key === 'Escape') chatIn.blur();
    return;
  }
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === 'enter') { chatIn.focus(); e.preventDefault(); }
  if (k === ' ' || k === 'shift') { tryDodge(); e.preventDefault(); }
  if (k === 'q') usePotion();
  if (k === 'i' || k === 'tab') { toggleInv(); e.preventDefault(); }
  if (k === 'f') tryGate();
  if (k === 'e') trySkill();
  if (k === 'h') $('help').classList.toggle('hidden');
  if (k === 'm') { audio.muted = !audio.muted; audio.setVolume(audio.muted ? 0 : 0.8); toast(audio.muted ? 'ミュート' : 'サウンドON', '#aaa'); }
  if (k === 'escape') { $('inv').classList.add('hidden'); $('gate-menu').classList.add('hidden'); }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); mouse.l = mouse.r = false; });
canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('mousedown', (e) => {
  audio.init();
  if (e.button === 0) mouse.l = true;
  if (e.button === 2) { mouse.r = true; trySkill(); }
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { camZoom = clamp(camZoom + e.deltaY * 0.001, 0.6, 1.6); });
$('s-inv').addEventListener('click', toggleInv);

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function updateMouseWorld() {
  const v = new THREE.Vector2((mouse.x / innerWidth) * 2 - 1, -(mouse.y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(v, camera);
  groundPlane.constant = -1;
  raycaster.ray.intersectPlane(groundPlane, mouse.world);
}

// ======================================================================
// ネットワーク
// ======================================================================
const net = new Net(onMsg);

function onMsg(m) {
  switch (m.t) {
    case 'welcome':
      me.id = m.id; world.unlocked = m.unlocked;
      enterFloor(m.floor);
      break;
    case 'warped': enterFloor(m.floor); break;
    case 'snap': onSnap(m); break;
    case 'roster': roster = m.r; world.unlocked = m.unlocked; renderParty(); break;
    case 'tele': onTele(m); break;
    case 'die': onMobDie(m); break;
    case 'xp': gainXp(m.n); break;
    case 'loot': for (const d of m.items) spawnDrop(d.it, d.x, d.z); break;
    case 'chat': addChat(m.from, m.text, m.color); break;
    case 'leave': removeOther(m.id); break;
    case 'unlock': world.unlocked = m.unlocked; break;
    case 'bossStart': {
      banner(`第${m.n}層ボス`, m.name, '#ff6a6a', 3);
      audio.sfx('roar'); shake = 1.2;
      break;
    }
    case 'enrage': {
      toast('ボスが激昂した！ 攻撃が激しくなる…', '#ff5a5a', true);
      audio.sfx('enrage'); shake = 0.8;
      const b = mobs.get(m.id);
      if (b) fx.parts.burst(b.x, 3, b.z, 80, { color: 0xff3020, size: 0.8, speed: 12, life: 1 });
      break;
    }
    case 'bossClear': {
      banner(`第${m.n}層 攻略`, 'CONGRATULATIONS!', '#ffd84a', 3);
      audio.sfx('clear');
      for (let i = 0; i < 6; i++) setTimeout(() => fx.parts.burst(LAIR_POS.x + rnd(-8, 8), rnd(4, 10), LAIR_POS.z + rnd(-8, 8), 80, { color: [0xffd84a, 0x6ad0ff, 0xff6ab0][i % 3], size: 0.6, speed: 10, life: 1.5, gravity: -4 }), i * 250);
      break;
    }
    case 'bossReset': toast('ボスが退却した…（全員が離脱）', '#aaa'); break;
    case 'disconnected': addChat('', 'サーバーとの接続が切れました。ページを再読み込みしてください。', '#f66'); break;
  }
}

// ======================================================================
// 階層
// ======================================================================
function enterFloor(n) {
  world.floor = n;
  const def = FLOORS[n - 1];
  if (env) fx.dispose(env.group);
  env = buildFloor(def);
  scene.add(env.group);
  scene.fog = new THREE.Fog(def.fog, def.fogNear, def.fogFar);
  hemi.color.set(def.hemi[0]); hemi.groundColor.set(def.hemi[1]); hemi.intensity = 1.1;
  sun.color.set(def.sun); sun.intensity = def.sunI;
  ambient.setKind(def.particles);
  for (const id of [...mobs.keys()]) removeMob(id);
  for (const id of [...others.keys()]) removeOther(id);
  for (const t of teles.splice(0)) t.meshes.forEach((mm) => fx.dispose(mm));
  for (const d of drops.splice(0)) disposeDrop(d);
  me.x = GATE_POS.x + rnd(-2, 2); me.z = GATE_POS.z - 6; me.a = Math.PI;
  me.potions = 3;
  audio.setMusic(def.music, false);
  audio.setAmbient(def.amb);
  banner(`第${n}層`, def.name, '#bfe6ff');
  $('me-floor').textContent = `第${n}層 ${def.name}`;
  audio.sfx('warp');
  fx.beam(me.x, me.z, 0x6ad0ff, 12, 1.2, 1.2);
}

// ======================================================================
// スナップショット適用
// ======================================================================
function onSnap(m) {
  if (m.n !== world.floor) return;
  world.bossState = m.bs;
  const seenP = new Set();
  for (const p of m.p) {
    const [id, name, x, z, a, hp, mhp, lv, color, wk, wr, sw, sk, dead, dg] = p;
    if (id === me.id) continue;
    seenP.add(id);
    let o = others.get(id);
    if (!o) {
      o = { id, model: makePlayer(color), x, z, a, swingT: 9, combo: 0, sw, sk, spinT: -1, walkT: 0, plate: makePlate(name, true) };
      scene.add(o.model);
      others.set(id, o);
    }
    Object.assign(o, { tx: x, tz: z, ta: a, hp, mhp, lv, name, dead, dg, wk, wr });
    setPlayerWeapon(o.model, wk, wr);
    if (sw !== o.sw) {
      o.sw = sw; o.swingT = 0; o.combo++;
      const W = WEAPONS[wk];
      fx.slash(o.x, o.z, o.a, W.range, W.arc, RARITIES[wr].color, 1.0, o.combo % 2 === 1);
    }
    if (sk !== o.sk) { o.sk = sk; o.spinT = 0; fx.ringWave(o.x, o.z, 0x9ad8ff, 5); fx.parts.burst(o.x, 1, o.z, 30, { color: 0x9ad8ff, speed: 6 }); }
  }
  for (const id of [...others.keys()]) if (!seenP.has(id)) removeOther(id);

  const seenM = new Set();
  for (const r of m.m) {
    const [id, d, x, z, a, hp, mhp, lv, st, kind, enr] = r;
    seenM.add(id);
    let mb = mobs.get(id);
    if (!mb) {
      const def = FLOORS[world.floor - 1];
      let model, name, rad;
      if (kind === 2) {
        const b = def.boss;
        model = makeMob(b.t, b.color, b.scale, b.accent, true);
        name = b.name; rad = 0.9 * b.scale;
      } else {
        const md = def.mobs[d];
        const sc = kind === 1 ? 0.8 : 1;
        model = makeMob(md.t, md.color, sc);
        name = md.name; rad = 0.75 * sc;
      }
      mb = { id, model, name, rad, kind, x, z, a, hp, mhp, lv, st, flash: 0, plate: kind === 2 ? null : makePlate(name, false), localHp: hp, localT: 0 };
      model.position.set(x, groundHeight(x, z), z);
      scene.add(model);
      mobs.set(id, mb);
      if (kind === 2) {
        fx.parts.burst(x, 2, z, 120, { color: def.boss.accent, size: 1, speed: 14, life: 1.2 });
        fx.ringWave(x, z, def.boss.accent, 14, 0.8);
        fx.flash(x, 4, z, def.boss.accent, 80, 0.6, 30);
      }
    }
    Object.assign(mb, { tx: x, tz: z, ta: a, mhp, lv, st, enraged: !!enr });
    // ローカル予測ダメージを少しの間優先
    if (now() - mb.localT > 0.4) mb.hp = hp; else mb.hp = Math.min(mb.hp, hp);
  }
  for (const id of [...mobs.keys()]) if (!seenM.has(id)) removeMob(id);
}

function removeMob(id) {
  const mb = mobs.get(id);
  if (!mb) return;
  fx.dispose(mb.model);
  if (mb.plate) mb.plate.remove();
  mobs.delete(id);
}
function removeOther(id) {
  const o = others.get(id);
  if (!o) return;
  fx.dispose(o.model);
  o.plate.remove();
  others.delete(id);
}

function onMobDie(m) {
  const mb = mobs.get(m.id);
  const col = mb ? (m.boss ? FLOORS[world.floor - 1].boss.accent : FLOORS[world.floor - 1].mobs[0].color) : 0xffffff;
  // ポリゴン片が砕け散る演出
  fx.parts.burst(m.x, 1.2, m.z, m.boss ? 300 : 40, { color: 0x9ad8ff, size: m.boss ? 0.9 : 0.45, speed: m.boss ? 16 : 7, life: m.boss ? 2 : 0.9, gravity: -3 });
  fx.parts.burst(m.x, 1.2, m.z, m.boss ? 100 : 15, { color: col, size: 0.6, speed: 5, life: 1 });
  fx.flash(m.x, 2, m.z, 0x9ad8ff, m.boss ? 100 : 20, 0.4);
  audio.sfx('mobdie');
  if (m.boss) { shake = 1.5; audio.sfx('impact'); }
  removeMob(m.id);
}

// ======================================================================
// テレグラフ（予兆）と被弾判定
// ======================================================================
function onTele(m) {
  const color = m.c || '#ff3030';
  const meshes = m.sh.map((s) => { const g = makeTelegraph(s, color); scene.add(g); return g; });
  teles.push({ meshes, sh: m.sh, start: now(), dur: m.d / 1000, dmg: m.dmg, color, src: m.src });
  const near = m.sh.some((s) => Math.hypot(s.x - me.x, s.z - me.z) < 25);
  if (near) audio.sfx('telegraph');
}

function updateTeles() {
  const t = now();
  for (let i = teles.length - 1; i >= 0; i--) {
    const te = teles[i];
    const k = clamp((t - te.start) / te.dur, 0, 1);
    te.meshes.forEach((g) => g.setProgress(k));
    if (k >= 1) {
      resolveTele(te);
      te.meshes.forEach((g) => fx.dispose(g));
      teles.splice(i, 1);
    }
  }
}

function resolveTele(te) {
  const big = te.dmg > (S ? S.mhp * 0.12 : 20);
  for (const s of te.sh) {
    // 着弾演出
    const c = new THREE.Color(te.color);
    if (s.k === 'circle') { fx.ringWave(s.x, s.z, c, s.r, 0.35); fx.parts.burst(s.x, 0.3, s.z, Math.min(40, 6 + s.r * 4), { color: c, speed: 6, size: 0.5, life: 0.5, up: 2 }); }
    else if (s.k === 'ring') fx.ringWave(s.x, s.z, c, s.r1, 0.5);
    else {
      const len = s.len, n = Math.ceil(len / 2);
      for (let j = 0; j < n; j++) {
        const d = (j / n) * len;
        fx.parts.burst(s.x + Math.sin(s.a) * d, 0.3, s.z + Math.cos(s.a) * d, 4, { color: c, speed: 5, size: 0.5, life: 0.4 });
      }
    }
  }
  const nearSrc = te.sh.some((s) => Math.hypot(s.x - me.x, s.z - me.z) < 22);
  if (big && nearSrc) { audio.sfx('impact'); shake = Math.max(shake, 0.35); }
  if (me.dead) return;
  const hit = te.sh.some((s) => inShape(s, me.x, me.z));
  if (!hit) return;
  if (me.iframe > 0) {
    // ジャスト回避
    floatText(me.x, 2.6, me.z, 'JUST回避!', 'just');
    audio.sfx('perfect');
    fx.ringWave(me.x, me.z, 0x9affff, 3, 0.3);
    if (S.fx.has('mirror')) {
      me.buffT = 5;
      fx.ringWave(me.x, me.z, 0xffffff, 7, 0.5);
      fx.parts.burst(me.x, 1, me.z, 60, { color: 0xbff8ff, speed: 10, size: 0.6 });
      for (const mb of mobs.values()) if (Math.hypot(mb.x - me.x, mb.z - me.z) < 6 + mb.rad) dealDamage(mb, 3.0, { noProc: true });
    }
    return;
  }
  if (S.fx.has('aegis') && Math.random() < 0.25) {
    floatText(me.x, 2.4, me.z, '無効化!', 'info');
    audio.sfx('block');
    fx.ringWave(me.x, me.z, 0xffd84a, 2, 0.3, 1);
    return;
  }
  const dmg = Math.round(te.dmg * (1 - S.def / 100) * rnd(0.9, 1.1));
  me.hp -= dmg;
  me.lastHurt = now();
  floatText(me.x, 2.2, me.z, dmg, 'me');
  audio.sfx('hurt');
  shake = Math.max(shake, 0.3);
  $('vignette').style.boxShadow = 'inset 0 0 160px rgba(255,0,0,.55)';
  setTimeout(() => { $('vignette').style.boxShadow = 'inset 0 0 120px rgba(255,0,0,0)'; }, 180);
  if (me.hp <= 0) die();
}

function die() {
  me.hp = 0; me.dead = true; me.deadT = 5;
  audio.sfx('death');
  fx.parts.burst(me.x, 1, me.z, 80, { color: 0x9ad8ff, speed: 8, size: 0.5, life: 1.2 });
  $('death').classList.remove('hidden');
}

// ======================================================================
// 戦闘（プレイヤー側）
// ======================================================================
function aimAngle() { return Math.atan2(mouse.world.x - me.x, mouse.world.z - me.z); }

function dealDamage(mb, mult, o = {}) {
  if (!mb || mb.hp <= 0) return;
  let crit = Math.random() * 100 < S.crit || (o.skill && S.fx.has('skillcrit'));
  let dmg = S.atk * mult * rnd(0.92, 1.08) * (crit ? S.critd / 100 : 1) * (me.buffT > 0 ? 1.5 : 1);
  dmg = Math.max(1, Math.round(dmg));
  mb.hp -= dmg; mb.localT = now(); mb.flash = 1;
  net.send({ t: 'hit', id: mb.id, dmg, crit });
  floatText(mb.x, 2.2 * (mb.kind === 2 ? 2.5 : 1), mb.z, dmg, crit ? 'crit' : '');
  const wc = RARITIES[S.wr].color;
  fx.parts.burst(mb.x, 1.2, mb.z, crit ? 18 : 8, { color: crit ? 0xffd84a : wc, speed: crit ? 9 : 6, size: crit ? 0.5 : 0.35, life: 0.4 });
  audio.sfx('hit', { crit });
  if (S.vamp > 0) heal(dmg * S.vamp / 100, false);
  if (o.noProc) return;
  if (crit && S.fx.has('thunder')) {
    pending.push({ at: now() + 0.08, fn: () => {
      fx.lightning(mb.x, mb.z); audio.sfx('thunder'); shake = Math.max(shake, 0.2);
      for (const m2 of mobs.values()) if (Math.hypot(m2.x - mb.x, m2.z - mb.z) < 3.5 + m2.rad) dealDamage(m2, 1.5, { noProc: true });
    } });
  }
  if (S.fx.has('flame') && Math.random() < 0.35) {
    fx.parts.burst(mb.x, 0.8, mb.z, 25, { color: 0xff6a20, speed: 4, size: 0.6, life: 0.7, gravity: 3 });
    audio.sfx('flame');
    for (const m2 of mobs.values()) if (m2 !== mb && Math.hypot(m2.x - mb.x, m2.z - mb.z) < 2.8 + m2.rad) dealDamage(m2, 0.6, { noProc: true });
  }
}

function hitArc(range, arcDeg, mult, a = me.a, o = {}) {
  const arc = THREE.MathUtils.degToRad(arcDeg) / 2;
  let n = 0;
  for (const mb of mobs.values()) {
    const dx = mb.x - me.x, dz = mb.z - me.z, d = Math.hypot(dx, dz);
    if (d > range + mb.rad) continue;
    let diff = Math.atan2(dx, dz) - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) <= arc + mb.rad / Math.max(d, 0.5) || d < mb.rad + 0.6) { dealDamage(mb, mult, o); n++; }
  }
  return n;
}

function hitLine(len, w, mult, a = me.a, o = {}, sx = me.x, sz = me.z) {
  const fx_ = Math.sin(a), fz = Math.cos(a);
  for (const mb of mobs.values()) {
    const dx = mb.x - sx, dz = mb.z - sz;
    const along = dx * fx_ + dz * fz, side = Math.abs(dx * fz - dz * fx_);
    if (along > -mb.rad && along < len + mb.rad && side < w / 2 + mb.rad) dealDamage(mb, mult, o);
  }
}

function doSwing() {
  const W = S.W;
  me.combo = now() - me.lastSwing < W.speed * 2.2 ? (me.combo + 1) % 3 : 0;
  me.lastSwing = now();
  me.swingT = 0;
  me.swingDur = W.speed * (1 - S.aspd / 100) * (me.combo === 2 ? 1.25 : 1);
  me.sw++;
  me.a = aimAngle();
  const mult = W.mult * [1, 1.1, 1.6][me.combo];
  const col = RARITIES[S.wr].color;
  fx.slash(me.x, me.z, me.a, W.range, W.arc, col, 1.0, me.combo % 2 === 1);
  audio.sfx('swing', { heavy: S.wk === 'greatsword' || me.combo === 2 });
  const a = me.a;
  pending.push({ at: now() + 0.06, fn: () => hitArc(W.range, W.arc, mult, a) });
  if (me.combo === 2 && S.fx.has('wave')) launchWave(a, col);
}

function launchWave(a, col) {
  const mesh = fx.waveMesh(col);
  mesh.position.set(me.x, 1, me.z); mesh.rotation.y = a;
  waves.push({ mesh, x: me.x, z: me.z, a, t: 0, hit: new Set() });
  audio.sfx('wave');
}

function updateWaves(dt) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i];
    w.t += dt;
    w.x += Math.sin(w.a) * 22 * dt; w.z += Math.cos(w.a) * 22 * dt;
    w.mesh.position.set(w.x, 1, w.z);
    w.mesh.material.opacity = 0.9 * (1 - w.t / 0.7);
    w.mesh.scale.setScalar(1 + w.t * 1.5);
    fx.parts.emit(w.x, 1, w.z, { color: w.mesh.material.color, size: 0.4, life: 0.3, speed: 1, gravity: 0 });
    for (const mb of mobs.values()) {
      if (w.hit.has(mb.id)) continue;
      if (Math.hypot(mb.x - w.x, mb.z - w.z) < 1.8 + mb.rad) { w.hit.add(mb.id); dealDamage(mb, 1.4, { noProc: true }); }
    }
    if (w.t > 0.7) { fx.dispose(w.mesh); waves.splice(i, 1); }
  }
}

function trySkill() {
  if (!S || me.dead || me.skillCd > 0 || me.dodgeT > 0 || me.skillT >= 0) return;
  const sk = S.W.skill;
  me.skillCd = sk.cd * (1 - S.cdr / 100);
  me.skillT = 0; me.skillKind = S.wk; me.sk++;
  me.a = aimAngle();
  const a = me.a, col = RARITIES[S.wr].color;
  audio.sfx('skill');
  floatText(me.x, 3, me.z, sk.name, 'info');
  fx.flash(me.x, 2, me.z, col, 25, 0.4);
  switch (S.wk) {
    case 'sword': {
      // 突進突き
      me.dashT = 0.2; me.dashA = a; me.iframe = 0.25;
      const sx = me.x, sz = me.z;
      pending.push({ at: now() + 0.12, fn: () => {
        hitLine(8.5, 2.6, sk.mult, a, { skill: true }, sx, sz);
        fx.slash(me.x, me.z, a, 3.5, 60, col, 1.1);
        for (let d = 0; d < 9; d += 0.5) fx.parts.emit(sx + Math.sin(a) * d, 1.1, sz + Math.cos(a) * d, { color: col, size: 0.6, life: 0.5, speed: 1.5, gravity: 0 });
      } });
      break;
    }
    case 'greatsword': {
      for (let i = 0; i < 3; i++) {
        pending.push({ at: now() + 0.1 + i * 0.15, fn: () => {
          hitArc(4.6, 360, sk.mult / 3, a, { skill: true });
          fx.slash(me.x, me.z, me.a + i * 2.1, 4.6, 200, col, 1.0, i % 2 === 1);
          fx.ringWave(me.x, me.z, col, 4.6, 0.3);
          audio.sfx('swing', { heavy: true });
        } });
      }
      break;
    }
    case 'spear': {
      const sx = me.x, sz = me.z;
      pending.push({ at: now() + 0.12, fn: () => {
        hitLine(12, 2.2, sk.mult, a, { skill: true }, sx, sz);
        audio.sfx('thunder');
        for (let d = 0; d < 12; d += 0.4) fx.parts.emit(sx + Math.sin(a) * d, 1.1, sz + Math.cos(a) * d, { color: 0xbfe0ff, size: 0.7, life: 0.45, speed: 2, gravity: 0 });
        fx.lightning(sx + Math.sin(a) * 10, sz + Math.cos(a) * 10, 0xbfe0ff);
      } });
      break;
    }
    case 'dagger': {
      for (let i = 0; i < 5; i++) {
        pending.push({ at: now() + 0.05 + i * 0.09, fn: () => {
          const aa = me.a + rnd(-0.4, 0.4);
          hitArc(3.0, 150, sk.mult, me.a, { skill: true });
          fx.slash(me.x, me.z, aa, 3.0, 120, col, 0.8 + i * 0.12, i % 2 === 1);
          audio.sfx('swing');
        } });
      }
      break;
    }
  }
}

function tryDodge() {
  audio.init();
  if (!S || me.dead || me.dodgeCd > 0) return;
  let dx = 0, dz = 0;
  if (keys.has('w')) dz -= 1; if (keys.has('s')) dz += 1; if (keys.has('a')) dx -= 1; if (keys.has('d')) dx += 1;
  if (!dx && !dz) { dx = Math.sin(me.a); dz = Math.cos(me.a); }
  const l = Math.hypot(dx, dz);
  me.dodgeDir = [dx / l, dz / l];
  me.dodgeT = 0.38; me.dodgeCd = 0.75; me.iframe = 0.32;
  me.swingT = 9; me.skillT = -1;
  audio.sfx('dodge');
  fx.parts.burst(me.x, 0.3, me.z, 12, { color: 0xdddddd, speed: 3, size: 0.4, life: 0.4, gravity: 1 });
}

function usePotion() {
  if (!S || me.dead || me.potions <= 0 || me.potCd > 0 || me.hp >= S.mhp) return;
  me.potions--; me.potCd = 1;
  heal(S.mhp * 0.45, true);
  audio.sfx('potion');
  fx.parts.burst(me.x, 1, me.z, 30, { color: 0x6aff8a, speed: 3, size: 0.4, life: 0.8, gravity: 3 });
}

function heal(n, show) {
  const before = me.hp;
  me.hp = Math.min(S.mhp, me.hp + n);
  if (show && me.hp > before) floatText(me.x, 2.2, me.z, '+' + Math.round(me.hp - before), 'heal');
}

function gainXp(n) {
  if (char.lv >= MAX_LEVEL) return;
  char.xp += n;
  floatText(me.x, 3.0, me.z, `+${n} EXP`, 'info');
  let leveled = false;
  while (char.lv < MAX_LEVEL && char.xp >= xpToNext(char.lv)) {
    char.xp -= xpToNext(char.lv); char.lv++; leveled = true;
  }
  if (leveled) {
    calcStats(); me.hp = S.mhp;
    audio.sfx('levelup');
    fx.beam(me.x, me.z, 0xffd84a, 16, 1.0, 1.5);
    fx.parts.burst(me.x, 0.5, me.z, 80, { color: 0xffd84a, speed: 6, size: 0.5, life: 1.5, gravity: 2 });
    banner('LEVEL UP', `Lv ${char.lv}`, '#ffd84a');
  }
  saveChar();
}

// ======================================================================
// ドロップ
// ======================================================================
function spawnDrop(it, x, z) {
  const model = makeLootOrb(it.rarity);
  model.position.set(x, groundHeight(x, z), z);
  scene.add(model);
  const r = it.rarity, col = RARITIES[r].color;
  const beam = r >= 2 ? fx.beam(x, z, col, 6 + r * 4, 0.25 + r * 0.08) : null;
  drops.push({ it, x, z, model, beam, t: 0 });
  fx.parts.burst(x, 1, z, 10 + r * 15, { color: col, speed: 4 + r, size: 0.4, life: 0.8 });
  audio.sfx('drop', { rarity: r });
  if (r >= 4) {
    const what = it.slot === 'weapon' ? '武器' : it.slot === 'armor' ? '防具' : '装飾品';
    banner(r === 5 ? '★★★ 神器ドロップ ★★★' : '★ 伝説の' + what + ' ★', it.name, col, r);
    fx.flash(x, 3, z, col, 120, 1.2, 40);
    fx.ringWave(x, z, col, 10, 1.0);
    shake = Math.max(shake, r === 5 ? 1 : 0.5);
  }
}

function disposeDrop(d) {
  fx.dispose(d.model);
  if (d.beam) fx.dispose(d.beam);
}

function updateDrops(dt) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.t += dt;
    d.model.userData.orb.rotation.y += dt * 2;
    d.model.userData.orb.position.y = 0.8 + Math.sin(d.t * 3) * 0.15;
    if (d.beam) d.beam.material.uniforms.uTime.value = d.t;
    const dist = Math.hypot(d.x - me.x, d.z - me.z);
    if (!me.dead && d.t > 0.5 && dist < 1.8) {
      if (char.inv.length >= 60) { if (d.t % 3 < dt) toast('インベントリがいっぱい！（Iで分解）', '#f88'); continue; }
      char.inv.unshift(d.it);
      saveChar();
      audio.sfx('pickup');
      const cmp = itemPower(d.it) > itemPower(char.eq[d.it.slot]) ? '  ▲' : '';
      toast(`${RARITIES[d.it.rarity].name}「${d.it.name}」を入手${cmp}`, RARITIES[d.it.rarity].color, d.it.rarity >= 4);
      disposeDrop(d);
      drops.splice(i, 1);
      if (!$('inv').classList.contains('hidden')) renderInv();
    } else if (d.t > 150) { disposeDrop(d); drops.splice(i, 1); }
  }
}

// ======================================================================
// UI
// ======================================================================
const floatEls = [];
function floatText(x, y, z, text, cls) {
  const el = document.createElement('div');
  el.className = 'dmg ' + (cls || '');
  el.textContent = text;
  $('float').appendChild(el);
  floatEls.push({ el, x: x + rnd(-0.4, 0.4), y, z, t: 0 });
}
function makePlate(name, player) {
  const el = document.createElement('div');
  el.className = 'plate' + (player ? ' player' : '');
  el.innerHTML = `<div class="pn"></div><div class="pb"><div></div></div>`;
  el.querySelector('.pn').textContent = name;
  $('float').appendChild(el);
  return el;
}
const _v = new THREE.Vector3();
function project(x, y, z) {
  _v.set(x, y, z).project(camera);
  return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight, vis: _v.z < 1 };
}
function updateFloat(dt) {
  for (let i = floatEls.length - 1; i >= 0; i--) {
    const f = floatEls[i];
    f.t += dt;
    const p = project(f.x, f.y + f.t * 1.5, f.z);
    f.el.style.left = p.x + 'px'; f.el.style.top = p.y + 'px';
    f.el.style.opacity = String(1 - Math.max(0, f.t - 0.6) / 0.4);
    if (f.t > 1) { f.el.remove(); floatEls.splice(i, 1); }
  }
  for (const mb of mobs.values()) {
    if (!mb.plate) continue;
    const d = Math.hypot(mb.x - me.x, mb.z - me.z);
    const p = project(mb.x, mb.model.position.y + 2.4 * (mb.kind === 1 ? 0.8 : 1) + (mb.model.userData.float ? 0.5 : 0), mb.z);
    const show = p.vis && d < 30;
    mb.plate.style.display = show ? '' : 'none';
    if (!show) continue;
    mb.plate.style.left = p.x + 'px'; mb.plate.style.top = p.y + 'px';
    mb.plate.querySelector('.pn').textContent = `Lv${mb.lv} ${mb.name}`;
    mb.plate.querySelector('.pb > div').style.width = clamp(mb.hp / mb.mhp * 100, 0, 100) + '%';
  }
  for (const o of others.values()) {
    const p = project(o.x, 2.6, o.z);
    o.plate.style.display = p.vis && !o.dead ? '' : 'none';
    o.plate.style.left = p.x + 'px'; o.plate.style.top = p.y + 'px';
    o.plate.querySelector('.pn').textContent = `Lv${o.lv} ${o.name}`;
    o.plate.querySelector('.pb > div').style.width = clamp(o.hp / o.mhp * 100, 0, 100) + '%';
  }
}

function toast(text, color = '#fff', big = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (big ? ' big' : '');
  el.style.borderColor = color; el.style.color = color;
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3600);
  while ($('toasts').children.length > 5) $('toasts').firstChild.remove();
}
let bannerUntil = 0, bannerPrio = 0;
function banner(top, main, color, prio = 0) {
  if (now() < bannerUntil && prio < bannerPrio) return;
  bannerUntil = now() + 2.5; bannerPrio = prio;
  const b = $('banner');
  b.innerHTML = `<div class="b1">${esc(top)}</div><div class="b2" style="color:${color}">${esc(main)}</div>`;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
function addChat(from, text, color) {
  const log = $('chat-log');
  const el = document.createElement('div');
  if (from) el.innerHTML = `<b style="color:${esc(color)}">${esc(from)}</b>: ${esc(text)}`;
  else { el.style.color = color; el.textContent = text; }
  log.appendChild(el);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
function renderParty() {
  $('party').innerHTML = '<div class="dim" style="margin-bottom:6px">オンライン ' + roster.length + '人</div>' + roster.map(([id, name, lv, floor, hp, mhp, color]) => `
    <div class="pm"><div class="nm"><span style="color:${esc(color)}">${esc(name)}${id === me.id ? ' (自分)' : ''}</span><span class="dim">Lv${lv} / ${floor}層</span></div>
    <div class="bar hp"><div style="width:${clamp(hp / mhp * 100, 0, 100)}%"></div></div></div>`).join('');
}

function updateHud() {
  $('me-name').textContent = char.name;
  $('me-lv').textContent = 'Lv ' + char.lv;
  const hpPct = clamp(me.hp / S.mhp * 100, 0, 100);
  $('me-hp').style.width = hpPct + '%';
  $('me-hp').parentElement.classList.toggle('low', hpPct < 30);
  $('me-hp-t').textContent = `${Math.ceil(me.hp)} / ${S.mhp}`;
  const need = xpToNext(char.lv);
  $('me-xp').style.width = (char.lv >= MAX_LEVEL ? 100 : char.xp / need * 100) + '%';
  $('me-xp-t').textContent = char.lv >= MAX_LEVEL ? 'MAX' : `${char.xp} / ${need}`;
  $('pot-n').textContent = me.potions;
  const cd = (id, v, max) => { const el = $(id); el.querySelector('.cd').style.height = clamp(v / max * 100, 0, 100) + '%'; el.classList.toggle('ready', v <= 0); };
  cd('s-skill', me.skillCd, S.W.skill.cd * (1 - S.cdr / 100));
  cd('s-dodge', me.dodgeCd, 0.75);
  cd('s-pot', me.potions > 0 ? me.potCd : 1, 1);
  $('buffs').textContent = me.buffT > 0 ? `✦ 見切り（ダメージ1.5倍） ${me.buffT.toFixed(1)}s` : '';

  const boss = [...mobs.values()].find((m) => m.kind === 2);
  $('boss').classList.toggle('hidden', !boss);
  if (boss) {
    $('boss-name').textContent = `Lv${boss.lv} ${boss.name}`;
    $('boss-name').classList.toggle('enraged', !!boss.enraged);
    const pct = clamp(boss.hp / boss.mhp * 100, 0, 100) + '%';
    $('boss-hp').style.width = pct; $('boss-hp-lag').style.width = pct;
  }
  const nearGate = Math.hypot(me.x - GATE_POS.x, me.z - GATE_POS.z) < 6;
  const nearLair = !boss && world.bossState !== 'fight' && Math.hypot(me.x - LAIR_POS.x, me.z - LAIR_POS.z) < LAIR_RADIUS + 6;
  const pr = $('prompt');
  if (nearGate && !me.dead) { pr.classList.remove('hidden'); pr.innerHTML = '<kbd>F</kbd> 転移門を使う（ポーション補充済み）'; }
  else if (nearLair && world.bossState === 'cleared') { pr.classList.remove('hidden'); pr.textContent = 'ボスは討伐済み。しばらくすると再挑戦できます'; }
  else if (nearLair) { pr.classList.remove('hidden'); pr.textContent = '⚠ ボス部屋：魔法陣の中に入ると戦闘開始'; }
  else pr.classList.add('hidden');
}

// ミニマップ
const mm = $('minimap').getContext('2d');
function drawMinimap() {
  const W = 180, sc = W / 2 / (FIELD_RADIUS + 4);
  const P = (x, z) => [W / 2 + x * sc, W / 2 + z * sc];
  mm.clearRect(0, 0, W, W);
  mm.save();
  mm.beginPath(); mm.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); mm.clip();
  mm.fillStyle = hex(FLOORS[world.floor - 1].ground) + '99'; mm.fillRect(0, 0, W, W);
  let [x, y] = P(GATE_POS.x, GATE_POS.z);
  mm.fillStyle = '#6ad0ff'; mm.beginPath(); mm.arc(x, y, 5, 0, 7); mm.fill();
  [x, y] = P(LAIR_POS.x, LAIR_POS.z);
  mm.strokeStyle = hex(FLOORS[world.floor - 1].boss.accent); mm.lineWidth = 2; mm.beginPath(); mm.arc(x, y, LAIR_RADIUS * sc, 0, 7); mm.stroke();
  for (const d of drops) { [x, y] = P(d.x, d.z); mm.fillStyle = RARITIES[d.it.rarity].color; mm.fillRect(x - 2, y - 2, 4, 4); }
  for (const mb of mobs.values()) { [x, y] = P(mb.x, mb.z); mm.fillStyle = mb.kind === 2 ? '#ff2a2a' : '#ff7a6a'; mm.beginPath(); mm.arc(x, y, mb.kind === 2 ? 6 : 2, 0, 7); mm.fill(); }
  for (const o of others.values()) { [x, y] = P(o.x, o.z); mm.fillStyle = '#7f7'; mm.beginPath(); mm.arc(x, y, 3.5, 0, 7); mm.fill(); }
  [x, y] = P(me.x, me.z);
  mm.translate(x, y); mm.rotate(-me.a + Math.PI);
  mm.fillStyle = '#fff'; mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4, 5); mm.lineTo(-4, 5); mm.closePath(); mm.fill();
  mm.restore();
}

// ---- インベントリ ----
const GLYPH = { sword: '剣', greatsword: '大', spear: '槍', dagger: '短', armor: '鎧', acc: '飾' };
function cellHtml(it, showUp) {
  const c = RARITIES[it.rarity].color;
  const up = showUp && itemPower(it) > itemPower(char.eq[it.slot]) ? '<span class="up">▲</span>' : '';
  return `<div class="cell r${it.rarity}" data-id="${it.id}" style="border-color:${c};color:${c}">${up}<span class="lv">${it.ilvl}</span><span class="gi">${GLYPH[it.kind || it.slot]}</span><span style="font-size:9px;max-width:58px;overflow:hidden;white-space:nowrap">${esc(it.name)}</span></div>`;
}
function renderInv() {
  for (const el of document.querySelectorAll('.eq')) {
    const it = char.eq[el.dataset.slot];
    const cell = el.querySelector('.cell');
    if (it) {
      const c = RARITIES[it.rarity].color;
      cell.outerHTML = `<div class="cell r${it.rarity}" data-id="${it.id}" data-eq="1" style="border-color:${c};color:${c}"><span class="gi">${GLYPH[it.kind || it.slot]}</span><span>${esc(it.name)}<br><small class="dim">iLv${it.ilvl}</small></span></div>`;
    } else cell.outerHTML = '<div class="cell" style="color:#666">なし</div>';
  }
  $('inv-grid').innerHTML = char.inv.map((it) => cellHtml(it, true)).join('') || '<div class="dim">アイテムなし。モンスターを倒そう！</div>';
  const st = [
    ['攻撃力', Math.round(S.atk)], ['最大HP', S.mhp], ['会心率', S.crit.toFixed(1) + '%'], ['会心ダメージ', S.critd.toFixed(0) + '%'],
    ['攻撃速度', '+' + S.aspd.toFixed(1) + '%'], ['移動速度', '+' + S.move.toFixed(1) + '%'], ['被ダメ軽減', S.def.toFixed(1) + '%'],
    ['HP吸収', S.vamp.toFixed(1) + '%'], ['スキル短縮', S.cdr.toFixed(0) + '%'],
  ];
  $('stats').innerHTML = `<b>Lv${char.lv} ${esc(char.name)}</b> <span class="dim">${S.W.name}</span>` + st.map(([k, v]) => `<div><span class="dim">${k}</span><span>${v}</span></div>`).join('')
    + [...S.fx].map((f) => `<div style="color:#ffd27a;font-size:11px">✦ ${UNIQUE_FX[f]}</div>`).join('');
  bindCells();
}
function findItem(id) { return char.inv.find((i) => i.id === id) || Object.values(char.eq).find((i) => i && i.id === id); }
function bindCells() {
  for (const cell of document.querySelectorAll('#inv .cell[data-id]')) {
    const it = findItem(cell.dataset.id);
    cell.onmouseenter = (e) => showTip(it, e);
    cell.onmousemove = (e) => moveTip(e);
    cell.onmouseleave = () => $('tooltip').classList.add('hidden');
    if (cell.dataset.eq) continue;
    cell.onclick = () => equip(it);
    cell.oncontextmenu = (e) => { e.preventDefault(); salvage(it); };
  }
}
function equip(it) {
  const idx = char.inv.indexOf(it);
  if (idx < 0) return;
  const old = char.eq[it.slot];
  char.inv.splice(idx, 1);
  if (old) char.inv.splice(idx, 0, old);
  char.eq[it.slot] = it;
  audio.sfx('equip');
  calcStats(); saveChar(); renderInv();
  $('tooltip').classList.add('hidden');
}
function salvage(it) {
  if (it.rarity >= 4 && !confirm(`${RARITIES[it.rarity].name}「${it.name}」を本当に分解しますか？`)) return;
  char.inv.splice(char.inv.indexOf(it), 1);
  audio.sfx('ui'); saveChar(); renderInv();
  $('tooltip').classList.add('hidden');
}
$('inv-salvage').onclick = () => { char.inv = char.inv.filter((i) => i.rarity >= 2); audio.sfx('ui'); saveChar(); renderInv(); };
$('inv-close').onclick = toggleInv;
function toggleInv() { const el = $('inv'); el.classList.toggle('hidden'); if (!el.classList.contains('hidden')) renderInv(); $('tooltip').classList.add('hidden'); }
function itemLines(it) {
  const r = RARITIES[it.rarity];
  const type = it.slot === 'weapon' ? WEAPONS[it.kind].name : it.slot === 'armor' ? '防具' : '装飾品';
  let h = `<div class="tn" style="color:${r.color}">${esc(it.name)}</div><div class="dim">${r.name} ${type} ・ iLv${it.ilvl}</div>`;
  if (it.atk) h += `<div>攻撃力 +${it.atk}</div>`;
  if (it.hp) h += `<div>HP +${it.hp}</div>`;
  for (const [k, v] of it.affixes) h += `<div style="color:#9fd8ff">${AFFIXES[k].name} +${v}${AFFIXES[k].unit}</div>`;
  if (it.fx) for (const f of it.fx) h += `<div class="fx">✦ ${UNIQUE_FX[f]}</div>`;
  if (it.slot === 'weapon') h += `<div class="dim">スキル: ${WEAPONS[it.kind].skill.name}</div>`;
  if (it.lore) h += `<div class="lore">${esc(it.lore)}</div>`;
  return h;
}
function showTip(it, e) {
  if (!it) return;
  const tip = $('tooltip');
  let h = itemLines(it);
  const cur = char.eq[it.slot];
  if (cur && cur !== it) {
    const d = itemPower(it) - itemPower(cur);
    h += `<div class="cmp" style="color:${d >= 0 ? '#6f6' : '#f77'}">装備中と比較: 戦力 ${d >= 0 ? '+' : ''}${d}</div>`;
  }
  tip.innerHTML = h; tip.classList.remove('hidden'); moveTip(e);
}
function moveTip(e) {
  const tip = $('tooltip');
  tip.style.left = Math.min(e.clientX + 16, innerWidth - 300) + 'px';
  tip.style.top = Math.min(e.clientY + 10, innerHeight - tip.offsetHeight - 10) + 'px';
}

// ---- 転移門 ----
function tryGate() {
  if (Math.hypot(me.x - GATE_POS.x, me.z - GATE_POS.z) > 6 || me.dead) return;
  const list = $('gate-list');
  list.innerHTML = FLOORS.map((f) => `<button data-n="${f.n}" ${f.n > world.unlocked ? 'disabled' : ''} class="${f.n === world.floor ? 'cur' : ''}">
    <b>第${f.n}層</b> ${f.n <= world.unlocked ? f.name : '？？？'} <span class="dim" style="float:right">推奨Lv${1 + (f.n - 1) * 5}〜</span></button>`).join('');
  for (const b of list.querySelectorAll('button')) b.onclick = () => { net.send({ t: 'warp', floor: Number(b.dataset.n) }); $('gate-menu').classList.add('hidden'); };
  $('gate-menu').classList.remove('hidden');
  audio.sfx('ui');
}
$('gate-close').onclick = () => $('gate-menu').classList.add('hidden');

// ======================================================================
// メインループ
// ======================================================================
let lastT = now();
let sendT = 0;
let saveT = 0;
const camPos = new THREE.Vector3();

function update(dt) {
  const t = now();
  updateMouseWorld();
  // 遅延ヒット
  for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= t) { const p = pending.splice(i, 1)[0]; if (!me.dead) p.fn(); }

  me.dodgeCd -= dt; me.skillCd -= dt; me.potCd -= dt; me.iframe -= dt; me.buffT -= dt;
  if (me.dead) {
    me.deadT -= dt;
    $('death-t').textContent = `${Math.max(0, me.deadT).toFixed(1)} 秒後に転移門で復活`;
    if (me.deadT <= 0) {
      me.dead = false; me.hp = S.mhp; me.potions = 3;
      me.x = GATE_POS.x + rnd(-2, 2); me.z = GATE_POS.z - 6;
      $('death').classList.add('hidden');
      fx.beam(me.x, me.z, 0x6ad0ff, 12, 1, 1);
    }
  } else {
    // 移動
    let dx = 0, dz = 0;
    if (document.activeElement !== chatIn) {
      if (keys.has('w') || keys.has('arrowup')) dz -= 1;
      if (keys.has('s') || keys.has('arrowdown')) dz += 1;
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright')) dx += 1;
    }
    const l = Math.hypot(dx, dz);
    me.moving = false;
    if (me.dodgeT > 0) {
      me.dodgeT -= dt;
      me.x += me.dodgeDir[0] * 17 * dt; me.z += me.dodgeDir[1] * 17 * dt;
      if (Math.random() < 0.5) fx.parts.emit(me.x, 0.6, me.z, { color: 0xbfe6ff, size: 0.4, life: 0.3, speed: 0.5, gravity: 0 });
    } else if (me.dashT > 0) {
      me.dashT -= dt;
      me.x += Math.sin(me.dashA) * 40 * dt; me.z += Math.cos(me.dashA) * 40 * dt;
    } else if (l > 0) {
      const swinging = me.swingT < me.swingDur || me.skillT >= 0;
      const sp = 7.2 * (1 + S.move / 100) * (swinging ? 0.45 : 1);
      me.x += dx / l * sp * dt; me.z += dz / l * sp * dt;
      me.moving = true;
      if (!swinging && !mouse.l) me.a = Math.atan2(dx, dz);
      me.walkT += dt;
      me.stepT -= dt;
      if (me.stepT <= 0) { me.stepT = 0.32; audio.sfx('step'); }
    }
    const r = Math.hypot(me.x, me.z);
    if (r > FIELD_RADIUS) { me.x *= FIELD_RADIUS / r; me.z *= FIELD_RADIUS / r; }

    // 攻撃
    me.swingT += dt;
    if (mouse.l && me.dodgeT <= 0 && me.skillT < 0 && me.swingT >= me.swingDur && !$('inv').contains(document.activeElement)) doSwing();
    if (me.skillT >= 0) { me.skillT += dt; if (me.skillT > 0.55) me.skillT = -1; }

    // 自然回復 / 転移門でポーション補充
    const regen = t - me.lastHurt > 5 ? 0.03 : 0.004;
    me.hp = Math.min(S.mhp, me.hp + S.mhp * regen * dt);
    if (Math.hypot(me.x - GATE_POS.x, me.z - GATE_POS.z) < 6) me.potions = 3;
  }

  // 自キャラモデル
  me.model.position.set(me.x, groundHeight(me.x, me.z), me.z);
  me.model.rotation.y = me.a;
  animatePlayer(me.model, {
    t, moving: me.moving, walkT: me.walkT, kind: S.wk, combo: me.combo, dead: me.dead,
    swing: me.swingT < me.swingDur ? me.swingT / me.swingDur : -1,
    spin: me.skillT >= 0 && (S.wk === 'greatsword') ? me.skillT / 0.55 : -1,
    dodge: me.dodgeT > 0 ? me.dodgeT / 0.38 : 0,
  });
  if (me.buffT > 0 && Math.random() < 0.4) fx.parts.emit(me.x + rnd(-0.5, 0.5), rnd(0.2, 2), me.z + rnd(-0.5, 0.5), { color: 0x9affff, size: 0.3, life: 0.6, speed: 1, gravity: 2 });
  // 伝説・神器のオーラ
  if (S.wr >= 4 && Math.random() < 0.3) fx.parts.emit(me.x + rnd(-0.6, 0.6), rnd(0.3, 2), me.z + rnd(-0.6, 0.6), { color: RARITIES[S.wr].color, size: 0.25, life: 0.8, speed: 0.4, gravity: 1.5 });

  // 他プレイヤー
  for (const o of others.values()) {
    const k = 1 - Math.exp(-12 * dt);
    const mx = o.tx - o.x, mz = o.tz - o.z;
    const moving = Math.hypot(mx, mz) > 0.03;
    o.x += mx * k; o.z += mz * k;
    let da = o.ta - o.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    o.a += da * k;
    o.swingT += dt; if (o.spinT >= 0) { o.spinT += dt; if (o.spinT > 0.55) o.spinT = -1; }
    if (moving) o.walkT += dt;
    o.model.position.set(o.x, groundHeight(o.x, o.z), o.z);
    o.model.rotation.y = o.a;
    animatePlayer(o.model, { t, moving, walkT: o.walkT, kind: o.wk, combo: o.combo, dead: o.dead, swing: o.swingT < 0.35 ? o.swingT / 0.35 : -1, spin: o.spinT >= 0 && o.wk === 'greatsword' ? o.spinT / 0.55 : -1, dodge: o.dg > 0 ? 0.5 : 0 });
  }

  // モンスター
  for (const mb of mobs.values()) {
    const k = 1 - Math.exp(-10 * dt);
    mb.x += (mb.tx - mb.x) * k; mb.z += (mb.tz - mb.z) * k;
    let da = mb.ta - mb.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    mb.a += da * k;
    mb.flash = Math.max(0, mb.flash - dt * 6);
    mb.model.position.set(mb.x, groundHeight(mb.x, mb.z), mb.z);
    mb.model.rotation.y = mb.a;
    animateMob(mb.model, { t: t + mb.id, st: mb.st, flash: mb.flash, enraged: mb.enraged });
    if (mb.kind === 2 && mb.enraged && Math.random() < 0.5) fx.parts.emit(mb.x + rnd(-2, 2), rnd(0.5, 5), mb.z + rnd(-2, 2), { color: 0xff3a20, size: 0.6, life: 0.8, speed: 1, gravity: 3 });
  }

  updateTeles();
  updateWaves(dt);
  updateDrops(dt);

  // 送信
  sendT -= dt;
  if (sendT <= 0) {
    sendT = 0.066;
    net.send({ t: 'st', x: +me.x.toFixed(2), z: +me.z.toFixed(2), a: +me.a.toFixed(2), hp: Math.round(me.hp), mhp: S.mhp, lv: char.lv, dead: me.dead, wk: S.wk, wr: S.wr, sw: me.sw, sk: me.sk, dg: me.dodgeT > 0 ? 1 : 0 });
  }
  saveT -= dt;
  if (saveT <= 0) { saveT = 10; saveChar(); }

  // BGM 切り替え（ボス戦中で部屋の近くならボス曲）
  const def = FLOORS[world.floor - 1];
  const bossNear = world.bossState === 'fight' && Math.hypot(me.x - LAIR_POS.x, me.z - LAIR_POS.z) < LAIR_RADIUS + 20;
  audio.setMusic(def.music, bossNear);

  // カメラ
  shake = Math.max(0, shake - dt * 2.5);
  const off = new THREE.Vector3(0, 15 * camZoom, 12.5 * camZoom);
  camPos.set(me.x, 0, me.z).add(off);
  camera.position.lerp(camPos, 1 - Math.exp(-8 * dt));
  if (shake > 0) camera.position.add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(shake * 0.35));
  camera.lookAt(camera.position.x, 1, camera.position.z - off.z);

  sun.position.set(me.x + 20, 40, me.z + 10);
  sun.target.position.set(me.x, 0, me.z);

  if (env) {
    env.gate.userData.anim(t); env.lair.userData.anim(t);
    const fighting = world.bossState === 'fight';
    for (const m of env.ringMats) m.opacity = fighting ? 0.6 + Math.sin(t * 6) * 0.3 : 0.45;
    if (Math.random() < 0.3) fx.parts.emit(GATE_POS.x + rnd(-3, 3), 0.5, GATE_POS.z + rnd(-0.5, 0.5), { color: 0x6ad0ff, size: 0.3, life: 1.5, speed: 0.5, gravity: 2 });
  }
  ambient.update(dt, me.x, me.z, t);
  fx.update(dt);
  updateFloat(dt);
  updateHud();
  drawMinimap();
}

function loop() {
  requestAnimationFrame(loop);
  const t = now();
  const dt = Math.min(0.05, t - lastT);
  lastT = t;
  if (started) update(dt);
  composer.render();
}

// ======================================================================
// ログイン
// ======================================================================
let startKind = 'sword';
for (const b of document.querySelectorAll('#lweapon button')) {
  b.onclick = () => { document.querySelectorAll('#lweapon button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); startKind = b.dataset.k; };
}
const existing = loadChar();
if (existing) {
  $('lname').value = existing.name; $('lcolor').value = existing.color;
  $('lexisting').textContent = `セーブデータあり: Lv${existing.lv} ${existing.name}（続きから）`;
  $('lweapon-wrap').style.display = 'none';
}

$('lstart').onclick = async () => {
  audio.init();
  const name = $('lname').value.trim() || 'プレイヤー';
  char = loadChar() || { name, color: $('lcolor').value, lv: 1, xp: 0, inv: [], eq: { weapon: starterWeapon(startKind), armor: null, acc: null } };
  char.name = name; char.color = $('lcolor').value;
  saveChar();
  $('lstart').disabled = true; $('lstart').textContent = '接続中…';
  const params = new URLSearchParams(location.search);
  const wsUrl = params.get('server') || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const ok = params.has('solo') || location.protocol === 'file:' ? false : await net.connect(wsUrl);
  if (!ok) await net.startSolo();
  $('mode-tag').textContent = ok ? 'ONLINE' : 'SOLO MODE（サーバー未接続）';
  me.model = makePlayer(char.color);
  scene.add(me.model);
  calcStats(); me.hp = S.mhp;
  $('login').classList.add('hidden');
  $('hud').classList.remove('hidden');
  started = true;
  net.send({ t: 'hello', name: char.name, color: char.color, lv: char.lv });
  addChat('', ok ? 'サーバーに接続しました。友達を誘おう！' : 'ソロモードで起動しました（npm start でサーバーを立てるとマルチプレイ）', '#9fe');
  setTimeout(() => $('help').classList.add('hidden'), 15000);
};

// ログイン背景用に第1層を表示
enterFloorPreview();
function enterFloorPreview() {
  const def = FLOORS[0];
  env = buildFloor(def);
  scene.add(env.group);
  scene.fog = new THREE.Fog(def.fog, def.fogNear, def.fogFar);
  hemi.color.set(def.hemi[0]); hemi.groundColor.set(def.hemi[1]);
  sun.color.set(def.sun); sun.intensity = def.sunI;
  sun.position.set(20, 40, 10);
  camera.position.set(30, 12, 30); camera.lookAt(0, 2, 0);
  ambient.setKind(def.particles);
  const spin = () => {
    if (started) return;
    const t = now() * 0.05;
    camera.position.set(Math.sin(t) * 45, 14, Math.cos(t) * 45); camera.lookAt(0, 2, 0);
    ambient.update(0.016, 0, 0, now());
    env.gate.userData.anim(now());
    fx.update(0.016);
    requestAnimationFrame(spin);
  };
  spin();
}
loop();

window.__game = { me, mobs, drops, teles, char: () => char, world, fx, S: () => S, net };
