// Godot のダメージの式と武器の効果の差し込み口（godot/worldart/scripts/game/combat/）が元の JavaScript と同じ結果になるかを照合するための「入力と期待値」を書く。
//   node tools/worldart/godot/golden_combat.mjs   → godot/worldart/data/combat_golden.json
// 元は public/js/game/combat.js（dealDamage・stunValue）と weapon-fx.js（差し込み口）、game/tree-effects.js（入口）、各武器の effects。
// ポート（ports.js）には wirePorts で最小のダミー（画面・音・通信・当たり判定・回復など）を差し込む。式と状態の変化は元のモジュールをそのまま動かす。
// 全武器の effects を登録した状態（元のゲームと同じ）で回す。ほかの 4 武器の効果が片手剣・大剣の場面で働くかは、
// 「Godot へ移した武器（SUITE_OF）だけ登録した状態」でも同じ場面を回して比べ、違いがあれば報告する。
//
// 形: { base: {me}, states: { <id>: { wk, ch, S } }, scenes: [ { suite, name, in, out } ] }
//   state: 場面が使う能力値の状態。ch はキャラクター（武器ツリーの振り分けを含む）、S は calcStats の結果（数・真偽・文字と Set は配列）。
//          Godot 側は ch から武器ツリー W を作る（wtree.gd）。S は calcStats（stats.js）の結果なので、ここから読む（rules.gd はまだツリーを知らない）。
//   in:  { state, tms（今の時刻 ms）, rand（Math.random の値の列）, me（base.me への上書き）, mobs, aim, op }
//   op:  { k: 'deal'|'stun'|'hook'|'ext'|'entry', ... }
//   out: { ret, args, ev（記録だけの操作 [時刻, 名前, 引数]）, net（サーバーへの送信）, me / mobs（場面の前との差）, shake, hitStop, used（使った乱数の数）}
// 乱数は種固定、時刻（performance.now）も固定の値。照合する側は godot/worldart/scripts/tests/combat_golden.gd。
//
// 自己確認: dealDamage の式を使わずに全部を動かしている確認として、(1) actions.js の SWEEP の値（このファイルのダミーが使う）が元のソースと同じ、
//   (2) 乱数の列を使い切らない、(3) 数が有限、を調べる。違えば止まる。
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { wirePorts, state, rules } from '../../../public/js/game/ports.js';
import * as D from '../../../public/shared/data.js';
import { BALANCE } from '../../../public/shared/balance.js';
import { SPEAR_TIMINGS } from '../../../public/shared/skill-timings.js';
import * as ST from '../../../public/js/game/stats.js';
import * as CB from '../../../public/js/game/combat.js';
import * as TE from '../../../public/js/game/tree-effects.js';
import * as V from '../../../public/js/game/variants.js';
import * as S0 from '../../../public/js/game/state.js';
import { fxCall, fxReduce, fxSome, registerWeaponFx } from '../../../public/js/game/weapon-fx.js';
import { WEAPON_DEFS } from '../../../public/js/weapons/index.js';
import { WTREES, wtLearn, wtChoose, profOf } from '../../../public/js/weapon-tree.js';

const ONLY = process.env.GOLDEN_ONLY ? process.env.GOLDEN_ONLY.split(',') : null; // 子プロセス用: 登録する武器を絞る
const SUITE_OF = { sword: 'sword', greatsword: 'greatsword', dagger: 'dagger', axe: 'axe' };
const PORTED = Object.keys(SUITE_OF).join(','); // Godot へ移した武器（子プロセスで、この武器だけ登録した状態と比べる）

// ---- 種を固定した乱数（golden_rules.mjs と同じ mulberry32） ----
let seed = 20261021;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const rr = (a, b) => a + rnd() * (b - a);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const q8 = (x) => Math.round(x * 8) / 8; // 時刻は 1/8 ms の格子（足し算で端数が出にくい）

// ---- 記録 ----
const clean = (v, depth = 0) => {
  if (typeof v === 'function') return 'fn';
  if (v instanceof Set) return [...v].sort();
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : clean(x, depth + 1)));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = clean(v[k], depth + 1); return o; }
  if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('有限でない数が記録に入った');
  return v;
};
const ev = [], net = [];
const rawNow = () => performance.now() / 1000;
let tms = 0;
performance.now = () => tms;
const rec = (name) => (...args) => { ev.push([rawNow(), name, clean(args)]); };

