// ゲームの中の当たり（strikes の arc・line・circle・proj・arrow）と、飛び道具の毎フレーム（updateProjs）を照合するための「入力と期待値」を書く。
//   node tools/worldart/godot/golden_strikes.mjs   → godot/worldart/data/strikes_golden.json
// 元は public/js/game/actions.js（buildCombat の strikes・boomerangStep・updateProjs・projRevive）と weapon-fx.js（hitOpts・arrowTick・arrowEdge・arrowHit・arrowGone）、
// weapons/bow.js（罠の毎フレーム・射抜き）。ポート（ports.js）には wirePorts で最小のダミーを差し込み、strikes と updateProjs は元のモジュールをそのまま動かす。
// dealDamage と reviveHit は「呼ばれた（敵の id・倍率・オプション）」を書き留めるだけのダミー（ダメージの式は golden_combat で照合済み）。
// 全武器の effects を登録した状態（元のゲームと同じ）で回す。見た目（メッシュ・粒・音）はダミー。粒（parts）は記録しない。
//
// 形: { base: {me}, states: { <id>: { wk, ch, S } }, scenes: [ { suite, name, in, out } ] }
//   suite: arc・line・circle・proj・arrow・boomerang・trap
//   in:  { state, area（エリアの id）, door, tms（今の時刻 ms）, rand（Math.random の値の列）, me, mobs, allies（倒れた仲間）, op }
//   op:  { k: 'arc'|'line'|'circle', args:[...] } か { k: 'run', spawns:[{ fn:'proj'|'arrow', o }], frames, aura, meV }
//        o.skip = { $:'mob', id }、o.boomerang.catch = true（戻ってきたとき記録する関数を付ける）、o.onHit = true（当たった敵を記録する関数を付ける）
//   out: { ev（[時刻, 名前, 引数]）, created（飛び道具の作った直後の値）, frames（フレームごとの [x, z, a] の列）, left（残った飛び道具）, me（場面の前との差）, shake, used }
//        ev の名前: deal [敵の id, 倍率, オプション]・revive [仲間の id, オプション]・catch・onHit [敵の id]・fx.*・sfx・floatText ほか（武器の効果が呼んだもの）
// 乱数は種固定、時刻（performance.now）も固定の値。照合する側は godot/worldart/scripts/tests/strikes_golden.gd。
//
// 自己確認: (1) 乱数の列を使い切らない、(2) 数が有限、(3) 各 suite に当たりが 1 件以上ある（空振りの照合を防ぐ）。違えば止まる。
import fs from 'node:fs';
import { wirePorts, state } from '../../../public/js/game/ports.js';
import * as D from '../../../public/shared/data.js';
import { AREAS, collide } from '../../../public/shared/areas.js';
import * as ST from '../../../public/js/game/stats.js';
import * as CB from '../../../public/js/game/combat.js';
import * as TE from '../../../public/js/game/tree-effects.js';
import * as V from '../../../public/js/game/variants.js';
import * as S0 from '../../../public/js/game/state.js';
import { buildCombat, strikes, updateProjs } from '../../../public/js/game/actions.js';
import { fxCall, registerWeaponFx } from '../../../public/js/game/weapon-fx.js';
import { WEAPON_DEFS } from '../../../public/js/weapons/index.js';
import { WTREES, wtLearn, wtChoose, profOf } from '../../../public/js/weapon-tree.js';

// ---- 種を固定した乱数（golden_combat.mjs と同じ mulberry32。種だけ違う） ----
let seed = 20261022;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const rr = (a, b) => a + rnd() * (b - a);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const q8 = (x) => Math.round(x * 8) / 8;
const mkRand = (n) => Array.from({ length: n }, rnd);

