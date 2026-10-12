import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  FLOORS, WEAPONS, RARITIES, MAX_LEVEL, INSTINCT, BOW_ZONE,
  WEAPON_SKILL_POOL, xpToNext, baseAtk, baseHp, inShape, starterWeapon, makeItem, floorLevel, itemWeight, weightClass, salvageValue,
} from '../shared/data.js';
import { AREAS, AREA_TYPES, HAZARDS, grid, collide, spawnPoint, hazardsOf, chestsOf, insideOpen } from '../shared/areas.js';
import { AudioEngine } from './audio.js';
import { FX, makeTelegraph } from './fx.js';
import { buildArea, textSprite, AmbientParticles } from './env.js';
import { makePlayer, setPlayerWeapon, animatePlayer, makeMob, animateMob, makeLootOrb, makeCoin, makeGoldBag } from './models.js';
import { Net } from './net.js';
import { OCC } from './toon.js';
import {
  HEAVY, WEAPON_SKILLS, TREE_SKILLS, NODE_INDEX,
  spTotal, spSpent, canLearn, treeEffects,
} from './skills.js';
import { QUESTS, QUEST_INDEX, questState, questAvailable, questProgress } from './quests.js';
import { createUI } from './ui/app.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => performance.now() / 1000;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

// 画面（ui/app.js）への窓口。DOM には直接さわらない
let ui = null;
const toast = (...a) => ui?.toast(...a);
const banner = (...a) => ui?.banner(...a);
const addChat = (...a) => ui?.chat(...a);
const floatText = (...a) => ui?.floatText(...a);
const renderParty = () => ui?.party();
const renderQuests = () => ui?.quests();

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
  master: 1, music: 1, sfx: 1, amb: 1, quality: params.has('low') ? 'low' : 'high', shake: true, dmgnum: true, occlusion: true,
};
try { Object.assign(settings, JSON.parse(localStorage.getItem(SET_KEY)) || {}); } catch { /* */ }
function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch { /* */ } }
const GRASS_BY_Q = { high: 1, mid: 0.5, low: 0.25 };

// ======================================================================
// レンダラー
// ======================================================================
const canvas = document.getElementById('c');
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
  staggerT: 0, instinctT: -9999, dStack: 0, dStackT: 0, nextAtkBonus: 1, atkBonus: 1, atkBonusT: 0,
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
const bprojs = []; // ボスの弾
const pending = []; // 遅延処理
let roster = [];
let started = false;
let shake = 0;
const CAM_ZOOM = [0.55, 1.6];
const cam = { zoom: 1, zoomT: 1, focus: new THREE.Vector3() };
const tmpV = new THREE.Vector3();
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
  // 防具の種類ごとの特性
  if (eq.armor?.trait) { const [k, v] = eq.armor.trait; aff[k] = (aff[k] || 0) + v; }
  const fxs = new Set(items.flatMap((i) => i.fx || []));
  const wk = eq.weapon ? eq.weapon.kind : 'sword';
  const T = treeEffects(char, wk);
  const m = (k) => (aff[k] || 0) + (T.mods[k] || 0);
  for (const f of T.flags) fxs.add(f);
  const atk = (baseAtk(char.lv) + (eq.weapon?.atk || 0) + (eq.acc?.atk || 0)) * (1 + m('atkp') / 100);
  const mhp = (baseHp(char.lv) + (eq.armor?.hp || 0) + (eq.acc?.hp || 0)) * (1 + m('hpp') / 100);
  const weight = items.reduce((a, it) => a + itemWeight(it), 0);
  const wc = weightClass(weight);
  const W = WEAPONS[wk];
  // 武器パッシブ
  const P = {
    heavy: wk === 'greatsword' ? 20 : wk === 'axe' ? 25 : 0,
    vamp: wk === 'axe' ? 3 : 0,
    def: wk === 'spear' ? 10 : 0,
    dodge: wk === 'dagger' ? 0.75 : 1,
    iframe: wk === 'sword' ? 0.1 : 0,
  };
  S = {
    wk, W, atk, mhp: Math.round(mhp), fx: fxs, flags: T.flags, actives: T.actives,
    crit: 5 + m('crit'), critd: 150 + m('critd'), aspd: m('aspd'), move: m('move'),
    vamp: m('vamp') + (fxs.has('vamp') ? 4 : 0) + P.vamp, cdr: Math.min(60, m('cdr') + (fxs.has('star') ? 35 : 0)),
    def: Math.min(65, m('def') + (eq.armor?.def || 0) + P.def), wr: eq.weapon ? eq.weapon.rarity : 0,
    normp: m('normp'), heavyp: m('heavyp') + P.heavy, wskillp: m('wskillp'), dodgecd: Math.min(60, m('dodgecd')),
    justbuff: m('justbuff'), counter: m('counter'), backwater: m('backwater'), maxPot: 3 + m('potion') + (char.potBonus || 0),
    ws: WEAPON_SKILLS[weaponSkillId()], weight, wc,
    dodgeCd: DODGE_CD * wc.cd * (1 - Math.min(60, m('dodgecd')) / 100) * P.dodge,
    iframeBonus: P.iframe, stunp: m('stunp'), optimal: W.optimal || 0, zoneMax: BOW_ZONE.max + m('zone'),
  };
  me.hp = Math.min(me.hp, S.mhp);
  if (me.model) setPlayerWeapon(me.model, S.wk, S.wr);
  ui?.refresh();
}