// ---- ダミー（wirePorts と武器の効果に渡す道具）----
const fxD = { slash: rec('fx.slash'), ringWave: rec('fx.ringWave'), flash: rec('fx.flash'), lightning: rec('fx.lightning'), parts: { emit: rec('parts.emit'), burst: rec('parts.burst') } };
const audioD = { sfx: rec('sfx') };
const floatText = rec('floatText');
const strikes = { arc: rec('arc'), line: rec('line'), circle: rec('circle'), proj: rec('proj'), arrow: rec('arrow'), dash: rec('dash'), hit: rec('hit') };
let hitStopV = 0;
const setHitStop = (v) => { ev.push([rawNow(), 'setHitStop', [v]]); hitStopV = v; };
const heal = (n, show) => { ev.push([rawNow(), 'heal', clean([n, show])]); state.me.hp = Math.min(ST.S.mhp, state.me.hp + n); };
const taunt = rec('taunt');
const onVariantHit = (mb, dmg, o) => { ev.push([rawNow(), 'onVariantHit', [mb.id, dmg, o.sv.key]]); };
let ext = {};
const extendCombat = (o) => { Object.assign(ext, o); };
const SWEEP = { ...SPEAR_TIMINGS.counter, r: 5.2, mult: 7.5, stun: 14 };
{ // 自己確認 (1): actions.js の SWEEP の値（ダミーが使う）が元のソースと同じ
  const src = fs.readFileSync(new URL('../../../public/js/game/actions.js', import.meta.url), 'utf8');
  if (!src.includes('export const SWEEP = { ...SPEAR_TIMINGS.counter, r: 5.2, mult: 7.5, stun: 14 };')) { console.error('自己確認 NG: actions.js の SWEEP がダミーの値と違う'); process.exit(1); }
}
let aimV = 0;

wirePorts({
  state: { CHARGE_MAX: S0.CHARGE_MAX, DODGE_CD: S0.DODGE_CD, me: S0.me, mobs: S0.mobs, pending: S0.pending, world: { area: 'f1_field', def: { shape: 'open', weather: null } }, characterStore: { lost: false }, settings: { shake: true }, char: null },
  stats: { get S() { return ST.S; }, addBuff: ST.addBuff, buffMod: ST.buffMod, hasBuff: ST.hasBuff, calcStats: ST.calcStats },
  view: { fx: fxD, audio: audioD, weaponStyle: () => null, armorLook: () => null, setPlayerWeapon() {}, setPlayerArmor() {} },
  screen: { floatText, ui: { refresh() {} } },
  link: { net: { send: (m) => { net.push(clean(m)); } } },
  rules: {
    tf: V.tf, indoorNow: V.indoorNow, titleDmg: V.titleDmg, wtCritAdd: TE.wtCritAdd, wtDmgMult: TE.wtDmgMult, wtOnHit: TE.wtOnHit, later: CB.later,
    heal, setHitStop, get hitStop() { return hitStopV; }, onVariantHit, strikes, aimAngle: () => aimV,
  },
});
const api = {
  player: { me: state.me, get S() { return ST.S; }, weaponColor: () => D.RARITIES[ST.S.wr].color, addBuff: ST.addBuff, hasBuff: ST.hasBuff, heal, setHitStop },
  field: { mobs: state.mobs, world: state.world, heightAt: () => 0, aimAngle: () => aimV, aimPoint: () => ({ x: 0, z: 0 }) },
  attack: { strikes, dealDamage: CB.dealDamage, extendCombat, SWEEP, ATK_TYPES: TE.ATK_TYPES, later: CB.later },
  tree: { quietBuff: TE.quietBuff, cutCds: TE.cutCds, wtEmit: TE.wtEmit },
  show: { fx: fxD, audio: audioD, floatText, addShake: CB.addShake, trapMesh: () => null, bannerMesh: () => null, handTracker: () => () => ({ x: state.me.x + 0.3, y: 1.1, z: state.me.z + 0.2 }) },
  party: { taunt },
  register: registerWeaponFx,
};
for (const d of WEAPON_DEFS) if (!ONLY || ONLY.includes(d.wk)) d.effects?.(api);

const BASE_ME = JSON.parse(JSON.stringify(S0.me));
const me = state.me;
function resetMe(over = {}) {
  for (const k of Object.keys(me)) delete me[k];
  Object.assign(me, structuredClone(BASE_ME), structuredClone(over));
}

// ---- 能力値の状態 ----
const ITEM_FX = ['skillcrit', 'thunder', 'flame', 'vamp'];
function mkChar(wk, steps) {
  const affixes = Array.from({ length: ri(0, 4) }, () => { const k = pick(['atkp', 'crit', 'critd', 'hpp', 'aspd', 'vamp', 'cdr']); return [k, ri(1, D.AFFIXES[k].tiers.length)]; });
  const weapon = { slot: 'weapon', kind: wk, rarity: ri(0, 7), ilvl: ri(1, 50), enh: ri(0, 15), affixes, skill: 'retreat', atk: ri(1, 400) };
  if (chance(0.3)) weapon.fx = [pick(ITEM_FX)];
  const eq = { weapon };
  if (chance(0.7)) eq.armor = { slot: 'armor', rarity: ri(0, 7), ilvl: ri(1, 50), enh: ri(0, 10), affixes: [], armor: pick(Object.keys(D.ARMOR_CLASSES)), hp: ri(0, 800), def: ri(0, 30) };
  const ch = { lv: ri(1, D.MAX_LEVEL), eq, potBonus: 0, skills: {}, tree: {}, wtree: {}, prof: {}, wt: {} };
  profOf(ch, wk).lv = 20;
  for (const [id, lv, br] of steps) {
    const n = nodeOf(wk, id);
    if (n.from) wtLearn(ch, n.from);
    for (let i = 0; i < lv; i++) wtLearn(ch, id);
    if (br) wtChoose(ch, id, br);
  }
  return ch;
}
const nodeOf = (wk, id) => { for (const r of WTREES[wk].rows) for (const n of r.nodes) if (n.id === id) return { ...n, kind: r.kind }; throw new Error(id); };
const clone = (x) => JSON.parse(JSON.stringify(x));

