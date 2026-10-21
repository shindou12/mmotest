import { CRAFT_MAX_TIER, ENH_MAX, ENH_RATE, RARITIES, affixCost, affixName, affixVal, enhCost, gradeItem, isLegend, isVariant, loreCost, loreTitle, salvageMats, salvageValue, skillCost, transcendCount, weightedTier } from '../../shared/data.js';
import { NODE_INDEX, WEAPON_SKILLS, canLearn } from '../skills.js';
import { clamp, now, rnd } from './util.js';
import { field, rules, screen, state, stats, view } from './ports.js';

// ======================================================================
// 装備・スキルツリー・設定の操作（画面の描画は ui/app.js の Presenter）
// ======================================================================
export function findItem(id) { return state.char.inv.find((i) => i.id === id) || Object.values(state.char.eq).find((i) => i && i.id === id); }
export function equip(id) {
  const it = state.char.inv.find((i) => i.id === id);
  if (!it) return;
  const idx = state.char.inv.indexOf(it);
  const old = state.char.eq[it.slot];
  state.char.inv.splice(idx, 1);
  if (old) state.char.inv.splice(idx, 0, old);
  state.char.eq[it.slot] = it;
  view.audio.sfx('equip');
  stats.calcStats(); state.saveChar();
}
// 装備を外す（武器は外せない）
export function unequip(slot) {
  if (slot === 'weapon' || !state.char.eq[slot]) return;
  if (state.char.inv.length >= 60) { screen.toast('インベントリがいっぱいです', '#f88'); return; }
  state.char.inv.unshift(state.char.eq[slot]);
  state.char.eq[slot] = null;
  view.audio.sfx('equip');
  stats.calcStats(); state.saveChar();
}
export let salvageArm = null;
export function salvage(id) {
  const it = state.char.inv.find((i) => i.id === id);
  if (!it) return;
  if (it.slot === 'title') { screen.toast('称号は分解できません', '#f99'); return; }
  // 伝説以上は2回右クリックで分解（誤操作防止）
  if (it.rarity >= 5 && (salvageArm?.id !== it.id || now() - salvageArm.t > 2)) {
    salvageArm = { id: it.id, t: now() };
    screen.toast(`もう一度右クリックで「${it.name}」を分解`, RARITIES[it.rarity].color);
    return;
  }
  state.char.inv.splice(state.char.inv.indexOf(it), 1);
  salvageGold(salvageValue(it));
  harvest(it);
  state.saveChar(); screen.ui.refresh();
}
// 分解の対象: バーで選んだレア度以下。称号・★付き（超越の特性つき）・伝説以上は対象外
export function salvageTarget(it) {
  const lim = state.char.autoSalvage ?? -1;
  return lim >= 0 && it.slot !== 'title' && it.rarity <= lim && !isLegend(it.rarity) && transcendCount(it) === 0;
}
export function setAutoSalvage(v) {
  state.char.autoSalvage = clamp(Math.round(v), -1, 4);
  state.saveChar(); screen.ui.refresh();
}
// 自動分解: 落とし物の代わりに、硬貨と強化の欠片が飛び出す
export const SHARD_COLOR = 0x8ae8ff;
export function spawnSalvaged(it, x, z, src, delay) {
  setTimeout(() => {
    const ox = src?.x ?? x, oz = src?.z ?? z;
    rules.spawnGold(salvageValue(it), ox, oz);
    const model = view.makeShard();
    model.position.set(ox, 1 + view.fx.ground(ox, oz), oz);
    view.scene.add(model);
    const a = Math.atan2(x - ox, z - oz) + rnd(-0.3, 0.3), sp = Math.max(1.5, Math.hypot(x - ox, z - oz) * 1.6);
    rules.coins.push({ mat: it, model, value: 0, x: ox, z: oz, y: 1.0 + view.fx.ground(ox, oz), vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: rnd(6, 8), t: 0, spin: rnd(4, 8), bounces: 0 });
    if (Math.hypot(ox - state.me.x, oz - state.me.z) < 30) view.audio.sfx('shard', { drop: true });
  }, delay * 1000);
}
export function salvageCommon() {
  const junk = state.char.inv.filter(salvageTarget);
  if (!junk.length) return;
  state.char.inv = state.char.inv.filter((i) => !junk.includes(i));
  salvageGold(junk.reduce((a, i) => a + salvageValue(i), 0));
  for (const it of junk) harvest(it);
  screen.toast(`${junk.length}個を分解した`, '#ffd84a');
  state.saveChar(); screen.ui.refresh();
}
// 分解で素材を得る: 強化の欠片と、特性ごとの宝石。特性リストに記録（鍛冶屋で付けられるようになる）
export function harvest(it) {
  const M = salvageMats(it);
  state.char.mats.shard = (state.char.mats.shard || 0) + M.shard;
  for (const [key, tier] of M.gems) {
    state.char.mats.gems[key] = (state.char.mats.gems[key] || 0) + 1;
    const before = state.char.codex[key] || 0;
    if (tier > before) {
      state.char.codex[key] = tier;
      screen.toast(`特性リストに追加：${affixName(key)}（${before ? `T${before} → ` : ''}T${tier} まで付与可能）`, '#c8a0ff', true);
    }
  }
}
// 分解したゴールドは足元から噴き出して、そのまま吸い寄せられる
export function salvageGold(n) {
  view.audio.sfx('equip');
  if (!state.started || state.me.dead) { rules.addGold(n); return; }
  rules.spawnGold(n, state.me.x, state.me.z, n >= 300);
}

