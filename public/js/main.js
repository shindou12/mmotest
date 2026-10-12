import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  FLOORS, WEAPONS, RARITIES, AFFIXES, UNIQUE_FX, MAX_LEVEL, MAX_FLOOR, ARMOR_CLASSES,
  WEAPON_SKILL_POOL, xpToNext, baseAtk, baseHp, inShape, starterWeapon, makeItem, floorLevel, itemWeight, weightClass,
} from '../shared/data.js';
import { AREAS, AREA_TYPES, CELL, grid, collide, exitsOf, spawnPoint } from '../shared/areas.js';
import { AudioEngine } from './audio.js';
import { FX, makeTelegraph } from './fx.js';
import { buildArea, textSprite, AmbientParticles } from './env.js';
import { makePlayer, setPlayerWeapon, animatePlayer, makeMob, animateMob, makeLootOrb } from './models.js';
import { Net } from './net.js';
import {
  HEAVY, WEAPON_SKILLS, TREE_SKILLS, TREES, STYLE_COLS, NODE_INDEX,
  spTotal, spSpent, treeSpent, canLearn, treeEffects,
} from './skills.js';
import { QUESTS, QUEST_INDEX, questState, questAvailable, questProgress } from './quests.js';

const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => performance.now() / 1000;
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

// ======================================================================
// セーブデータ / 設定
// ======================================================================
const SAVE_KEY = 'eterna_char_v1';
const SET_KEY = 'eterna_settings_v1';
let char = null;
function loadChar() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } }
function saveChar() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(char)); } catch { /* */ } }

const params = new URLSearchParams(location.search);
const settings = {
  master: 1, music: 1, sfx: 1, amb: 1, quality: params.has('low') ? 'low' : 'high', shake: true, dmgnum: true,
};
try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY)) || {}); } catch { /* */ }
function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch { /* */ } }
const GRASS_BY_Q = { high: 1, mid: 0.5, low: 0.25 };

// ======================================================================
// レンダラー
// ======================================================================
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
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

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.45, 0.95);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

function applyQuality() {
  const q = settings.quality;
  bloomPass.enabled = q !== 'low';
  sun.castShadow = q !== 'low';
  renderer.setPixelRatio(q === 'high' ? Math.min(devicePixelRatio, 1.5) : 1);
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
}
applyQuality();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

const fx = new FX(scene);
const ambient = new AmbientParticles(scene);
const audio = new AudioEngine();
audio.setVolumes(settings);

// ======================================================================
// ゲーム状態
// ======================================================================
const CHARGE_MIN = 0.22, CHARGE_MAX = 0.9;
const DODGE_CD = 0.75;
const me = {
  id: 0, x: 0, z: 0, a: Math.PI, hp: 100, dead: false, deadT: 0,
  swingT: 9, swingDur: 0.4, combo: 0, lastSwing: 0, sw: 0, sk: 0, queued: 0,
  charging: false, chargeT: 0, chargeLv: 0, guarding: false, guardStart: 0,
  dodgeT: 0, dodgeCd: 0, dodgeDir: [0, 1], iframe: 0,
  wsCd: 0, tcd: {}, skillT: -1, spin: false, dashT: 0, dashA: 0, dashSpeed: 0,
  potions: 3, potCd: 0, lastHurt: -99, walkT: 0, moving: false, stepT: 0,
  buffs: [], ambush: 0, lastStandT: -999, transit: false,
  model: null,
};
const world = { area: 'f1_town', def: AREAS.f1_town, floor: 1, unlocked: 1, bossState: 'idle', door: false, plates: [] };
let env = null;
let S = null; // 計算済みステータス
const mobs = new Map();
const others = new Map();
const npcs = [];
const teles = [];
const drops = [];
const projs = [];
const pending = []; // 遅延処理
let roster = [];
let started = false;
let shake = 0;
let camZoom = 1;
const keys = new Set();
const mouse = { x: 0, y: 0, l: false, r: false, world: new THREE.Vector3() };
const heightAt = (x, z) => (env ? env.heightAt(x, z) : 0);

// ======================================================================
// バフ
// ======================================================================
function addBuff(id, label, sec, mods, color) {
  me.buffs = me.buffs.filter((b) => b.id !== id);
  me.buffs.push({ id, label, t: sec, max: sec, mods, color });
  audio.sfx('buff');
  fx.parts.burst(me.x, 1, me.z, 30, { color, speed: 4, size: 0.4, life: 0.8, gravity: 3 });
  fx.ringWave(me.x, me.z, color, 3, 0.4);
}
const hasBuff = (id) => me.buffs.some((b) => b.id === id);
const buffMod = (k) => me.buffs.reduce((a, b) => a + (b.mods[k] || 0), 0);

// ======================================================================
// ステータス計算（装備 + スキルツリー + 重量）
// ======================================================================
function weaponSkillId() {
  const w = char.eq.weapon;
  const kind = w ? w.kind : 'sword';
  const id = w?.skill;
  return id && WEAPON_SKILLS[id]?.kind === kind ? id : WEAPON_SKILL_POOL[kind][0];
}

function calcStats() {
  const eq = char.eq;
  const items = [eq.weapon, eq.armor, eq.acc].filter(Boolean);
  const aff = {};
  for (const it of items) for (const [k, v] of it.affixes) aff[k] = (aff[k] || 0) + v;
  const fxs = new Set(items.flatMap((i) => i.fx || []));
  const wk = eq.weapon ? eq.weapon.kind : 'sword';
  const T = treeEffects(char, wk);
  const m = (k) => (aff[k] || 0) + (T.mods[k] || 0);
  for (const f of T.flags) fxs.add(f);
  const atk = (baseAtk(char.lv) + (eq.weapon?.atk || 0) + (eq.acc?.atk || 0)) * (1 + m('atkp') / 100);
  const mhp = (baseHp(char.lv) + (eq.armor?.hp || 0) + (eq.acc?.hp || 0)) * (1 + m('hpp') / 100);
  const weight = items.reduce((a, it) => a + itemWeight(it), 0);
  const wc = weightClass(weight);
  S = {
    wk, W: WEAPONS[wk], atk, mhp: Math.round(mhp), fx: fxs, flags: T.flags, actives: T.actives,
    crit: 5 + m('crit'), critd: 150 + m('critd'), aspd: m('aspd'), move: m('move'),
    vamp: m('vamp') + (fxs.has('vamp') ? 4 : 0), cdr: Math.min(60, m('cdr') + (fxs.has('star') ? 35 : 0)),
    def: Math.min(65, m('def') + (eq.armor?.def || 0)), wr: eq.weapon ? eq.weapon.rarity : 0,
    normp: m('normp'), heavyp: m('heavyp'), wskillp: m('wskillp'), dodgecd: Math.min(60, m('dodgecd')),
    justbuff: m('justbuff'), counter: m('counter'), backwater: m('backwater'), maxPot: 3 + m('potion') + (char.potBonus || 0),
    ws: WEAPON_SKILLS[weaponSkillId()], weight, wc,
    dodgeCd: DODGE_CD * wc.cd * (1 - Math.min(60, m('dodgecd')) / 100),
  };
  me.hp = Math.min(me.hp, S.mhp);
  if (me.model) setPlayerWeapon(me.model, S.wk, S.wr);
  $('s-guard').classList.toggle('hidden', !S.W.guard);
  $('ws-key').textContent = S.W.guard ? 'E' : '右 / E';
}

function itemPower(it) {
  if (!it) return 0;
  let p = (it.atk || 0) * 3 + (it.hp || 0) * 0.5 + (it.def || 0) * 4;
  for (const [, v] of it.affixes) p += v * (it.atk || 10) * 0.15 + v * 0.5;
  if (it.fx) p *= 1 + it.fx.length * 0.25;
  return Math.round(p);
}

// ======================================================================
// 入力
// ======================================================================
const chatIn = $('chat-in');
const PANELS = ['inv', 'gate-menu', 'tree', 'settings', 'map', 'dialog'];
const anyPanel = () => PANELS.some((p) => !$(p).classList.contains('hidden'));
addEventListener('keydown', (e) => {
  if (!started) return;
  if (document.activeElement === chatIn) {
    if (e.key === 'Enter') { const t = chatIn.value.trim(); if (t) net.send({ t: 'chat', text: t }); chatIn.value = ''; chatIn.blur(); }
    if (e.key === 'Escape') chatIn.blur();
    return;
  }
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === 'enter') { chatIn.focus(); e.preventDefault(); }
  if (k === ' ' || k === 'shift') { tryDodge(); e.preventDefault(); }
  if (k === 'q') usePotion();
  if (k === 'e') tryWeaponSkill();
  if (k === '1') tryTreeSkill(0);
  if (k === '2') tryTreeSkill(1);
  if (k === 'i' || k === 'tab') { togglePanel('inv'); e.preventDefault(); }
  if (k === 'k') togglePanel('tree');
  if (k === 'm') togglePanel('map');
  if (k === 'o') togglePanel('settings');
  if (k === 'f') interact();
  if (k === 'h') $('help').classList.toggle('hidden');
  if (k === 'escape') {
    if (anyPanel()) { PANELS.forEach((p) => $(p).classList.add('hidden')); $('tooltip').classList.add('hidden'); }
    else togglePanel('settings');
  }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); mouse.l = mouse.r = false; me.charging = false; me.guarding = false; });
canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('mousedown', (e) => {
  audio.init();
  if (!started) return;
  if (e.button === 0) { mouse.l = true; me.charging = true; me.chargeT = 0; me.chargeLv = 0; }
  if (e.button === 2) {
    mouse.r = true;
    // 盾槍は右クリック長押しでガード。それ以外は武器スキル
    if (S?.W.guard) { if (!me.dead) { me.guarding = true; me.guardStart = now(); me.charging = false; audio.sfx('equip'); } }
    else tryWeaponSkill();
  }
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    mouse.l = false;
    if (me.charging && started) {
      me.charging = false;
      if (me.chargeT < CHARGE_MIN) me.queued = now() + 0.45; // 短押し → 通常攻撃（入力を少しの間覚えておく）
      else doHeavy(me.chargeLv);
    }
  }
  if (e.button === 2) { mouse.r = false; me.guarding = false; }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { camZoom = clamp(camZoom + e.deltaY * 0.001, 0.6, 1.6); });
$('s-inv').addEventListener('click', () => togglePanel('inv'));
$('s-tree').addEventListener('click', () => togglePanel('tree'));
$('s-set').addEventListener('click', () => togglePanel('settings'));
$('s-map').addEventListener('click', () => togglePanel('map'));