// S の数・真偽・文字と Set を書き出す／戻す
function snapS(S) {
  const o = {};
  for (const [k, v] of Object.entries(S)) {
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') o[k] = v;
    else if (v instanceof Set) o[k] = [...v].sort();
  }
  return o;
}
function applySnap(S, snap) {
  for (const [k, v] of Object.entries(snap)) S[k] = Array.isArray(v) ? new Set(v) : v;
}
// 能力値のばらつき（calcStats の結果を書き換える。入力としてそのまま書き出す）
const T_IDS = ['t_breaker', 't_shark', 't_night', 't_lucky', 't_reaper', 't_berserk', 't_hunter', 't_boss1', 't_star'];
function varyS(S, level) {
  if (level === 0) return;
  if (chance(0.5)) S.crit = pick([0, 25, 60, 150]);
  if (chance(0.3)) S.critd = pick([150, 200, 260]);
  if (chance(0.4)) S.vamp = pick([0, 5, 12]);
  if (chance(0.4)) S.backwater = pick([0, 20, 40]);
  if (chance(0.4)) S.stunp = pick([0, 15, 40]);
  if (chance(0.3)) { S.dStackPer = 3; S.dStackMax = 10; S.dStackT = 3; }
  if (chance(0.3)) S.flags = new Set([...S.flags, 'execute']);
  for (const f of ['skillcrit', 'thunder', 'flame']) if (chance(0.15)) S.fx = new Set([...S.fx, f]);
  S.tfx = new Set(Array.from({ length: ri(0, 3) }, () => pick(T_IDS)));
}

// ---- 場面の状態の一覧 ----
const states = {};
const stateIds = Object.fromEntries(Object.keys(SUITE_OF).map((wk) => [wk, []]));
function addState(wk, label, steps, variants) {
  for (let v = 0; v < variants; v++) {
    const id = `${wk}/${label}#${v}`;
    const ch = mkChar(wk, steps);
    state.char = clone(ch); resetMe(); ST.calcStats(); varyS(ST.S, v);
    states[id] = { wk, ch, S: snapS(ST.S) };
    stateIds[wk].push(id);
  }
}
for (const wk of Object.keys(SUITE_OF)) {
  addState(wk, 'none', [], 2);
  for (const r of WTREES[wk].rows) for (const n of r.nodes) {
    const stepsOf = r.kind === 'skill' || r.kind === 'passive' ? [[1], [2], [3, 'A'], [3, 'B']] : [[1]];
    for (const [lv, br] of stepsOf) addState(wk, `${n.id}/${lv}${br || ''}`, [[n.id, lv, br]], 1);
  }
  // 組み合わせ: クラス・マスターと、いくつかのスキル・パッシブを振った状態
  const all = WTREES[wk].rows.flatMap((r) => r.nodes.map((n) => ({ ...n, kind: r.kind })));
  const ks1 = all.filter((n) => n.kind === 'ks1'), ks2 = all.filter((n) => n.kind === 'ks2'), pass = all.filter((n) => n.kind === 'skill' || n.kind === 'passive');
  for (let i = 0; i < 16; i++) {
    const steps = [];
    const k1 = pick(ks1);
    steps.push([k1.id, 1]);
    const k2s = ks2.filter((n) => n.from === k1.id);
    if (chance(0.8) && k2s.length) steps.push([pick(k2s).id, 1]);
    for (const n of pass) if (chance(0.3)) { const lv = ri(1, 3); steps.push([n.id, lv, lv === 3 ? pick(['A', 'B']) : undefined]); }
    addState(wk, `combo${i}`, steps, 1);
  }
}

