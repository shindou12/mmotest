import { INSTINCT, SKILL_VARIANTS, WEAPONS, WEAPON_SKILL_POOL, affixVal, baseAtk, baseHp, enhMult, isVariant, itemWeight, titleReqOk, weightClass } from '../../shared/data.js';
import { armorLook, setPlayerArmor, setPlayerWeapon, weaponStyle } from '../models.js';
import { WEAPON_SKILLS, treeEffects } from '../skills.js';
import { wtEffects } from '../weapon-tree.js';
import { ui } from './ui-bridge.js';
import { char } from './save.js';
import { audio, fx } from './render.js';
import { CHARGE_MAX, DODGE_CD, me } from './state.js';
import { setMom } from './tree-effects.js';

// ======================================================================
// バフ
// ======================================================================
export let S = null; // 計算済みステータス
export function addBuff(id, label, sec, mods, color) {
  me.buffs = me.buffs.filter((b) => b.id !== id);
  me.buffs.push({ id, label, t: sec, max: sec, mods, color });
  audio.sfx('buff');
  fx.parts.burst(me.x, 1, me.z, 30, { color, speed: 4, size: 0.4, life: 0.8, gravity: 3 });
  fx.ringWave(me.x, me.z, color, 3, 0.4);
}
export const hasBuff = (id) => me.buffs.some((b) => b.id === id);
export const buffMod = (k) => me.buffs.reduce((a, b) => a + (b.mods[k] || 0), 0);

// ======================================================================
// ステータス計算（装備 + スキルツリー + 重量）
// ======================================================================
export function weaponSkillId() {
  const w = char.eq.weapon;
  const kind = w ? w.kind : 'sword';
  const id = w?.skill;
  return id && WEAPON_SKILLS[id]?.kind === kind ? id : WEAPON_SKILL_POOL[kind][0];
}