function togglePanel(id) {
  const el = $(id);
  const open = el.classList.contains('hidden');
  PANELS.forEach((p) => $(p).classList.add('hidden'));
  $('tooltip').classList.add('hidden');
  if (!open) return;
  el.classList.remove('hidden');
  audio.sfx('ui');
  if (id === 'inv') renderInv();
  if (id === 'tree') renderTree();
  if (id === 'settings') renderSettings();
  if (id === 'map') renderMap();
}

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
      enterArea(m.area, m.x, m.z);
      break;
    case 'warped': enterArea(m.area, m.x, m.z); break;
    case 'snap': onSnap(m); break;
    case 'roster': roster = m.r; world.unlocked = m.unlocked; renderParty(); break;
    case 'tele': onTele(m); break;
    case 'die': onMobDie(m); break;
    case 'xp':
      gainXp(m.n);
      questEvent(m.boss ? { type: 'boss', floor: m.boss } : { type: 'kill', name: m.nm, area: m.ar });
      break;
    case 'loot':
      for (const d of m.items) spawnDrop(d.it, d.x, d.z);
      if (m.src === 'chest') {
        char.chests = char.chests || {};
        char.chests[m.ar] = Date.now();
        questEvent({ type: 'chest', area: m.ar });
        audio.sfx('clear');
        saveChar();
      }
      break;
    case 'door': if (m.open) { world.door = true; audio.sfx('impact'); addShake(0.4); } break;
    case 'chat': addChat(m.from, m.text, m.color); break;
    case 'leave': removeOther(m.id); break;
    case 'unlock': world.unlocked = m.unlocked; break;
    case 'bossStart': {
      banner(`第${m.n}層ボス`, m.name, '#ff6a6a', 3);
      audio.sfx('roar'); addShake(1.2);
      break;
    }
    case 'enrage': {
      const final = m.p === 3;
      banner(final ? '最終形態' : '激昂', final ? 'ボスが本気を出した！' : '攻撃が激しくなる…', final ? '#ff4ab0' : '#ff5a5a', 3);
      audio.sfx(final ? 'phase' : 'enrage'); addShake(final ? 1.4 : 0.8);
      const b = mobs.get(m.id);
      if (b) {
        fx.parts.burst(b.x, 3, b.z, final ? 200 : 80, { color: final ? 0xff40c0 : 0xff3020, size: 0.8, speed: 14, life: 1.2 });
        fx.ringWave(b.x, b.z, final ? 0xff40c0 : 0xff3020, 18, 0.8);
      }
      break;
    }
    case 'bossClear': {
      banner(`第${m.n}層 攻略`, 'CONGRATULATIONS!', '#ffd84a', 3);
      audio.sfx('clear');
      const L = env?.lair || { x: 0, z: 0 };
      for (let i = 0; i < 6; i++) setTimeout(() => fx.parts.burst(L.x + rnd(-8, 8), rnd(4, 10), L.z + rnd(-8, 8), 80, { color: [0xffd84a, 0x6ad0ff, 0xff6ab0][i % 3], size: 0.6, speed: 10, life: 1.5, gravity: -4 }), i * 250);
      break;
    }
    case 'bossReset': toast('ボスが退却した…（全員が離脱）', '#aaa'); break;
    case 'disconnected': addChat('', 'サーバーとの接続が切れました。ページを再読み込みしてください。', '#f66'); break;
  }
}

// ======================================================================
// エリア
// ======================================================================
function buildEnv(id) {
  if (env) fx.dispose(env.group);
  const def = AREAS[id];
  env = buildArea(def, FLOORS[def.floor - 1], { grass: GRASS_BY_Q[settings.quality] ?? 1 });
  scene.add(env.group);
  const L = env.light;
  scene.fog = new THREE.Fog(L.fog, L.fogNear, L.fogFar);
  hemi.intensity = L.hemi; sun.intensity = L.sun;
}

function enterArea(id, x, z) {
  const def = AREAS[id];
  const prev = world.area;
  world.area = id; world.def = def; world.floor = def.floor;
  world.door = false; world.plates = []; world.bossState = 'idle';
  const fdef = FLOORS[def.floor - 1];
  buildEnv(id);
  hemi.color.set(fdef.hemi[0]); hemi.groundColor.set(fdef.hemi[1]);
  sun.color.set(fdef.sun);
  const indoor = def.shape === 'grid';
  ambient.setKind(indoor ? 'dust' : fdef.particles);
  for (const mid of [...mobs.keys()]) removeMob(mid);
  for (const oid of [...others.keys()]) removeOther(oid);
  for (const t of teles.splice(0)) t.meshes.forEach((mm) => fx.dispose(mm));
  for (const d of drops.splice(0)) disposeDrop(d);
  buildNpcs(def);
  me.x = x; me.z = z; me.a = Math.PI; me.transit = false;
  for (const p of env.portals) p.armed = Math.hypot(p.x - x, p.z - z) > p.r + 1.5;
  if (S && (def.type === 'town' || def.type === 'camp')) me.potions = S.maxPot;
  audio.setMusic(fdef.music, false);
  audio.setAmbient(indoor ? 'cave' : fdef.amb);
  const T = AREA_TYPES[def.type];
  banner(`第${def.floor}層 ・ ${T.name}`, def.name, T.color);
  $('me-floor').textContent = `第${def.floor}層 ${def.name}`;
  audio.sfx('warp');
  fx.beam(me.x, me.z, 0x6ad0ff, 12, 1.2, 1.2);
  if (prev !== id) questEvent({ type: 'visit', area: id });
  if (!$('map').classList.contains('hidden')) renderMap();
}

// ---- NPC ----
function buildNpcs(def) {
  for (const n of npcs.splice(0)) fx.dispose(n.model);
  for (const d of def.npcs || []) {
    const model = makePlayer(d.color);
    model.userData.ring.visible = false;
    model.position.set(d.x, heightAt(d.x, d.z), d.z);
    scene.add(model);
    const n = { ...d, model, label: null, mark: '' };
    npcs.push(n);
  }
  refreshNpcMarks();
}
function npcMark(id) {
  const qs = QUESTS.filter((q) => q.npc === id);
  if (qs.some((q) => questState(char, q.id)?.done && !questState(char, q.id)?.claimed)) return '？ 報告できる';
  if (qs.some((q) => questAvailable(char, q))) return '！ 依頼あり';
  return '';
}
function refreshNpcMarks() {
  if (!char) return;
  for (const n of npcs) {
    const mark = npcMark(n.id);
    if (n.label && mark === n.mark) continue;
    if (n.label) { n.model.remove(n.label); n.label.material.map.dispose(); }
    n.mark = mark;
    n.label = textSprite(n.name, mark ? '#ffd84a' : '#ffffff', 4, mark);
    n.label.position.y = 3.1;
    n.model.add(n.label);
  }
}