// 弓の適性エリア: 外側の円（適性距離）から内側へ、引き絞るほど広がる
function bowZoneWidth() {
  if (!me.charging) return BOW_ZONE.min;
  const k = clamp(me.chargeT / CHARGE_MAX, 0, 1);
  return BOW_ZONE.min + (S.zoneMax - BOW_ZONE.min) * k;
}
function bowZone(w = BOW_ZONE.min) { const outer = S.optimal; return [Math.max(0, outer - w), outer]; }

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
// DOM のイベントは UI（ui/app.js）の Root 配下で受け、Mediator が裁定してからここを呼ぶ
const input = {
  keyDown(k) {
    audio.init();
    if (!started) return;
    keys.add(k);
    if (k === ' ' || k === 'shift') tryDodge();
    if (k === 'q') usePotion();
    if (k === 'e') tryWeaponSkill();
    if (k === '1') tryTreeSkill(0);
    if (k === '2') tryTreeSkill(1);
  },
  keyUp(k) { keys.delete(k); },
  blur() { keys.clear(); mouse.l = mouse.r = false; me.charging = false; me.guarding = false; },
  pointerMove(x, y) { mouse.x = x; mouse.y = y; },
  pointerDown(button) {
    audio.init();
    if (!started) return;
    if (button === 0) { mouse.l = true; me.charging = true; me.chargeT = 0; me.chargeLv = 0; }
    if (button === 2) {
      mouse.r = true;
      // 盾槍は右クリック長押しでガード。それ以外は武器スキル
      if (S?.W.guard) { if (!me.dead) { me.guarding = true; me.guardStart = now(); me.charging = false; audio.sfx('equip'); } }
      else tryWeaponSkill();
    }
  },
  pointerUp(button) {
    if (button === 0) {
      mouse.l = false;
      if (me.charging && started) {
        me.releaseZoneW = S ? bowZoneWidth() : BOW_ZONE.min;
        me.charging = false;
        if (me.chargeT < CHARGE_MIN) me.queued = now() + 0.45; // 短押し → 通常攻撃（入力を少しの間覚えておく）
        else doHeavy(me.chargeLv);
      }
    }
    if (button === 2) {
      mouse.r = false;
      // 盾槍: ガードしていた時間に応じて次の攻撃にボーナス（最大+50%・2秒で最大）
      if (me.guarding) {
        me.nextAtkBonus = 1 + Math.min(now() - me.guardStart, 2) / 2 * 0.5;
        if (me.nextAtkBonus > 1.15) floatText(me.x, 2.6, me.z, `反撃準備 +${Math.round((me.nextAtkBonus - 1) * 100)}%`, 'info');
      }
      me.guarding = false;
    }
  },
  // ホイール1段で一定の比率だけ寄る/引く（どの距離でも同じ手触り）
  wheel(dy) { cam.zoomT = clamp(cam.zoomT * Math.exp(clamp(dy, -120, 120) * 0.0012), CAM_ZOOM[0], CAM_ZOOM[1]); },
  // ---- スマホ ----
  zoomBy(f) { cam.zoomT = clamp(cam.zoomT * f, CAM_ZOOM[0], CAM_ZOOM[1]); },
  setTouch(on) {
    if (touch.on === on) return;
    touch.on = on;
    if (on) cam.zoom = cam.zoomT = 1.12; // 画面が小さいので少し引く
  },
  stick(x, y) { touch.stick.x = x; touch.stick.y = y; },
  // ボタンを引っぱって狙う（len: 0〜1）。null で自動ターゲットに戻す
  aim(a, len = 0) { touch.aim = a; touch.aimLen = len; },
  // 右側のボタン
  button(act, down) {
    audio.init();
    if (!started) return;
    if (act === 'atk') return down ? input.pointerDown(0) : input.pointerUp(0);
    if (act === 'guard') return down ? input.pointerDown(2) : input.pointerUp(2);
    if (!down) return;
    if (act === 'skill') tryWeaponSkill();
    if (act === 't1') tryTreeSkill(0);
    if (act === 't2') tryTreeSkill(1);
    if (act === 'dodge') tryDodge();
    if (act === 'pot') usePotion();
  },
};

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
        char.chests[m.cid || m.ar] = Date.now();
        questEvent({ type: 'chest', area: m.ar });
        audio.sfx('clear');
        saveChar();
      }
      break;
    case 'gold': spawnGold(m.n, m.x, m.z, !!m.bag); break;
    // 共有ボックス
    case 'box': ui.boxItems(m.items, m.max); break;
    case 'boxPut': {
      const i = char.inv.findIndex((it) => it.id === m.ref);
      if (i >= 0) { const [it] = char.inv.splice(i, 1); toast(`「${it.name}」を共有ボックスに入れた`, '#9ae8ff'); }
      audio.sfx('equip'); saveChar(); ui.refresh();
      break;
    }
    case 'boxTake': {
      if (char.inv.length >= 60) { toast('インベントリがいっぱいです', '#f88'); net.send({ t: 'box', op: 'put', item: m.item }); break; }
      char.inv.unshift(m.item);
      toast(`「${m.item.name}」を共有ボックスから取り出した`, RARITIES[m.item.rarity].color);
      audio.sfx('pickup'); saveChar(); ui.refresh();
      break;
    }
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
    case 'bossReset': toast('ボスが退却した…（全員が離脱）', '#aaa'); clearBossProjs(); break;
    case 'proj': spawnBossProj(m); break;
    case 'pgone': {
      const i = bprojs.findIndex((p) => p.id === m.id);
      if (i >= 0) { const p = bprojs[i]; fx.parts.burst(p.x, 1.2, p.z, 20, { color: 0xbfe0ff, speed: 6, size: 0.4, life: 0.35 }); fx.dispose(p.mesh); bprojs.splice(i, 1); }
      break;
    }
    case 'stun': {
      // スタン: そのボスが出していた攻撃はすべて取り消される
      for (let i = teles.length - 1; i >= 0; i--) if (teles[i].src === m.id) { teles[i].meshes.forEach((g) => fx.dispose(g)); teles.splice(i, 1); }
      clearBossProjs();
      const b = mobs.get(m.id);
      banner('STUN!', `${m.sec}秒間 動けない・被ダメージ1.3倍`, '#ffd84a', 3);
      audio.sfx('impact'); audio.sfx('perfect'); addShake(0.8);
      if (b) { fx.ringWave(b.x, b.z, 0xffd84a, 8, 0.6); fx.parts.burst(b.x, 4, b.z, 80, { color: 0xffe080, speed: 10, size: 0.6, life: 1 }); }
      break;
    }
    case 'guardStop': {
      const who = m.pid === me.id ? 'あなた' : others.get(m.pid)?.name || '仲間';
      toast(`${who}が突進を受け止めた！`, '#bfe0ff');
      fx.ringWave(m.x, m.z, 0xbfe0ff, 5, 0.4);
      fx.parts.burst(m.x, 1.5, m.z, 40, { color: 0xbfe0ff, speed: 9, size: 0.5, life: 0.5 });
      audio.sfx('block'); audio.sfx('impact'); addShake(0.6);
      if (m.pid === me.id) floatText(me.x, 2.8, me.z, 'GUARD BREAK!', 'just');
      break;
    }
    case 'hateReset': {
      const b = mobs.get(m.id);
      if (b) { toast('ヘイトがリセットされた！ 狙いを取り直そう', '#ff9a8a'); fx.ringWave(b.x, b.z, 0xff9a8a, 6, 0.5); }
      break;
    }
    case 'aim': {
      // 遠距離攻撃の照準線（ボス → 狙われた人）
      const b = mobs.get(m.id);
      const tgt = () => (m.tid === me.id ? me : others.get(m.tid));
      if (!b || !tgt()) break;
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff4a3a, transparent: true, depthTest: false }));
      line.renderOrder = 7;
      fx.add(line, m.d / 1000, (o, k) => {
        const t = tgt();
        if (!t) return;
        const pos = o.geometry.attributes.position;
        pos.setXYZ(0, b.x, 1.6, b.z); pos.setXYZ(1, t.x, 1.0, t.z); pos.needsUpdate = true;
        o.material.opacity = 0.4 + 0.6 * Math.abs(Math.sin(k * 20));
      });
      if (m.tid === me.id) { audio.sfx('telegraph'); toast('ボスに狙われている！', '#ff6a5a'); }
      break;
    }
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
  if (char) flushCoins();
  clearBossProjs();
  buildNpcs(def);
  me.x = x; me.z = z; me.a = Math.PI; me.transit = false;
  for (const p of env.portals) p.armed = Math.hypot(p.x - x, p.z - z) > p.r + 1.5;
  if (S && (def.type === 'town' || def.type === 'camp')) me.potions = S.maxPot;
  audio.setMusic(fdef.music, false);
  audio.setAmbient(indoor ? 'cave' : fdef.amb);
  const T = AREA_TYPES[def.type];
  banner(`第${def.floor}層 ・ ${T.name}`, def.name, T.color);
  if (def.named) toast(`この地には主「${def.named.name}」が棲むという…`, '#ffb27a');
  audio.sfx('warp');
  fx.beam(me.x, me.z, 0x6ad0ff, 12, 1.2, 1.2);
  cam.focus.set(x, 1.2, z); cam.back = null;
  if (prev !== id) questEvent({ type: 'visit', area: id });
  ui.close();
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
      o = { id, model: makePlayer(color), x, z, a, swingT: 9, combo: 0, sw, sk, spinT: -1, walkT: 0 };
      scene.add(o.model);
      others.set(id, o);
    }
    Object.assign(o, { tx: x, tz: z, ta: a, hp, mhp, lv, name, dead, dg, wk, wr, gd });
    setPlayerWeapon(o.model, wk, wr);
    if (sw !== o.sw) {
      o.sw = sw; o.swingT = 0; o.combo++;
      const W = WEAPONS[wk];
      if (W.ranged) fxArrow(o.x, o.z, o.a, RARITIES[wr].color);
      else fx.slash(o.x, o.z, o.a, W.range, W.arc, RARITIES[wr].color, 1.0, o.combo % 2 === 1);
    }
    if (sk !== o.sk) { o.sk = sk; o.spinT = 0; fx.ringWave(o.x, o.z, 0x9ad8ff, 5); fx.parts.burst(o.x, 1, o.z, 30, { color: 0x9ad8ff, speed: 6 }); }
  }
  for (const id of [...others.keys()]) if (!seenP.has(id)) removeOther(id);

  const seenM = new Set();
  const fdef = FLOORS[world.floor - 1];
  for (const r of m.m) {
    const [id, d, x, z, a, hp, mhp, lv, st, kind, enr, elite, target, hateT, stunPct, stunT] = r;
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
        // elite: 1 精鋭 / 2 門番 / 3 ネームド（秘境の主）
        const sc = kind === 1 ? 0.8 : elite === 3 ? 1.9 : elite ? 1.3 : 1;
        model = makeMob(md.t, md.color, sc, elite === 3 ? 0xff60d0 : elite ? 0xffb030 : null);
        name = elite === 3 ? `★ ${world.def.named?.name || md.name}` : elite === 2 ? '門番' : (elite ? '精鋭 ' : '') + md.name;
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
    Object.assign(mb, { tx: x, tz: z, ta: a, mhp, lv, st, enraged: !!enr, target, hateT, stunPct, stunT });
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
  if (te.src) net.send({ t: 'absorb', id: te.src }); // 狙われ役が攻撃を受けるとヘイトのリセットが少し延びる
  if (S.fx.has('aegis') && Math.random() < 0.25) {
    floatText(me.x, 2.4, me.z, '無効化!', 'info');
    audio.sfx('block');
    fx.ringWave(me.x, me.z, 0xffd84a, 2, 0.3, 1);
    return;
  }
  let raw = te.dmg;
  // 敵の正面で受けると苛烈、背後なら軽い
  const srcMob = mobs.get(te.src);
  if (srcMob) {
    const off = Math.abs(angDiff(Math.atan2(me.x - srcMob.x, me.z - srcMob.z), srcMob.a));
    if (off < THREE.MathUtils.degToRad(60)) raw *= 1.3;
    else if (off > THREE.MathUtils.degToRad(120)) raw *= 0.7;
  }
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
  takeDamage(raw);
}

