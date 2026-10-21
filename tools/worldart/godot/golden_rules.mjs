// Godot の式（godot/worldart/scripts/game/rules.gd）と元の JavaScript が同じ値を返すかを照合するための「入力と期待値の組」を書く。
//   node tools/worldart/godot/golden_rules.mjs   → godot/worldart/data/rules_golden.json
// 形: { suites: { <名前>: [ { in: [引数...], out: 期待値 }, ... ] } }。種を固定した乱数なので、何度書いても同じ。
// 照合する側は godot/worldart/scripts/tests/rules_golden.gd（Godot を画面なしで動かして比べる）。
//
// 新しい照合（suite）の足し方:
//   1) このファイルで SUITES['名前'] = () => [ {in:[...], out: 元の JS の戻り値}, ... ] を足す（乱数は rnd() を使う）。
//   2) rules_golden.gd の SUITES の表に、同じ名前で「入力の配列を受けて値を返す」関数を足す。
//   戻り値は JSON にできる形（数・文字・真偽・配列・辞書）。Godot 側は数を 1e-6 の許容差で比べる。
//
// calc_stats は stats.js の calcStats() をそのまま呼ぶ。stats.js は画面や通信の「入れ物」（ports.js）を通して外を使うので、
// 起動前に wirePorts で最小のダミー（state・view・screen）を差し込んでいる。元の式には手を入れない。
import fs from 'node:fs';
import { wirePorts, state } from '../../../public/js/game/ports.js';
import * as D from '../../../public/shared/data.js';
import * as A from '../../../public/shared/areas.js';
import * as ST from '../../../public/js/game/stats.js';
import * as S0 from '../../../public/js/game/state.js';
import { registerWeaponFx } from '../../../public/js/game/weapon-fx.js';
import { WEAPON_DEFS } from '../../../public/js/weapons/index.js';
import { WTREES, wtLearn, wtChoose, profOf } from '../../../public/js/weapon-tree.js';
import { TREES } from '../../../public/js/skills.js';

// 種を固定した乱数（mulberry32）
let seed = 20261021;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));          // a〜b の整数
const rr = (a, b) => a + rnd() * (b - a);                          // a〜b の実数
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const N = 240;

const SUITES = {};

// areas.js collide: 屋外（輪郭と障害物のそば）、屋内（壁と扉。開閉の両方）
SUITES.collide = () => {
  const out = [];
  for (const id of ['f1_field', 'f1_town', 'f1_dun']) {
    const def = A.AREAS[id];
    for (let i = 0; i < N; i++) {
      const rad = pick([0.5, 0.5, 0.3, 0.8, rr(0.2, 1.2)]);
      let x, z;
      if (def.shape === 'open') {
        const mode = i % 4, R = A.maxR(def);
        if (mode === 0) { const a = rr(0, Math.PI * 2), r = Math.sqrt(rnd()) * R * 1.1; x = Math.sin(a) * r; z = -Math.cos(a) * r; }   // 全域（輪郭の外も）
        else if (mode === 1) { const a = rr(0, Math.PI * 2), r = A.boundR(def, a) + rr(-3, 2); x = Math.sin(a) * r; z = -Math.cos(a) * r; }   // 輪郭のそば
        else { const ob = pick(A.obstaclesOf(def).filter((o) => o.solid)); const a = rr(0, Math.PI * 2), r = ob.r + rr(-0.5, 1.5); x = ob.x + Math.cos(a) * r; z = ob.z + Math.sin(a) * r; }   // 障害物のそば
      } else {
        const g = A.grid(def), c = ri(0, g.W - 1), r = ri(0, g.H - 1);
        x = (c - g.W / 2 + rnd()) * A.CELL + (rnd() < 0.5 ? rr(-1, 1) : 0); z = (r - g.H / 2 + rnd()) * A.CELL + (rnd() < 0.5 ? rr(-1, 1) : 0);   // 壁のそば・壁の中も
      }
      const door = rnd() < 0.5;
      const q = A.collide(def, x, z, rad, door);
      out.push({ in: [id, x, z, rad, door], out: [q.x, q.z] });
    }
  }
  return out;
};

