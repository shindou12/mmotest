import { CRAFT_MAX_TIER, ENH_MAX, ENH_RATE, RARITIES, affixCost, affixName, affixVal, enhCost, gradeItem, isLegend, isVariant, loreCost, loreTitle, salvageMats, salvageValue, skillCost, transcendCount, weightedTier } from '../../shared/data.js';
import { makeShard } from '../models.js';
import { NODE_INDEX, WEAPON_SKILLS, canLearn } from '../skills.js';
import { clamp, now, rnd } from './util.js';
import { banner, toast, ui } from './ui-bridge.js';
import { char, saveChar, saveSettings, settings } from './save.js';
import { applyQuality, audio, fx, scene } from './render.js';
import { me, started, world } from './state.js';
import { calcStats } from './stats.js';
import { buildEnv } from './area.js';
import { addGold, coins, spawnGold } from './loot.js';

// ======================================================================
// 装備・スキルツリー・設定の操作（画面の描画は ui/app.js の Presenter）
// ======================================================================
export function findItem(id) { return char.inv.find((i) => i.id === id) || Object.values(char.eq).find((i) => i && i.id === id); }
export function equip(id) {
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
// 装備を外す（武器は外せない）
export function unequip(slot) {
  if (slot === 'weapon' || !char.eq[slot]) return;
  if (char.inv.length >= 60) { toast('インベントリがいっぱいです', '#f88'); return; }
  char.inv.unshift(char.eq[slot]);
  char.eq[slot] = null;
  audio.sfx('equip');
  calcStats(); saveChar();
}
export let salvageArm = null;
export function salvage(id) {
  const it = char.inv.find((i) => i.id === id);
  if (!it) return;
  if (it.slot === 'title') { toast('称号は分解できません', '#f99'); return; }
  // 伝説以上は2回右クリックで分解（誤操作防止）
  if (it.rarity >= 5 && (salvageArm?.id !== it.id || now() - salvageArm.t > 2)) {
    salvageArm = { id: it.id, t: now() };
    toast(`もう一度右クリックで「${it.name}」を分解`, RARITIES[it.rarity].color);
    return;
  }
  char.inv.splice(char.inv.indexOf(it), 1);
  salvageGold(salvageValue(it));
  harvest(it);
  saveChar(); ui.refresh();
}
// 分解の対象: バーで選んだレア度以下。称号・★付き（超越の特性つき）・伝説以上は対象外
export function salvageTarget(it) {
  const lim = char.autoSalvage ?? -1;
  return lim >= 0 && it.slot !== 'title' && it.rarity <= lim && !isLegend(it.rarity) && transcendCount(it) === 0;
}
export function setAutoSalvage(v) {
  char.autoSalvage = clamp(Math.round(v), -1, 4);
  saveChar(); ui.refresh();
}
// 自動分解: 落とし物の代わりに、硬貨と強化の欠片が飛び出す
export const SHARD_COLOR = 0x8ae8ff;
export function spawnSalvaged(it, x, z, src, delay) {
  setTimeout(() => {
    const ox = src?.x ?? x, oz = src?.z ?? z;
    spawnGold(salvageValue(it), ox, oz);
    const model = makeShard();
    model.position.set(ox, 1, oz);
    scene.add(model);
    const a = Math.atan2(x - ox, z - oz) + rnd(-0.3, 0.3), sp = Math.max(1.5, Math.hypot(x - ox, z - oz) * 1.6);
    coins.push({ mat: it, model, value: 0, x: ox, z: oz, y: 1.0, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: rnd(6, 8), t: 0, spin: rnd(4, 8), bounces: 0 });
    if (Math.hypot(ox - me.x, oz - me.z) < 30) audio.sfx('shard', { drop: true });
  }, delay * 1000);
}
export function salvageCommon() {
  const junk = char.inv.filter(salvageTarget);
  if (!junk.length) return;
  char.inv = char.inv.filter((i) => !junk.includes(i));
  salvageGold(junk.reduce((a, i) => a + salvageValue(i), 0));
  for (const it of junk) harvest(it);
  toast(`${junk.length}個を分解した`, '#ffd84a');
  saveChar(); ui.refresh();
}
// 分解で素材を得る: 強化の欠片と、特性ごとの宝石。特性リストに記録（鍛冶屋で付けられるようになる）
export function harvest(it) {
  const M = salvageMats(it);
  char.mats.shard = (char.mats.shard || 0) + M.shard;
  for (const [key, tier] of M.gems) {
    char.mats.gems[key] = (char.mats.gems[key] || 0) + 1;
    const before = char.codex[key] || 0;
    if (tier > before) {
      char.codex[key] = tier;
      toast(`特性リストに追加：${affixName(key)}（${before ? `T${before} → ` : ''}T${tier} まで付与可能）`, '#c8a0ff', true);
    }
  }
}
// 分解したゴールドは足元から噴き出して、そのまま吸い寄せられる
export function salvageGold(n) {
  audio.sfx('equip');
  if (!started || me.dead) { addGold(n); return; }
  spawnGold(n, me.x, me.z, n >= 300);
}

export function learn(id) {
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
export function setSlot(i, skill) {
  const learnedNew = Object.values(char.wt || {}).some((st) => st.lv[skill] > 0); // 新しい武器ツリーのスキル
  if (!skill || (i !== 0 && i !== 1) || (!learnedNew && !Object.entries(char.tree).some(([id,rank])=>rank>0&&NODE_INDEX[id]?.active===skill))) return;
  char.slots = char.slots || [null, null];
  const other = char.slots.indexOf(skill);
  if (other >= 0) char.slots[other] = null;
  char.slots[i] = skill;
  audio.sfx('equip'); saveChar(); ui.refresh();
}
export function resetTree() {
  char.tree = {}; char.slots = [null, null];
  audio.sfx('ui'); calcStats(); saveChar();
  toast('スキルポイントを振り直しました', '#9fe');
}
// ======================================================================
// 鍛冶屋: 強化 / 特性変更 / スキル変更 / 伝承化。結果は { ok, msg, ... } で返し、画面側が表示する
// ======================================================================
export const fail = (msg) => { audio.sfx('ui'); return { ok: false, msg }; };
export function pay(cost) {
  if ((char.gold || 0) < (cost.gold || 0)) return 'ゴールドが足りません';
  if ((char.mats.shard || 0) < (cost.shard || 0)) return '強化の欠片が足りません';
  if (cost.gemKey && (char.mats.gems[cost.gemKey] || 0) < (cost.gem || 0)) return '宝石が足りません';
  char.gold -= cost.gold || 0;
  char.mats.shard -= cost.shard || 0;
  if (cost.gemKey) char.mats.gems[cost.gemKey] -= cost.gem || 0;
  return null;
}
export function smithEnhance(id) {
  const it = findItem(id);
  if (!it || it.slot === 'title') return fail('強化できない装備です');
  if ((it.enh || 0) >= ENH_MAX) return fail('これ以上は強化できません');
  const err = pay(enhCost(it));
  if (err) return fail(err);
  const rate = ENH_RATE[it.enh || 0];
  const ok = Math.random() < rate;
  let up = '';
  if (ok) {
    it.enh = (it.enh || 0) + 1;
    up = regrade(it);
    audio.sfx(it.enh >= 6 ? 'perfect' : 'levelup');
    fx.beam(me.x, me.z, it.enh >= 6 ? 0xffa236 : 0xffd84a, 10, 0.6, 0.8);
  } else audio.sfx('block');
  calcStats(); saveChar();
  return { ok, msg: ok ? `+${it.enh} に強化した！${up}` : `強化に失敗した…（+${it.enh || 0} のまま）`, enh: it.enh };
}
// 鍛冶屋で手を加えたら出来を測り直す。レアリティが変わったら知らせる
export function regrade(it) {
  const before = it.rarity;
  gradeItem(it);
  if (it.rarity === before) return '';
  const msg = `「${RARITIES[before].name}」から「${RARITIES[it.rarity].name}」に${it.rarity > before ? '上がった' : '下がった'}`;
  toast(`${it.name}：${msg}`, RARITIES[it.rarity].color, it.rarity > before);
  return `（${msg}）`;
}
export function smithAffix(id, idx, key) {
  const it = findItem(id);
  if (!it || !it.affixes[idx]) return fail('特性を選んでください');
  if (!char.codex[key]) return fail('まだ特性リストにない特性です（その特性の付いた装備を分解すると追加されます）');
  if (it.affixes.some((a, i) => i !== idx && a[0] === key)) return fail('同じ特性はひとつの装備に1つまでです');
  if (isVariant(key) && (it.slot !== 'weapon' || it.affixes.some((a, i) => i !== idx && isVariant(a[0])))) return fail('スキル変化は武器に1つまでです');
  const err = pay({ ...affixCost(it), gemKey: key });
  if (err) return fail(err);
  const tier = weightedTier(Math.min(char.codex[key], CRAFT_MAX_TIER), false);
  it.affixes[idx] = [key, tier, affixVal(key, tier)];
  const up = regrade(it);
  audio.sfx('buff'); fx.ringWave(me.x, me.z, 0xc8a0ff, 3, 0.4);
  calcStats(); saveChar();
  return { ok: true, msg: `${affixName(key)} T${tier} を付与した${up}`, tier };
}
export function smithSkill(id, skillId) {
  const it = findItem(id);
  if (!it || it.slot !== 'weapon' || WEAPON_SKILLS[skillId]?.kind !== it.kind) return fail('変更できないスキルです');
  if (it.skill === skillId) return fail('すでにそのスキルです');
  const err = pay(skillCost(it));
  if (err) return fail(err);
  it.skill = skillId;
  audio.sfx('skill');
  calcStats(); saveChar();
  return { ok: true, msg: `武器スキルを「${WEAPON_SKILLS[skillId].name}」に変えた` };
}
export function smithLore(id) {
  const it = findItem(id);
  if (!it || !isLegend(it.rarity) || !it.fx?.length || it.slot === 'title') return fail('伝説・神器の装備だけが伝承化できます');
  const err = pay(loreCost(it));
  if (err) return fail(err);
  const t = loreTitle(it);
  const i = char.inv.indexOf(it);
  if (i >= 0) char.inv.splice(i, 1); else for (const k of Object.keys(char.eq)) if (char.eq[k] === it) char.eq[k] = null;
  char.inv.unshift(t);
  banner('伝承化', t.name, RARITIES[t.rarity].color, 3);
  audio.sfx('clear'); fx.beam(me.x, me.z, 0xffa236, 16, 1, 1.4);
  calcStats(); saveChar();
  return { ok: true, msg: `${t.name} を手に入れた`, id: t.id };
}

export function setSetting(k, v) {
  settings[k] = v;
  saveSettings();
  if (['master', 'music', 'sfx', 'amb'].includes(k)) audio.setVolumes(settings);
  if (k === 'quality') { applyQuality(); if (started) buildEnv(world.area); }
}