// ---- 記録 ----
const clean = (v) => {
  if (typeof v === 'function') return 'fn';
  if (v instanceof Set) return [...v].map(String).sort();
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [String(k), clean(x)]));
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : clean(x)));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = clean(v[k]); return o; }
  if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('有限でない数が記録に入った');
  return v;
};
// dealDamage・reviveHit のオプション: skip は敵の id に、proj（飛び道具そのもの）は 'w' に置き換える
const cleanO = (o) => { const c = { ...o }; if (c.skip) c.skip = c.skip.id; if (c.proj) c.proj = 'w'; return clean(c); };
// 飛び道具の値（mesh は除く。Set・Map は文字にして並べる）
const snapW = (w) => { const o = {}; for (const k of Object.keys(w)) if (k !== 'mesh' && w[k] !== undefined) o[k] = clean(w[k]); return o; };
const ev = [];
let tms = 0, recOn = false;
performance.now = () => tms;
const rawNow = () => tms / 1000;
const rec = (name) => (...args) => { if (recOn) ev.push([rawNow(), name, clean(args)]); };

// ---- ダミー ----
const meshStub = () => ({ parent: null, position: { set() {} }, rotation: {}, scale: { setScalar() {} }, material: { color: 0, opacity: 1 }, userData: {} });
const noop = () => {};
const fxD = { slash: rec('fx.slash'), ringWave: rec('fx.ringWave'), flash: rec('fx.flash'), lightning: rec('fx.lightning'), beam: rec('fx.beam'), parts: { emit: noop, burst: noop }, add: noop, dispose: noop, items: [], ground: () => 0 };
const audioD = { sfx: rec('sfx') };
const floatText = rec('floatText');
let hitStopV = 0;
const setHitStop = (v) => { if (recOn) ev.push([rawNow(), 'setHitStop', [v]]); hitStopV = v; };
const heal = (n, show) => { if (recOn) ev.push([rawNow(), 'heal', clean([n, show])]); state.me.hp = Math.min(ST.S.mhp, state.me.hp + n); };
const taunt = rec('taunt');
const onVariantHit = () => {};
let ext = {};
const extendCombat = (o) => { Object.assign(ext, o); };
let allies = [];
let aimV = 0;
const world = { area: 'f1_field', def: AREAS.f1_field, door: false };

wirePorts({
  state: { CHARGE_MAX: S0.CHARGE_MAX, DODGE_CD: S0.DODGE_CD, me: S0.me, mobs: S0.mobs, pending: S0.pending, projs: S0.projs, world, characterStore: { lost: false }, settings: { shake: true }, char: null },
  stats: { get S() { return ST.S; }, addBuff: ST.addBuff, buffMod: ST.buffMod, hasBuff: ST.hasBuff, calcStats: ST.calcStats },
  view: {
    fx: fxD, audio: audioD, scene: { add(m) { m.parent = 1; } }, weaponStyle: () => null, armorLook: () => null, setPlayerWeapon() {}, setPlayerArmor() {},
    projShape: (shape) => ({ wave: shape !== 'axe', make: meshStub, tick: noop }), arrowMesh: meshStub,
  },
  screen: { floatText, ui: { refresh() {} } },
  link: { net: { send: noop } },
  rules: {
    tf: V.tf, indoorNow: V.indoorNow, titleDmg: V.titleDmg, wtCritAdd: TE.wtCritAdd, wtDmgMult: TE.wtDmgMult, wtOnHit: TE.wtOnHit, later: CB.later,
    heal, setHitStop, get hitStop() { return hitStopV; }, onVariantHit, aimAngle: () => aimV, aimPoint: () => ({ x: 0, z: 0 }), addShake: CB.addShake,
    // 当たりの記録（ダメージの式は動かさない）
    dealDamage: (mb, mult, o) => { ev.push([rawNow(), 'deal', [mb.id, mult, cleanO(o)]]); },
    downedAllies: () => allies,
    reviveHit: (p, o) => { ev.push([rawNow(), 'revive', [p.id, cleanO(o)]]); },
  },
});
buildCombat();
const SWEEP = {};
const api = {
  player: { me: state.me, get S() { return ST.S; }, weaponColor: () => D.RARITIES[ST.S.wr].color, addBuff: ST.addBuff, hasBuff: ST.hasBuff, heal, setHitStop },
  field: { mobs: state.mobs, world: state.world, heightAt: () => 0, aimAngle: () => aimV, aimPoint: () => ({ x: 0, z: 0 }) },
  attack: { strikes, dealDamage: CB.dealDamage, extendCombat, SWEEP, ATK_TYPES: TE.ATK_TYPES, later: CB.later },
  tree: { quietBuff: TE.quietBuff, cutCds: TE.cutCds, wtEmit: TE.wtEmit },
  show: { fx: fxD, audio: audioD, floatText, addShake: CB.addShake, trapMesh: (o) => ({ g: { position: { set() {} } }, ring: { material: {} }, col: o.color ?? 0xffc860 }), bannerMesh: () => ({ g: { position: { set() {} } }, flag: { rotation: {} }, ring: { material: {} } }), handTracker: () => () => ({ x: state.me.x + 0.3, y: 1.1, z: state.me.z + 0.2 }) },
  party: { taunt },
  register: registerWeaponFx,
};
for (const d of WEAPON_DEFS) d.effects?.(api);