// data.js inShape: circle・ring・cone・line
SUITES.in_shape = () => {
  const out = [];
  for (let i = 0; i < N; i++) {
    const k = ['circle', 'ring', 'cone', 'line'][i % 4];
    const s = { k, x: rr(-10, 10), z: rr(-10, 10) };
    if (k === 'circle') s.r = rr(1, 8);
    if (k === 'ring') { s.r0 = rr(1, 5); s.r1 = s.r0 + rr(0.5, 5); }
    if (k === 'cone') { s.len = rr(2, 12); s.a = rr(-Math.PI, Math.PI); s.arc = rr(0.3, Math.PI * 1.5); }
    if (k === 'line') { s.len = rr(3, 15); s.a = rr(-Math.PI, Math.PI); s.w = rr(0.5, 4); }
    const near = rnd() < 0.6;   // 形のそば（内外の境目）を多めに
    const x = near ? s.x + rr(-8, 8) : rr(-20, 20), z = near ? s.z + rr(-8, 8) : rr(-20, 20);
    const pad = rnd() < 0.3 ? 0.4 : rr(0, 1.5);
    out.push({ in: [s, x, z, pad], out: D.inShape(s, x, z, pad) });
  }
  return out;
};

// areas.js boundR（屋外のエリアだけ）
SUITES.bound_r = () => {
  const out = [];
  for (const id of ['f1_field', 'f1_town']) for (let i = 0; i < N; i++) {
    const a = i < 8 ? i * Math.PI / 4 - Math.PI : rr(-Math.PI, Math.PI);
    out.push({ in: [id, a], out: A.boundR(A.AREAS[id], a) });
  }
  return out;
};

// data.js angDiff
SUITES.ang_diff = () => {
  const out = [];
  for (let i = 0; i < N; i++) {
    const a = rr(-12, 12), b = rr(-12, 12);
    out.push({ in: [a, b], out: D.angDiff(a, b) });
  }
  return out;
};

// data.js xpToNext
SUITES.xp_to_next = () => {
  const out = [];
  for (let i = 0; i < N; i++) { const lv = (i % D.MAX_LEVEL) + 1; out.push({ in: [lv], out: D.xpToNext(lv) }); }
  return out;
};

// stats.js calcStats（装備の基礎値・強化・付加効果・防具の基本効果・重さ。ツリー・称号なし）
wirePorts({ state: { char: null, me: { hp: 1e9, buffs: [] }, CHARGE_MAX: S0.CHARGE_MAX, DODGE_CD: S0.DODGE_CD }, view: { weaponStyle: () => null, armorLook: () => null, setPlayerWeapon() {}, setPlayerArmor() {} }, screen: { ui: { refresh() {} } } });
const AFFIX_KEYS = Object.keys(D.AFFIXES);
const mkAffixes = () => Array.from({ length: ri(0, 4) }, () => [pick(AFFIX_KEYS), ri(1, D.AFFIXES.atkp.tiers.length)]);
const mkItem = (slot) => {
  const it = { slot, rarity: ri(0, 7), ilvl: ri(1, 50), enh: ri(0, 15), affixes: mkAffixes() };
  if (rnd() < 0.5) it.atk = ri(1, 400);
  if (slot === 'weapon') { it.kind = pick(Object.keys(D.WEAPONS)); it.skill = 'retreat'; }
  if (slot === 'armor') {
    it.armor = pick(Object.keys(D.ARMOR_CLASSES)); it.hp = ri(0, 800); it.def = ri(0, 30);
    if (rnd() < 0.6) it.base = [pick(['def', 'hpp', 'dodgecd', 'aspd', 'move']), ri(1, 12)];
  }
  if (slot === 'acc') { it.atk = ri(0, 100); it.hp = ri(0, 300); }
  if (rnd() < 0.15) it.weight = rr(0, 10);
  return it;
};
SUITES.calc_stats = () => {
  const out = [];
  for (let i = 0; i < N; i++) {
    const eq = {};
    if (rnd() < 0.85) eq.weapon = mkItem('weapon');
    if (rnd() < 0.8) eq.armor = mkItem('armor');
    if (rnd() < 0.7) eq.acc = mkItem('acc');
    const ch = { lv: ri(1, D.MAX_LEVEL), eq, potBonus: 0, skills: {}, tree: {}, wtree: {} };
    state.char = JSON.parse(JSON.stringify(ch));
    ST.calcStats();
    const S = ST.S;
    const o = { wk: S.wk, atk: S.atk, mhp: S.mhp, def: S.def, crit: S.crit, critd: S.critd, aspd: S.aspd, move: S.move, vamp: S.vamp, cdr: S.cdr,
      normp: S.normp, heavyp: S.heavyp, wskillp: S.wskillp, maxPot: S.maxPot, dodgeCd: S.dodgeCd, roll: S.wc.roll, wr: S.wr, weight: S.weight };
    out.push({ in: [ch], out: o });
  }
  return out;
};

