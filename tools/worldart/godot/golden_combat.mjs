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
// G4: suite hurt_<武器>（予告の着弾・被ダメージ・のけぞり/ダウン/吹き飛び・受け身・這いずり・復活・力尽きる・ガード・ガードブレイク・回転なぎ払い・毒沼の判定）、
//   variants（スキル変化 sv_* の武器スキルの呼び出し列・当たったときの効果・倍率）、titles（称号の与ダメ倍率・移動速度・攻撃速度・窮地）。
//   元の hurt.js・input.js・actions.js（sweepTick）・variants.js・loop.js（hazardAt）をそのまま動かす。op.k = 'call' は { mod, fn, args } でモジュールの関数を呼ぶ。
// 自己確認: dealDamage の式を使わずに全部を動かしている確認として、(1) actions.js の SWEEP を元のモジュールから直接読む（写さない）、
//   (2) 乱数の列を使い切らない、(3) 数が有限、を調べる。違えば止まる。
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { wirePorts, state, rules } from '../../../public/js/game/ports.js';
import * as D from '../../../public/shared/data.js';
import { BALANCE } from '../../../public/shared/balance.js';
import { SPEAR_TIMINGS } from '../../../public/shared/skill-timings.js';
import * as ST from '../../../public/js/game/stats.js';
import * as CB from '../../../public/js/game/combat.js';
import * as TE from '../../../public/js/game/tree-effects.js';
import * as V from '../../../public/js/game/variants.js';
import * as H from '../../../public/js/game/hurt.js';
import * as IN from '../../../public/js/game/input.js';
import * as AC from '../../../public/js/game/actions.js';
import * as LP from '../../../public/js/game/loop.js';
import { AREAS, hazardsOf } from '../../../public/shared/areas.js';
import * as S0 from '../../../public/js/game/state.js';
import { fxCall, fxReduce, fxSome, registerWeaponFx } from '../../../public/js/game/weapon-fx.js';
import { WEAPON_DEFS } from '../../../public/js/weapons/index.js';
import { WTREES, wtLearn, wtChoose, profOf } from '../../../public/js/weapon-tree.js';

const ONLY = process.env.GOLDEN_ONLY ? process.env.GOLDEN_ONLY.split(',') : null; // 子プロセス用: 登録する武器を絞る
const SUITE_OF = { sword: 'sword', greatsword: 'greatsword', dagger: 'dagger', axe: 'axe', spear: 'spear', bow: 'bow' };
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
  if (v instanceof Set) return [...v].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : 1));
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
// beam は旗手（盾槍）が使う。add・items・ground は罠と旗の見た目の置き場（記録しない。Godot では api.gd の trap_visual・banner_visual が受け持つ）
const fxD = { slash: rec('fx.slash'), ringWave: rec('fx.ringWave'), flash: rec('fx.flash'), lightning: rec('fx.lightning'), beam: rec('fx.beam'), parts: { emit: rec('parts.emit'), burst: rec('parts.burst') }, add() {}, items: [], ground: () => 0 };
const audioD = { sfx: rec('sfx') };
const floatText = rec('floatText');
const strikes = { arc: rec('arc'), line: rec('line'), circle: rec('circle'), proj: rec('proj'), arrow: rec('arrow'), dash: rec('dash'), hit: rec('hit') };
const setHitStop = (v) => { ev.push([rawNow(), 'setHitStop', [v]]); H.setHitStop(v); };
const heal = (n, show) => { ev.push([rawNow(), 'heal', clean([n, show])]); state.me.hp = Math.min(ST.S.mhp, state.me.hp + n); };
const taunt = rec('taunt');
let realVariants = false; // variants の suite では、スキル変化の付加効果を本当に動かす（それ以外は記録だけ）
const onVariantHit = (mb, dmg, o) => { if (realVariants) V.onVariantHit(mb, dmg, o); else ev.push([rawNow(), 'onVariantHit', [mb.id, dmg, o.sv.key]]); };
// G4: hurt.js・input.js・variants.js が使う外の道具のダミー（記録するだけ。画面・音・通信・移動・回避・強攻撃・セーブの削除）
const bannerR = rec('banner'), toastR = rec('toast'), uiHurt = rec('ui.hurt'), moveMeR = rec('moveMe'), tryDodgeR = rec('tryDodge'), doHeavyR = rec('doHeavy');
const discard = () => { ev.push([rawNow(), 'characterDiscard', []]); return true; };
// 武器スキルに渡す戦闘コンテキスト（rules.combat）のダミー。スキル変化はこれを包む（variants.js variantCtx の Object.create(rules.combat)）
const combatD = { ...strikes, col: () => D.RARITIES[ST.S.wr].color, fx: fxD, later: CB.later, sfx: (...a) => audioD.sfx(...a) };
// スキル変化の照合に使う技（元の技の代わりに、当たりの形・見た目・遅延・移動を 1 通り呼ぶ）。Godot 側 combat_golden.gd の TEST_SKILLS と同じ内容
const TEST_SKILLS = {
  a: (c) => { const m = state.me; c.arc(4, 120, 1.5, { type: 'wskill', a: 0.3 }); c.fx.slash(m.x, m.z, 0.3, 4, 120, c.col(), 1.0); c.line(8, 1.4, 2, { type: 'wskill', a: 0.3 }); c.circle(m.x, m.z, 3, 1.2, { type: 'wskill' }); c.sfx('skill'); },
  b: (c) => { const m = state.me; c.proj({ a: 0.5, mult: 2, rad: 1.5, type: 'wskill' }); c.arrow({ a: 0.1, type: 'wskill', pierce: true }); c.proj({ a: 0.2, color: 0x123456, type: 'wskill' }); c.hit(state.mobs.get(7), 1.5, { type: 'wskill' }); c.fx.ringWave(m.x, m.z, c.col(), 3, 0.3); c.later(0.2, () => c.arc(3, 90, 1, { type: 'wskill', a: 0.2 })); c.dash(0.4, 3, 0.1); c.arc(2, 60, 1); },
};
let ext = {};
const extendCombat = (o) => { Object.assign(ext, o); };
const SWEEP = AC.SWEEP; // 盾槍のガードカウンター（guardCounter）と sweepTick が読む。自己確認 (1): 元のモジュールから直接読む
if (!(SWEEP.r === 5.2 && SWEEP.mult === 7.5 && SWEEP.stun === 14 && Math.abs(SWEEP.dur - (SPEAR_TIMINGS.counter.wind + SPEAR_TIMINGS.counter.slash + SPEAR_TIMINGS.counter.rest)) < 1e-12)) { console.error('自己確認 NG: actions.js の SWEEP が想定と違う'); process.exit(1); }
Object.assign(AC.strikes, strikes); // actions.js sweepTick が読む strikes（組み立て役が buildCombat で入れるもの）をダミーにする
let aimV = 0;