const BASE_ME = JSON.parse(JSON.stringify(S0.me));
const me = state.me;
function resetMe(over = {}) {
  for (const k of Object.keys(me)) delete me[k];
  Object.assign(me, structuredClone(BASE_ME), structuredClone(over));
}

// ---- 能力値の状態（golden_combat.mjs と同じ作り方。どのスキルを振ったかだけ決め打ち） ----
function nodeOf(wk, id) { for (const r of WTREES[wk].rows) for (const n of r.nodes) if (n.id === id) return { ...n, kind: r.kind }; throw new Error(id); }
function mkChar(wk, steps) {
  const weapon = { slot: 'weapon', kind: wk, rarity: ri(0, 7), ilvl: ri(1, 50), enh: ri(0, 15), affixes: [], skill: 'retreat', atk: ri(1, 400) };
  const ch = { lv: ri(1, D.MAX_LEVEL), eq: { weapon }, potBonus: 0, skills: {}, tree: {}, wtree: {}, prof: {}, wt: {} };
  profOf(ch, wk).lv = 20;
  for (const [id, lv, br] of steps) {
    const n = nodeOf(wk, id);
    if (n.from) wtLearn(ch, n.from);
    for (let i = 0; i < lv; i++) wtLearn(ch, id);
    if (br) wtChoose(ch, id, br);
  }
  return ch;
}
const clone = (x) => JSON.parse(JSON.stringify(x));
function snapS(S) {
  const o = {};
  for (const [k, v] of Object.entries(S)) {
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') o[k] = v;
    else if (v instanceof Set) o[k] = [...v].sort();
  }
  return o;
}
function applySnap(S, snap) { for (const [k, v] of Object.entries(snap)) S[k] = Array.isArray(v) ? new Set(v) : v; }

const states = {};
const STATE_SPECS = {
  'sword': ['sword', []], 'greatsword': ['greatsword', []], 'axe': ['axe', []], 'dagger': ['dagger', []],
  'spear': ['spear', []], 'spear/reach': ['spear', [['sp_reach', 1]]],
  'bow': ['bow', []], 'bow/hawk': ['bow', [['bw_sniper', 1]], ['t_hawk']],
  'bow/far': ['bow', [['bw_zone', 3, 'B']]], 'bow/far+hawk': ['bow', [['bw_zone', 3, 'B'], ['bw_sniper', 1], ['bw_hawk', 1]], ['t_hawk']],
  'bow/aim': ['bow', [['bw_sniper', 1], ['bw_aim', 1]]],
  'bow/trap': ['bow', [['bw_trapper', 1]]], 'bow/shot': ['bow', [['bw_trapper', 1], ['bw_shot', 1]]], 'bow/lure': ['bow', [['bw_trapper', 1], ['bw_lure', 1]]],
};
for (const [id, [wk, steps, tfx]] of Object.entries(STATE_SPECS)) {
  const ch = mkChar(wk, steps);
  state.char = clone(ch); resetMe(); ST.calcStats();
  if (tfx) ST.S.tfx = new Set(tfx);
  states[id] = { wk, ch, S: snapS(ST.S) };
}