// 被ダメージの共通処理（予兆・ボスの弾）
function takeDamage(raw) {
  const dr = clamp(buffMod('dr'), -100, 90);
  const dmg = Math.max(1, Math.round(raw * (1 - S.def / 100) * (1 - dr / 100) * rnd(0.9, 1.1)));
  me.hp -= dmg;
  me.lastHurt = now();
  floatText(me.x, 2.2, me.z, dmg, 'me');
  audio.sfx('hurt');
  addShake(0.3);
  ui.hurt();
  // ひるみ（大剣の溜め中はひるまない）
  if (dmg >= S.mhp * 0.1 && me.hp > 0) {
    const armor = S.wk === 'greatsword' && me.charging;
    if (armor) floatText(me.x, 2.8, me.z, 'スーパーアーマー', 'info');
    else { me.staggerT = 0.35; me.charging = false; me.guarding = false; me.queued = 0; }
  }
  if (me.hp <= 0 && S.flags.has('laststand') && now() - me.lastStandT > 90) {
    me.hp = 1; me.lastStandT = now(); me.iframe = 1.0;
    floatText(me.x, 2.8, me.z, '不屈!', 'just');
    audio.sfx('perfect');
    fx.beam(me.x, me.z, 0xffd84a, 8, 0.8, 0.8);
    return;
  }
  if (me.hp <= 0) { die(); return; }
  // 生存本能（近接武器のパッシブ）: HPが一定以下になると、しばらく被ダメージを大きく軽減
  if (S.W.melee && me.hp < S.mhp * INSTINCT.hp && now() - me.instinctT > INSTINCT.cd) {
    me.instinctT = now();
    addBuff('instinct', '生存本能', INSTINCT.sec, { dr: INSTINCT.dr }, 0xff6a5a);
    floatText(me.x, 2.8, me.z, '生存本能!', 'just');
    fx.beam(me.x, me.z, 0xff6a5a, 8, 0.8, 0.8);
    ui.toast(`生存本能が発動！ ${INSTINCT.sec}秒間 被ダメージ-${INSTINCT.dr}%（次は${INSTINCT.cd}秒後）`, '#ff9a8a');
  }
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
}

// ======================================================================
// 戦闘（プレイヤー側）
// ======================================================================
// ---- 狙い: マウス、またはスマホ（ボタンを引っぱった方向 → 自動ターゲット → 向いている方向） ----
const touch = { on: false, stick: { x: 0, y: 0 }, aim: null, aimLen: 0, target: null };
function autoTarget() {
  if (!S) return null;
  const range = S.W.ranged ? WEAPONS.bow.range : S.W.range + 4;
  // 近さと、スティック（または向き）の方向との近さで選ぶ
  const sl = Math.hypot(touch.stick.x, touch.stick.y);
  const want = sl > 0.3 ? Math.atan2(touch.stick.x, touch.stick.y) : me.a;
  let best = null, bs = Infinity;
  for (const mb of mobs.values()) {
    if (mb.hp <= 0) continue;
    const d = Math.hypot(mb.x - me.x, mb.z - me.z);
    if (d > range + mb.rad) continue;
    const off = Math.abs(angDiff(Math.atan2(mb.x - me.x, mb.z - me.z), want));
    const s = d * (1 + off / Math.PI) * (mb.kind === 2 ? 0.8 : 1);
    if (s < bs) { bs = s; best = mb; }
  }
  return best;
}
function aimAngle() {
  if (!touch.on) return Math.atan2(mouse.world.x - me.x, mouse.world.z - me.z);
  if (touch.aim != null) return touch.aim;
  const t = touch.target;
  return t ? Math.atan2(t.x - me.x, t.z - me.z) : me.a;
}
// 地点を狙うスキル（アローレインなど）
function aimPoint() {
  if (!touch.on) return { x: mouse.world.x, z: mouse.world.z };
  if (touch.aim != null) { const r = 3 + touch.aimLen * 13; return { x: me.x + Math.sin(touch.aim) * r, z: me.z + Math.cos(touch.aim) * r }; }
  if (touch.target) return { x: touch.target.x, z: touch.target.z };
  return { x: me.x + Math.sin(me.a) * 8, z: me.z + Math.cos(me.a) * 8 };
}
function addShake(v) { if (settings.shake) shake = Math.max(shake, v); }