// ======================================================================
// スナップショット適用
// ======================================================================
function onSnap(m) {
  if (m.ar !== world.area) return;
  world.bossState = m.bs;
  world.door = !!m.door;
  world.plates = m.pl || [];
  const seenP = new Set();
  for (const p of m.p) {
    const [id, name, x, z, a, hp, mhp, lv, color, wk, wr, sw, sk, dead, dg, gd] = p;
    if (id === me.id) continue;
    seenP.add(id);
    let o = others.get(id);
    if (!o) {
      o = { id, model: makePlayer(color), x, z, a, swingT: 9, combo: 0, sw, sk, spinT: -1, walkT: 0, plate: makePlate(name, true) };
      scene.add(o.model);
      others.set(id, o);
    }
    Object.assign(o, { tx: x, tz: z, ta: a, hp, mhp, lv, name, dead, dg, wk, wr, gd });
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
  const fdef = FLOORS[world.floor - 1];
  for (const r of m.m) {
    const [id, d, x, z, a, hp, mhp, lv, st, kind, enr, elite, target] = r;
    seenM.add(id);
    let mb = mobs.get(id);
    if (!mb) {
      let model, name, rad;
      if (kind === 2) {
        const b = fdef.boss;
        model = makeMob(b.t, b.color, b.scale, b.accent, true);
        name = b.name; rad = 0.9 * b.scale;
      } else {
        const md = fdef.mobs[d];
        const sc = kind === 1 ? 0.8 : elite ? 1.3 : 1;
        model = makeMob(md.t, md.color, sc, elite ? 0xffb030 : null);
        name = elite === 2 ? '門番' : (elite ? '精鋭 ' : '') + md.name;
        rad = 0.75 * sc;
      }
      mb = { id, model, name, rad, kind, elite, x, z, a, hp, mhp, lv, st, flash: 0, label: null, localT: 0, poisonUntil: 0, poisonT: 0 };
      if (kind !== 2) mb.label = makeMobLabel(mb);
      model.position.set(x, heightAt(x, z), z);
      scene.add(model);
      mobs.set(id, mb);
      if (kind === 2) {
        fx.parts.burst(x, 2, z, 120, { color: fdef.boss.accent, size: 1, speed: 14, life: 1.2 });
        fx.ringWave(x, z, fdef.boss.accent, 14, 0.8);
        fx.flash(x, 4, z, fdef.boss.accent, 80, 0.6, 30);
      }
    }
    Object.assign(mb, { tx: x, tz: z, ta: a, mhp, lv, st, enraged: !!enr, target });
    // ローカル予測ダメージを少しの間優先
    if (now() - mb.localT > 0.4) mb.hp = hp; else mb.hp = Math.min(mb.hp, hp);
  }
  for (const id of [...mobs.keys()]) if (!seenM.has(id)) removeMob(id);
}

function removeMob(id) {
  const mb = mobs.get(id);
  if (!mb) return;
  if (mb.label) mb.label.material.map.dispose();
  fx.dispose(mb.model);
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
  const fdef = FLOORS[world.floor - 1];
  const col = mb ? (m.boss ? fdef.boss.accent : fdef.mobs[0].color) : 0xffffff;
  // ポリゴン片が砕け散る演出
  fx.parts.burst(m.x, 1.2, m.z, m.boss ? 300 : 40, { color: 0x9ad8ff, size: m.boss ? 0.9 : 0.45, speed: m.boss ? 16 : 7, life: m.boss ? 2 : 0.9, gravity: -3 });
  fx.parts.burst(m.x, 1.2, m.z, m.boss ? 100 : 15, { color: col, size: 0.6, speed: 5, life: 1 });
  fx.flash(m.x, 2, m.z, 0x9ad8ff, m.boss ? 100 : 20, 0.4);
  audio.sfx('mobdie');
  if (m.boss) { addShake(1.5); audio.sfx('impact'); }
  removeMob(m.id);
}

// ======================================================================
// テレグラフ（予兆）と被弾判定
// ======================================================================
function onTele(m) {
  const color = m.c || '#ff3030';
  const meshes = m.sh.map((s) => { const g = makeTelegraph(s, color, heightAt); scene.add(g); return g; });
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
  if (big && nearSrc) { audio.sfx('impact'); addShake(0.35); }
  if (me.dead) return;
  const hit = te.sh.some((s) => inShape(s, me.x, me.z));
  if (!hit) return;
  if (me.iframe > 0) { onJustDodge(); return; }
  if (S.fx.has('aegis') && Math.random() < 0.25) {
    floatText(me.x, 2.4, me.z, '無効化!', 'info');
    audio.sfx('block');
    fx.ringWave(me.x, me.z, 0xffd84a, 2, 0.3, 1);
    return;
  }
  let raw = te.dmg;
  // 盾槍のガード（攻撃してきた方向が正面なら軽減）
  if (me.guarding && S.W.guard) {
    const src = mobs.get(te.src) || { x: te.sh[0].x, z: te.sh[0].z };
    const dirTo = Math.atan2(src.x - me.x, src.z - me.z);
    const centered = Math.hypot(src.x - me.x, src.z - me.z) < 0.5;
    if (centered || Math.abs(angDiff(dirTo, me.a)) < THREE.MathUtils.degToRad(80)) {
      const bulwark = S.flags.has('bulwark');
      const justWin = 0.28 + (bulwark ? 0.15 : 0);
      if (te.src) net.send({ t: 'threat', id: te.src, n: Math.round(te.dmg * 3) });
      if (now() - me.guardStart <= justWin) {
        floatText(me.x, 2.8, me.z, 'JUST GUARD!', 'just');
        audio.sfx('perfect'); audio.sfx('block');
        fx.ringWave(me.x, me.z, 0xbfe0ff, 4, 0.35);
        combat.circle(me.x, me.z, 4, 1.6, { type: 'proc', noProc: true, threat: 3 });
        return;
      }
      raw *= bulwark ? 0 : 0.25;
      audio.sfx('block');
      fx.parts.burst(me.x + Math.sin(me.a) * 0.8, 1.2, me.z + Math.cos(me.a) * 0.8, 14, { color: 0xbfe0ff, speed: 5, size: 0.4, life: 0.35 });
      if (raw <= 0) { floatText(me.x, 2.4, me.z, '防御', 'info'); return; }
    }
  }
  const dr = clamp(buffMod('dr'), -100, 90);
  const dmg = Math.max(1, Math.round(raw * (1 - S.def / 100) * (1 - dr / 100) * rnd(0.9, 1.1)));
  me.hp -= dmg;
  me.lastHurt = now();
  floatText(me.x, 2.2, me.z, dmg, 'me');
  audio.sfx('hurt');
  addShake(0.3);
  $('vignette').style.boxShadow = 'inset 0 0 160px rgba(255,0,0,.55)';
  setTimeout(() => { $('vignette').style.boxShadow = 'inset 0 0 120px rgba(255,0,0,0)'; }, 180);
  if (me.hp <= 0 && S.flags.has('laststand') && now() - me.lastStandT > 90) {
    me.hp = 1; me.lastStandT = now(); me.iframe = 1.0;
    floatText(me.x, 2.8, me.z, '不屈!', 'just');
    audio.sfx('perfect');
    fx.beam(me.x, me.z, 0xffd84a, 8, 0.8, 0.8);
    return;
  }
  if (me.hp <= 0) die();
}

function onJustDodge() {
  floatText(me.x, 2.6, me.z, 'JUST回避!', 'just');
  audio.sfx('perfect');
  fx.ringWave(me.x, me.z, 0x9affff, 3, 0.3);
  if (S.justbuff > 0) addBuff('just', '見切り', 3, { dmgp: S.justbuff }, 0x9affff);
  if (S.counter > 0) {
    combat.circle(me.x, me.z, 5, S.counter / 100, { type: 'proc', noProc: true });
    fx.ringWave(me.x, me.z, 0xbff8ff, 5.5, 0.35);
  }
  if (S.fx.has('mirror')) {
    addBuff('mirror', '八咫の加護', 5, { dmgp: 50 }, 0xffffff);
    fx.ringWave(me.x, me.z, 0xffffff, 7, 0.5);
    fx.parts.burst(me.x, 1, me.z, 60, { color: 0xbff8ff, speed: 10, size: 0.6 });
    combat.circle(me.x, me.z, 6, 3.0, { type: 'proc', noProc: true });
  }
}

function die() {
  me.hp = 0; me.dead = true; me.deadT = 5; me.charging = false; me.guarding = false; me.buffs = [];
  audio.sfx('death');
  fx.parts.burst(me.x, 1, me.z, 80, { color: 0x9ad8ff, speed: 8, size: 0.5, life: 1.2 });
  $('death').classList.remove('hidden');
}

// ======================================================================
// 戦闘（プレイヤー側）
// ======================================================================
function aimAngle() { return Math.atan2(mouse.world.x - me.x, mouse.world.z - me.z); }
function addShake(v) { if (settings.shake) shake = Math.max(shake, v); }

const TYPE_MOD = { normal: 'normp', heavy: 'heavyp', wskill: 'wskillp' };
function dealDamage(mb, mult, o = {}) {
  if (!mb || mb.hp <= 0) return;
  const skill = o.type === 'wskill' || o.type === 'tskill';
  let crit = o.crit || Math.random() * 100 < S.crit + buffMod('crit') || (skill && S.fx.has('skillcrit'));
  if (!crit && me.ambush > 0 && !o.noProc) { crit = true; me.ambush--; }
  const typeMult = 1 + (S[TYPE_MOD[o.type]] || 0) / 100;
  const back = me.hp < S.mhp * 0.5 ? 1 + S.backwater / 100 : 1;
  let dmg = S.atk * (1 + buffMod('atkp') / 100) * mult * typeMult * back * (1 + buffMod('dmgp') / 100) * rnd(0.92, 1.08) * (crit ? S.critd / 100 : 1);
  dmg = Math.max(1, Math.round(dmg));
  mb.hp -= dmg; mb.localT = now(); mb.flash = 1;
  net.send({ t: 'hit', id: mb.id, dmg, crit });
  if (o.threat > 1) net.send({ t: 'threat', id: mb.id, n: Math.round(dmg * (o.threat - 1)) });
  floatText(mb.x, 2.2 * (mb.kind === 2 ? 2.5 : 1), mb.z, dmg, o.type === 'dot' ? 'poison' : crit ? 'crit' : '');
  if (o.type !== 'dot') {
    const wc = RARITIES[S.wr].color;
    fx.parts.burst(mb.x, 1.2, mb.z, crit ? 18 : 8, { color: crit ? 0xffd84a : wc, speed: crit ? 9 : 6, size: crit ? 0.5 : 0.35, life: 0.4 });
    audio.sfx('hit', { crit });
  }
  if (S.vamp > 0) heal(dmg * S.vamp / 100, false);
  if (o.noProc) return;
  if (hasBuff('poison')) mb.poisonUntil = now() + 4;
  if (crit && S.fx.has('thunder')) {
    later(0.08, () => {
      fx.lightning(mb.x, mb.z); audio.sfx('thunder'); addShake(0.2);
      combat.circle(mb.x, mb.z, 3.5, 1.5, { noProc: true });
    });
  }
  if (S.fx.has('flame') && Math.random() < 0.35) {
    fx.parts.burst(mb.x, 0.8, mb.z, 25, { color: 0xff6a20, speed: 4, size: 0.6, life: 0.7, gravity: 3 });
    audio.sfx('flame');
    for (const m2 of mobs.values()) if (m2 !== mb && Math.hypot(m2.x - mb.x, m2.z - mb.z) < 2.8 + m2.rad) dealDamage(m2, 0.6, { noProc: true });
  }
}

function later(sec, fn) { pending.push({ at: now() + sec, fn }); }

// スキルから使う戦闘コンテキスト（skills.js の c）
const combat = {
  me,
  fx,
  S: () => S,
  aim: aimAngle,
  col: () => RARITIES[S.wr].color,
  later,
  sfx: (n, o) => audio.sfx(n, o),
  text: (t, cls) => floatText(me.x, 3, me.z, t, cls),
  shake: addShake,
  hit: (mb, mult, o) => dealDamage(mb, mult, o),
  heal: (frac) => heal(S.mhp * frac, true),
  buff: addBuff,
  taunt: (r) => net.send({ t: 'taunt', r }),
  arc(range, deg, mult, o = {}) {
    const a = o.a ?? me.a, arc = THREE.MathUtils.degToRad(deg) / 2;
    for (const mb of [...mobs.values()]) {
      const dx = mb.x - me.x, dz = mb.z - me.z, d = Math.hypot(dx, dz);
      if (d > range + mb.rad) continue;
      if (Math.abs(angDiff(Math.atan2(dx, dz), a)) <= arc + mb.rad / Math.max(d, 0.5) || d < mb.rad + 0.6) dealDamage(mb, mult, o);
    }
  },
  line(len, w, mult, o = {}) {
    const a = o.a ?? me.a, sx = o.sx ?? me.x, sz = o.sz ?? me.z;
    const fx_ = Math.sin(a), fz = Math.cos(a);
    for (const mb of [...mobs.values()]) {
      const dx = mb.x - sx, dz = mb.z - sz;
      const along = dx * fx_ + dz * fz, side = Math.abs(dx * fz - dz * fx_);
      if (along > -mb.rad && along < len + mb.rad && side < w / 2 + mb.rad) dealDamage(mb, mult, o);
    }
  },
  circle(x, z, r, mult, o = {}) {
    for (const mb of [...mobs.values()]) if (Math.hypot(mb.x - x, mb.z - z) < r + mb.rad) dealDamage(mb, mult, o);
  },
  proj(o) {
    const color = o.color ?? RARITIES[S.wr].color;
    const mesh = fx.waveMesh(color);
    mesh.position.set(me.x, 1, me.z); mesh.rotation.y = o.a;
    projs.push({ mesh, x: me.x, z: me.z, a: o.a, t: 0, speed: o.speed ?? 22, life: o.life ?? 0.7, rad: o.rad ?? 1.8, mult: o.mult ?? 1.4, type: o.type, hit: new Set() });
    audio.sfx('wave');
  },
  dash(a, dist, dur, iframe) {
    me.dashA = a; me.dashT = dur; me.dashSpeed = dist / dur; me.a = a;
    if (iframe) me.iframe = Math.max(me.iframe, iframe);
  },
  nearest(range) {
    let best = null, bd = range;
    for (const mb of mobs.values()) { const d = Math.hypot(mb.x - me.x, mb.z - me.z); if (d < bd) { bd = d; best = mb; } }
    return best;
  },
};

function canAct() { return S && !me.dead && me.dodgeT <= 0 && me.skillT < 0 && me.dashT <= 0 && !me.guarding; }

function doSwing() {
  const W = S.W;
  me.combo = now() - me.lastSwing < W.speed * 2.2 ? (me.combo + 1) % 3 : 0;
  me.lastSwing = now();
  me.swingT = 0;
  me.swingDur = W.speed * (1 - (S.aspd + buffMod('aspd')) / 100) * (me.combo === 2 ? 1.25 : 1);
  me.sw++;
  me.a = aimAngle();
  const mult = W.mult * [1, 1.1, 1.6][me.combo];
  const col = RARITIES[S.wr].color;
  fx.slash(me.x, me.z, me.a, W.range, W.arc, col, 1.0, me.combo % 2 === 1);
  audio.sfx('swing', { heavy: S.wk === 'greatsword' || me.combo === 2 });
  const a = me.a;
  later(0.06, () => combat.arc(W.range, W.arc, mult, { a, type: 'normal' }));
  if (me.combo === 2 && S.fx.has('wave')) combat.proj({ a, mult: 1.4, type: 'normal' });
}

function doHeavy(lv) {
  if (!canAct() || lv < 1) return;
  me.a = aimAngle();
  me.swingT = 0; me.swingDur = 0.5; me.combo = 2; me.sw++;
  audio.sfx('heavy');
  fx.flash(me.x, 1.5, me.z, RARITIES[S.wr].color, lv === 2 ? 30 : 15, 0.3);
  HEAVY[S.wk].run(combat, lv);
}

function tryWeaponSkill() {
  if (!canAct() || me.wsCd > 0) return;
  const sk = S.ws;
  me.wsCd = sk.cd * (1 - S.cdr / 100);
  startSkill(sk);
}

function tryTreeSkill(i) {
  if (!S) return;
  const id = char.slots?.[i];
  if (!id) { toast(`スロット${i + 1}は空です（Kでスキルツリー）`, '#aab'); return; }
  if (!S.actives.has(id)) { toast(`${TREE_SKILLS[id].name}は今の武器では使えません`, '#f99'); return; }
  if (!canAct() || (me.tcd[id] || 0) > 0) return;
  const sk = TREE_SKILLS[id];
  me.tcd[id] = sk.cd * (1 - S.cdr / 100);
  startSkill(sk);
}

function startSkill(sk) {
  me.skillT = 0; me.spin = !!sk.spin; me.sk++;
  me.a = aimAngle();
  me.charging = false;
  audio.sfx('skill');
  floatText(me.x, 3, me.z, sk.name, 'info');
  fx.flash(me.x, 2, me.z, RARITIES[S.wr].color, 25, 0.4);
  sk.run(combat);
}

function updateProjs(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const w = projs[i];
    w.t += dt;
    w.x += Math.sin(w.a) * w.speed * dt; w.z += Math.cos(w.a) * w.speed * dt;
    w.mesh.position.set(w.x, 1, w.z);
    w.mesh.material.opacity = 0.9 * (1 - w.t / w.life);
    w.mesh.scale.setScalar(1 + w.t * 1.5);
    fx.parts.emit(w.x, 1, w.z, { color: w.mesh.material.color, size: 0.4, life: 0.3, speed: 1, gravity: 0 });
    for (const mb of [...mobs.values()]) {
      if (w.hit.has(mb.id)) continue;
      if (Math.hypot(mb.x - w.x, mb.z - w.z) < w.rad + mb.rad) { w.hit.add(mb.id); dealDamage(mb, w.mult, { type: w.type, noProc: true }); }
    }
    const c = collide(world.def, w.x, w.z, 0.1, world.door);
    if (w.t > w.life || Math.hypot(c.x - w.x, c.z - w.z) > 0.05) { fx.dispose(w.mesh); projs.splice(i, 1); }
  }
}