// ---- 場面を動かす ----
const scenes = [];
const DT = 1 / 60;
function mkO(o) {
  const r = clone(o);
  if (r.skip?.$) r.skip = state.mobs.get(r.skip.id);
  if (r.boomerang?.catch) { delete r.boomerang.catch; r.boomerang.onCatch = () => { ev.push([rawNow(), 'catch', []]); }; }
  if (r.onHit === true) r.onHit = (mb) => { ev.push([rawNow(), 'onHit', [mb.id]]); };
  return r;
}
function execute(suite, name, stateId, spec) {
  const st = states[stateId];
  ev.length = 0; state.pending.length = 0; CB.setShake(0); hitStopV = 0; aimV = 0; recOn = false;
  for (const k of Object.keys(TE.wtAuraAcc)) TE.wtAuraAcc[k] = 0;
  state.mobs.clear(); state.projs.length = 0; state.characterStore.lost = false;
  world.area = spec.area; world.def = AREAS[spec.area]; world.door = !!spec.door;
  resetMe(); state.char = clone(st.ch); tms = spec.tms;
  ST.calcStats(); applySnap(ST.S, st.S);
  resetMe(spec.me);
  for (const m of spec.mobs) state.mobs.set(m.id, clone(m));
  allies = clone(spec.allies);
  ev.length = 0;
  let ri2 = 0;
  const rr0 = Math.random;
  Math.random = () => { if (ri2 >= spec.rand.length) throw new Error('乱数の列を使い切った'); return spec.rand[ri2++]; };
  const before = clean(me);
  const op = spec.op;
  const created = [], frames = [];
  try {
    if (op.k === 'arc' || op.k === 'line') {
      const a = clone(op.args); a[3] = mkO(a[3] ?? {});
      strikes[op.k](...a);
    } else if (op.k === 'circle') {
      const a = clone(op.args); a[4] = mkO(a[4] ?? {});
      strikes.circle(...a);
    } else if (op.k === 'run') {
      for (const s of op.spawns) {
        strikes[s.fn](mkO(s.o));
        created.push(snapW(state.projs[state.projs.length - 1]));
      }
      ev.length = 0; // 作った直後の見た目（閃光・音）は記録しない。毎フレームからを比べる
      recOn = true;
      for (let f = 0; f < op.frames; f++) {
        if (!state.projs.length && !(op.aura && f < op.minFrames)) break;
        tms = tms + DT * 1000;
        me.x += (op.meV?.[0] ?? 0) * DT; me.z += (op.meV?.[1] ?? 0) * DT;
        for (const m of state.mobs.values()) if (m.vx || m.vz) { m.x += (m.vx ?? 0) * DT; m.z += (m.vz ?? 0) * DT; }
        if (op.aura) fxCall('aura', DT, ST.S.wt);
        updateProjs(DT);
        frames.push(state.projs.map((w) => [w.x, w.z, w.a]));
      }
    } else throw new Error(op.k);
  } finally { Math.random = rr0; recOn = false; }
  const after = clean(me);
  const diff = (b, a) => { const o = {}; for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) o[k] = a[k] === undefined ? { $del: 1 } : a[k]; return o; };
  const out = { ev: clean(ev), created, frames, left: state.projs.map(snapW), me: diff(before, after), shake: CB.shake, used: ri2 };
  const input = { state: stateId, area: spec.area, door: !!spec.door, tms: spec.tms, rand: spec.rand, me: spec.me, mobs: spec.mobs, allies: spec.allies, op: spec.op };
  scenes.push({ suite, name, in: input, out });
  state.projs.length = 0;
  return out;
}

// ---- 場面を作る ----
const AREAS_USED = ['f1_field', 'f1_field', 'f1_dun'];
function openSpot(area) {
  const def = AREAS[area];
  for (let i = 0; i < 400; i++) {
    const x = rr(-9, 9), z = rr(-9, 9);
    const q = collide(def, x, z, 0.5, false);
    if (q.x === x && q.z === z) return { x, z };
  }
  return { x: 0, z: 0 };
}