// ---- 場面の生成 ----
const BUFFS = [
  { id: 'b_atk', mods: { atkp: 20 } }, { id: 'b_dmg', mods: { dmgp: 25 } }, { id: 'b_crit', mods: { crit: 30 } }, { id: 'b_heavy', mods: { heavyp: 40 } },
  { id: 'b_norm', mods: { normp: 15 } }, { id: 'b_wsk', mods: { wskillp: 30 } }, { id: 'b_stun', mods: { stunp: 50 } }, { id: 'b_vamp', mods: { vamp: 8 } },
  { id: 'sw_saint', mods: {} }, { id: 'sw_dance', mods: {} }, { id: 'sw_brave', mods: {} }, { id: 'sw_parryB', mods: { atkp: 25 } }, { id: 'sw_cycleB', mods: { aspd: 12 } },
  { id: 'gt_siege', mods: {} }, { id: 'dk_poison', mods: {} }, { id: 'ax_rage', mods: { atkp: 5 } }, { id: 'gt_eye', mods: { dmgp: 15 } }, { id: 'gt_mirror', mods: { dmgp: 30 } }, { id: 'poison', mods: {} }, { id: 'dr_a', mods: { dr: 10 } },
];
const mkBuff = (b, t) => ({ id: b.id, label: b.id, t, max: Math.max(t, rr(t, t + 3)), mods: b.mods, color: pick([0xffffff, 0xffd84a, 0x9affff]) });
function genMe(t) {
  const o = {};
  o.x = rr(-2, 2); o.z = rr(-2, 2); o.a = rr(-3.1, 3.1);
  o.hp = pick([1, 20, 60, 100, 400, 3000, 99999]);
  o.buffs = Array.from({ length: pick([0, 0, 1, 2, 3]) }, () => mkBuff(pick(BUFFS), pick([0.5, 2, 5, 1e9])));
  o.ambush = pick([0, 0, 0, 1, 3]);
  if (chance(0.3)) { o.atkBonus = pick([1.25, 1.5, 2]); o.atkBonusT = chance(0.7) ? t + rr(0.1, 2) : t - rr(0.1, 2); }
  if (chance(0.3)) o.dStack = ri(0, 10);
  if (chance(0.2)) o.vampT = t - pick([0.2, 5, 100]);
  if (chance(0.2)) o.starT = t - pick([0.2, 5]);
  o.act = ri(0, 3); o.mom = pick([0, 0, 1, 4, 9, 10]);
  o.cycleAct = pick([-1, o.act]); o.danceAct = pick([-1, o.act]); o.normHealAct = pick([-1, o.act]); o.normHeals = pick([0, 1, 2]); o.danceExt = pick([0, 1, 3.9, 4]);
  o.edgeT = pick([0, t - 0.2, t - 1]); o.edgeHealT = pick([0, t - 0.05, t - 1]);
  o.afterJust = chance(0.25); o.revenge = pick([0, 0, 50, 400, 100000]);
  o.charging = chance(0.4); o.chargeT = pick([0, 0.4, 1.2]); o.chargeLv = pick([0, 1, 2]); o.chargeStart = t - pick([0.1, 0.3, 0.5, 2]);
  o.eyeCharge = chance(0.3); o.eyeT = t - pick([1, 3, 7, 99]); o.iaiReady = chance(0.3); o.primeCharge = pick([0, 0, 0.5]);
  o.lastHeavyLv = pick([0, 1, 2]); o.lastHeavyT = t - pick([0.1, 0.5, 0.79, 0.81, 3]);
  o.phantom = chance(0.3) ? { id: pick(['sw_aircut', 'sw_slant']), until: t + pick([-1, 2]) } : null; o.phantomUntil = t + pick([-1, 0.5]);
  o.parryUntil = t + pick([-1, 0.3]); o.parryDone = chance(0.4); o.saintOn = chance(0.3); o.paladinT = t - pick([0.5, 2, 9]); o.mageT = t + pick([-1, 2]);
  o.parryReadyT = t + pick([-1, 1]); o.combo = ri(0, 3); o.iframe = pick([0, 0.2, 1]); o.wsCd = pick([0, 5]); o.tcd = chance(0.5) ? { sw_aircut: 6, gt_x: 2 } : {};
  o.model = chance(0.5) ? true : null;
  if (chance(0.3)) o.undyingT = t - pick([1, 30, 100]);
  o.dead = chance(0.05);
  return o;
}
const T_OPT = ['normal', 'heavy', 'wskill', 'tskill', 'dot', 'proc'];
function genO(type) {
  const o = { type: type || pick(T_OPT) };
  if (chance(0.2)) o.crit = true;
  if (chance(0.25)) o.stun = pick([0.5, 2, 7]);
  if (chance(0.25)) o.falloff = pick([0.5, 0.8, 1.2]);
  if (chance(0.2)) o.exec = pick([1.5, 2]);
  if (chance(0.1)) o.noProc = true;
  if (chance(0.2)) o.wave = true;
  if (chance(0.25)) o.proj = chance(0.5) ? { eclipse: true } : (chance(0.5) ? {} : { heaven: true, boomed: true });
  if (chance(0.1)) o.sv = { key: pick(['sv_heavy', 'sv_quake', 'sv_giant']), t: ri(1, 7) };
  if (chance(0.1)) o.healOnHit = 0.1;
  if (chance(0.1)) o.threat = pick([1, 1.5, 3]);
  if (chance(0.05)) o.tech = 'tx';
  if (chance(0.1)) o.wtNo = true;
  if (chance(0.15)) o.poison = pick([1, 2, 3]);
  if (chance(0.1)) o.a = rr(-3, 3);
  return o;
}
function genMobs(t) {
  const mk = (id) => {
    const mhp = pick([100, 800, 5000, 60000]);
    const m0 = { id, x: rr(-4, 4), z: rr(-4, 4), a: rr(-3.1, 3.1), hp: pick([mhp, mhp, mhp * 0.9, mhp * 0.25, mhp * 0.05]), mhp, rad: pick([0.6, 0.8, 1.2]), kind: pick([0, 0, 1, 2]), elite: chance(0.25),
      stunT: chance(0.25) ? rr(0.5, 3) : 0, guard: chance(0.25), act: chance(0.1) ? { p: 'burrow', age: rr(0, 2), d: rr(1.5, 3) } : null, localT: pick([-99, -99, 0]), flash: 0, jolt: pick([0, 0, 0.05]), joltMax: 0, joltAmp: pick([0, 0.2]), poisonUntil: 0 };
    if (chance(0.3)) { m0.vStack = ri(0, 5); m0.poisonUntil = t + pick([-1, 2]); }
    if (chance(0.25)) { m0.bleedN = ri(0, 3); m0.bleedPow = pick([0.2, 0.6, 1.2]); m0.bleedUntil = t + pick([-1, 2]); }
    if (chance(0.2)) m0.axBoom = chance(0.5);
    return m0;
  };
  const ms = [mk(7)];
  for (let i = 0; i < ri(0, 2); i++) { const m = mk(8 + i); m.x = ms[0].x + rr(-2, 2); m.z = ms[0].z + rr(-2, 2); ms.push(m); }
  if (chance(0.15)) ms[0].hp = 0;
  return ms;
}
const mkRand = (n = 16) => Array.from({ length: n }, rnd);