export function calcStats() {
  const eq = char.eq;
  const items = [eq.weapon, eq.armor, eq.acc].filter(Boolean);
  const aff = {};
  let sv = null; // 武器のスキル変化
  for (const it of items) {
    for (const [k, t] of it.affixes) {
      if (isVariant(k)) { if (it.slot === 'weapon') sv = { key: k, t, ...SKILL_VARIANTS[k] }; continue; }
      aff[k] = (aff[k] || 0) + affixVal(k, t);
    }
  }
  // 防具の基本効果
  if (eq.armor?.base) { const [k, v] = eq.armor.base; aff[k] = (aff[k] || 0) + v; }
  const fxs = new Set(items.flatMap((i) => i.fx || []));
  const wk = eq.weapon ? eq.weapon.kind : 'sword';
  // 称号: 条件（近接のみ など）を満たすときだけ効く。同じ固有効果は重ならない（Set）
  const title = eq.title;
  const titleOn = !!title && titleReqOk(title.req, wk);
  const tfx = new Set();
  if (titleOn) { if (title.title) tfx.add(title.title); for (const f of title.fx || []) fxs.add(f); }
  const T = treeEffects(char, wk);
  const WT = wtEffects(char, wk); // 新しい武器ツリー（今は片手剣だけ）
  const m = (k) => (aff[k] || 0) + (T.mods[k] || 0) + (WT?.mods[k] || 0);
  for (const f of T.flags) fxs.add(f);
  // 強化値は基礎値（攻撃力・HP・被ダメ軽減）を伸ばす
  const base = (it, k) => (it?.[k] || 0) * enhMult(it);
  const atk = (baseAtk(char.lv) + base(eq.weapon, 'atk') + base(eq.acc, 'atk')) * (1 + m('atkp') / 100);
  const mhp = (baseHp(char.lv) + base(eq.armor, 'hp') + base(eq.acc, 'hp')) * (1 + m('hpp') / 100);
  const weight = items.reduce((a, it) => a + itemWeight(it), 0);
  const wc = weightClass(weight);
  const W = WEAPONS[wk];
  // 武器パッシブ
  const P = {
    heavy: 0, // 大剣・大斧の強攻撃アップは武器ツリー（溜めの心得・剛力の心得）に移った
    vamp: 0, // 大斧の回復は武器ツリー「血の心得」に移った
    def: 0, // 盾槍の被ダメージ-10%は武器ツリー「鉄壁の心得」に移った
    dodge: 1, // 短剣の回避クールタイム-25%は武器ツリー「身軽」に移った
    iframe: 0, // 片手剣の回避無敵は武器ツリーの「軽身」に移った
  };
  S = {
    wk, W, atk, mhp: Math.round(mhp), fx: fxs, flags: T.flags, actives: WT ? new Set([...T.actives, ...WT.actives]) : T.actives,
    wt: WT, guard: (!!W.guard && WT?.ks1 !== 'sp_dragoon') || WT?.ks1 === 'sw_guard',
    chargeMax: CHARGE_MAX * (WT?.ks1 === 'gt_blow' ? 1.25 : 1) * (WT?.br('gt_charge') === 'A' || WT?.br('bw_draw') === 'A' ? 0.8 : 1), dodgeDist: WT?.br('sw_light') === 'B' || WT?.br('dk_agile') === 'B' ? 1.3 : 1,
    // 短剣の連撃: 当てるたびに攻撃の速さ（連撃の心得・連刃）
    dStackPer: wk !== 'dagger' ? 0 : !WT ? 4 : WT.lv('dk_combo') ? WT.v('dk_combo', 'per') : WT.ks1 === 'dk_blades' ? 4 : 0,
    dStackMax: WT?.ks1 === 'dk_blades' ? 15 : 10, dStackT: (WT?.br('dk_combo') === 'A' ? 5 : 3) * (WT?.ks2 === 'dk_gale' ? 2 : 1),
    crit: 5 + m('crit'), critd: 150 + m('critd'), aspd: m('aspd'), move: m('move'),
    vamp: m('vamp') + (fxs.has('vamp') ? 4 : 0) + P.vamp, cdr: Math.min(60, m('cdr') + (fxs.has('star') ? 35 : 0)),
    // 生存本能: 近接武器は常に被ダメ軽減
    def: Math.min(65, m('def') + base(eq.armor, 'def') + P.def + (W.melee ? INSTINCT.dr : 0)), wr: eq.weapon ? eq.weapon.rarity : 0,
    sv, title, titleOn, tfx,
    normp: m('normp'), heavyp: m('heavyp') + P.heavy, wskillp: m('wskillp'), dodgecd: Math.min(60, m('dodgecd')),
    justbuff: m('justbuff'), counter: m('counter'), backwater: m('backwater'), maxPot: 3 + m('potion') + (char.potBonus || 0),
    ws: WEAPON_SKILLS[weaponSkillId()], weight, wc,
    dodgeCd: DODGE_CD * wc.cd * (1 - Math.min(60, m('dodgecd')) / 100) * P.dodge,
    iframeBonus: P.iframe + (WT ? WT.v('sw_light', 'iframe') : 0) + (WT?.br('bw_roll') === 'B' ? 0.1 : 0), stunp: m('stunp'),
    // 弓: 引かずに撃つ射程（張り弦 +4m）・最大射程（遠見の心得）・弓を引く速さ（速引き +30%）
    bowBase: (W.baseRange || 0) + (WT?.br('bw_zone') === 'A' ? 4 : 0), bowMax: (W.range || 0) + (WT ? WT.v('bw_zone', 'rng') : 0), bowDraw: (W.draw || 1) * (WT?.br('bw_draw') === 'A' ? 1.3 : 1),
  };
  if (W.ranged) S.chargeMax = Math.max(0.3, (S.bowMax - S.bowBase) / S.bowDraw); // 弓: 最大射程まで引いたら最大の溜め
  me.hp = Math.min(me.hp, S.mhp);
  if (S.wt?.ks1 !== 'sw_glad' && me.mom) setMom(0);
  S.wst = weaponStyle(eq.weapon);
  S.arm = armorLook(eq.armor);
  if (me.model) { setPlayerWeapon(me.model, S.wk, S.wr, S.wst); setPlayerArmor(me.model, S.arm); }
  ui?.refresh();
}

// 弓の射程: 引くほど足元の円が広がり（弓を引く速さ）、最大射程で止まる。引かずに撃つ矢は bowBase まで
export function bowRange() {
  if (!me.charging) return S.bowBase;
  return Math.min(S.bowMax, S.bowBase + S.bowDraw * me.chargeT);
}

export function itemPower(it) {
  if (!it) return 0;
  const e = enhMult(it);
  let p = (it.atk || 0) * 3 * e + (it.hp || 0) * 0.5 * e + (it.def || 0) * 4 * e;
  for (const [k, t] of it.affixes) p += isVariant(k) ? 40 + t * 10 : t * ((it.atk || 10) * 0.6 + 2);
  if (it.fx) p *= 1 + it.fx.length * 0.25;
  if (it.slot === 'title') p = 100 + it.rarity * 20;
  return Math.round(p);
}