let mobId = 7;
function mkMob(x, z) {
  const mhp = pick([100, 800, 5000]);
  return { id: mobId++, x, z, a: rr(-3.1, 3.1), hp: pick([mhp, mhp, mhp * 0.25, 0]), mhp, rad: pick([0.6, 0.8, 1.2]), kind: pick([0, 0, 1, 2]), elite: chance(0.2), stunT: 0, guard: chance(0.2), act: chance(0.1) ? { p: 'burrow', age: rr(0, 2), d: 3 } : null };
}
// 自分のまわり（距離 r0〜r1）に敵を n 体
function mobsAround(cx, cz, n, r0, r1) {
  return Array.from({ length: n }, () => { const ang = rr(-Math.PI, Math.PI), d = rr(r0, r1); return mkMob(cx + Math.sin(ang) * d, cz + Math.cos(ang) * d); });
}
// 道すじ（始点・向き）にそって敵を n 体
function mobsAlong(sx, sz, a, n, len, side) {
  return Array.from({ length: n }, () => { const t = rr(0.5, len), l = rr(-side, side); return mkMob(sx + Math.sin(a) * t + Math.cos(a) * l, sz + Math.cos(a) * t - Math.sin(a) * l); });
}
function alliesAt(pts) { return pts.map(([x, z]) => ({ id: 31 + Math.floor(rnd() * 5), x, z, rv: 3, revHitT: -99 })); }
function newScene(over = {}) {
  const area = pick(AREAS_USED);
  const p = openSpot(area);
  const tms0 = q8(rr(50000, 200000));
  const o = { tms: tms0, area, door: chance(0.3), rand: mkRand(over.randN ?? 400), me: { x: p.x, z: p.z, a: rr(-3.1, 3.1) }, mobs: [], allies: [] };
  mobId = 7;
  return Object.assign(o, over);
}
const MELEE_STATES = ['sword', 'greatsword', 'axe', 'dagger', 'spear', 'spear/reach'];
const ALL_STATES = Object.keys(STATE_SPECS);
const TYPES = ['normal', 'heavy', 'wskill', 'tskill', 'proc'];
const genO = (extra = {}) => {
  const o = { type: pick(TYPES), ...extra };
  if (chance(0.3)) o.a = rr(-3.1, 3.1);
  if (chance(0.2)) o.stun = pick([0.5, 2, 7]);
  if (chance(0.15)) o.tech = 'tx';
  if (chance(0.1)) o.noProc = true;
  return o;
};

// 扇・直線・円: 自分のまわりに敵を置いて、どれに当たるか
for (let i = 0; i < 360; i++) {
  const stId = MELEE_STATES[i % MELEE_STATES.length];
  const rng = pick([2.2, 3, 4.5, 6, 9]);
  const s = newScene();
  s.mobs = mobsAround(s.me.x, s.me.z, ri(3, 8), 0.2, rng + 2.5);
  if (chance(0.2)) s.mobs[0].x = s.me.x + rr(-0.3, 0.3), s.mobs[0].z = s.me.z + rr(-0.3, 0.3); // ほぼ重なっている敵
  if (chance(0.5)) s.allies = alliesAt(Array.from({ length: ri(1, 3) }, () => { const ang = rr(-3.1, 3.1), d = rr(0, rng + 1.5); return [s.me.x + Math.sin(ang) * d, s.me.z + Math.cos(ang) * d]; }));
  s.op = { k: 'arc', args: [rng, pick([30, 60, 90, 120, 180, 270, 360]), pick([0.5, 1, 1.6, 2.4]), genO()] };
  execute('arc', `arc ${stId} #${i}`, stId, s);
}
for (let i = 0; i < 240; i++) {
  const stId = MELEE_STATES[i % MELEE_STATES.length];
  const len = pick([3, 5, 8, 12]), w = pick([0.6, 1.2, 2.4, 4]);
  const s = newScene();
  const o = genO();
  if (chance(0.4)) { o.sx = s.me.x + rr(-3, 3); o.sz = s.me.z + rr(-3, 3); }
  const a = o.a ?? s.me.a;
  s.mobs = mobsAlong(o.sx ?? s.me.x, o.sz ?? s.me.z, a, ri(2, 6), len + 1, w * 0.8 + 1).concat(mobsAround(s.me.x, s.me.z, ri(1, 3), 0.3, len));
  if (chance(0.5)) s.allies = alliesAt(Array.from({ length: ri(1, 3) }, () => { const t = rr(-0.8, len + 0.8), l = rr(-w, w); return [(o.sx ?? s.me.x) + Math.sin(a) * t + Math.cos(a) * l, (o.sz ?? s.me.z) + Math.cos(a) * t - Math.sin(a) * l]; }));
  s.op = { k: 'line', args: [len, w, pick([0.5, 1.2, 2]), o] };
  execute('line', `line ${stId} #${i}`, stId, s);
}
for (let i = 0; i < 240; i++) {
  const stId = MELEE_STATES[i % MELEE_STATES.length];
  const r = pick([1.5, 2.7, 4, 5.2]);
  const s = newScene();
  const cx = s.me.x + rr(-3, 3), cz = s.me.z + rr(-3, 3);
  const o = genO();
  if (chance(0.5)) o.reach = pick([2, 4, 7]);
  s.mobs = mobsAround(cx, cz, ri(3, 7), 0, r + 6);
  if (chance(0.3)) o.skip = { $: 'mob', id: s.mobs[0].id };
  if (chance(0.5)) s.allies = alliesAt(Array.from({ length: ri(1, 3) }, () => { const ang = rr(-3.1, 3.1), d = rr(0, r + 4); return [cx + Math.sin(ang) * d, cz + Math.cos(ang) * d]; }));
  s.op = { k: 'circle', args: [cx, cz, r, pick([0.5, 1.5, 7.5]), o] };
  execute('circle', `circle ${stId} #${i}`, stId, s);
}