const TYPE_MOD = { normal: 'normp', heavy: 'heavyp', wskill: 'wskillp' };
function dealDamage(mb, mult, o = {}) {
  if (!mb || mb.hp <= 0) return;
  const skill = o.type === 'wskill' || o.type === 'tskill';
  let crit = o.crit || Math.random() * 100 < S.crit + buffMod('crit') || (skill && S.fx.has('skillcrit'));
  if (!crit && me.ambush > 0 && !o.noProc) { crit = true; me.ambush--; }
  const typeMult = 1 + (S[TYPE_MOD[o.type]] || 0) / 100;
  const back = me.hp < S.mhp * 0.5 ? 1 + S.backwater / 100 : 1;
  const stunned = mb.stunT > 0 ? 1.3 : 1;
  const exec = S.flags.has('execute') && mb.hp < mb.mhp * 0.3 ? 1.5 : 1;
  const guardBonus = now() < me.atkBonusT ? me.atkBonus : 1;
  let dmg = S.atk * (1 + buffMod('atkp') / 100) * mult * typeMult * back * stunned * exec * guardBonus
    * (1 + buffMod('dmgp') / 100) * (o.falloff ?? 1) * rnd(0.92, 1.08) * (crit ? S.critd / 100 : 1);
  dmg = Math.max(1, Math.round(dmg));
  mb.hp -= dmg; mb.localT = now(); mb.flash = 1;
  // スタン値: 強攻撃で大きく溜まる。近接武器ほど溜めやすい
  let st = 0;
  if (mb.kind === 2 && !(mb.stunT > 0)) {
    st = o.stun ?? { normal: 1.2, heavy: 6, wskill: 3, tskill: 3 }[o.type] ?? 0;
    st *= S.W.stun * (S.W.melee ? 1 + S.stunp / 100 : 1);
    st = Math.round(st * 10) / 10;
  }
  net.send({ t: 'hit', id: mb.id, dmg, crit, st });
  if (o.threat > 1) net.send({ t: 'threat', id: mb.id, n: Math.round(dmg * (o.threat - 1)) });
  // 武器パッシブ（攻撃が当たったとき）
  if (['normal', 'heavy', 'wskill', 'tskill'].includes(o.type)) {
    if (S.wk === 'sword') { me.wsCd -= 0.15; for (const k in me.tcd) me.tcd[k] -= 0.15; }
    if (S.wk === 'dagger') { me.dStack = Math.min(10, me.dStack + 1); me.dStackT = 3; }
  }
  floatText(mb.x, 2.2 * (mb.kind === 2 ? 2.5 : 1), mb.z, dmg, o.type === 'dot' ? 'poison' : crit ? 'crit' : '');
  if (o.type !== 'dot') {
    const wc = RARITIES[S.wr].color;
    fx.parts.burst(mb.x, 1.2, mb.z, crit ? 18 : 8, { color: crit ? 0xffd84a : wc, speed: crit ? 9 : 6, size: crit ? 0.5 : 0.35, life: 0.4 });
    audio.sfx('hit', { crit });
  }
  const vamp = S.vamp + buffMod('vamp');
  if (vamp > 0) heal(dmg * vamp / 100, false);
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
  point: aimPoint,
  zone: () => bowZone(me.releaseZoneW ?? BOW_ZONE.min),
  arrow(o) {
    const color = o.color ?? RARITIES[S.wr].color;
    const mesh = arrowMesh(color, o.big);
    mesh.position.set(me.x, 1.2, me.z); mesh.rotation.y = o.a;
    projs.push({ mesh, arrow: true, x: me.x, z: me.z, sx: me.x, sz: me.z, a: o.a, t: 0, speed: o.speed ?? 42, life: (WEAPONS.bow.range + 4) / (o.speed ?? 42), rad: o.rad ?? 0.7, mult: o.mult ?? 1, type: o.type, pierce: !!o.pierce, hit: new Set(), zone: o.zone ?? bowZone(), color });
    // 射出の閃光
    const fx0 = me.x + Math.sin(o.a) * 0.9, fz0 = me.z + Math.cos(o.a) * 0.9;
    fx.flash(fx0, 1.3, fz0, color, o.big ? 14 : 8, 0.15, 6);
    fx.parts.burst(fx0, 1.25, fz0, o.big ? 18 : 8, { color, speed: 5, size: 0.35, life: 0.25, gravity: 0 });
    audio.sfx('swing');
  },
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

function canAct() { return S && !me.dead && me.dodgeT <= 0 && me.skillT < 0 && me.dashT <= 0 && !me.guarding && me.staggerT <= 0; }
// 弓は回避中も通常攻撃ができる（転がり撃ち）
const canShootInDodge = () => S.W.ranged && !me.dead && me.dodgeT > 0 && me.skillT < 0 && me.staggerT <= 0;

// 攻撃を始めるとき、盾槍のガードボーナスをこの攻撃に乗せる
function startAttack() {
  me.atkBonus = me.nextAtkBonus; me.atkBonusT = now() + 0.7; me.nextAtkBonus = 1;
}

function doSwing() {
  const W = S.W;
  startAttack();
  me.combo = now() - me.lastSwing < W.speed * 2.2 ? (me.combo + 1) % 3 : 0;
  me.lastSwing = now();
  me.swingT = 0;
  me.swingDur = W.speed * (1 - (S.aspd + buffMod('aspd') + me.dStack * 4) / 100) * (me.combo === 2 ? 1.25 : 1);
  me.sw++;
  me.a = aimAngle();
  const mult = W.mult * [1, 1.1, 1.6][me.combo];
  const col = RARITIES[S.wr].color;
  const a = me.a;
  if (W.ranged) {
    combat.arrow({ a, mult, type: 'normal' });
    if (me.dodgeT > 0) floatText(me.x, 2.4, me.z, '転がり撃ち', 'info');
    return;
  }
  fx.slash(me.x, me.z, me.a, W.range, W.arc, col, 1.0, me.combo % 2 === 1);
  audio.sfx('swing', { heavy: S.wk === 'greatsword' || S.wk === 'axe' || me.combo === 2 });
  later(0.06, () => combat.arc(W.range, W.arc, mult, { a, type: 'normal' }));
  if (me.combo === 2 && S.fx.has('wave')) combat.proj({ a, mult: 1.4, type: 'normal' });
}

// 矢の見た目
function arrowMesh(color, big) {
  // 小さくて見えにくかったので、光る矢じりと長い光の尾を付けて大きめにする
  const g = new THREE.Group();
  const s = big ? 2.0 : 1.5;
  const bright = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35).multiplyScalar(2.2);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 1.2 * s, 6), new THREE.MeshBasicMaterial({ color: 0xfff4dc }));
  shaft.rotation.x = Math.PI / 2; g.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.13 * s, 0.38 * s, 6), new THREE.MeshBasicMaterial({ color: bright }));
  head.rotation.x = Math.PI / 2; head.position.z = 0.75 * s; g.add(head);
  const glowM = new THREE.MeshBasicMaterial({ color: bright, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28 * s, 10, 8), glowM);
  orb.position.z = 0.7 * s; g.add(orb);
  for (const rz of [0, Math.PI / 2]) {
    const trail = new THREE.Mesh(new THREE.PlaneGeometry(0.3 * s, 3.2 * s), new THREE.MeshBasicMaterial({ color: bright, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    trail.rotation.set(Math.PI / 2, 0, 0); trail.rotateY(rz); trail.position.z = -1.0 * s; g.add(trail);
  }
  g.userData.isArrow = true;
  return g;
}
// 他プレイヤーの矢（見た目だけ）
function fxArrow(x, z, a, color) {
  const m = arrowMesh(color, false);
  m.position.set(x, 1.2, z); m.rotation.y = a;
  fx.add(m, 0.6, (o, k) => { o.position.x = x + Math.sin(a) * 40 * k * 0.6; o.position.z = z + Math.cos(a) * 40 * k * 0.6; });
}

function doHeavy(lv) {
  if (!canAct() || lv < 1) return;
  startAttack();
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
  startAttack();
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
    if (w.arrow) {
      // 矢: 適性エリア（2つの円の間）にいる敵にだけ本来のダメージ
      w.mesh.position.set(w.x, 1.2, w.z);
      if (Math.random() < 0.7) fx.parts.emit(w.x, 1.2, w.z, { color: w.color, size: 0.35, life: 0.25, speed: 0.4, gravity: 0 });
      let done = false;
      for (const mb of [...mobs.values()]) {
        if (w.hit.has(mb.id) || Math.hypot(mb.x - w.x, mb.z - w.z) > w.rad + mb.rad) continue;
        w.hit.add(mb.id);
        const d = Math.hypot(mb.x - w.sx, mb.z - w.sz);
        const inZone = d >= w.zone[0] - mb.rad && d <= w.zone[1] + mb.rad;
        dealDamage(mb, w.mult, { type: w.type, falloff: inZone ? 1 : BOW_ZONE.outside });
        if (inZone) {
          floatText(mb.x, 3.4, mb.z, '適性!', 'info');
          fx.ringWave(mb.x, mb.z, 0x9affc8, 1.6, 0.25);
        } else floatText(mb.x, 3.4, mb.z, d < w.zone[0] ? '近い' : '遠い', 'info');
        fx.parts.burst(w.x, 1.2, w.z, inZone ? 16 : 6, { color: inZone ? 0x9affc8 : 0xffffff, speed: 5, size: 0.4, life: 0.3 });
        if (!w.pierce) { done = true; break; }
      }
      const c = collide(world.def, w.x, w.z, 0.1, world.door);
      if (done || w.t > w.life || Math.hypot(c.x - w.x, c.z - w.z) > 0.05) { fx.dispose(w.mesh); projs.splice(i, 1); }
      continue;
    }
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

// ---- ボスの弾 ----
function spawnBossProj(m) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(m.r, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(m.c).multiplyScalar(1.6) }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(m.r * 1.7, 14, 10), new THREE.MeshBasicMaterial({ color: m.c, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(core, halo);
  g.position.set(m.x, 1.3, m.z);
  scene.add(g);
  bprojs.push({ ...m, mesh: g, dodged: false });
}
function clearBossProjs() { for (const p of bprojs.splice(0)) fx.dispose(p.mesh); }
function updateBossProjs(dt) {
  for (let i = bprojs.length - 1; i >= 0; i--) {
    const p = bprojs[i];
    p.x += p.vx * dt; p.z += p.vz * dt; p.life -= dt;
    p.mesh.position.set(p.x, 1.3, p.z);
    if (Math.random() < 0.6) fx.parts.emit(p.x, 1.3, p.z, { color: p.c, size: 0.4, life: 0.3, speed: 0.3, gravity: 0 });
    let gone = p.life <= 0;
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (!gone && !me.dead && d < p.r + 0.6) {
      const facing = Math.abs(angDiff(Math.atan2(p.x - me.x, p.z - me.z), me.a)) < THREE.MathUtils.degToRad(80);
      if (me.guarding && S.W.guard && facing) {
        // ガードで弾を消す
        net.send({ t: 'pblock', id: p.id });
        const just = now() - me.guardStart <= 0.28 + (S.flags.has('bulwark') ? 0.15 : 0);
        floatText(me.x, 2.6, me.z, just ? 'JUST GUARD!' : '防御', just ? 'just' : 'info');
        audio.sfx('block');
        fx.parts.burst(p.x, 1.3, p.z, 20, { color: 0xbfe0ff, speed: 6, size: 0.4, life: 0.35 });
        gone = true;
      } else if (me.iframe > 0) {
        if (!p.dodged) { p.dodged = true; onJustDodge(); }
      } else {
        net.send({ t: 'absorb', id: p.src });
        takeDamage(p.dmg);
        fx.parts.burst(p.x, 1.3, p.z, 20, { color: p.c, speed: 6, size: 0.5, life: 0.4 });
        gone = true;
      }
    }
    if (gone) { fx.dispose(p.mesh); bprojs.splice(i, 1); }
  }
}

function tryDodge() {
  audio.init();
  if (!S || me.dead || me.dodgeCd > 0 || me.dashT > 0 || me.staggerT > 0) return;
  let dx = 0, dz = 0;
  if (keys.has('w')) dz -= 1; if (keys.has('s')) dz += 1; if (keys.has('a')) dx -= 1; if (keys.has('d')) dx += 1;
  if (Math.hypot(touch.stick.x, touch.stick.y) > 0.25) { dx = touch.stick.x; dz = touch.stick.y; }
  if (!dx && !dz) { dx = Math.sin(me.a); dz = Math.cos(me.a); }
  const l = Math.hypot(dx, dz);
  const after = hasBuff('afterimage');
  me.dodgeDir = [dx / l, dz / l];
  me.dodgeT = 0.38;
  me.dodgeCd = S.dodgeCd * (after ? 0.25 : 1);
  me.iframe = (after ? 0.6 : 0.32) + S.iframeBonus;
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
    ui.refresh();
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

function acceptQuest(id) {
  const q = QUEST_INDEX[id];
  if (!q || questState(char, id) || !questAvailable(char, q)) return;
  char.quests = char.quests || {};
  char.quests[id] = { p: 0 };
  audio.sfx('equip'); saveChar(); renderQuests(); refreshNpcMarks();
  // すでに条件を満たしているもの（到達など）
  if (q.type === 'visit' && world.area === q.target) questEvent({ type: 'visit', area: q.target });
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
  if (def.box && d(def.box) < 3.8) return { kind: 'box', label: '<kbd>F</kbd> 共有ボックスを開く（装備の受け渡し）' };
  if (def.shape === 'grid') {
    const g = grid(def);
    const L = g.pts.L?.[0];
    if (L && d(L) < 3.5 && !world.door) return { kind: 'lever', label: '<kbd>F</kbd> レバーを引く' };
  }
  for (const C of chestsOf(def)) {
    if (d(C) < 3.5) return { kind: 'chest', chest: C, label: chestOpen(C) ? '宝箱は空っぽだ（しばらくすると中身が戻る）' : '<kbd>F</kbd> 宝箱を開ける' };
  }
  return null;
}
const chestCd = (C) => (C.big ? 300 : 600) * 1000;
function chestOpen(C) { return Date.now() - (char.chests?.[C.id] || 0) < chestCd(C); }

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
      ui.refresh();
    } else if (d.t > 150) { disposeDrop(d); drops.splice(i, 1); }
  }
}

// ======================================================================
// ゴールド: 硬貨が飛び散って跳ね、近づくと吸い寄せられて拾える。大金は金貨袋
// ======================================================================
const coins = [];
const GOLD_MAGNET = 4.5;
let goldGainBuf = 0, goldGainT = 0, coinSfxT = 0;
function spawnGold(n, x, z, bag = false) {
  n = Math.max(1, Math.round(n));
  if (Math.hypot(x - me.x, z - me.z) < 30) audio.sfx(bag ? 'drop' : 'coins', { n: Math.min(10, Math.ceil(Math.sqrt(n))), rarity: 3 });
  if (bag) {
    const model = makeGoldBag();
    model.position.set(x, heightAt(x, z), z);
    scene.add(model);
    const a = Math.random() * Math.PI * 2;
    coins.push({ bag: true, model, value: n, x, z, y: 1.2, vx: Math.sin(a) * 1.5, vz: Math.cos(a) * 1.5, vy: 7, t: 0, spin: 0 });
    fx.parts.burst(x, 1, z, 40, { color: 0xffd84a, speed: 6, size: 0.45, life: 0.9, gravity: 6 });
    fx.beam(x, z, 0xffd84a, 8, 0.35);
    return;
  }
  // 硬貨の枚数は金額の平方根くらい（3〜14枚）。端数は最初の1枚に
  const k = clamp(Math.round(Math.sqrt(n)), Math.min(3, n), 14);
  const each = Math.floor(n / k);
  for (let i = 0; i < k; i++) {
    const model = makeCoin();
    const a = Math.random() * Math.PI * 2, sp = rnd(1.5, 4.5);
    model.position.set(x, 1, z);
    scene.add(model);
    coins.push({ model, value: each + (i === 0 ? n - each * k : 0), x, z, y: 1.0, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: rnd(5, 8.5), t: 0, spin: rnd(8, 16), bounces: 0 });
  }
}
function addGold(n) {
  char.gold = (char.gold || 0) + n;
  goldGainBuf += n; goldGainT = 0.35;
}
function collectCoin(c) {
  addGold(c.value);
  if (c.bag) {
    audio.sfx('bag');
    fx.parts.burst(c.x, 1, c.z, 50, { color: 0xffd84a, speed: 7, size: 0.5, life: 0.8, gravity: 4 });
    fx.ringWave(c.x, c.z, 0xffd84a, 3, 0.35);
  } else {
    // 連続で拾ったときは音を間引く（重なりすぎてうるさくならないように）
    if (coinSfxT <= 0) { audio.sfx('coin', { vol: 1 }); coinSfxT = 0.035; }
    fx.parts.burst(me.x, 1.2, me.z, 4, { color: 0xffe080, speed: 3, size: 0.3, life: 0.3, gravity: 0 });
  }
  fx.dispose(c.model);
}
function updateCoins(dt) {
  coinSfxT -= dt;
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.t += dt;
    const ground = heightAt(c.x, c.z) + (c.bag ? 0 : 0.17);
    const dx = me.x - c.x, dz = me.z - c.z, d = Math.hypot(dx, dz);
    const settled = c.t > (c.bag ? 0.7 : 0.45);
    if (settled && !me.dead && d < (c.bag ? 2.6 : GOLD_MAGNET)) {
      // 吸い寄せ: 近いほど速く、少し浮き上がって飛んでくる
      const sp = (c.bag ? 9 : 14) + (GOLD_MAGNET - d) * 4;
      c.x += dx / (d || 1) * Math.min(d, sp * dt); c.z += dz / (d || 1) * Math.min(d, sp * dt);
      c.y += ((ground + 0.9) - c.y) * Math.min(1, dt * 8);
      if (d < 0.6) { collectCoin(c); coins.splice(i, 1); continue; }
    } else if (c.y > ground || c.vy > 0) {
      // 放物線で飛んで、地面で跳ねる
      c.vy -= 22 * dt;
      c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt;
      const col = collide(world.def, c.x, c.z, 0.2, world.door); c.x = col.x; c.z = col.z;
      if (c.y <= ground) {
        c.y = ground;
        if (Math.abs(c.vy) > 2.2) {
          c.vy = -c.vy * 0.38; c.vx *= 0.6; c.vz *= 0.6;
          if (!c.bag && c.bounces++ < 1 && coinSfxT <= 0 && d < 20) { audio.sfx('coin', { vol: 0.45 }); coinSfxT = 0.03; }
          if (c.bag) { addShake(0.1); fx.parts.burst(c.x, 0.2, c.z, 10, { color: 0xd8c8a0, speed: 3, size: 0.4, life: 0.4, up: 1 }); }
        } else { c.vy = 0; c.vx = 0; c.vz = 0; }
      }
    }
    // 見た目: 硬貨は回転しながら、地面ではキラッと光る。袋は少し弾む
    if (c.bag) {
      c.model.position.set(c.x, c.y, c.z);
      c.model.userData.body.rotation.y += dt * 1.2;
      c.model.userData.halo.material.opacity = 0.35 + Math.sin(c.t * 4) * 0.2;
      if (Math.random() < 0.15) fx.parts.emit(c.x + rnd(-0.4, 0.4), c.y + rnd(0.3, 1), c.z + rnd(-0.4, 0.4), { color: 0xfff0a0, size: 0.3, life: 0.5, speed: 0.3, gravity: -1 });
    } else {
      c.model.position.set(c.x, c.y, c.z);
      const b = c.model.userData.body;
      b.rotation.y += c.spin * dt;
      if (c.vy === 0 && c.y <= ground + 0.01) { c.spin = Math.max(2.5, c.spin * (1 - dt * 2)); }
      if (Math.random() < 0.012) fx.parts.emit(c.x, c.y + 0.2, c.z, { color: 0xffffff, size: 0.35, life: 0.25, speed: 0, gravity: 0 });
    }
    if (c.t > 90) { fx.dispose(c.model); coins.splice(i, 1); }
  }
  // 拾った金額はまとめて表示（チャリチャリ拾っている間は合算）
  if (goldGainBuf > 0) {
    goldGainT -= dt;
    if (goldGainT <= 0) { floatText(me.x, 2.9, me.z, `+${goldGainBuf} G`, 'gold'); goldGainBuf = 0; saveChar(); ui.refresh(); }
  }
}
// エリア移動などで残った硬貨は、そのまま所持金に入れる
function flushCoins() {
  for (const c of coins.splice(0)) { addGold(c.value); fx.dispose(c.model); }
}

// ======================================================================
// 3D 空間のラベル（DOM の UI は ui/app.js）
// ======================================================================
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
  g.strokeText(txt, 128, 20); g.fillStyle = aggro ? '#ff6a5a' : mb.elite === 3 ? '#ff8ae0' : mb.elite ? '#ffc04a' : '#ffffff'; g.fillText(txt, 128, 20);
  g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(48, 40, 160, 12);
  g.fillStyle = pct > 30 ? '#e8443a' : '#ff9a3a'; g.fillRect(50, 42, 156 * pct / 100, 8);
  mb.label.material.map.needsUpdate = true;
}

