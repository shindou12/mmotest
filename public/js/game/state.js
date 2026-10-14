import * as THREE from 'three';
import { AREAS } from '../../shared/areas.js';

// ======================================================================
// ゲーム状態
// ======================================================================
export const CHARGE_MIN = 0.22, CHARGE_MAX = 0.9;
export const DODGE_CD = 0.75;
export const me = {
  id: 0, x: 0, z: 0, a: Math.PI, hp: 100, dead: false, deadT: 0,
  crawl: false, rv: -1, downs: 0, downsAt: 0, // 這いずり / ゲージの残り（円1周=1）/ 最近倒れた回数
  swingT: 9, swingDur: 0.4, combo: 0, lastSwing: 0, sw: 0, sk: 0, queued: 0,
  charging: false, chargeT: 0, chargeLv: 0, guarding: false, guardStart: 0,
  dodgeT: 0, dodgeCd: 0, dodgeDir: [0, 1], iframe: 0,
  wsCd: 0, tcd: {}, skillT: -1, spin: false, dashT: 0, dashA: 0, dashSpeed: 0,
  potions: 3, potCd: 0, lastHurt: -99, walkT: 0, moving: false, stepT: 0,
  buffs: [], ambush: 0, lastStandT: -999, transit: false,
  staggerT: 0, hurtT: 0, downT: 0, downStart: -99, noDownT: 0, kbT: 0, kbX: 0, kbZ: 0, dStack: 0, dStackT: 0, nextAtkBonus: 1, atkBonus: 1, atkBonusT: 0,
  // 武器ツリー（片手剣）の状態: 攻撃の通し番号 / 勢い / 魔剣士の時間 / 幻剣 / 受け流し / 報復 など
  act: 0, mom: 0, mageT: 0, cycleAct: -1, danceAct: -1, danceExt: 0, normHealAct: -1, normHeals: 0, edgeT: 0, edgeHealT: 0,
  afterJust: false, revenge: 0, chargeStart: 0, eyeCharge: false, eyeT: -99, iaiReady: false, primeCharge: 0, lastHeavyLv: 0, lastHeavyT: -99, phantom: null, phantomUntil: 0, soarReady: 0, aimN: 0, hawkT: -99, stormN: 0, traps: [], trapT: -99, tipRun: 0, tipAct: -1, pierceReady: false, banner: null, boltT: 0, parryUntil: 0, parryDone: true, saintOn: false, paladinT: 0,
  model: null,
};
export const world = { area: 'f1_town', def: AREAS.f1_town, floor: 1, unlocked: 1, bossState: 'idle', door: false, plates: [] };
export const mobs = new Map();
export const others = new Map();
export const npcs = [];
export const teles = [];
export const drops = [];
export const projs = [];
export const bprojs = []; // ボスの弾
export const pending = []; // 遅延処理
export let started = false;
export const CAM_ZOOM = [0.55, 1.6];
export const cam = { zoom: 1, zoomT: 1, focus: new THREE.Vector3() };
export const tmpV = new THREE.Vector3();
export const keys = new Set();
export const mouse = { x: 0, y: 0, l: false, r: false, world: new THREE.Vector3() };

export function setStarted(v) { started = v; }