// stats.js calcStats（G1-3b）: 武器ツリー（wtEffects の mods）・旧ツリー（treeEffects）・称号・fxCall('stats') まで。
// 全武器の効果（weapons/*.js の effects）を登録した状態（元のゲームと同じ）で回す。片手剣・大剣の場面で、ほかの武器の 'stats' が値を変えないことの確認を兼ねる。
// 効果が使う道具（api）は 'stats' / 'afterStats' に要らないので、何もしない代用品にする（register と player だけ本物）
{
  const nop = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : nop), apply: () => undefined });
  const api = { player: { me: state.me, get S() { return ST.S; }, weaponColor: () => 0xffffff, addBuff: ST.addBuff, hasBuff: ST.hasBuff, heal() {}, setHitStop() {} },
    field: nop, attack: nop, tree: nop, show: nop, party: nop, register: registerWeaponFx };
  for (const d of WEAPON_DEFS) d.effects?.(api);
}
const TITLE_IDS = Object.keys(D.TITLES);
const FX_POOL = ['skillcrit', 'thunder', 'flame', 'vamp', 'wave', 'star', 'quake', 'execute'];
SUITES.calc_stats_tree = () => {
  const out = [];
  for (let i = 0; i < N; i++) {
    const wk = i % 2 ? 'greatsword' : 'sword';
    const weapon = { slot: 'weapon', kind: wk, rarity: ri(0, 7), ilvl: ri(1, 50), enh: ri(0, 15), affixes: mkAffixes(), skill: pick(D.WEAPON_SKILL_POOL[wk]), atk: ri(1, 400) };
    if (rnd() < 0.3) weapon.fx = [pick(FX_POOL), ...(rnd() < 0.3 ? [pick(FX_POOL)] : [])];
    const eq = { weapon };
    if (rnd() < 0.8) eq.armor = mkItem('armor');
    if (rnd() < 0.7) eq.acc = mkItem('acc');
    if (i % 3 !== 0) { // 称号あり（条件に合わない・固有効果つきも混ぜる）
      const id = pick(TITLE_IDS), T = D.TITLES[id];
      eq.title = { slot: 'title', kind: null, rarity: T.rarity, ilvl: 1, affixes: [], enh: 0, v: 3, weight: 0, name: T.name, title: id, req: T.req || (rnd() < 0.15 ? wk : null) };
      if (rnd() < 0.4) eq.title.fx = [pick(FX_POOL)];
    }
    // 旧ツリー（stat・style）: ノードをランダムな段階まで
    const tree = {};
    for (const t of Object.values(TREES)) for (const n of t.nodes) if (rnd() < 0.5) tree[n.id] = ri(1, n.max);
    const ch = { lv: ri(1, D.MAX_LEVEL), eq, potBonus: pick([0, 0, 1, 2]), skills: {}, tree, wtree: {}, prof: {}, wt: {}, slots: [null, null] };
    // 武器ツリー: クラス・マスター・スキル・パッシブ（段階・分岐つき）をランダムに
    if (i % 5 !== 4) {
      profOf(ch, wk).lv = 20;
      const all = WTREES[wk].rows.flatMap((r) => r.nodes.map((n) => ({ ...n, kind: r.kind })));
      const k1 = pick(all.filter((n) => n.kind === 'ks1'));
      wtLearn(ch, k1.id);
      if (rnd() < 0.8) wtLearn(ch, pick(all.filter((n) => n.kind === 'ks2' && n.from === k1.id)).id);
      for (const n of all) if ((n.kind === 'skill' || n.kind === 'passive') && rnd() < 0.5) { const lv = ri(1, 3); for (let j = 0; j < lv; j++) wtLearn(ch, n.id); if (lv === 3) wtChoose(ch, n.id, pick(['A', 'B'])); }
    }
    state.char = JSON.parse(JSON.stringify(ch));
    ST.calcStats();
    const S = ST.S;
    // 数・真偽・文字と Set（並べた配列）だけを比べる
    const o = {};
    for (const [k, v] of Object.entries(S)) {
      if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') o[k] = v;
      else if (v instanceof Set) o[k] = [...v].sort();
    }
    o.roll = S.wc.roll;
    out.push({ in: [ch], out: o });
  }
  return out;
};

const suites = {};
let total = 0;
for (const [name, f] of Object.entries(SUITES)) { suites[name] = f(); total += suites[name].length; console.log(`${name}: ${suites[name].length} 件`); }
fs.writeFileSync(new URL('../../../godot/worldart/data/rules_golden.json', import.meta.url), JSON.stringify({ suites }));
console.log(`-> godot/worldart/data/rules_golden.json 合計 ${total} 件`);