// 斬撃波・光波・大きな光波（月蝕）・投げた斧: 固定の dt で消えるまで
const PROJ_KINDS = [
  () => ({ a: 0, mult: 1.4 }),
  () => ({ speed: 22, life: 0.55, rad: 1.3, mult: 1.2, type: 'tskill', color: 0xbfe0ff }),
  () => ({ speed: 23, life: 0.65, rad: 2.1, mult: 1.5, type: 'tskill', color: 0xfff0a0, stun: 6 }),
  () => ({ speed: 22, life: 0.75, rad: 3.4, mult: 3.5, type: 'heavy', color: 0xfff0a0, stun: 6, eclipse: true }),
  () => ({ speed: 24, life: 0.5, rad: 0.9, mult: 0.5, type: 'proc', wtNo: true }),
  () => ({ speed: 20, life: 0.4, rad: 2.4, mult: 2.8, type: 'heavy', shape: 'axe', stun: 6 }),
  () => ({ speed: 26, life: 0.7, rad: 1.6, mult: 2.8, type: 'wskill', color: 0xd8b080, tech: 'tx', cast: 1, sv: { key: 'sv_x', t: 3 } }),
];
for (let i = 0; i < 160; i++) {
  const stId = ['sword', 'greatsword', 'axe', 'spear', 'dagger'][i % 5];
  const s = newScene();
  const o = { ...PROJ_KINDS[i % PROJ_KINDS.length](), a: rr(-3.1, 3.1) };
  if (chance(0.3)) { o.sx = s.me.x + rr(-4, 4); o.sz = s.me.z + rr(-4, 4); }
  const sx = o.sx ?? s.me.x, sz = o.sz ?? s.me.z;
  const len = (o.speed ?? 22) * (o.life ?? 0.7);
  s.mobs = mobsAlong(sx, sz, o.a, ri(2, 6), len, (o.rad ?? 1.8) + 1.2);
  if (chance(0.3)) { const m = s.mobs[0]; m.vx = rr(-3, 3); m.vz = rr(-3, 3); }
  if (chance(0.5)) s.allies = alliesAt(Array.from({ length: ri(1, 2) }, () => { const t = rr(0.5, len), l = rr(-1.5, 1.5); return [sx + Math.sin(o.a) * t + Math.cos(o.a) * l, sz + Math.cos(o.a) * t - Math.sin(o.a) * l]; }));
  s.op = { k: 'run', spawns: [{ fn: 'proj', o }], frames: 400 };
  execute('proj', `proj ${stId} #${i}`, stId, s);
}