const scenes = [];
let fails = 0;
// 場面を元の JS で動かし、入力と結果を書く
function execute(suite, name, stateId, spec) {
  const st = states[stateId];
  // 準備
  ev.length = 0; net.length = 0; state.pending.length = 0; CB.setShake(0); hitStopV = 0; aimV = spec.aim ?? 0;
  for (const k of Object.keys(TE.wtAuraAcc)) TE.wtAuraAcc[k] = 0;
  state.mobs.clear(); state.characterStore.lost = !!spec.lost; state.world.def.shape = spec.indoor ? 'grid' : 'open';
  resetMe(); state.char = clone(st.ch); tms = spec.tms;
  ST.calcStats(); applySnap(ST.S, st.S);
  resetMe(spec.me);
  for (const m of spec.mobs) state.mobs.set(m.id, clone(m));
  ev.length = 0; net.length = 0;
  let ri2 = 0;
  const rr0 = Math.random;
  Math.random = () => { if (ri2 >= spec.rand.length) throw new Error('乱数の列を使い切った'); return spec.rand[ri2++]; };
  const before = { me: clean(me), mobs: Object.fromEntries([...state.mobs].map(([id, m]) => [id, clean(m)])) };
  const args = [];
  let ret;
  const refs = { mob: () => state.mobs.get(7), W: () => ST.S.wt, Sx: () => spec.Sx, weapon: () => D.WEAPONS[st.wk] };
  const res = (a) => (a && typeof a === 'object' && !Array.isArray(a) && a.$ ? refs[a.$]() : a);
  const op = spec.op;
  try {
    if (op.k === 'deal') { const o = clone(op.o); args.push(o); CB.dealDamage(state.mobs.get(op.mob), op.mult, o); }
    else if (op.k === 'stun') { const o = clone(op.o); args.push(o); ret = CB.stunValue(o); }
    else if (op.k === 'hook') {
      if (op.Sx) spec.Sx = clone(op.Sx);
      const isRef = (x) => x && typeof x === 'object' && !Array.isArray(x) && x.$;
      const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
      const a = op.args.map((x) => (isRef(x) ? res(x) : isObj(x) ? clone(x) : x));
      for (let i = 0; i < a.length; i++) if (!isRef(op.args[i]) && isObj(a[i])) args.push(a[i]);
      if (op.kind === 'call') fxCall(op.name, ...a);
      else if (op.kind === 'some') ret = fxSome(op.name, ...a);
      else ret = fxReduce(op.name, op.acc, ...a);
      if (spec.Sx) args.push(clean(spec.Sx));
    } else if (op.k === 'ext') ext[op.name](...op.args.map(res));
    else if (op.k === 'entry') {
      const o = op.o ? clone(op.o) : undefined; if (o) args.push(o);
      const mb = state.mobs.get(7);
      switch (op.name) {
        case 'wtDmgMult': ret = TE.wtDmgMult(o, mb, op.crit); break;
        case 'wtOnHit': TE.wtOnHit(mb, op.dmg, op.crit, o, op.mult); break;
        case 'wtAfterCast': TE.wtAfterCast(op.id, op.free); break;
        case 'phantomReady': ret = TE.phantomReady(op.id); break;
        case 'wtOnHurt': TE.wtOnHurt(op.guarded); break;
        case 'wtOnGuard': TE.wtOnGuard(op.raw, op.src ? mb : null); break;
        case 'wtDr': ret = TE.wtDr(); break;
        case 'wtCritAdd': ret = TE.wtCritAdd(o); break;
        case 'wtChargeStart': TE.wtChargeStart(); break;
        case 'wtHeavy': TE.wtHeavy(op.lv); break;
        case 'wtAura': TE.wtAura(op.dt); break;
        default: throw new Error(op.name);
      }
    } else throw new Error(op.k);
    // 遅延処理（later）を時刻の順に（同じ時刻は登録順）
    let guard = 0;
    while (state.pending.length) {
      let bi = 0;
      for (let i = 1; i < state.pending.length; i++) if (state.pending[i].at < state.pending[bi].at) bi = i;
      const qq = state.pending.splice(bi, 1)[0];
      tms = qq.at * 1000; ev.push([rawNow(), 'run', []]);
      qq.fn();
      if (++guard > 500) throw new Error('later が終わらない');
    }
  } finally { Math.random = rr0; }
  const after = { me: clean(me), mobs: Object.fromEntries([...state.mobs].map(([id, m]) => [id, clean(m)])) };
  const diff = (b, a) => { const o = {}; for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) o[k] = a[k] === undefined ? { $del: 1 } : a[k]; return o; };
  const out = { ev: clean(ev), net: clean(net), me: diff(before.me, after.me), mobs: {}, shake: CB.shake, hitStop: hitStopV, used: ri2 };
  for (const id of Object.keys(after.mobs)) { const d = diff(before.mobs[id], after.mobs[id]); if (Object.keys(d).length) out.mobs[id] = d; }
  if (ret !== undefined) out.ret = clean(ret);
  if (args.length) out.args = clean(args.map((x) => x));
  const input = { state: stateId, tms: spec.tms, rand: spec.rand, me: spec.me, mobs: spec.mobs, op: spec.op };
  if (spec.aim) input.aim = spec.aim;
  if (spec.lost) input.lost = true;
  if (spec.indoor) input.indoor = true;
  scenes.push({ suite, name, in: input, out });
  return out;
}