function tryDodge() {
  audio.init();
  if (!S || me.dead || me.dodgeCd > 0 || me.dashT > 0) return;
  let dx = 0, dz = 0;
  if (keys.has('w')) dz -= 1; if (keys.has('s')) dz += 1; if (keys.has('a')) dx -= 1; if (keys.has('d')) dx += 1;
  if (!dx && !dz) { dx = Math.sin(me.a); dz = Math.cos(me.a); }
  const l = Math.hypot(dx, dz);
  const after = hasBuff('afterimage');
  me.dodgeDir = [dx / l, dz / l];
  me.dodgeT = 0.38;
  me.dodgeCd = S.dodgeCd * (after ? 0.25 : 1);
  me.iframe = after ? 0.6 : 0.32;
  me.swingT = 9; me.skillT = -1; me.charging = false; me.guarding = false;
  audio.sfx('dodge');
  fx.parts.burst(me.x, 0.3, me.z, 12, { color: after ? 0x9affff : 0xdddddd, speed: 3, size: 0.4, life: 0.4, gravity: 1 });
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
    toast('スキルポイント +1（Kでスキルツリー）', '#ffd84a');
    if (!$('tree').classList.contains('hidden')) renderTree();
  }
  saveChar();
}

// ======================================================================
// クエスト
// ======================================================================
function questEvent(ev) {
  if (!char) return;
  const changed = questProgress(char, ev);
  for (const q of changed) {
    const st = questState(char, q.id);
    if (st.done) { toast(`クエスト達成：「${q.name}」 依頼人に報告しよう`, '#ffd84a', true); audio.sfx('clear'); }
    else toast(`${q.name} ${st.p} / ${q.n}`, '#bfe6ff');
  }
  if (changed.length) { saveChar(); renderQuests(); refreshNpcMarks(); }
}

function renderQuests() {
  const active = QUESTS.filter((q) => { const s = questState(char, q.id); return s && !s.claimed; });
  $('quests').classList.toggle('hidden', !active.length);
  $('quests').innerHTML = '<div class="dim">クエスト</div>' + active.map((q) => {
    const s = questState(char, q.id);
    return `<div class="qi ${s.done ? 'done' : ''}"><b>${esc(q.name)}</b><span>${s.done ? '達成！報告しよう' : `${s.p} / ${q.n}`}</span><small>${esc(q.desc)}</small></div>`;
  }).join('');
}

function openDialog(n) {
  const qs = QUESTS.filter((q) => q.npc === n.id);
  let h = `<div class="inv-head"><b>${esc(n.name)}</b><button id="dialog-close">×</button></div><p class="npc-line">「${esc(n.line)}」</p>`;
  for (const q of qs) {
    const s = questState(char, q.id);
    const avail = questAvailable(char, q);
    if (!s && !avail) continue;
    const rw = [`経験値 ${q.reward.xp}`, q.reward.rarity != null ? `${RARITIES[q.reward.rarity].name}以上の${q.reward.slot ? { weapon: '武器', armor: '防具', acc: '装飾品' }[q.reward.slot] : '装備'}` : '', q.reward.potion ? `ポーション所持数 +${q.reward.potion}` : ''].filter(Boolean).join('・');
    let btn = '';
    if (!s) btn = `<button data-acc="${q.id}">受ける</button>`;
    else if (s.claimed) btn = '<span class="dim">完了</span>';
    else if (s.done) btn = `<button class="claim" data-claim="${q.id}">報告する</button>`;
    else btn = `<span class="dim">${s.p} / ${q.n}</span>`;
    h += `<div class="quest ${s?.claimed ? 'claimed' : ''}"><div><b>${esc(q.name)}</b><div class="dim">${esc(q.desc)}</div><div class="rw">報酬：${rw}</div></div>${btn}</div>`;
  }
  if (!qs.some((q) => questState(char, q.id) || questAvailable(char, q))) h += '<div class="dim">今はお願いしたいことはないよ。</div>';
  $('dialog').innerHTML = h;
  PANELS.forEach((p) => $(p).classList.add('hidden'));
  $('dialog').classList.remove('hidden');
  $('dialog-close').onclick = () => $('dialog').classList.add('hidden');
  for (const b of $('dialog').querySelectorAll('[data-acc]')) b.onclick = () => {
    char.quests = char.quests || {};
    char.quests[b.dataset.acc] = { p: 0 };
    audio.sfx('equip'); saveChar(); renderQuests(); refreshNpcMarks(); openDialog(n);
    // すでに条件を満たしているもの（到達など）
    const q = QUEST_INDEX[b.dataset.acc];
    if (q.type === 'visit' && world.area === q.target) questEvent({ type: 'visit', area: q.target });
  };
  for (const b of $('dialog').querySelectorAll('[data-claim]')) b.onclick = () => { claimQuest(QUEST_INDEX[b.dataset.claim]); openDialog(n); };
}

function claimQuest(q) {
  const s = questState(char, q.id);
  if (!s?.done || s.claimed) return;
  s.claimed = true;
  const r = q.reward;
  if (r.rarity != null) {
    const ilvl = Math.max(char.lv, floorLevel(world.floor) + 3);
    const rar = Math.max(r.rarity, Math.random() < 0.15 ? r.rarity + 1 : r.rarity);
    const it = makeItem(ilvl, Math.min(5, rar), r.slot ? { slot: r.slot } : {});
    spawnDrop(it, me.x + rnd(-1, 1), me.z + rnd(1, 2));
  }
  if (r.potion) { char.potBonus = (char.potBonus || 0) + r.potion; calcStats(); me.potions = S.maxPot; toast(`ポーションの所持数が ${S.maxPot} になった`, '#6aff8a'); }
  banner('クエスト完了', q.name, '#ffd84a', 2);
  audio.sfx('levelup');
  gainXp(r.xp);
  saveChar(); renderQuests(); refreshNpcMarks();
}

// ======================================================================
// 調べる（F）: 転移門 / NPC / レバー / 宝箱
// ======================================================================
function nearestInteract() {
  if (me.dead) return null;
  const def = world.def;
  const d = (p) => Math.hypot(p.x - me.x, p.z - me.z);
  if (def.gate && d(def.gate) < 6) return { kind: 'gate', label: '<kbd>F</kbd> 転移門を使う（ポーション補充済み）' };
  for (const n of npcs) if (d(n) < 3.2) return { kind: 'npc', npc: n, label: `<kbd>F</kbd> ${esc(n.name)}と話す` };
  if (def.shape === 'grid') {
    const g = grid(def);
    const L = g.pts.L?.[0];
    if (L && d(L) < 3.5 && !world.door) return { kind: 'lever', label: '<kbd>F</kbd> レバーを引く' };
    const C = g.pts.C?.[0];
    if (C && d(C) < 3.5) return { kind: 'chest', label: chestOpen() ? '宝箱は空っぽだ（しばらくすると中身が戻る）' : '<kbd>F</kbd> 宝箱を開ける' };
  }
  return null;
}
function chestOpen() { return Date.now() - (char.chests?.[world.area] || 0) < 300000; }
function interact() {
  const it = nearestInteract();
  if (!it) return;
  if (it.kind === 'gate') tryGate();
  if (it.kind === 'npc') { openDialog(it.npc); audio.sfx('ui'); }
  if (it.kind === 'lever') { net.send({ t: 'interact', what: 'lever' }); audio.sfx('equip'); }
  if (it.kind === 'chest' && !chestOpen()) net.send({ t: 'interact', what: 'chest' });
}