// 矢（弓・投げナイフ）: 貫通・射程・毒・会心・遠矢・鷹の目・最大まで引いた矢
for (let i = 0; i < 260; i++) {
  const stId = pick(['bow', 'bow', 'bow/hawk', 'bow/far', 'bow/far+hawk', 'bow/aim', 'dagger']);
  const s = newScene();
  s.rand = s.rand.map((v) => (chance(0.5) ? rr(0.28, 0.32) : v)); // 鷹の目（確率 0.3）の境目の値を多めに
  const o = { a: rr(-3.1, 3.1), type: pick(['normal', 'heavy', 'tskill']), mult: pick([0.75, 1, 1.5, 3.4]) };
  if (chance(0.4)) o.pierce = true;
  if (chance(0.3)) o.range = pick([6, 10, 16, 24]);
  if (chance(0.3)) o.poison = pick([1, 2]);
  if (chance(0.25)) o.crit = true;
  if (chance(0.4)) o.full = true;
  if (chance(0.3)) o.snipe = true;
  if (chance(0.2)) o.big = true;
  if (chance(0.2)) o.speed = pick([30, 42, 60]);
  if (chance(0.2)) o.rad = pick([0.4, 1.2]);
  if (chance(0.3)) o.onHit = true;
  if (chance(0.15)) o.tech = 'bow_tether';
  if (chance(0.15)) o.sv = { key: 'sv_x', t: 2 };
  const len = (o.range ?? (stId === 'dagger' ? 24 : 18)) + 2;
  s.mobs = mobsAlong(s.me.x, s.me.z, o.a, ri(2, 7), len, 1.2);
  if (chance(0.5)) s.allies = alliesAt(Array.from({ length: ri(1, 2) }, () => { const t = rr(0.5, len), l = rr(-1, 1); return [s.me.x + Math.sin(o.a) * t + Math.cos(o.a) * l, s.me.z + Math.cos(o.a) * t - Math.sin(o.a) * l]; }));
  const spawns = [{ fn: 'arrow', o }];
  if (chance(0.25)) spawns.push({ fn: 'arrow', o: { ...o, a: o.a + 0.04 } }); // 連射
  s.op = { k: 'run', spawns, frames: 400 };
  execute('arrow', `arrow ${stId} #${i}`, stId, s);
}

// 戻る斧: 行き → (回る) → 戻る → 捕まえる
for (let i = 0; i < 90; i++) {
  const stId = 'axe';
  const s = newScene();
  const hover = pick([0, 0, 0.8, 1.5]);
  const boomerang = { out: pick([0.3, 0.5]), hover, catch: true };
  if (chance(0.7)) boomerang.hoverMult = 0.7;
  if (chance(0.7)) boomerang.rehit = 0.25;
  const o = { a: rr(-3.1, 3.1), mult: pick([2.4, 0.9]), speed: pick([18, 18, 22]), rad: pick([2.2, 1.6]), scale: pick([1.7, 1.2]), shape: 'axe', type: 'tskill', stun: 4, boomerang };
  if (chance(0.3)) { o.sx = s.me.x + rr(-2, 2); o.sz = s.me.z + rr(-2, 2); }
  const sx = o.sx ?? s.me.x, sz = o.sz ?? s.me.z;
  s.mobs = mobsAlong(sx, sz, o.a, ri(2, 5), o.speed * (boomerang.out + 0.3), 1.5).concat(mobsAround(s.me.x, s.me.z, ri(0, 2), 1, 6));
  if (chance(0.4)) { const m = s.mobs[0]; m.vx = rr(-2, 2); m.vz = rr(-2, 2); }
  if (chance(0.4)) s.allies = alliesAt([[sx + Math.sin(o.a) * rr(1, 8), sz + Math.cos(o.a) * rr(1, 8)]]);
  const spawns = [{ fn: 'proj', o }];
  if (chance(0.3)) for (const d of [-0.4, 0.4]) spawns.push({ fn: 'proj', o: { ...o, a: o.a + d, mult: o.mult * 0.375, rad: 1.6, scale: 1.2, boomerang: { out: boomerang.out, hover, hoverMult: 0.7, rehit: 0.25, catch: true } } });
  s.op = { k: 'run', spawns, frames: 600, meV: chance(0.5) ? [rr(-2, 2), rr(-2, 2)] : [0, 0] };
  execute('boomerang', `boomerang ${stId} #${i}`, stId, s);
}