// ---- 場面を作る ----
const HOOKS = (ctx) => {
  const { o, crit, snap } = ctx;
  const W = { $: 'W' }, MB = { $: 'mob' };
  const dmg = ri(1, 3000), mult = pick([0.5, 1, 2.2]), flag = chance(0.5);
  const ids = ['sw_aircut', 'sw_dance', 'sw_parry', 'sw_slant', 'sw_brave', 'gt_wave', 'gt_siege', 'gt_x'];
  const sid = pick(ids);
  return {
    stats: { kind: 'call', Sx: Object.fromEntries(Object.entries(snap || {}).filter(([, v]) => !Array.isArray(v))), args: [{ $: 'Sx' }, W, { $: 'weapon' }] },
    afterStats: { kind: 'call', args: [] }, treeReset: { kind: 'call', args: [] }, tick: { kind: 'call', args: [] },
    critAlways: { kind: 'some', args: [o] },
    dmgMult: { kind: 'reduce', acc: 1, args: [W, o, MB, crit] }, dmgMultLast: { kind: 'reduce', acc: 1.3, args: [W, o, MB, crit] },
    critAdd: { kind: 'reduce', acc: 0, args: [o] },
    onHit: { kind: 'call', args: [MB, dmg, crit, o, mult] },
    afterCast: { kind: 'call', args: [sid, flag] }, afterCastLate: { kind: 'call', args: [sid, flag] },
    phantomReady: { kind: 'some', args: [sid] },
    parry: { kind: 'some', args: [] }, onHurt: { kind: 'call', args: [] }, onHurtCharging: { kind: 'call', args: [] },
    onGuard: { kind: 'call', args: [pick([10, 300, 5000]), flag ? MB : null] },
    beforeHeavy: { kind: 'call', args: [] }, guardCounter: { kind: 'some', args: [] },
    drLowHp: { kind: 'reduce', acc: 0, args: [] }, dr: { kind: 'reduce', acc: 0, args: [] },
    incoming: { kind: 'reduce', acc: pick([10, 250.5]), args: [] }, swingAspd: { kind: 'reduce', acc: 0, args: [] },
    swingLate: { kind: 'call', args: [rr(-3, 3), flag] }, swingLast: { kind: 'call', args: [rr(-3, 3)] },
    justDodge: { kind: 'call', args: [] }, cooldownDt: { kind: 'reduce', acc: pick([0.016, 0.1]), args: [] },
    onKill: { kind: 'call', args: [flag ? MB : null] },
    aura: { kind: 'call', args: [pick([0.016, 0.05, 0.2]), W] },
    heavy: { kind: 'call', args: [pick([1, 2]), rr(-3, 3)] },
    counter: { kind: 'some', args: [flag ? MB : { x: rr(-3, 3), z: rr(-3, 3) }] },
    superArmor: { kind: 'some', args: [] }, noKnockdown: { kind: 'some', args: [] },
    // 短剣・大斧
    critAfter: { kind: 'some', args: [MB, o] }, ambushMult: { kind: 'reduce', acc: pick([1, 1.2]), args: [flag] },
    finisher: { kind: 'reduce', acc: pick([1, 40, 500]), args: [MB, crit, o] },
    poisonTick: { kind: 'reduce', acc: 0, args: [MB] }, bleedMul: { kind: 'reduce', acc: pick([1, 1.5]), args: [] },
    stun: { kind: 'reduce', acc: pick([1.2, 6, 3]), args: [o] }, reach: { kind: 'reduce', acc: 1, args: [flag] },
    heavyNeedsFull: { kind: 'some', args: [] }, heavyStart: { kind: 'call', args: [pick([1, 2])] }, heavyAfter: { kind: 'call', args: [pick([1, 2])] },
    heavyOverride: { kind: 'some', args: [pick([1, 2])] }, cheatDeath: { kind: 'some', args: [] },
  };
};
const HOOK_NAMES = Object.keys(HOOKS({ o: {}, crit: false }));