function updateMobLabels() {
  for (const mb of mobs.values()) {
    if (!mb.label) continue;
    mb.label.visible = Math.hypot(mb.x - me.x, mb.z - me.z) < 30;
    const pct = Math.round(clamp(mb.hp / mb.mhp, 0, 1) * 100);
    if (pct !== mb.labelPct || mb.lv !== mb.labelLv || (mb.target === me.id) !== mb.labelAggro) drawMobLabel(mb, pct);
  }
}



// ======================================================================
// 装備・スキルツリー・設定の操作（画面の描画は ui/app.js の Presenter）
// ======================================================================
function findItem(id) { return char.inv.find((i) => i.id === id) || Object.values(char.eq).find((i) => i && i.id === id); }
function equip(id) {
  const it = char.inv.find((i) => i.id === id);
  if (!it) return;
  const idx = char.inv.indexOf(it);
  const old = char.eq[it.slot];
  char.inv.splice(idx, 1);
  if (old) char.inv.splice(idx, 0, old);
  char.eq[it.slot] = it;
  audio.sfx('equip');
  calcStats(); saveChar();
}
let salvageArm = null;
function salvage(id) {
  const it = char.inv.find((i) => i.id === id);
  if (!it) return;
  // 伝説以上は2回右クリックで分解（誤操作防止）
  if (it.rarity >= 4 && (salvageArm?.id !== it.id || now() - salvageArm.t > 2)) {
    salvageArm = { id: it.id, t: now() };
    toast(`もう一度右クリックで「${it.name}」を分解`, RARITIES[it.rarity].color);
    return;
  }
  char.inv.splice(char.inv.indexOf(it), 1);
  salvageGold(salvageValue(it));
  saveChar(); ui.refresh();
}
function salvageCommon() {
  const junk = char.inv.filter((i) => i.rarity < 2);
  if (!junk.length) return;
  char.inv = char.inv.filter((i) => i.rarity >= 2);
  salvageGold(junk.reduce((a, i) => a + salvageValue(i), 0));
  toast(`${junk.length}個を分解した`, '#ffd84a');
  saveChar(); ui.refresh();
}
// 分解したゴールドは足元から噴き出して、そのまま吸い寄せられる
function salvageGold(n) {
  audio.sfx('equip');
  if (!started || me.dead) { addGold(n); return; }
  spawnGold(n, me.x, me.z, n >= 300);
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
  calcStats(); saveChar();
}
function setSlot(i, skill) {
  if (!skill) return;
  char.slots = char.slots || [null, null];
  const other = char.slots.indexOf(skill);
  if (other >= 0) char.slots[other] = null;
  char.slots[i] = skill;
  audio.sfx('equip'); saveChar(); ui.refresh();
}
function resetTree() {
  char.tree = {}; char.slots = [null, null];
  audio.sfx('ui'); calcStats(); saveChar();
  toast('スキルポイントを振り直しました', '#9fe');
}
function setSetting(k, v) {
  settings[k] = v;
  saveSettings();
  if (['master', 'music', 'sfx', 'amb'].includes(k)) audio.setVolumes(settings);
  if (k === 'quality') { applyQuality(); if (started) buildEnv(world.area); }
}