wirePorts({
  state: { CHARGE_MAX: S0.CHARGE_MAX, DODGE_CD: S0.DODGE_CD, me: S0.me, mobs: S0.mobs, pending: S0.pending, world: { area: 'f1_field', def: { shape: 'open', weather: null } }, characterStore: { lost: false, discard }, settings: { shake: true }, char: null,
    keys: new Set(), others: new Map(), teles: [], DEBUG: false },
  stats: { get S() { return ST.S; }, addBuff: ST.addBuff, buffMod: ST.buffMod, hasBuff: ST.hasBuff, calcStats: ST.calcStats },
  view: { fx: fxD, audio: audioD, weaponStyle: () => null, armorLook: () => null, setPlayerWeapon() {}, setPlayerArmor() {}, toColor: (c) => c },
  screen: { floatText, banner: bannerR, toast: toastR, ui: { refresh() {}, hurt: uiHurt } },
  link: { net: { send: (m) => { net.push(clean(m)); } } },
  rules: {
    tf: V.tf, indoorNow: V.indoorNow, titleDmg: V.titleDmg, wtCritAdd: TE.wtCritAdd, wtDmgMult: TE.wtDmgMult, wtOnHit: TE.wtOnHit, later: CB.later,
    heal, setHitStop, get hitStop() { return H.hitStop; }, onVariantHit, strikes, aimAngle: () => aimV, aimPoint: () => ({ x: 0, z: 0 }),
    // G4: 被弾・ガード・スキル変化・窮地の称号
    GUARD: IN.GUARD, guardUp: IN.guardUp, guardDamage: IN.guardDamage, guardProfile: IN.guardProfile, armCounter: IN.armCounter, canGuard: IN.canGuard,
    wtOnGuard: TE.wtOnGuard, wtOnHurt: TE.wtOnHurt, wtDr: TE.wtDr, addShake: CB.addShake, stunValue: CB.stunValue, dealDamage: CB.dealDamage,
    tryDodge: tryDodgeR, moveMe: moveMeR, doHeavy: doHeavyR, titleMove: V.titleMove, titleAspd: V.titleAspd, desperate: V.desperate,
    combat: combatD, touch: { stick: { x: 0, y: 0 } },
  },
});
const api = {
  player: { me: state.me, get S() { return ST.S; }, weaponColor: () => D.RARITIES[ST.S.wr].color, addBuff: ST.addBuff, hasBuff: ST.hasBuff, heal, setHitStop },
  field: { mobs: state.mobs, world: state.world, heightAt: () => 0, aimAngle: () => aimV, aimPoint: () => ({ x: 0, z: 0 }) },
  attack: { strikes, dealDamage: CB.dealDamage, extendCombat, SWEEP, ATK_TYPES: TE.ATK_TYPES, later: CB.later },
  tree: { quietBuff: TE.quietBuff, cutCds: TE.cutCds, wtEmit: TE.wtEmit },
  show: { fx: fxD, audio: audioD, floatText, addShake: CB.addShake, trapMesh: (o) => ({ g: { position: { set() {} } }, ring: { material: {} }, col: o.color ?? 0xffc860 }), bannerMesh: () => ({ g: { position: { set() {} } }, flag: { rotation: {} }, ring: { material: {} } }), handTracker: () => () => ({ x: state.me.x + 0.3, y: 1.1, z: state.me.z + 0.2 }) },
  party: { taunt },
  register: registerWeaponFx,
};
for (const d of WEAPON_DEFS) if (!ONLY || ONLY.includes(d.wk)) d.effects?.(api);