function scene(suite, label, stateId, extra) {
  const tms0 = q8(rr(50000, 200000));
  const t = tms0 / 1000;
  const spec = { tms: tms0, rand: mkRand(extra?.randN || 16), me: genMe(t), mobs: genMobs(t), aim: chance(0.3) ? rr(-3, 3) : 0, lost: false, indoor: chance(0.15), ...extra };
  return spec;
}
const count = {};
for (const wk of Object.keys(SUITE_OF)) {
  const sc = SUITE_OF[wk];
  // damage: 状態ごとに 3 場面（種類・敵・自分・バフがばらつく）。最初の数場面は種類を順に
  let k = 0;
  for (const sid of stateIds[wk]) {
    for (let j = 0; j < 3; j++) {
      const spec = scene(`damage_${sc}`, 'deal', sid);
      const type = T_OPT[(k++) % T_OPT.length];
      spec.op = { k: 'deal', mob: 7, mult: pick([0.5, 1, 2.2, 3.4, 7.5]), o: genO(type) };
      execute(`damage_${sc}`, `deal ${sid} ${type}`, sid, spec);
    }
    // stunValue（スタン値）
    const specS = scene(`damage_${sc}`, 'stun', sid);
    specS.op = { k: 'stun', o: genO() };
    execute(`damage_${sc}`, `stun ${sid}`, sid, specS);
  }
  // 敵・自分の条件を網羅する場面（none の状態で）
  const base = stateIds[wk][0];
  const grid = [
    ['guard-front', (s) => { const m = s.mobs[0]; m.guard = true; m.kind = 0; m.hp = m.mhp = 500; m.a = Math.atan2(s.me.x - m.x, s.me.z - m.z) + 0.3; s.op.o.type = 'normal'; }],
    ['guard-back', (s) => { const m = s.mobs[0]; m.guard = true; m.hp = m.mhp = 500; m.a = Math.atan2(s.me.x - m.x, s.me.z - m.z) + 3; s.op.o.type = 'normal'; }],
    ['guard-dot', (s) => { const m = s.mobs[0]; m.guard = true; m.hp = m.mhp = 500; m.a = Math.atan2(s.me.x - m.x, s.me.z - m.z); s.op.o.type = 'dot'; }],
    ['burrow-hidden', (s) => { s.mobs[0].act = { p: 'burrow', age: 1, d: 3 }; s.mobs[0].hp = s.mobs[0].mhp = 500; }],
    ['burrow-edge', (s) => { s.mobs[0].act = { p: 'burrow', age: 0.3, d: 3 }; s.mobs[0].hp = s.mobs[0].mhp = 500; }],
    ['boss-stun', (s) => { s.mobs[0].kind = 2; s.mobs[0].stunT = 2; s.mobs[0].hp = s.mobs[0].mhp = 9000; s.op.o.type = 'heavy'; }],
    ['boss', (s) => { s.mobs[0].kind = 2; s.mobs[0].stunT = 0; s.mobs[0].hp = s.mobs[0].mhp = 9000; s.op.o.type = 'heavy'; }],
    ['elite-low', (s) => { s.mobs[0].kind = 1; s.mobs[0].elite = true; s.mobs[0].hp = 10; s.mobs[0].mhp = 100; }],
    ['dead', (s) => { s.mobs[0].hp = 0; }],
    ['lost', (s) => { s.lost = true; }],
    ['low-hp-self', (s) => { s.me.hp = 1; s.op.o.type = 'normal'; }],
    ['ambush', (s) => { s.me.ambush = 2; s.op.o.crit = undefined; s.op.o.noProc = undefined; s.op.o.type = 'normal'; }],
    ['guard-bonus', (s) => { s.me.atkBonus = 1.5; s.me.atkBonusT = s.tms / 1000 + 1; s.op.o.type = 'normal'; }],
  ];
  for (const [nm, f] of grid) for (const type of ['normal', 'heavy', 'wskill', 'tskill']) {
    const spec = scene(`damage_${sc}`, nm, base);
    spec.op = { k: 'deal', mob: 7, mult: 1.5, o: { type } };
    f(spec);
    execute(`damage_${sc}`, `${nm} ${type}`, base, spec);
  }
  // hooks: 状態 × 差し込み口（全武器の効果を登録した状態で呼ぶ）
  for (const sid of stateIds[wk]) {
    const picked = HOOK_NAMES.filter((n) => chance(0.2) || n === 'onHit' || n === 'dmgMult');
    for (const name of picked) {
      const o = genO(); const crit = chance(0.4);
      const h = HOOKS({ o, crit, snap: states[sid].S })[name];
      const spec = scene(`hooks_${sc}`, name, sid, { randN: name === 'aura' ? 300 : 16 });
      if (name === 'poisonTick') spec.mobs[0].vStack = ri(1, 5); // 毒の1回は毒が重なっている敵にだけ呼ばれる
      spec.op = { k: 'hook', name, ...h };
      execute(`hooks_${sc}`, `${name} ${sid}`, sid, spec);
    }
    // 入口（tree-effects.js）と、道具
    const ents = [
      { name: 'wtDmgMult', o: genO(), crit: chance(0.4) }, { name: 'wtOnHit', o: genO(), crit: chance(0.5), dmg: ri(1, 999), mult: pick([1, 2]) },
      { name: 'wtAfterCast', id: pick(['sw_dance', 'sw_aircut', 'gt_wave']), free: chance(0.4) }, { name: 'phantomReady', id: pick(['sw_aircut', 'sw_slant']) },
      { name: 'wtOnHurt', guarded: chance(0.5) }, { name: 'wtOnGuard', raw: pick([20, 500]), src: chance(0.5) }, { name: 'wtDr' }, { name: 'wtCritAdd', o: genO() },
      { name: 'wtChargeStart' }, { name: 'wtHeavy', lv: pick([1, 2]) }, { name: 'wtAura', dt: pick([0.016, 0.05, 0.2]) },
    ];
    for (const e of ents) if (chance(0.25)) {
      const spec = scene(`hooks_${sc}`, e.name, sid, { randN: e.name === 'wtAura' ? 300 : 16 });
      spec.op = { k: 'entry', ...e };
      execute(`hooks_${sc}`, `entry:${e.name} ${sid}`, sid, spec);
    }
    const MOBREF = { $: 'mob' };
    for (const e of [{ name: 'parry', args: [pick([0.4, 0.55]), pick([70, 80])] }, { name: 'primeCharge', args: [pick([0.5, 0.8])] },
      { name: 'poison', args: [MOBREF, pick([1, 3, 5])] }, { name: 'bleed', args: [MOBREF, pick([0.2, 0.45]), chance(0.5)] }, { name: 'bleed', args: [MOBREF, pick([0.2, 0.45])] },
      { name: 'ambush', args: [pick([1, 3, 4])] }, { name: 'pay', args: [pick([0.15, 0.9])] }].filter((e) => ext[e.name])) if (chance(0.25)) {
      const spec = scene(`hooks_${sc}`, e.name, sid);
      spec.op = { k: 'ext', ...e };
      execute(`hooks_${sc}`, `ext:${e.name} ${sid}`, sid, spec);
    }
  }
}
// aura は何度か回して粒の蓄積（wtAuraAcc）を確かめる: 同じ状態で時間を空けずに続けて呼ぶ場面も入れる
for (const wk of Object.keys(SUITE_OF)) {
  const sc = SUITE_OF[wk];
  for (const sid of stateIds[wk].filter((s) => /glad|saint|avenger/.test(s))) for (const dt of [0.3, 0.9]) {
    const spec = scene(`hooks_${sc}`, 'aura', sid, { randN: 900 });
    spec.me.mom = 10; spec.me.revenge = 300; spec.me.buffs.push(mkBuff({ id: 'sw_saint', mods: {} }, 3));
    spec.op = { k: 'hook', name: 'aura', kind: 'call', args: [dt, { $: 'W' }] };
    execute(`hooks_${sc}`, `aura ${sid} ${dt}`, sid, spec);
  }
}