// ======================================================================
// ドロップ
// ======================================================================
function spawnDrop(it, x, z) {
  const model = makeLootOrb(it.rarity);
  model.position.set(x, heightAt(x, z), z);
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
    addShake(r === 5 ? 1 : 0.5);
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
  if (!settings.dmgnum && (cls === '' || cls === 'crit' || cls === 'poison' || cls === undefined)) return;
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
// 敵の名前とHPバーは、モデルの子として3D空間に置く（画面上でずれない）
function makeMobLabel(mb) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xdddddd, depthTest: false, depthWrite: false, transparent: true, fog: false }));
  sp.renderOrder = 999;
  sp.geometry.userData.shared = true; // Sprite のジオメトリは three.js 内で共有されている
  const s = mb.model.scale.x;
  sp.scale.set(3.2 / s, 0.8 / s, 1);
  sp.position.y = (2.75 + (mb.model.userData.float ? 0.6 : 0)) / s * (mb.elite ? 1.1 : 1);
  sp.userData.cv = cv;
  mb.model.add(sp);
  mb.label = sp;
  drawMobLabel(mb, 100);
  return sp;
}
function drawMobLabel(mb, pct) {
  const aggro = mb.target === me.id;
  mb.labelPct = pct; mb.labelLv = mb.lv; mb.labelAggro = aggro;
  const cv = mb.label.userData.cv, g = cv.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.font = 'bold 22px "Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.85)';
  const txt = `${aggro ? '! ' : ''}Lv${mb.lv} ${mb.name}`;
  g.strokeText(txt, 128, 20); g.fillStyle = aggro ? '#ff6a5a' : mb.elite ? '#ffc04a' : '#ffffff'; g.fillText(txt, 128, 20);
  g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(48, 40, 160, 12);
  g.fillStyle = pct > 30 ? '#e8443a' : '#ff9a3a'; g.fillRect(50, 42, 156 * pct / 100, 8);
  mb.label.material.map.needsUpdate = true;
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
    if (!mb.label) continue;
    mb.label.visible = Math.hypot(mb.x - me.x, mb.z - me.z) < 30;
    const pct = Math.round(clamp(mb.hp / mb.mhp, 0, 1) * 100);
    if (pct !== mb.labelPct || mb.lv !== mb.labelLv || (mb.target === me.id) !== mb.labelAggro) drawMobLabel(mb, pct);
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
  $('party').innerHTML = '<div class="dim" style="margin-bottom:6px">オンライン ' + roster.length + '人</div>' + roster.map(([id, name, lv, floor, hp, mhp, color, aname]) => `
    <div class="pm"><div class="nm"><span style="color:${esc(color)}">${esc(name)}${id === me.id ? ' (自分)' : ''}</span><span class="dim">Lv${lv}</span></div>
    <div class="dim" style="font-size:10px">${floor}層 ${esc(aname || '')}</div>
    <div class="bar hp"><div style="width:${clamp(hp / mhp * 100, 0, 100)}%"></div></div></div>`).join('');
}

function setCd(id, v, max) {
  const el = $(id);
  el.querySelector('.cd').style.height = clamp(max > 0 ? v / max * 100 : 0, 0, 100) + '%';
  el.classList.toggle('ready', v <= 0);
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
  $('atk-name').textContent = HEAVY[S.wk].name;
  $('skill-name').textContent = S.ws.name;
  setCd('s-skill', me.wsCd, S.ws.cd * (1 - S.cdr / 100));
  for (let i = 0; i < 2; i++) {
    const id = char.slots?.[i];
    const el = $('s-t' + (i + 1));
    const usable = id && S.actives.has(id);
    el.querySelector('.nm').textContent = id ? TREE_SKILLS[id].name : '未設定';
    el.classList.toggle('off', !usable);
    setCd('s-t' + (i + 1), usable ? (me.tcd[id] || 0) : 1, usable ? TREE_SKILLS[id].cd * (1 - S.cdr / 100) : 1);
  }
  setCd('s-dodge', me.dodgeCd, S.dodgeCd);
  $('dodge-w').textContent = S.wc.name;
  $('dodge-w').style.color = S.wc.color;
  setCd('s-pot', me.potions > 0 ? me.potCd : 1, 1);
  $('s-guard').classList.toggle('active', me.guarding);
  const left = spTotal(char.lv) - spSpent(char.tree);
  $('sp-badge').textContent = left > 0 ? left : '';
  $('sp-badge').classList.toggle('hidden', left <= 0);
  // 溜めゲージ
  const ch = $('charge');
  if (me.charging && me.chargeT >= CHARGE_MIN) {
    ch.classList.remove('hidden');
    ch.firstElementChild.style.width = clamp((me.chargeT - CHARGE_MIN) / (CHARGE_MAX - CHARGE_MIN) * 100, 0, 100) + '%';
    ch.classList.toggle('max', me.chargeLv === 2);
  } else ch.classList.add('hidden');

  $('buffs').innerHTML = me.buffs.map((b) => `<span style="color:${hex(new THREE.Color(b.color).getHex())}">✦ ${esc(b.label)} ${b.t.toFixed(1)}s</span>`).join('　');

  const boss = [...mobs.values()].find((m) => m.kind === 2);
  $('boss').classList.toggle('hidden', !boss);
  if (boss) {
    $('boss-name').textContent = `Lv${boss.lv} ${boss.name}`;
    $('boss-name').classList.toggle('enraged', !!boss.enraged);
    const pct = clamp(boss.hp / boss.mhp * 100, 0, 100) + '%';
    $('boss-hp').style.width = pct; $('boss-hp-lag').style.width = pct;
    const tname = boss.target === me.id ? 'あなた' : others.get(boss.target)?.name;
    $('boss-target').textContent = tname ? `ターゲット：${tname}` : '';
    $('boss-target').classList.toggle('me', boss.target === me.id);
  }
  const pr = $('prompt');
  const it = nearestInteract();
  const lair = env?.lair;
  const nearLair = lair && !boss && world.bossState !== 'fight' && Math.hypot(me.x - lair.x, me.z - lair.z) < lair.r + 4;
  if (it) { pr.classList.remove('hidden'); pr.innerHTML = it.label; }
  else if (nearLair && world.bossState === 'cleared') { pr.classList.remove('hidden'); pr.textContent = 'ボスは討伐済み。しばらくすると再挑戦できます'; }
  else if (nearLair) { pr.classList.remove('hidden'); pr.textContent = '⚠ ボス部屋：魔法陣の中に入ると戦闘開始'; }
  else pr.classList.add('hidden');
}

// ---- ミニマップ ----
const mmCanvas = $('minimap');
const mm = mmCanvas.getContext('2d');
let gridImage = null;
function drawMinimap() {
  const W = 180;
  const def = world.def;
  const extent = def.shape === 'open' ? def.R + 4 : Math.max(grid(def).W, grid(def).H) * CELL / 2 + 2;
  // 屋内は自分を中心にして少し拡大
  const indoor = def.shape === 'grid';
  const sc = indoor ? W / 2 / 30 : W / 2 / extent;
  const cx = indoor ? me.x : 0, cz = indoor ? me.z : 0;
  const P = (x, z) => [W / 2 + (x - cx) * sc, W / 2 + (z - cz) * sc];
  mm.clearRect(0, 0, W, W);
  mm.save();
  mm.beginPath(); mm.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); mm.clip();
  mm.fillStyle = indoor ? '#0c0e16dd' : hex(FLOORS[world.floor - 1].ground) + '99'; mm.fillRect(0, 0, W, W);
  if (indoor) {
    const g = grid(def);
    for (let r = 0; r < g.H; r++) for (let c = 0; c < g.W; c++) {
      const ch = g.rows[r][c];
      if (ch === '#') continue;
      const x = (c - g.W / 2) * CELL, z = (r - g.H / 2) * CELL;
      const [px, pz] = P(x, z);
      mm.fillStyle = ch === 'D' ? (world.door ? '#6a8a6a' : '#c04a4a') : ch === 'T' || ch === 't' ? '#6a4a3a' : '#4a5064';
      mm.fillRect(px, pz, CELL * sc + 0.5, CELL * sc + 0.5);
    }
    const g2 = grid(def);
    for (const [ch, col] of [['C', '#ffd27a'], ['L', '#ff9a4a'], ['P', '#6ad0ff']]) for (const p of g2.pts[ch] || []) { const [x, y] = P(p.x, p.z); mm.fillStyle = col; mm.fillRect(x - 3, y - 3, 6, 6); }
  } else {
    mm.strokeStyle = 'rgba(255,255,255,.25)'; mm.lineWidth = 2;
    mm.beginPath(); mm.arc(W / 2, W / 2, def.R * sc, 0, Math.PI * 2); mm.stroke();
  }
  if (def.gate) { const [x, y] = P(def.gate.x, def.gate.z); mm.fillStyle = '#6ad0ff'; mm.beginPath(); mm.arc(x, y, 5, 0, 7); mm.fill(); }
  if (env?.lair) { const [x, y] = P(env.lair.x, env.lair.z); mm.strokeStyle = hex(FLOORS[world.floor - 1].boss.accent); mm.lineWidth = 2; mm.beginPath(); mm.arc(x, y, env.lair.r * sc, 0, 7); mm.stroke(); }
  for (const p of env?.portals || []) { const [x, y] = P(p.x, p.z); mm.fillStyle = '#bfe6ff'; mm.beginPath(); mm.moveTo(x, y - 5); mm.lineTo(x + 5, y + 4); mm.lineTo(x - 5, y + 4); mm.closePath(); mm.fill(); }
  for (const n of npcs) { const [x, y] = P(n.x, n.z); mm.fillStyle = n.mark ? '#ffd84a' : '#e0e0e0'; mm.beginPath(); mm.arc(x, y, 3.5, 0, 7); mm.fill(); }
  for (const d of drops) { const [x, y] = P(d.x, d.z); mm.fillStyle = RARITIES[d.it.rarity].color; mm.fillRect(x - 2, y - 2, 4, 4); }
  for (const mb of mobs.values()) { const [x, y] = P(mb.x, mb.z); mm.fillStyle = mb.kind === 2 ? '#ff2a2a' : mb.elite ? '#ffb030' : '#ff7a6a'; mm.beginPath(); mm.arc(x, y, mb.kind === 2 ? 6 : mb.elite ? 3 : 2, 0, 7); mm.fill(); }
  for (const o of others.values()) { const [x, y] = P(o.x, o.z); mm.fillStyle = '#7f7'; mm.beginPath(); mm.arc(x, y, 3.5, 0, 7); mm.fill(); }
  const [x, y] = P(me.x, me.z);
  mm.translate(x, y); mm.rotate(-me.a + Math.PI);
  mm.fillStyle = '#fff'; mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4, 5); mm.lineTo(-4, 5); mm.closePath(); mm.fill();
  mm.restore();
  void gridImage;
}