S0.me.gg = IN.GUARD.max; // input.js initGuard（wiring.js が起動のときに呼ぶ）
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
  { id: 'gt_siege', mods: {} }, { id: 'dk_poison', mods: {} }, { id: 'ax_rage', mods: { atkp: 5 } }, { id: 'sp_thunder', mods: {} }, { id: 'sp_intercept', mods: {} }, { id: 'sp_taunt', mods: {} }, { id: 'gt_eye', mods: { dmgp: 15 } }, { id: 'gt_mirror', mods: { dmgp: 30 } }, { id: 'poison', mods: {} }, { id: 'dr_a', mods: { dr: 10 } },
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
  // 盾槍・弓の状態
  o.gg = pick([0, 40, 100]); o.soarReady = t + pick([-1, 1]); o.pierceReady = chance(0.3); o.tipRun = ri(0, 4); o.tipAct = pick([-1, o.act]); o.boltT = t - pick([0.1, 1]);
  o.banner = chance(0.3) ? { x: rr(-2, 2), z: rr(-2, 2), until: t + pick([-1, 3]), mesh: { k: 'banner' } } : null;
  o.aimN = ri(0, 3); o.hawkT = t - pick([1, 9]); o.stormN = ri(0, 9); o.trapT = t - pick([1, 3]);
  o.traps = Array.from({ length: pick([0, 0, 1, 2, 3]) }, () => ({ x: rr(-2, 2), z: rr(-2, 2), r: pick([1.8, 2.7]), mult: pick([2, 2.6]), stun: pick([3, 16]), life: 5, arm: 0.2, color: 0x85d9ff, ...(chance(0.5) ? { dodge: true } : {}),
    armAt: t + pick([-1, 1]), until: t + pick([-1, 5]), area: pick(['f1_field', 'f1_field', 'f2_field']), mesh: { k: 'trap' } }));
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
  if (chance(0.2)) o.tip = pick([0.1, 0.5, 0.8]);
  if (chance(0.15)) o.full = true;
  if (chance(0.15)) o.snipe = true;
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
  ev.length = 0; net.length = 0; state.pending.length = 0; CB.setShake(0); H.setHitStop(0); aimV = spec.aim ?? 0;
  for (const k of Object.keys(TE.wtAuraAcc)) TE.wtAuraAcc[k] = 0;
  state.mobs.clear(); state.characterStore.lost = !!spec.lost;
  state.world.def = spec.area ? AREAS[spec.area] : { shape: spec.indoor ? 'grid' : 'open', weather: spec.weather || null }; state.DEBUG = !!spec.debug; state.keys = new Set(spec.keys || []); state.touch = null;
  realVariants = suite === 'variants';
  resetMe(); state.char = clone(st.ch); tms = spec.tms;
  ST.calcStats(); applySnap(ST.S, st.S);
  if (spec.Sov) for (const [k, v] of Object.entries(spec.Sov)) ST.S[k] = Array.isArray(v) ? new Set(v) : v; // 場面ごとの能力値の上書き（称号・固有効果・フラグ・防御など。配列は Set）
  if (spec.sv !== undefined) ST.S.sv = spec.sv;
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
    } else if (op.k === 'call') {
      // モジュールの関数をそのまま呼ぶ（G4）。引数の { $: 'mob' | 'mob8' | 'sk' } は参照、普通のオブジェクトは写して呼んだあとの形を args に残す
      const mods = { H, IN, AC, LP, V, CB, TE };
      if (op.stick) rules.touch.stick = { ...op.stick }; else rules.touch.stick = { x: 0, y: 0 };
      const fixO = (o) => { if (o.cast && Array.isArray(o.cast.hitSet)) o.cast.hitSet = new Set(o.cast.hitSet); return o; };
      const a = op.args.map((x) => {
        if (x && typeof x === 'object' && !Array.isArray(x)) {
          if (x.$ === 'mob') return state.mobs.get(7);
          if (x.$ === 'mob8') return state.mobs.get(8);
          if (x.$ === 'sk') return { run: TEST_SKILLS[x.id] };
          const c = fixO(clone(x)); args.push(c); return c;
        }
        return x;
      });
      ret = mods[op.mod][op.fn](...a);
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
  const near = (x, y) => (typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) <= 1e-9 : Array.isArray(x) && Array.isArray(y) ? x.length === y.length && x.every((v, i) => near(v, y[i])) : x && y && typeof x === 'object' && typeof y === 'object' ? Object.keys(x).length === Object.keys(y).length && Object.keys(x).every((k) => k in y && near(x[k], y[k])) : x === y); // 最後の桁の違い（sin/cos/atan2）は同じとみなす。Godot 側の _eq も同じ
  const diff = (b, a) => { const o = {}; for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) if (!near(b[k], a[k])) o[k] = a[k] === undefined ? { $del: 1 } : a[k]; return o; };
  const out = { ev: clean(ev), net: clean(net), me: diff(before.me, after.me), mobs: {}, shake: CB.shake, hitStop: H.hitStop, used: ri2 };
  for (const id of Object.keys(after.mobs)) { const d = diff(before.mobs[id], after.mobs[id]); if (Object.keys(d).length) out.mobs[id] = d; }
  if (ret !== undefined) out.ret = clean(ret);
  if (args.length) out.args = clean(args.map((x) => x));
  const input = { state: stateId, tms: spec.tms, rand: spec.rand, me: spec.me, mobs: spec.mobs, op: spec.op };
  if (spec.aim) input.aim = spec.aim;
  for (const k of ['Sov', 'sv', 'area', 'weather', 'keys', 'debug']) if (spec[k] !== undefined && spec[k] !== null && spec[k] !== false) input[k] = spec[k];
  if (spec.sv === null) input.sv = null; // sv: null は「スキル変化なし」の指定
  if (spec.lost) input.lost = true;
  if (spec.indoor) input.indoor = true;
  scenes.push({ suite, name, in: input, out });
  return out;
}