// ---- 子プロセス: Godot へ移した武器（SUITE_OF）だけ登録した状態で同じ場面を回して比べる（親だけ） ----
if (ONLY) {
  fs.writeFileSync(process.env.GOLDEN_OUT, JSON.stringify(scenes.map((s) => s.out)));
  process.exit(0);
}
const tmp = new URL('../../../.agents/golden_combat_subset.json', import.meta.url);
fs.mkdirSync(new URL('../../../.agents/', import.meta.url), { recursive: true });
execFileSync(process.execPath, [new URL(import.meta.url).pathname], { env: { ...process.env, GOLDEN_ONLY: PORTED, GOLDEN_OUT: tmp.pathname }, stdio: 'inherit' });
const subset = JSON.parse(fs.readFileSync(tmp, 'utf8'));
fs.rmSync(tmp);
const other = [];
scenes.forEach((s, i) => { if (JSON.stringify(s.out) !== JSON.stringify(subset[i])) other.push(s.name); });
console.log(other.length ? `他の武器の効果が働いた場面: ${other.length} 件（${other.slice(0, 5).join(' / ')}）` : '他の武器の効果が働いた場面: 0 件（移した武器だけ登録した状態と全部同じ）');

// ---- 自己確認と書き出し ----
let totalUsed = 0;
for (const s of scenes) { if (s.out.used > s.in.rand.length) { console.error('自己確認 NG: 乱数が足りない', s.name); process.exit(1); } totalUsed += s.out.used; }
const suiteCount = {};
for (const s of scenes) suiteCount[s.suite] = (suiteCount[s.suite] || 0) + 1;
const opCount = {};
for (const s of scenes) { const k = s.in.op.k + (s.in.op.name ? ':' + s.in.op.name : ''); opCount[k] = (opCount[k] || 0) + 1; }
console.log('suite ごとの件数:', Object.entries(suiteCount).map(([k, n]) => `${k} ${n}`).join('  '));
console.log('状態:', Object.keys(states).length, ' 場面:', scenes.length, ' 使った乱数:', totalUsed);
console.log('op:', Object.entries(opCount).map(([k, n]) => `${k} ${n}`).join(' '));
const nBuff = scenes.filter((s) => s.out.net.length).length, nEv = scenes.filter((s) => s.out.ev.length).length;
console.log(`送信ありの場面 ${nBuff} / 記録あり ${nEv}`);
const base = { me: BASE_ME };
fs.writeFileSync(new URL('../../../godot/worldart/data/combat_golden.json', import.meta.url), JSON.stringify({ base, states, scenes }));
console.log(`-> godot/worldart/data/combat_golden.json 場面 ${scenes.length} 件`);