// ======================================================================
// メインループ
// ======================================================================
let lastT = now();
let sendT = 0;
let saveT = 0;
// ---- 弓の照準ガイド: 足元の2つの円（外=適性距離、内=引き絞るほど内側へ広がる）と狙いの線 ----
let bowGuide = null;
function makeBowGuide() {
  const group = new THREE.Group();
  const U = { uIn: { value: 0.8 }, uTime: { value: 0 }, uCharge: { value: 0 } };
  // 2つの円の間の帯（ここに入った敵に本来のダメージ）
  const band = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, depthTest: false,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uIn; uniform float uTime; uniform float uCharge; varying vec2 vP;
      void main(){
        float r = length(vP); if (r > 1.0 || r < uIn) discard;
        float edge = smoothstep(0.0, 0.012, 1.0 - r) * smoothstep(0.0, 0.012, r - uIn);
        float stripes = 0.5 + 0.5 * sin((atan(vP.y, vP.x) * 24.0) + uTime * 3.0);
        vec3 c = mix(vec3(0.45, 1.0, 0.8), vec3(1.0, 0.9, 0.4), uCharge);
        gl_FragColor = vec4(c, (0.16 + 0.1 * stripes) * edge + 0.0);
      }`,
  }));
  band.rotation.x = -Math.PI / 2;
  const ringMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
  const outer = new THREE.Mesh(new THREE.RingGeometry(0.975, 1, 128), ringMat(0x9affd8));
  const inner = new THREE.Mesh(new THREE.RingGeometry(0.975, 1, 128), ringMat(0xffffff));
  outer.rotation.x = inner.rotation.x = -Math.PI / 2;
  // 狙いの線（引き絞り中）
  const aim = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  aim.geometry.translate(0, 0.5, 0);
  aim.geometry.rotateX(Math.PI / 2); // +z 方向へ伸びる
  for (const m of [band, outer, inner, aim]) { m.renderOrder = 4; group.add(m); }
  return { group, band, outer, inner, aim, U };
}
function updateBowGuide(t) {
  if (!bowGuide) return;
  const G = bowGuide;
  G.group.visible = !!S.W.ranged && !me.dead;
  if (!G.group.visible) return;
  const w = bowZoneWidth(), [rin, rout] = bowZone(w);
  const charge = me.charging ? clamp(me.chargeT / CHARGE_MAX, 0, 1) : 0;
  G.group.position.set(me.x, heightAt(me.x, me.z) + 0.1, me.z);
  for (const m of [G.band, G.outer]) m.scale.set(rout, rout, 1);
  G.inner.scale.set(Math.max(0.05, rin), Math.max(0.05, rin), 1);
  G.U.uIn.value = rin / rout; G.U.uTime.value = t; G.U.uCharge.value = charge;
  G.inner.material.color.set(charge >= 1 ? 0xffd84a : 0xffffff);
  G.outer.material.opacity = G.inner.material.opacity = me.charging ? 0.95 : 0.55;
  G.aim.visible = me.charging && me.chargeT >= CHARGE_MIN;
  if (G.aim.visible) {
    G.aim.rotation.y = aimAngle();
    G.aim.scale.set(1 + charge, 1, WEAPONS.bow.range);
    G.aim.material.opacity = 0.35 + 0.4 * charge + 0.15 * Math.sin(t * 20);
  }
}

// ---- スマホの狙い: 自動ターゲットの印と、ボタンを引っぱったときの狙い線 ----
let touchGuide = null;
function updateTouchAim(t) {
  if (!touch.on) { if (touchGuide) touchGuide.group.visible = false; return; }
  if (!touchGuide) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: 0x9ae8ff, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    line.geometry.translate(0, 0.5, 0); line.geometry.rotateX(Math.PI / 2);
    const spot = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.5, 40), new THREE.MeshBasicMaterial({ color: 0x9ae8ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    spot.rotation.x = -Math.PI / 2;
    for (const m of [ring, line, spot]) { m.renderOrder = 5; group.add(m); }
    scene.add(group);
    touchGuide = { group, ring, line, spot };
  }
  const G = touchGuide;
  G.group.visible = !me.dead;
  touch.target = touch.aim == null ? autoTarget() : null;
  const tg = touch.target;
  G.ring.visible = !!tg;
  if (tg) {
    const s = tg.rad * 1.6 + Math.sin(t * 6) * 0.08;
    G.ring.position.set(tg.x, heightAt(tg.x, tg.z) + 0.12, tg.z); G.ring.scale.set(s, s, 1);
  }
  G.line.visible = G.spot.visible = touch.aim != null;
  if (touch.aim != null) {
    const len = S.W.ranged ? WEAPONS.bow.range : Math.max(4, S.W.range + 2);
    G.line.position.set(me.x, heightAt(me.x, me.z) + 0.15, me.z);
    G.line.rotation.y = touch.aim; G.line.scale.set(1, 1, len);
    const p = aimPoint();
    G.spot.position.set(p.x, heightAt(p.x, p.z) + 0.15, p.z);
  }
}

// ---- ハザード / 宝箱 ----
function hazardAt(x, z) {
  if (world.def.shape !== 'open') return null;
  return hazardsOf(world.def).find((h) => Math.hypot(h.x - x, h.z - z) < h.r - 0.3) || null;
}

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

  me.dodgeCd -= dt; me.wsCd -= dt; me.potCd -= dt; me.iframe -= dt; me.staggerT -= dt;
  me.dStackT -= dt; if (me.dStackT <= 0) me.dStack = 0;
  for (const k in me.tcd) me.tcd[k] -= dt;
  for (const b of me.buffs) b.t -= dt;
  me.buffs = me.buffs.filter((b) => b.t > 0);
  const safe = world.def.type === 'town' || world.def.type === 'camp';

  if (me.dead) {
    me.deadT -= dt;
    if (me.deadT <= 0) {
      me.dead = false; me.hp = S.mhp; me.potions = S.maxPot;
      const sp = spawnPoint(world.def);
      me.x = sp.x; me.z = sp.z;
      fx.beam(me.x, me.z, 0x6ad0ff, 12, 1, 1);
    }
  } else {
    // 移動
    let dx = 0, dz = 0;
    {
      if (keys.has('w') || keys.has('arrowup')) dz -= 1;
      if (keys.has('s') || keys.has('arrowdown')) dz += 1;
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright')) dx += 1;
    }
    // スマホのアナログスティック（倒した量で歩く速さが変わる）
    let analog = 1;
    const sl = Math.hypot(touch.stick.x, touch.stick.y);
    if (sl > 0.12) { dx = touch.stick.x; dz = touch.stick.y; analog = Math.min(1, sl * 1.15); }
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
    } else if (me.staggerT > 0) {
      // ひるみ中は動けない
      if (Math.random() < 0.3) fx.parts.emit(me.x + rnd(-0.3, 0.3), 2.2, me.z + rnd(-0.3, 0.3), { color: 0xffffff, size: 0.25, life: 0.3, speed: 1, gravity: 0 });
    } else if (l > 0) {
      const busy = me.swingT < me.swingDur || me.skillT >= 0;
      const slow = me.guarding ? 0.45 : busy ? 0.45 : me.charging && me.chargeT > CHARGE_MIN ? 0.4 : 1;
      const sp = 7.2 * (1 + (S.move + buffMod('move')) / 100) * slow * analog * (hazardAt(me.x, me.z)?.kind === 'sand' ? 0.5 : 1);
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
      me.chargeT += dt * (1 + buffMod('chargeRate') / 100); // 集中で溜めが速くなる
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
    if (me.queued > t && (canAct() || canShootInDodge()) && me.swingT >= me.swingDur && !safe) { me.queued = 0; doSwing(); }
    if (me.skillT >= 0) { me.skillT += dt; if (me.skillT > 0.55) me.skillT = -1; }

    // ハザード: 毒沼は踏んでいる間ダメージ、流砂は足が遅くなる（移動のところ）
    const hz = hazardAt(me.x, me.z);
    if (hz && hz.kind !== me.hazKind) ui.toast(`${HAZARDS[hz.kind].name}: ${HAZARDS[hz.kind].desc}`, hz.kind === 'poison' ? '#c08aff' : '#e0c890');
    me.hazKind = hz?.kind;
    if (hz?.kind === 'poison') {
      me.hazT = (me.hazT ?? 0) - dt;
      if (me.hazT <= 0) {
        me.hazT = 0.5;
        me.hp -= Math.max(1, Math.round(S.mhp * 0.025));
        me.lastHurt = t;
        floatText(me.x, 2.2, me.z, '毒', 'poison');
        fx.parts.burst(me.x, 0.4, me.z, 8, { color: 0x9aff7a, speed: 2, size: 0.35, life: 0.5, gravity: -1 });
        if (me.hp <= 0) die();
      }
    }

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
    if (mb.stunT > 0 && Math.random() < 0.5) {
      // スタン中: 頭上で星が回る
      const a = t * 6 + Math.random() * 6, h = 2.6 * mb.model.scale.y;
      fx.parts.emit(mb.x + Math.sin(a) * 1.5, h, mb.z + Math.cos(a) * 1.5, { color: 0xffe060, size: 0.5, life: 0.4, speed: 0.3, gravity: 0 });
      mb.model.userData.body.rotation.z = Math.sin(t * 3) * 0.15;
    } else if (mb.model.userData.body) mb.model.userData.body.rotation.z = 0;
    if (mb.kind === 2 && mb.enraged && Math.random() < 0.5) fx.parts.emit(mb.x + rnd(-2, 2), rnd(0.5, 5), mb.z + rnd(-2, 2), { color: 0xff3a20, size: 0.6, life: 0.8, speed: 1, gravity: 3 });
  }

  // ギミックの見た目
  if (env.door) {
    const y = world.door ? -3.4 : 0;
    env.door.position.y += (y - env.door.position.y) * Math.min(1, dt * 3);
    env.door.visible = env.door.position.y > -3.3;
  }
  if (env.lever) env.lever.userData.stick.rotation.z += ((world.door ? -0.6 : 0.6) - env.lever.userData.stick.rotation.z) * Math.min(1, dt * 6);
  for (const c of env.chests || []) {
    const open = chestOpen(c);
    const lid = c.obj.userData.lid;
    lid.rotation.x += ((open ? -1.9 : 0) - lid.rotation.x) * Math.min(1, dt * 5);
    c.obj.userData.shine.visible = !open;
  }
  env.plates?.forEach((m, i) => { m.material.emissiveIntensity = world.plates[i] ? 1.6 + Math.sin(t * 8) * 0.4 : 0; });

  updateTeles();
  updateProjs(dt);
  updateBossProjs(dt);
  updateDrops(dt);
  updateCoins(dt);
  updateBowGuide(t);
  updateTouchAim(t);

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

  // カメラ: 注視点（自キャラ）を滑らかに追い、ズームは目標値へ指数的に近づける。
  // 寄るほど少し低い角度から見る
  shake = Math.max(0, shake - dt * 2.5);
  cam.zoom += (cam.zoomT - cam.zoom) * (1 - Math.exp(-10 * dt));
  cam.focus.lerp(tmpV.set(me.x, heightAt(me.x, me.z) + 1.2, me.z), 1 - Math.exp(-12 * dt));
  const zoom = cam.zoom * (world.def.shape === 'grid' ? 0.9 : 1);
  const pitch = THREE.MathUtils.lerp(0.62, 0.92, clamp((cam.zoom - CAM_ZOOM[0]) / (CAM_ZOOM[1] - CAM_ZOOM[0]), 0, 1));
  const dist = 19.5 * zoom;
  // 屋外の端では、カメラが外周の崖の中に入らないよう、真上寄りから見下ろす
  let back = Math.cos(pitch) * dist;
  if (world.def.shape === 'open') {
    while (back > 2 && !insideOpen(world.def, cam.focus.x, cam.focus.z + back, 1)) back -= 0.5;
  }
  cam.back = cam.back == null ? back : cam.back + (back - cam.back) * (1 - Math.exp(-6 * dt));
  camera.position.set(cam.focus.x, cam.focus.y + Math.sqrt(Math.max(0, dist * dist - cam.back * cam.back)), cam.focus.z + cam.back);
  if (shake > 0) camera.position.add(tmpV.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(shake * 0.35));
  camera.lookAt(cam.focus);
  // 近景の透過（カメラと自キャラの間のもの・カメラに近すぎるもの）
  OCC.uOccCam.value.copy(camera.position);
  OCC.uOccTgt.value.set(me.x, heightAt(me.x, me.z) + 1.1, me.z);
  OCC.uOccR.value = settings.occlusion === false ? 0 : 1.9;
  OCC.uOccNear.value = camera.position.distanceTo(OCC.uOccTgt.value) * 0.5;

  sun.position.set(me.x + 20, 40, me.z + 10);
  sun.target.position.set(me.x, 0, me.z);

  env.update(t, me.x, me.z);
  const fighting = world.bossState === 'fight';
  for (const m of env.ringMats) m.opacity = fighting ? 0.28 + Math.sin(t * 4) * 0.1 : 0.4;
  if (world.def.gate && Math.random() < 0.3) fx.parts.emit(world.def.gate.x + rnd(-3, 3), 0.5, world.def.gate.z + rnd(-0.5, 0.5), { color: 0x6ad0ff, size: 0.3, life: 1.5, speed: 0.5, gravity: 2 });
  ambient.update(dt, me.x, me.z, t);
  fx.update(dt);
  updateMobLabels();
  ui.frame(dt);
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
async function startGame({ name, color, kind }) {
  audio.init();
  audio.setVolumes(settings);
  char = loadChar() || { name, color, lv: 1, xp: 0, inv: [], eq: { weapon: starterWeapon(kind), armor: null, acc: null } };
  char.name = name; char.color = color;
  char.tree = char.tree || {}; char.slots = char.slots || [null, null]; char.quests = char.quests || {};
  saveChar();
  const wsUrl = params.get('server') || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const ok = params.has('solo') || window.ETERNA_SOLO || location.protocol === 'file:' ? false : await net.connect(wsUrl);
  if (!ok) await net.startSolo();
  me.model = makePlayer(char.color);
  scene.add(me.model);
  bowGuide = makeBowGuide();
  scene.add(bowGuide.group);
  calcStats(); me.hp = S.mhp; me.potions = S.maxPot;
  started = true;
  net.send({ t: 'hello', name: char.name, color: char.color, lv: char.lv });
  addChat('', ok ? 'サーバーに接続しました。友達を誘おう！' : 'ソロモードで起動しました（npm start でサーバーを立てるとマルチプレイ）', '#9fe');
  addChat('', '町の人に話しかけると（F）サブクエストを受けられます。町の共有ボックスで仲間と装備を受け渡しできます。', '#9fe');
  if (spTotal(char.lv) - spSpent(char.tree) > 0) toast('未使用のスキルポイントがあります（Kでスキルツリー）', '#ffd84a');
  return ok;
}

// ======================================================================
// 画面（UI）に渡すゲームの窓口: 読み取り用の状態と、操作
// ======================================================================
const game = {
  get char() { return char; },
  get S() { return S; },
  me, world, settings, others, mobs, npcs, drops, input,
  CHARGE_MIN, CHARGE_MAX,
  env: () => env,
  roster: () => roster,
  boss: () => [...mobs.values()].find((m) => m.kind === 2),
  hazard: () => (started ? hazardAt(me.x, me.z) : null),
  project(x, y, z) {
    tmpV.set(x, y, z).project(camera);
    return { x: (tmpV.x + 1) / 2 * innerWidth, y: (1 - tmpV.y) / 2 * innerHeight, vis: tmpV.z < 1 };
  },
  nearestInteract, chestOpen, itemPower, findItem,
  sfx: (n) => audio.sfx(n),
  loginInfo() { const c = loadChar(); return c && { name: c.name, color: c.color, lv: c.lv, kind: c.eq?.weapon?.kind || 'sword' }; },
  resetChar() {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem('aincrad_solo_world'); // ソロの階層解放状況・共有ボックスもリセット
    } catch { /* */ }
  },
  start: startGame,
  fullscreen() {
    try {
      document.documentElement.requestFullscreen?.()
        .then(() => screen.orientation?.lock?.('landscape').catch(() => {}))
        .catch(() => {});
    } catch { /* 対応していないブラウザ（iOS Safari など） */ }
  },
  interact(it) {
    if (it.kind === 'lever') { net.send({ t: 'interact', what: 'lever' }); audio.sfx('equip'); }
    if (it.kind === 'chest' && !chestOpen(it.chest)) net.send({ t: 'interact', what: 'chest', id: it.chest.id });
  },
  equip, salvage, salvageCommon, learn, setSlot, resetTree, setSetting, acceptQuest,
  claimQuest: (id) => claimQuest(QUEST_INDEX[id]),
  warp: (n) => net.send({ t: 'warp', floor: n }),
  chat: (text) => net.send({ t: 'chat', text }),
  boxOpen: () => net.send({ t: 'box', op: 'open' }),
  boxClose: () => net.send({ t: 'box', op: 'close' }),
  boxPut(id) {
    const it = char.inv.find((i) => i.id === id);
    if (it) net.send({ t: 'box', op: 'put', item: it, ref: it.id });
  },
  boxTake: (uid) => net.send({ t: 'box', op: 'take', uid }),
};
ui = createUI(game);

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
    OCC.uOccCam.value.copy(camera.position); OCC.uOccTgt.value.set(0, 2, 0);
    OCC.uOccNear.value = camera.position.length() * 0.35;
    ambient.update(0.016, 0, 0, now());
    env.update(now(), 0, 0);
    fx.update(0.016);
    requestAnimationFrame(spin);
  };
  spin();
}
loop();

window.__game = { me, mobs, drops, teles, npcs, bprojs, projs, char: () => char, world, fx, S: () => S, net, settings, env: () => env, ui: () => ui, cam, coins };