// 罠（置き矢・罠師）: 毎フレームの aura で踏まれて円で当たる。射抜き（自分の罠を矢で射抜く大爆発）
for (let i = 0; i < 90; i++) {
  const stId = pick(['bow/trap', 'bow/shot', 'bow/lure', 'bow']);
  const s = newScene({ randN: 800 });
  const t0 = s.tms / 1000;
  const nTrap = ri(1, 3);
  s.me.traps = Array.from({ length: nTrap }, () => {
    const tx = s.me.x + rr(-6, 6), tz = s.me.z + rr(-6, 6);
    return { x: tx, z: tz, r: pick([1.8, 2.7]), mult: pick([2, 2.6, 3.3]), stun: pick([3, 16]), life: 5, arm: 0.2, color: 0x85d9ff, ...(chance(0.5) || stId === 'bow/shot' ? { dodge: true } : {}),
      armAt: t0 + pick([-1, 0.043, 0.307]), until: t0 + (stId === 'bow/shot' ? 5 : pick([-1, 0.311, 5])), area: pick([s.area, s.area, s.area, 'f2_field']), mesh: { k: 'trap' } };
  });
  s.mobs = s.me.traps.flatMap((t) => chance(0.8) ? [mkMob(t.x + rr(-1.5, 1.5), t.z + rr(-1.5, 1.5))] : []).concat(mobsAround(s.me.x, s.me.z, ri(0, 3), 1, 8));
  for (const m of s.mobs) { m.hp = m.mhp; if (chance(0.5)) { m.vx = rr(-3, 3); m.vz = rr(-3, 3); } }
  if (chance(0.3)) s.allies = alliesAt([[s.me.x + rr(-3, 3), s.me.z + rr(-3, 3)]]);
  const spawns = [];
  if (chance(0.7) || stId === 'bow/shot') { // 罠めがけて矢を撃つ
    const t = pick(s.me.traps);
    const a = Math.atan2(t.x - s.me.x, t.z - s.me.z) + rr(-0.05, 0.05);
    spawns.push({ fn: 'arrow', o: { a, type: 'normal', mult: 1, range: 20, pierce: chance(0.5) } });
  }
  s.op = { k: 'run', spawns, frames: 90, minFrames: 40, aura: true };
  execute('trap', `trap ${stId} #${i}`, stId, s);
}

// ---- 自己確認と書き出し ----
const suiteCount = {};
let totalUsed = 0;
for (const s of scenes) { suiteCount[s.suite] = (suiteCount[s.suite] || 0) + 1; totalUsed += s.out.used; if (s.out.used > s.in.rand.length) { console.error('自己確認 NG: 乱数が足りない', s.name); process.exit(1); } }
const hits = {};
for (const s of scenes) hits[s.suite] = (hits[s.suite] || 0) + s.out.ev.filter((e) => e[1] === 'deal').length;
const revives = scenes.reduce((n, s) => n + s.out.ev.filter((e) => e[1] === 'revive').length, 0);
const evNames = {};
for (const s of scenes) for (const e of s.out.ev) evNames[e[1]] = (evNames[e[1]] || 0) + 1;
for (const k of Object.keys(suiteCount)) if (!hits[k]) { console.error('自己確認 NG: 当たりが 1 件もない suite', k); process.exit(1); }
for (const k of ['catch', 'onHit', 'revive', 'floatText', 'fx.ringWave']) if (!evNames[k]) { console.error('自己確認 NG: 記録に現れない操作', k); process.exit(1); }
const removedBy = scenes.filter((s) => s.out.frames.length < 400).length;
console.log('suite ごとの件数:', Object.entries(suiteCount).map(([k, n]) => `${k} ${n}`).join('  '));
console.log('suite ごとの deal:', Object.entries(hits).map(([k, n]) => `${k} ${n}`).join('  '), ' revive:', revives);
console.log('記録した操作:', Object.entries(evNames).map(([k, n]) => `${k} ${n}`).join(' '));
console.log('場面:', scenes.length, ' 使った乱数:', totalUsed, ' 消えるまで回した場面:', removedBy);
fs.writeFileSync(new URL('../../../godot/worldart/data/strikes_golden.json', import.meta.url), JSON.stringify({ base: { me: BASE_ME }, states, scenes }));
console.log(`-> godot/worldart/data/strikes_golden.json 場面 ${scenes.length} 件`);