// ---- エリアマップ（M） ----
function renderMap() {
  const f = world.floor;
  const list = Object.values(AREAS).filter((a) => a.floor === f);
  const P = (a) => [a.mapPos[0] * 6, a.mapPos[1] * 4];
  let svg = '';
  const seen = new Set();
  for (const a of list) for (const e of a.exits) {
    const key = [a.id, e.to].sort().join('-');
    const b = AREAS[e.to];
    if (seen.has(key) || !b || b.floor !== f) continue;
    seen.add(key);
    const [x1, y1] = P(a), [x2, y2] = P(b);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="edge"/>`;
  }
  for (const a of list) {
    const [x, y] = P(a);
    const T = AREA_TYPES[a.type];
    const cur = a.id === world.area;
    const here = roster.filter((r) => r[7] === a.name && r[0] !== me.id).length;
    const extra = a.unique ? `宝：${a.unique.name}` : a.type === 'hunt' ? '経験値 1.6倍' : a.type === 'labyrinth' ? `ボス：${FLOORS[f - 1].boss.name}` : a.npcs ? `NPC ${a.npcs.length}人` : '';
    svg += `<g class="node ${cur ? 'cur' : ''}" transform="translate(${x},${y})">
      <circle r="30" style="stroke:${T.color}"/>
      <text class="ic" y="8" style="fill:${T.color}">${T.icon}</text>
      <text class="nm" y="50">${esc(a.name)}</text>
      <text class="ty" y="66">${T.name}${here ? `・仲間${here}人` : ''}</text>
      ${extra ? `<text class="ex" y="81">${esc(extra)}</text>` : ''}
      ${cur ? '<text class="you" x="38" y="-22" style="text-anchor:start">◀ 現在地</text>' : ''}
    </g>`;
  }
  $('map-title').textContent = `第${f}層 ${FLOORS[f - 1].name}`;
  $('map-svg').innerHTML = svg;
}
$('map-close').onclick = () => togglePanel('map');

// ---- インベントリ ----
const GLYPH = { sword: '剣', greatsword: '大', spear: '盾', dagger: '短', armor: '鎧', acc: '飾' };
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
      cell.outerHTML = `<div class="cell r${it.rarity}" data-id="${it.id}" data-eq="1" style="border-color:${c};color:${c}"><span class="gi">${GLYPH[it.kind || it.slot]}</span><span>${esc(it.name)}<br><small class="dim">iLv${it.ilvl}・重さ${itemWeight(it)}</small></span></div>`;
    } else cell.outerHTML = '<div class="cell" style="color:#666">なし</div>';
  }
  $('inv-grid').innerHTML = char.inv.map((it) => cellHtml(it, true)).join('') || '<div class="dim">アイテムなし。モンスターを倒そう！</div>';
  const st = [
    ['攻撃力', Math.round(S.atk)], ['最大HP', S.mhp], ['会心率', S.crit.toFixed(1) + '%'], ['会心ダメージ', S.critd.toFixed(0) + '%'],
    ['攻撃速度', '+' + S.aspd.toFixed(1) + '%'], ['移動速度', '+' + S.move.toFixed(1) + '%'], ['被ダメ軽減', S.def.toFixed(1) + '%'],
    ['HP吸収', S.vamp.toFixed(1) + '%'], ['スキル短縮', S.cdr.toFixed(0) + '%'],
  ];
  $('stats').innerHTML = `<b>Lv${char.lv} ${esc(char.name)}</b> <span class="dim">${S.W.name}</span>`
    + `<div class="wrow"><span class="dim">装備重量</span><span><b style="color:${S.wc.color}">${S.weight.toFixed(1)}（${S.wc.name}）</b></span></div>`
    + `<div class="wbar"><i style="width:${clamp(S.weight / 22 * 100, 0, 100)}%;background:${S.wc.color}"></i></div>`
    + `<div><span class="dim">回避のクールタイム</span><span>${S.dodgeCd.toFixed(2)}秒</span></div>`
    + st.map(([k, v]) => `<div><span class="dim">${k}</span><span>${v}</span></div>`).join('')
    + [...S.fx].filter((f) => UNIQUE_FX[f]).map((f) => `<div style="color:#ffd27a;font-size:11px">✦ ${UNIQUE_FX[f]}</div>`).join('');
  bindCells();
}
function findItem(id) { return char.inv.find((i) => i.id === id) || Object.values(char.eq).find((i) => i && i.id === id); }
function bindCells() {
  for (const cell of document.querySelectorAll('#inv .cell[data-id]')) {
    const it = findItem(cell.dataset.id);
    cell.onmouseenter = (e) => showTip(itemLines(it, true), e);
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
let salvageArm = null;
function salvage(it) {
  // 伝説以上は2回右クリックで分解（誤操作防止）
  if (it.rarity >= 4 && (salvageArm?.id !== it.id || now() - salvageArm.t > 2)) {
    salvageArm = { id: it.id, t: now() };
    toast(`もう一度右クリックで「${it.name}」を分解`, RARITIES[it.rarity].color);
    return;
  }
  char.inv.splice(char.inv.indexOf(it), 1);
  audio.sfx('ui'); saveChar(); renderInv();
  $('tooltip').classList.add('hidden');
}
$('inv-salvage').onclick = () => { char.inv = char.inv.filter((i) => i.rarity >= 2); audio.sfx('ui'); saveChar(); renderInv(); };
$('inv-close').onclick = () => togglePanel('inv');
function itemLines(it, compare) {
  const r = RARITIES[it.rarity];
  const type = it.slot === 'weapon' ? WEAPONS[it.kind].name : it.slot === 'armor' ? `防具（${ARMOR_CLASSES[it.armor || 'medium'].name}）` : '装飾品';
  let h = `<div class="tn" style="color:${r.color}">${esc(it.name)}</div><div class="dim">${r.name} ${type} ・ iLv${it.ilvl} ・ 重さ ${itemWeight(it)}</div>`;
  if (it.atk) h += `<div>攻撃力 +${it.atk}</div>`;
  if (it.hp) h += `<div>HP +${it.hp}</div>`;
  if (it.def) h += `<div>被ダメ軽減 +${it.def}%</div>`;
  for (const [k, v] of it.affixes) h += `<div style="color:#9fd8ff">${AFFIXES[k].name} +${v}${AFFIXES[k].unit}</div>`;
  if (it.fx) for (const f of it.fx) h += `<div class="fx">✦ ${UNIQUE_FX[f]}</div>`;
  if (it.slot === 'weapon') {
    const sid = it.skill && WEAPON_SKILLS[it.skill]?.kind === it.kind ? it.skill : WEAPON_SKILL_POOL[it.kind][0];
    const ws = WEAPON_SKILLS[sid];
    h += `<div class="wsk">武器スキル「${ws.name}」<br><span class="dim">${ws.desc}（CT ${ws.cd}秒）</span></div>`;
    if (WEAPONS[it.kind].guard) h += '<div class="dim">右クリック長押しでガード</div>';
  }
  if (it.lore) h += `<div class="lore">${esc(it.lore)}</div>`;
  const cur = char.eq[it.slot];
  if (compare && cur && cur !== it) {
    const d = itemPower(it) - itemPower(cur);
    h += `<div class="cmp" style="color:${d >= 0 ? '#6f6' : '#f77'}">装備中と比較: 戦力 ${d >= 0 ? '+' : ''}${d}</div>`;
    const dw = itemWeight(it) - itemWeight(cur);
    if (dw) {
      const after = weightClass(S.weight + dw);
      h += `<div class="cmp" style="color:${dw < 0 ? '#6f6' : '#fc8'}">重さ ${dw > 0 ? '+' : ''}${dw.toFixed(1)} → ${after.name}</div>`;
    }
  }
  return h;
}
function showTip(html, e) {
  const tip = $('tooltip');
  tip.innerHTML = html; tip.classList.remove('hidden'); moveTip(e);
}
function moveTip(e) {
  const tip = $('tooltip');
  tip.style.left = Math.min(e.clientX + 16, innerWidth - 300) + 'px';
  tip.style.top = Math.min(e.clientY + 10, innerHeight - tip.offsetHeight - 10) + 'px';
}

// ---- スキルツリー ----
let treeTab = null;
function renderTree() {
  if (!treeTab) treeTab = S.wk;
  const tree = char.tree || (char.tree = {});
  const left = spTotal(char.lv) - spSpent(tree);
  $('sp-left').innerHTML = `残りスキルポイント <b>${left}</b>`;
  const tabs = [['sword', '片手剣'], ['greatsword', '大剣'], ['spear', '盾槍'], ['dagger', '短剣'], ['stat', 'ステータス'], ['style', 'プレイスタイル']];
  $('tree-tabs').innerHTML = tabs.map(([id, nm], i) => `${i === 4 ? '<span class="tsep"></span>' : ''}<button data-t="${id}" class="${treeTab === id ? 'on' : ''}">${nm}<small>${id === S.wk ? '装備中・' : ''}${treeSpent(tree, id)}pt</small></button>`).join('');
  for (const b of $('tree-tabs').querySelectorAll('button')) b.onclick = () => { treeTab = b.dataset.t; audio.sfx('ui'); renderTree(); };

  const T = TREES[treeTab];
  const spent = treeSpent(tree, treeTab);
  const isWeapon = !['stat', 'style'].includes(treeTab);
  let h = '';
  if (isWeapon && treeTab !== S.wk) h += `<div class="tree-note">このツリーの効果は「${T.name}」を装備しているときだけ有効です</div>`;
  if (treeTab === 'style') h += `<div class="tree-cols">${STYLE_COLS.map((c) => `<div>${c}</div>`).join('')}</div>`;
  for (let tier = 0; tier < 4; tier++) {
    const need = tier * 2;
    const open = spent >= need;
    const nodes = T.nodes.filter((n) => n.tier === tier);
    h += `<div class="tier ${open ? '' : 'locked'}"><div class="tier-l">段階${tier + 1}<small>${need ? `${need}pt〜` : ''}</small></div><div class="tier-n ${treeTab === 'style' ? 'cols3' : ''}">`;
    for (const n of nodes) {
      const r = tree[n.id] || 0;
      const learnable = canLearn(char, n.id);
      const pips = Array.from({ length: n.max }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('');
      let slotBtns = '';
      if (n.active && r > 0) slotBtns = `<div class="slotbtns">${[0, 1].map((i) => `<button data-slot="${i}" data-sk="${n.active}" class="${char.slots?.[i] === n.active ? 'on' : ''}">${i + 1}</button>`).join('')}</div>`;
      h += `<div class="node ${r ? 'have' : ''} ${learnable ? 'can' : ''} ${n.active ? 'active' : ''}" data-id="${n.id}">
        <div class="nn">${n.active ? '◆ ' : ''}${esc(n.name)}</div><div class="pips">${pips}</div>
        <div class="nd">${esc(n.desc)}${n.active ? `<br><span class="dim">CT ${TREE_SKILLS[n.active].cd}秒</span>` : ''}</div>${slotBtns}</div>`;
    }
    h += '</div></div>';
  }
  $('tree-body').innerHTML = h;
  for (const el of $('tree-body').querySelectorAll('.node')) {
    el.onclick = (e) => {
      if (e.target.dataset.slot !== undefined) return;
      learn(el.dataset.id);
    };
  }
  for (const b of $('tree-body').querySelectorAll('.slotbtns button')) {
    b.onclick = () => {
      char.slots = char.slots || [null, null];
      const i = Number(b.dataset.slot), id = b.dataset.sk;
      const other = char.slots.indexOf(id);
      if (other >= 0) char.slots[other] = null;
      char.slots[i] = id;
      audio.sfx('equip'); saveChar(); renderTree();
    };
  }
}
function learn(id) {
  if (!canLearn(char, id)) { audio.sfx('ui'); return; }
  char.tree[id] = (char.tree[id] || 0) + 1;
  const n = NODE_INDEX[id];
  if (n.active) {
    char.slots = char.slots || [null, null];
    const empty = char.slots.indexOf(null);
    if (empty >= 0 && !char.slots.includes(n.active)) char.slots[empty] = n.active;
  }
  audio.sfx('levelup');
  calcStats(); saveChar(); renderTree();
}
$('tree-reset').onclick = () => {
  char.tree = {}; char.slots = [null, null];
  audio.sfx('ui'); calcStats(); saveChar(); renderTree();
  toast('スキルポイントを振り直しました', '#9fe');
};
$('tree-close').onclick = () => togglePanel('tree');

// ---- 設定 ----
function renderSettings() {
  for (const k of ['master', 'music', 'sfx', 'amb']) {
    const el = $('set-' + k);
    el.value = Math.round(settings[k] * 100);
    el.nextElementSibling.textContent = el.value;
  }
  $('set-quality').value = settings.quality;
  $('set-shake').checked = settings.shake;
  $('set-dmgnum').checked = settings.dmgnum;
}
for (const k of ['master', 'music', 'sfx', 'amb']) {
  $('set-' + k).addEventListener('input', (e) => {
    settings[k] = e.target.value / 100;
    e.target.nextElementSibling.textContent = e.target.value;
    audio.setVolumes(settings); saveSettings();
  });
}
$('set-quality').addEventListener('change', (e) => {
  settings.quality = e.target.value; saveSettings(); applyQuality();
  if (started) buildEnv(world.area);
});
$('set-shake').addEventListener('change', (e) => { settings.shake = e.target.checked; saveSettings(); });
$('set-dmgnum').addEventListener('change', (e) => { settings.dmgnum = e.target.checked; saveSettings(); });
$('settings-close').onclick = () => togglePanel('settings');

// ---- 転移門 ----
function tryGate() {
  const list = $('gate-list');
  list.innerHTML = FLOORS.slice(0, MAX_FLOOR).map((f) => `<button data-n="${f.n}" ${f.n > world.unlocked ? 'disabled' : ''} class="${f.n === world.floor ? 'cur' : ''}">
    <b>第${f.n}層</b> ${f.n <= world.unlocked ? f.name : '？？？'} <span class="dim" style="float:right">推奨Lv${1 + (f.n - 1) * 5}〜</span></button>`).join('')
    + '<div class="dim" style="text-align:center;margin-top:4px">第4層以降は準備中</div>';
  for (const b of list.querySelectorAll('button')) b.onclick = () => { net.send({ t: 'warp', floor: Number(b.dataset.n) }); $('gate-menu').classList.add('hidden'); };
  PANELS.forEach((p) => $(p).classList.add('hidden'));
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

function moveMe(dx, dz) {
  me.x += dx; me.z += dz;
  const c = collide(world.def, me.x, me.z, 0.45, world.door);
  me.x = c.x; me.z = c.z;
}

function update(dt) {
  const t = now();
  updateMouseWorld();
  // 遅延処理（スキルの多段ヒットなど）
  for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= t) { const p = pending.splice(i, 1)[0]; if (!me.dead) p.fn(); }

  me.dodgeCd -= dt; me.wsCd -= dt; me.potCd -= dt; me.iframe -= dt;
  for (const k in me.tcd) me.tcd[k] -= dt;
  for (const b of me.buffs) b.t -= dt;
  me.buffs = me.buffs.filter((b) => b.t > 0);
  const safe = world.def.type === 'town' || world.def.type === 'camp';

  if (me.dead) {
    me.deadT -= dt;
    $('death-t').textContent = `${Math.max(0, me.deadT).toFixed(1)} 秒後に${world.def.gate ? '転移門' : 'エリアの入口'}で復活`;
    if (me.deadT <= 0) {
      me.dead = false; me.hp = S.mhp; me.potions = S.maxPot;
      const sp = spawnPoint(world.def);
      me.x = sp.x; me.z = sp.z;
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
      const sp = 17 * S.wc.roll;
      moveMe(me.dodgeDir[0] * sp * dt, me.dodgeDir[1] * sp * dt);
      if (Math.random() < 0.5) fx.parts.emit(me.x, 0.6, me.z, { color: hasBuff('afterimage') ? 0x9affff : 0xbfe6ff, size: 0.4, life: hasBuff('afterimage') ? 0.6 : 0.3, speed: 0.5, gravity: 0 });
    } else if (me.dashT > 0) {
      me.dashT -= dt;
      moveMe(Math.sin(me.dashA) * me.dashSpeed * dt, Math.cos(me.dashA) * me.dashSpeed * dt);
      fx.parts.emit(me.x, 0.8, me.z, { color: RARITIES[S.wr].color, size: 0.4, life: 0.3, speed: 0.5, gravity: 0 });
    } else if (l > 0) {
      const busy = me.swingT < me.swingDur || me.skillT >= 0;
      const slow = me.guarding ? 0.45 : busy ? 0.45 : me.charging && me.chargeT > CHARGE_MIN ? 0.4 : 1;
      const sp = 7.2 * (1 + (S.move + buffMod('move')) / 100) * slow;
      moveMe(dx / l * sp * dt, dz / l * sp * dt);
      me.moving = true;
      if (!busy && !me.charging && !me.guarding) me.a = Math.atan2(dx, dz);
      me.walkT += dt;
      me.stepT -= dt;
      if (me.stepT <= 0) { me.stepT = 0.32; audio.sfx('step'); }
    }
    if (me.guarding) me.a = aimAngle();

    // 出口
    if (!me.transit) {
      for (const p of env.portals) {
        const d = Math.hypot(p.x - me.x, p.z - me.z);
        if (d < p.r && p.armed) {
          if (AREAS[p.to].floor > world.unlocked) { toast('この先はまだ開放されていない', '#f99'); p.armed = false; continue; }
          me.transit = true; net.send({ t: 'move', to: p.to }); audio.sfx('warp');
          break;
        }
        if (d > p.r + 1.5) p.armed = true;
      }
    }

    // 溜め
    if (me.charging) {
      me.chargeT += dt;
      if (me.chargeT >= CHARGE_MIN) {
        me.a = aimAngle();
        const lv = me.chargeT >= CHARGE_MAX ? 2 : 1;
        if (lv !== me.chargeLv) {
          me.chargeLv = lv;
          audio.sfx(lv === 2 ? 'charged' : 'charge', { lv });
          if (lv === 2) { fx.ringWave(me.x, me.z, RARITIES[S.wr].color, 2.5, 0.3); fx.flash(me.x, 1.5, me.z, RARITIES[S.wr].color, 20, 0.3); }
        }
        // 光が集まる演出
        if (Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2, rr = 1.8;
          fx.parts.emit(me.x + Math.sin(a) * rr, rnd(0.3, 1.8), me.z + Math.cos(a) * rr, { color: lv === 2 ? 0xffd84a : RARITIES[S.wr].color, size: 0.35, life: 0.35, dir: [-Math.sin(a), 0, -Math.cos(a)], speed: 5, spread: 0.2, gravity: 0, drag: 0 });
        }
      }
    }

    // 通常攻撃（短押しの入力を少し保持してコンボをつなぐ）
    me.swingT += dt;
    if (me.queued > t && canAct() && me.swingT >= me.swingDur && !safe) { me.queued = 0; doSwing(); }
    if (me.skillT >= 0) { me.skillT += dt; if (me.skillT > 0.55) me.skillT = -1; }

    // 自然回復 / 町や転移門の近くでポーション補充
    const regen = t - me.lastHurt > 5 ? 0.03 : 0.004;
    me.hp = Math.min(S.mhp, me.hp + S.mhp * (safe ? 0.1 : regen) * dt);
    if (safe) me.potions = S.maxPot;
  }

  // 毒
  for (const mb of [...mobs.values()]) {
    if (mb.poisonUntil > t) {
      mb.poisonT -= dt;
      if (mb.poisonT <= 0) { mb.poisonT = 0.5; dealDamage(mb, 0.12, { type: 'dot', noProc: true }); fx.parts.emit(mb.x, 1.2, mb.z, { color: 0x8aff5a, size: 0.4, life: 0.5, speed: 1, gravity: 1 }); }
    }
  }

  // 自キャラモデル
  me.model.position.set(me.x, heightAt(me.x, me.z), me.z);
  me.model.rotation.y = me.a;
  animatePlayer(me.model, {
    t, moving: me.moving, walkT: me.walkT, kind: S.wk, combo: me.combo, dead: me.dead, guard: me.guarding,
    swing: me.swingT < me.swingDur ? me.swingT / me.swingDur : me.charging && me.chargeT > CHARGE_MIN ? 0.02 : -1,
    spin: me.skillT >= 0 && me.spin ? me.skillT / 0.55 : -1,
    dodge: me.dodgeT > 0 ? me.dodgeT / 0.38 : 0,
  });
  if (me.guarding && Math.random() < 0.3) fx.parts.emit(me.x + Math.sin(me.a) * 0.9 + rnd(-0.4, 0.4), rnd(0.6, 1.8), me.z + Math.cos(me.a) * 0.9 + rnd(-0.4, 0.4), { color: 0xbfe0ff, size: 0.25, life: 0.3, speed: 0.3, gravity: 0 });
  for (const b of me.buffs) if (Math.random() < 0.25) fx.parts.emit(me.x + rnd(-0.5, 0.5), rnd(0.2, 2), me.z + rnd(-0.5, 0.5), { color: b.color, size: 0.3, life: 0.6, speed: 1, gravity: 2 });
  // 伝説・神器のオーラ
  if (S.wr >= 4 && Math.random() < 0.3) fx.parts.emit(me.x + rnd(-0.6, 0.6), rnd(0.3, 2), me.z + rnd(-0.6, 0.6), { color: RARITIES[S.wr].color, size: 0.25, life: 0.8, speed: 0.4, gravity: 1.5 });

  // NPC（近くに来たらこちらを向く）
  for (const n of npcs) {
    const d = Math.hypot(me.x - n.x, me.z - n.z);
    const want = d < 8 ? Math.atan2(me.x - n.x, me.z - n.z) : Math.PI;
    n.model.rotation.y += angDiff(want, n.model.rotation.y) * Math.min(1, dt * 4);
    animatePlayer(n.model, { t: t + n.x, moving: false, walkT: 0, kind: 'sword', combo: 0, dead: false, swing: -1, spin: -1, dodge: 0 });
  }

  // 他プレイヤー
  for (const o of others.values()) {
    const k = 1 - Math.exp(-12 * dt);
    const mx = o.tx - o.x, mz = o.tz - o.z;
    const moving = Math.hypot(mx, mz) > 0.03;
    o.x += mx * k; o.z += mz * k;
    o.a += angDiff(o.ta, o.a) * k;
    o.swingT += dt; if (o.spinT >= 0) { o.spinT += dt; if (o.spinT > 0.55) o.spinT = -1; }
    if (moving) o.walkT += dt;
    o.model.position.set(o.x, heightAt(o.x, o.z), o.z);
    o.model.rotation.y = o.a;
    animatePlayer(o.model, { t, moving, walkT: o.walkT, kind: o.wk, combo: o.combo, dead: o.dead, guard: !!o.gd, swing: o.swingT < 0.35 ? o.swingT / 0.35 : -1, spin: o.spinT >= 0 && o.wk === 'greatsword' ? o.spinT / 0.55 : -1, dodge: o.dg > 0 ? 0.5 : 0 });
  }

  // モンスター
  for (const mb of mobs.values()) {
    const k = 1 - Math.exp(-10 * dt);
    mb.x += (mb.tx - mb.x) * k; mb.z += (mb.tz - mb.z) * k;
    mb.a += angDiff(mb.ta, mb.a) * k;
    mb.flash = Math.max(0, mb.flash - dt * 6);
    mb.model.position.set(mb.x, heightAt(mb.x, mb.z), mb.z);
    mb.model.rotation.y = mb.a;
    animateMob(mb.model, { t: t + mb.id, st: mb.st, flash: mb.flash, enraged: mb.enraged });
    if (mb.model.userData.float && Math.random() < 0.25) fx.parts.emit(mb.x + rnd(-0.3, 0.3), 1.2 * mb.model.scale.y + mb.model.userData.body.position.y, mb.z + rnd(-0.3, 0.3), { color: FLOORS[world.floor - 1].mobs.find((d) => d.t === 'wisp')?.color ?? 0xffffff, size: 0.35, life: 0.7, speed: 0.4, gravity: 0.8 });
    if (mb.elite && Math.random() < 0.15) fx.parts.emit(mb.x + rnd(-0.6, 0.6), rnd(0.3, 2.4), mb.z + rnd(-0.6, 0.6), { color: 0xffb030, size: 0.3, life: 0.7, speed: 0.4, gravity: 1.5 });
    if (mb.kind === 2 && mb.enraged && Math.random() < 0.5) fx.parts.emit(mb.x + rnd(-2, 2), rnd(0.5, 5), mb.z + rnd(-2, 2), { color: 0xff3a20, size: 0.6, life: 0.8, speed: 1, gravity: 3 });
  }

  // ギミックの見た目
  if (env.door) {
    const y = world.door ? -3.4 : 0;
    env.door.position.y += (y - env.door.position.y) * Math.min(1, dt * 3);
    env.door.visible = env.door.position.y > -3.3;
  }
  if (env.lever) env.lever.userData.stick.rotation.z += ((world.door ? -0.6 : 0.6) - env.lever.userData.stick.rotation.z) * Math.min(1, dt * 6);
  if (env.chest) {
    const open = chestOpen();
    const lid = env.chest.userData.lid;
    lid.rotation.x += ((open ? -1.9 : 0) - lid.rotation.x) * Math.min(1, dt * 5);
    env.chest.userData.shine.visible = !open;
  }
  env.plates?.forEach((m, i) => { m.material.emissiveIntensity = world.plates[i] ? 1.6 + Math.sin(t * 8) * 0.4 : 0; });

  updateTeles();
  updateProjs(dt);
  updateDrops(dt);

  // 送信
  sendT -= dt;
  if (sendT <= 0) {
    sendT = 0.066;
    net.send({ t: 'st', x: +me.x.toFixed(2), z: +me.z.toFixed(2), a: +me.a.toFixed(2), hp: Math.round(me.hp), mhp: S.mhp, lv: char.lv, dead: me.dead, wk: S.wk, wr: S.wr, sw: me.sw, sk: me.sk, dg: me.dodgeT > 0 ? 1 : 0, gd: me.guarding ? 1 : 0 });
  }
  saveT -= dt;
  if (saveT <= 0) { saveT = 10; saveChar(); }

  // BGM 切り替え（ボス戦中で部屋の近くならボス曲）
  const fdef = FLOORS[world.floor - 1];
  const lair = env.lair;
  const bossNear = world.bossState === 'fight' && lair && Math.hypot(me.x - lair.x, me.z - lair.z) < lair.r + 20;
  audio.setMusic(fdef.music, !!bossNear);

  // カメラ
  shake = Math.max(0, shake - dt * 2.5);
  const zoom = camZoom * (world.def.shape === 'grid' ? 0.9 : 1);
  const off = new THREE.Vector3(0, 15 * zoom, 12.5 * zoom);
  camPos.set(me.x, 0, me.z).add(off);
  camera.position.lerp(camPos, 1 - Math.exp(-8 * dt));
  if (shake > 0) camera.position.add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(shake * 0.35));
  camera.lookAt(camera.position.x, 1, camera.position.z - off.z);

  sun.position.set(me.x + 20, 40, me.z + 10);
  sun.target.position.set(me.x, 0, me.z);

  env.update(t, me.x, me.z);
  const fighting = world.bossState === 'fight';
  for (const m of env.ringMats) m.opacity = fighting ? 0.28 + Math.sin(t * 4) * 0.1 : 0.4;
  if (world.def.gate && Math.random() < 0.3) fx.parts.emit(world.def.gate.x + rnd(-3, 3), 0.5, world.def.gate.z + rnd(-0.5, 0.5), { color: 0x6ad0ff, size: 0.3, life: 1.5, speed: 0.5, gravity: 2 });
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
  $('lnew').classList.remove('hidden');
}

// 最初からはじめる（誤操作防止のため2回押しで実行）
let newArmT = 0;
$('lnew').onclick = () => {
  const btn = $('lnew');
  if (performance.now() - newArmT > 5000) {
    newArmT = performance.now();
    btn.classList.add('armed');
    btn.textContent = `Lv${existing.lv} のデータが消えます。もう一度押すと最初から`;
    setTimeout(() => { if (performance.now() - newArmT >= 5000 && !btn.classList.contains('hidden')) { btn.classList.remove('armed'); btn.textContent = '最初からはじめる'; } }, 5100);
    return;
  }
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem('aincrad_solo_world'); // ソロの階層解放状況もリセット
  } catch { /* */ }
  btn.classList.add('hidden');
  $('lexisting').textContent = '新しいキャラクターではじめます';
  $('lweapon-wrap').style.display = '';
  $('lname').focus();
};

$('lstart').onclick = async () => {
  audio.init();
  audio.setVolumes(settings);
  const name = $('lname').value.trim() || 'プレイヤー';
  char = loadChar() || { name, color: $('lcolor').value, lv: 1, xp: 0, inv: [], eq: { weapon: starterWeapon(startKind), armor: null, acc: null } };
  char.name = name; char.color = $('lcolor').value;
  char.tree = char.tree || {}; char.slots = char.slots || [null, null]; char.quests = char.quests || {};
  saveChar();
  $('lstart').disabled = true; $('lstart').textContent = '接続中…';
  const wsUrl = params.get('server') || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const ok = params.has('solo') || window.ETERNA_SOLO || location.protocol === 'file:' ? false : await net.connect(wsUrl);
  if (!ok) await net.startSolo();
  $('mode-tag').textContent = ok ? 'ONLINE' : 'SOLO MODE（サーバー未接続）';
  me.model = makePlayer(char.color);
  scene.add(me.model);
  calcStats(); me.hp = S.mhp; me.potions = S.maxPot;
  $('login').classList.add('hidden');
  $('hud').classList.remove('hidden');
  started = true;
  renderQuests();
  net.send({ t: 'hello', name: char.name, color: char.color, lv: char.lv });
  addChat('', ok ? 'サーバーに接続しました。友達を誘おう！' : 'ソロモードで起動しました（npm start でサーバーを立てるとマルチプレイ）', '#9fe');
  addChat('', '町の人に話しかけると（F）サブクエストを受けられます。Mでエリアマップ。', '#9fe');
  if (spTotal(char.lv) - spSpent(char.tree) > 0) toast('未使用のスキルポイントがあります（Kでスキルツリー）', '#ffd84a');
  setTimeout(() => $('help').classList.add('hidden'), 15000);
};

// ログイン背景用に、はじまりの街を表示
enterPreview();
function enterPreview() {
  const def = AREAS.f1_town, fdef = FLOORS[0];
  world.def = def;
  buildEnv('f1_town');
  hemi.color.set(fdef.hemi[0]); hemi.groundColor.set(fdef.hemi[1]);
  sun.color.set(fdef.sun);
  sun.position.set(20, 40, 10);
  ambient.setKind(fdef.particles);
  const spin = () => {
    if (started) return;
    const t = now() * 0.05;
    camera.position.set(Math.sin(t) * 40, 16, Math.cos(t) * 40); camera.lookAt(0, 2, 0);
    ambient.update(0.016, 0, 0, now());
    env.update(now(), 0, 0);
    fx.update(0.016);
    requestAnimationFrame(spin);
  };
  spin();
}
loop();

window.__game = { me, mobs, drops, teles, npcs, char: () => char, world, fx, S: () => S, net, settings, env: () => env };