export function learn(id) {
  if (!canLearn(state.char, id)) { view.audio.sfx('ui'); return; }
  state.char.tree[id] = (state.char.tree[id] || 0) + 1;
  const n = NODE_INDEX[id];
  if (n.active) {
    state.char.slots = state.char.slots || [null, null];
    const empty = state.char.slots.indexOf(null);
    if (empty >= 0 && !state.char.slots.includes(n.active)) state.char.slots[empty] = n.active;
  }
  view.audio.sfx('levelup');
  stats.calcStats(); state.saveChar();
}
export function setSlot(i, skill) {
  const learnedNew = Object.values(state.char.wt || {}).some((st) => st.lv[skill] > 0); // 新しい武器ツリーのスキル
  if (!skill || (i !== 0 && i !== 1) || (!learnedNew && !Object.entries(state.char.tree).some(([id,rank])=>rank>0&&NODE_INDEX[id]?.active===skill))) return;
  state.char.slots = state.char.slots || [null, null];
  const other = state.char.slots.indexOf(skill);
  if (other >= 0) state.char.slots[other] = null;
  state.char.slots[i] = skill;
  view.audio.sfx('equip'); state.saveChar(); screen.ui.refresh();
}
// 右クリック: 共通ツリーのノードを1ポイントだけ戻す（全部の振り直しと同じく無料）。上の段の前提が崩れるときは戻せない
export function refundNode(id) {
  const n = NODE_INDEX[id], tree = state.char.tree || {};
  if (!n || !(tree[id] > 0)) { view.audio.sfx('ui'); return; }
  const after = { ...tree, [id]: tree[id] - 1 };
  const nodes = Object.keys(after).filter((k) => after[k] > 0 && NODE_INDEX[k]?.tree === n.tree);
  const below = (tier) => nodes.reduce((a, k) => a + (NODE_INDEX[k].tier < tier ? after[k] : 0), 0);
  if (nodes.some((k) => NODE_INDEX[k].tier > 0 && below(NODE_INDEX[k].tier) < NODE_INDEX[k].tier * 2)) {
    screen.toast('上の段のノードの前提になっているため戻せません', '#f88'); view.audio.sfx('ui'); return;
  }
  if (after[id] <= 0) { delete after[id]; if (n.active) state.char.slots = (state.char.slots || [null, null]).map((s) => (s === n.active ? null : s)); }
  state.char.tree = after;
  view.audio.sfx('ui'); stats.calcStats(); state.saveChar();
  screen.toast(`${n.name}を1ポイント戻しました`, '#9fe');
}
export function resetTree() {
  state.char.tree = {}; state.char.slots = [null, null];
  view.audio.sfx('ui'); stats.calcStats(); state.saveChar();
  screen.toast('スキルポイントを振り直しました', '#9fe');
}
// ======================================================================
// 鍛冶屋: 強化 / 特性変更 / スキル変更 / 伝承化。結果は { ok, msg, ... } で返し、画面側が表示する
// ======================================================================
export const fail = (msg) => { view.audio.sfx('ui'); return { ok: false, msg }; };
export function payGold(cost) {
  if ((state.char.gold || 0) < (cost.gold || 0)) return 'ゴールドが足りません';
  if ((state.char.mats.shard || 0) < (cost.shard || 0)) return '強化の欠片が足りません';
  if (cost.gemKey && (state.char.mats.gems[cost.gemKey] || 0) < (cost.gem || 0)) return '宝石が足りません';
  state.char.gold -= cost.gold || 0;
  state.char.mats.shard -= cost.shard || 0;
  if (cost.gemKey) state.char.mats.gems[cost.gemKey] -= cost.gem || 0;
  return null;
}
export function smithEnhance(id) {
  const it = findItem(id);
  if (!it || it.slot === 'title') return fail('強化できない装備です');
  if ((it.enh || 0) >= ENH_MAX) return fail('これ以上は強化できません');
  const err = payGold(enhCost(it));
  if (err) return fail(err);
  const rate = ENH_RATE[it.enh || 0];
  const ok = Math.random() < rate;
  let up = '';
  if (ok) {
    it.enh = (it.enh || 0) + 1;
    up = regrade(it);
    view.audio.sfx(it.enh >= 6 ? 'perfect' : 'levelup');
    view.fx.beam(state.me.x, state.me.z, it.enh >= 6 ? 0xffa236 : 0xffd84a, 10, 0.6, 0.8);
  } else view.audio.sfx('block');
  stats.calcStats(); state.saveChar();
  return { ok, msg: ok ? `+${it.enh} に強化した！${up}` : `強化に失敗した…（+${it.enh || 0} のまま）`, enh: it.enh };
}
// 鍛冶屋で手を加えたら出来を測り直す。レアリティが変わったら知らせる
export function regrade(it) {
  const before = it.rarity;
  gradeItem(it);
  if (it.rarity === before) return '';
  const msg = `「${RARITIES[before].name}」から「${RARITIES[it.rarity].name}」に${it.rarity > before ? '上がった' : '下がった'}`;
  screen.toast(`${it.name}：${msg}`, RARITIES[it.rarity].color, it.rarity > before);
  return `（${msg}）`;
}
export function smithAffix(id, idx, key) {
  const it = findItem(id);
  if (!it || !it.affixes[idx]) return fail('特性を選んでください');
  if (!state.char.codex[key]) return fail('まだ特性リストにない特性です（その特性の付いた装備を分解すると追加されます）');
  if (it.affixes.some((a, i) => i !== idx && a[0] === key)) return fail('同じ特性はひとつの装備に1つまでです');
  if (isVariant(key) && (it.slot !== 'weapon' || it.affixes.some((a, i) => i !== idx && isVariant(a[0])))) return fail('スキル変化は武器に1つまでです');
  const err = payGold({ ...affixCost(it), gemKey: key });
  if (err) return fail(err);
  const tier = weightedTier(Math.min(state.char.codex[key], CRAFT_MAX_TIER), false);
  it.affixes[idx] = [key, tier, affixVal(key, tier)];
  const up = regrade(it);
  view.audio.sfx('buff'); view.fx.ringWave(state.me.x, state.me.z, 0xc8a0ff, 3, 0.4);
  stats.calcStats(); state.saveChar();
  return { ok: true, msg: `${affixName(key)} T${tier} を付与した${up}`, tier };
}
export function smithSkill(id, skillId) {
  const it = findItem(id);
  if (!it || it.slot !== 'weapon' || WEAPON_SKILLS[skillId]?.kind !== it.kind) return fail('変更できないスキルです');
  if (it.skill === skillId) return fail('すでにそのスキルです');
  const err = payGold(skillCost(it));
  if (err) return fail(err);
  it.skill = skillId;
  view.audio.sfx('skill');
  stats.calcStats(); state.saveChar();
  return { ok: true, msg: `武器スキルを「${WEAPON_SKILLS[skillId].name}」に変えた` };
}
export function smithLore(id) {
  const it = findItem(id);
  if (!it || !isLegend(it.rarity) || !it.fx?.length || it.slot === 'title') return fail('伝説・神器の装備だけが伝承化できます');
  const err = payGold(loreCost(it));
  if (err) return fail(err);
  const t = loreTitle(it);
  const i = state.char.inv.indexOf(it);
  if (i >= 0) state.char.inv.splice(i, 1); else for (const k of Object.keys(state.char.eq)) if (state.char.eq[k] === it) state.char.eq[k] = null;
  state.char.inv.unshift(t);
  screen.banner('伝承化', t.name, RARITIES[t.rarity].color, 3);
  view.audio.sfx('clear'); view.fx.beam(state.me.x, state.me.z, 0xffa236, 16, 1, 1.4);
  stats.calcStats(); state.saveChar();
  return { ok: true, msg: `${t.name} を手に入れた`, id: t.id };
}

export function setSetting(k, v) {
  state.settings[k] = v;
  state.saveSettings();
  if (['master', 'music', 'sfx', 'amb'].includes(k)) view.audio.setVolumes(state.settings);
  if (k === 'quality') { view.applyQuality(); if (state.started) field.buildEnv(state.world.area); }
  if (k === 'fx') view.applyFxStyle();
}