// ---- 場面を作る ----
// 飛んでいる矢（projs の要素のうち効果が読む値）
const mkArrow = () => ({ x: rr(-2, 2), z: rr(-2, 2), sx: 0, sz: 0, a: rr(-3, 3), range: pick([9, 14, 22]), snipe: chance(0.6), type: 'heavy', ...(chance(0.2) ? { snipeDone: true } : {}) });
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
    stun: { kind: 'reduce', acc: pick([1.2, 6, 3, 12.5]), args: [o] }, reach: { kind: 'reduce', acc: 1, args: [flag] },
    heavyNeedsFull: { kind: 'some', args: [] }, heavyStart: { kind: 'call', args: [pick([1, 2])] }, heavyAfter: { kind: 'call', args: [pick([1, 2])] },
    heavyOverride: { kind: 'some', args: [pick([1, 2])] }, cheatDeath: { kind: 'some', args: [] },
    // 盾槍
    hitOpts: { kind: 'reduce', acc: o, args: [rr(0, 1)] }, swingColor: { kind: 'reduce', acc: 0xcfd3da, args: [] },
    swingExtra: { kind: 'call', args: [rr(-3, 3), pick([2.8, 4.3]), 0xcfd3da] }, hitTech: { kind: 'reduce', acc: 'tx', args: [o, MB] },
    onHurtFirst: { kind: 'call', args: [] }, steadyGuard: { kind: 'some', args: [] }, guardKeep: { kind: 'reduce', acc: 1, args: [] }, guardRegen: { kind: 'reduce', acc: 1, args: [] },
    guardRegenDelay: { kind: 'reduce', acc: 1, args: [] }, guardLock: { kind: 'reduce', acc: pick([0.3, 0.4]), args: [] },
    guardCtrLock: { kind: 'reduce', acc: 0.85, args: [{ max: 100, cut: 0.25, regenDelay: 1.6, regen: 20, up: 0.06, lock: 0.3, ctrLock: 0.7 }] },
    counterGauge: { kind: 'call', args: [100] }, chargeStart: { kind: 'some', args: [] },
    sweepPower: { kind: 'reduce', acc: 0.5, args: [] }, sweepStun: { kind: 'reduce', acc: 14, args: [] }, shieldBack: { kind: 'some', args: [] },
    // 弓
    onDodge: { kind: 'call', args: [] }, shoot: { kind: 'some', args: [rr(-3, 3), pick([0.6, 0.66])] },
    iaiLabel: { kind: 'reduce', acc: '居合', args: [] },
    arrowTick: { kind: 'call', args: [mkArrow()] }, arrowEdge: { kind: 'some', args: [mkArrow(), rr(0, 22)] }, arrowHit: { kind: 'call', args: [mkArrow(), MB] }, arrowGone: { kind: 'call', args: [mkArrow()] },
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
      const spec = scene(`hooks_${sc}`, name, sid, { randN: name === 'aura' ? 300 : name === 'shoot' ? 64 : 16 });
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
      { name: 'ambush', args: [pick([1, 3, 4])] }, { name: 'pay', args: [pick([0.15, 0.9])] },
      { name: 'trap', args: [rr(-2, 2), rr(-2, 2), { mult: pick([2.6, 3.3]), r: pick([1.8, 2.7]), stun: pick([3, 16]), life: 5, arm: 0.2, color: 0x85d9ff }] }].filter((e) => ext[e.name])) if (chance(0.25)) {
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


// =====================================================================================================================
// G4: 被弾・ガード（hurt_<武器>）、スキル変化（variants）、称号（titles）。ここから先は乱数の列の続きなので、上の場面は増やしても変わらない
// =====================================================================================================================
const SV_KEYS = Object.keys(D.SKILL_VARIANTS);
const svOf = (key, t) => { const { desc, ...rest } = D.SKILL_VARIANTS[key]; return { key, t, ...rest }; }; // desc は関数（Godot の sv は持たない）
const T_ALL = Object.keys(D.TITLES);
const HURT_T = ['t_shell', 't_relic', 't_berserk', 't_phoenix', 't_guard', 't_boss2', 't_wind', 't_hunter', 't_breaker'];
const wpick = (list) => { let r = rnd() * list.reduce((a, [, w]) => a + w, 0); for (const [v, w] of list) { r -= w; if (r < 0) return v; } return list[0][0]; };
const subsetOf = (arr, n) => Array.from({ length: n }, () => pick(arr)).filter((x, i, a) => a.indexOf(x) === i);

// 被弾・ガードの状態: 武器ツリーを振った状態を、武器ごとに 14 個足す（盾槍・片手剣はガードに関わるノードを多めに）
const GUARD_NODES = { spear: ['sp_iron', 'sp_shield', 'sp_ctr', 'sp_brk', 'sp_taunt', 'sp_knight', 'sp_dragoon'], sword: ['sw_guard', 'sw_tough', 'sw_parry'], greatsword: ['gt_armor', 'gt_counter', 'gt_charge', 'gt_unyield'], axe: ['ax_berserk', 'ax_rage', 'ax_undying'], dagger: ['dk_agile'], bow: ['bw_roll'] };
const hurtStateIds = Object.fromEntries(Object.keys(SUITE_OF).map((wk) => [wk, []]));
for (const wk of Object.keys(SUITE_OF)) {
  const all = WTREES[wk].rows.flatMap((r) => r.nodes.map((n) => ({ ...n, kind: r.kind })));
  const ids = new Set(all.map((n) => n.id));
  for (let i = 0; i < 14; i++) {
    const ks1 = all.filter((n) => n.kind === 'ks1'), ks2 = all.filter((n) => n.kind === 'ks2'), pass = all.filter((n) => n.kind === 'skill' || n.kind === 'passive');
    const steps = [];
    const k1 = pick(ks1); steps.push([k1.id, 1]);
    const k2s = ks2.filter((n) => n.from === k1.id);
    if (chance(0.6) && k2s.length) steps.push([pick(k2s).id, 1]);
    for (const id of (GUARD_NODES[wk] || []).filter((x) => ids.has(x))) {
      const n = all.find((x) => x.id === id);
      if (n.kind === 'ks1' || n.kind === 'ks2') continue;
      if (chance(0.5)) { const lv = ri(1, 3); steps.push([id, lv, lv === 3 ? pick(['A', 'B']) : undefined]); }
    }
    for (const n of pass) if (chance(0.15) && !steps.some((st) => st[0] === n.id)) { const lv = ri(1, 3); steps.push([n.id, lv, lv === 3 ? pick(['A', 'B']) : undefined]); }
    const before = Object.keys(states).length;
    addState(wk, `hurt${i}`, steps, 1);
    hurtStateIds[wk].push(Object.keys(states)[before]);
  }
}
// 場面ごとの能力値の上書き: 防御・見切り・称号・固有効果・フラグ（配列は Set）。武器ツリー由来の fx・flags は残す
function genSov(st) {
  const o = { def: pick([0, 5, 20, 45, 65]), justbuff: pick([0, 0, 20]), counter: pick([0, 0, 80, 150]) };
  o.tfx = subsetOf(HURT_T, pick([0, 1, 2, 3]));
  o.fx = [...new Set([...(st.S.fx || []), ...subsetOf(['aegis', 'mirror', 'thunder', 'flame'], pick([0, 1, 2]))])].sort();
  o.flags = [...new Set([...(st.S.flags || []), ...subsetOf(['laststand', 'bulwark'], pick([0, 1, 2]))])].sort();
  return o;
}
function genHurtMe(t) {
  const g = {
    guarding: chance(0.5), guardStart: t - pick([0.02, 0.1, 2]), counter: chance(0.35),
    brokenT: chance(0.15) ? t + 0.5 : 0, noDownT: pick([0, t - 1, t + 1]), downStart: t - pick([0.05, 0.3, 0.9, 2]),
    downT: pick([0, 0, 0.6]), staggerT: pick([0, 0, 0.2]), lastStandT: t - pick([10, 200]), downs: ri(0, 3),
    crawl: chance(0.06), god: chance(0.03), guardLockT: pick([0, t - 1, t + 0.3]), ggHitT: pick([0, t - 0.2, t - 5]), guardEndT: pick([0, t - 0.2, t - 5]),
    sweepT: chance(0.5) ? rr(0.01, 0.94) : 0, sweepHit: chance(0.3), iframe: pick([0, 0, 0, 0.3]), hp: pick([1, 20, 100, 400, 3000, 99999]), dead: chance(0.04),
    kbT: pick([0, 0.1]), gg: pick([0, 8, 40, 100]), walkT: rr(0, 5), moving: chance(0.5),
  };
  if (chance(0.3)) g.phoenixT = t - pick([10, 400]);
  return g;
}
function genShape(cx, cz) {
  const k = pick(['circle', 'ring', 'cone', 'line']);
  if (k === 'circle') return { k, x: cx, z: cz, r: pick([2, 3, 5]) };
  if (k === 'ring') return { k, x: cx, z: cz, r0: pick([0.5, 1, 3]), r1: pick([2.5, 4, 6]) };
  if (k === 'cone') return { k, x: cx + rr(-3, 3), z: cz + rr(-3, 3), len: pick([4, 8, 12]), arc: pick([1, 2, 3]), a: rr(-3, 3) };
  return { k, x: cx + rr(-3, 3), z: cz + rr(-3, 3), a: rr(-3, 3), len: pick([6, 12]), w: pick([2, 4]) };
}
function genTele(me, mhp) {
  const far = chance(0.15);
  const cx = me.x + rr(-1.5, 1.5) + (far ? 40 : 0), cz = me.z + rr(-1.5, 1.5);
  const te = { sh: Array.from({ length: pick([1, 1, 2, 3]) }, () => genShape(cx, cz)), dmg: Math.max(1, Math.round(mhp * pick([0.03, 0.08, 0.15, 0.3, 0.6]))), kd: chance(0.2), color: pick(['#ff3030', '#30a0ff']) };
  const src = pick([7, 7, 8, 0, null]);
  if (src !== null) te.src = src;
  return te;
}
const genSrc = (me) => (chance(0.3) ? null : { x: me.x + rr(-3, 3), z: me.z + rr(-3, 3) });
const HURT_OPS = [['resolveTele', 12], ['takeDamage', 6], ['hitReaction', 3], ['knockFrom', 2], ['tryTech', 3], ['getUp', 1], ['onJustDodge', 3], ['fall', 3], ['revived', 1], ['reviveHit', 3], ['crawlTick', 2], ['die', 1],
  ['startGuard', 2], ['canGuard', 2], ['guardUp', 2], ['guardDamage', 4], ['guardBreak', 1], ['guardRegen', 3], ['armCounter', 1], ['endGuard', 4], ['sweepTick', 5], ['hazardAt', 1]];
const MODOF = { resolveTele: 'H', takeDamage: 'H', hitReaction: 'H', knockFrom: 'H', tryTech: 'H', getUp: 'H', onJustDodge: 'H', fall: 'H', revived: 'H', reviveHit: 'H', crawlTick: 'H', die: 'H',
  startGuard: 'IN', canGuard: 'IN', guardUp: 'IN', guardDamage: 'IN', guardBreak: 'IN', guardRegen: 'IN', armCounter: 'IN', endGuard: 'IN', sweepTick: 'AC', hazardAt: 'LP' };
for (const wk of Object.keys(SUITE_OF)) {
  const suite = `hurt_${SUITE_OF[wk]}`;
  for (const sid of hurtStateIds[wk]) {
    for (let j = 0; j < 26; j++) {
      const name = wpick(HURT_OPS);
      const spec = scene(suite, name, sid);
      const t = spec.tms / 1000, st = states[sid];
      Object.assign(spec.me, genHurtMe(t));
      spec.Sov = genSov(st);
      const mhp = st.S.mhp;
      const raw = Math.max(1, Math.round(mhp * pick([0.02, 0.08, 0.15, 0.3, 0.6, 1.5])));
      let args = [];
      switch (name) {
        case 'resolveTele': args = [genTele(spec.me, mhp)]; break;
        case 'takeDamage': args = [raw, genSrc(spec.me), chance(0.2), chance(0.25)]; break;
        case 'hitReaction': args = [raw, genSrc(spec.me), chance(0.2)]; break;
        case 'knockFrom': args = [chance(0.2) ? { x: spec.me.x + rr(-0.1, 0.1), z: spec.me.z } : genSrc(spec.me), pick([0.8, 1.4, 4]), pick([0.12, 0.18, 0.32])]; break;
        case 'revived': args = ['Alice']; break;
        case 'reviveHit': args = [{ id: 3, x: rr(-3, 3), z: rr(-3, 3), rv: pick([-1, 0, 0.3, 0.7]), ...(chance(0.4) ? { revHitT: t - pick([0.01, 1]) } : {}) }, genO()]; break;
        case 'crawlTick': args = [pick([0.016, 0.05, 0.2])]; spec.keys = subsetOf(['w', 'a', 's', 'd', 'arrowup', 'arrowleft'], pick([0, 1, 2])); if (chance(0.3)) spec.stick = { x: rr(-1, 1), y: rr(-1, 1) }; break;
        case 'guardDamage': args = [raw, chance(0.3)]; break;
        case 'guardRegen': args = [pick([0.016, 0.1, 0.5])]; break;
        case 'endGuard': args = [chance(0.5)]; break;
        case 'sweepTick': args = [pick([0.016, 0.05, 0.2, 0.4])]; break;
        case 'hazardAt': {
          spec.area = pick(['f2_field', 'f2_hunt', 'f3_field', 'f1_field']);
          const hs = hazardsOf(AREAS[spec.area]);
          const h = hs.length ? pick(hs) : { x: 0, z: 0, r: 2 };
          args = [h.x + rr(-h.r, h.r), h.z + rr(-h.r, h.r)];
          break;
        }
        default: args = [];
      }
      spec.op = { k: 'call', mod: MODOF[name], fn: name, args, ...(spec.stick ? { stick: spec.stick } : {}) };
      execute(suite, `${name} ${sid}`, sid, spec);
    }
  }
}

// ガードで受ける場面を厚くする: 盾槍・片手剣（守護騎士）で、構えて効き始めていて、敵の方を向いている状態で予告が着弾する
for (const wk of ['spear', 'sword']) {
  const suite = `hurt_${SUITE_OF[wk]}`;
  for (const sid of hurtStateIds[wk]) for (let j = 0; j < 14; j++) {
    const spec = scene(suite, 'guard', sid);
    const t = spec.tms / 1000, st = states[sid];
    Object.assign(spec.me, genHurtMe(t));
    spec.Sov = genSov(st);
    spec.Sov.flags = [...new Set([...spec.Sov.flags, ...(chance(0.3) ? ['bulwark'] : [])])].sort();
    const m7 = spec.mobs[0];
    Object.assign(spec.me, { guarding: true, guardStart: t - pick([0.03, 1]), crawl: false, dead: false, iframe: 0, god: false, downT: 0, staggerT: 0, hp: pick([400, 3000, 99999]) });
    spec.me.a = Math.atan2(m7.x - spec.me.x, m7.z - spec.me.z) + (chance(0.8) ? rr(-0.5, 0.5) : pick([2.5, -2.5]));
    const te = genTele(spec.me, st.S.mhp);
    te.sh[0] = { k: 'circle', x: spec.me.x, z: spec.me.z, r: 3 }; // 必ず当たる
    te.src = 7;
    spec.op = { k: 'call', mod: 'H', fn: 'resolveTele', args: [te] };
    execute(suite, `guard ${sid}`, sid, spec);
  }
}

// ---- variants: スキル変化の武器スキル（技の呼び出し列）・当たったときの効果・倍率 ----
for (const wk of Object.keys(SUITE_OF)) {
  const sid = stateIds[wk][0];
  for (const key of SV_KEYS) for (const t of [1, 4, 7]) {
    const sv = svOf(key, t);
    for (const sk of ['a', 'b']) {
      const spec = scene('variants', 'cast', sid, { randN: 48 });
      spec.sv = sv; spec.op = { k: 'call', mod: 'V', fn: 'castWeaponSkill', args: [{ $: 'sk', id: sk }] };
      execute('variants', `cast ${sid} ${key} t${t} ${sk}`, sid, spec);
    }
    const specH = scene('variants', 'onHit', sid, { randN: 48 });
    const now0 = specH.tms / 1000;
    specH.sv = sv;
    specH.op = { k: 'call', mod: 'V', fn: 'onVariantHit', args: [{ $: 'mob' }, ri(1, 3000), { type: pick(['wskill', 'wskill', 'dot', 'normal']), sv, cast: { left: pick([0, 1, 3, D.SV.stormChains(t)]), hitSet: pick([[], [7], [8], [7, 8]]), exploded: chance(0.4), quakeT: now0 - pick([0, 0.1, 1]) } }] };
    execute('variants', `onHit ${sid} ${key} t${t}`, sid, specH);
    const specP = scene('variants', 'params', sid);
    specP.op = { k: 'call', mod: 'V', fn: 'variantParams', args: [sv, chance(0.5)] };
    execute('variants', `params ${sid} ${key} t${t}`, sid, specP);
  }
  // スキル変化なし: そのまま呼ぶ
  for (const sk of ['a', 'b']) {
    const spec = scene('variants', 'cast-none', sid, { randN: 16 });
    spec.sv = null; spec.op = { k: 'call', mod: 'V', fn: 'castWeaponSkill', args: [{ $: 'sk', id: sk }] };
    execute('variants', `cast ${sid} none ${sk}`, sid, spec);
  }
}

// ---- titles: 称号の与ダメージ倍率・移動速度・攻撃速度・窮地・天候 ----
for (const wk of Object.keys(SUITE_OF)) {
  const sid = stateIds[wk][0];
  for (let i = 0; i < 14; i++) for (const [fn, args] of [['titleDmg', [{ $: 'mob' }]], ['titleMove', []], ['titleAspd', []], ['desperate', []], ['weatherNow', []]]) {
    const spec = scene('titles', fn, sid);
    const t = spec.tms / 1000;
    spec.Sov = { tfx: subsetOf(T_ALL, pick([0, 1, 2, 4])) };
    if (chance(0.7)) spec.Sov.tfx = [...new Set([...spec.Sov.tfx, ...subsetOf(['t_reaper', 't_berserk', 't_hunter', 't_breaker', 't_delver', 't_traveler', 't_storm', 't_boss3'], pick([1, 2, 3]))])];
    spec.weather = chance(0.5) ? pick(['rain', 'fog', 'sandstorm']) : null;
    if (chance(0.5)) spec.me.travelT = t + pick([-5, 5]);
    spec.me.hp = pick([1, 20, 60, 100, 400, 3000]);
    spec.op = { k: 'call', mod: 'V', fn, args };
    execute('titles', `${fn} ${sid}`, sid, spec);
  }
}

// ---- 子プロセス: Godot へ移した武器（SUITE_OF）だけ登録した状態で同じ場面を回して比べる（親だけ） ----
if (ONLY) {
  fs.writeFileSync(process.env.GOLDEN_OUT, JSON.stringify(scenes.map((s) => s.out)));
  process.exit(0);
}
const tmp = new URL('../../../.agents/golden_combat_subset.json', import.meta.url);
fs.mkdirSync(new URL('../../../.agents/', import.meta.url), { recursive: true });
execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, GOLDEN_ONLY: PORTED, GOLDEN_OUT: fileURLToPath(tmp) }, stdio: 'inherit' });
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
