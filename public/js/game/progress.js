import { RARITIES, TITLES, TITLE_DROPS, floorLevel, makeItem, makeTitle } from '../../shared/data.js';
import { AREAS, CLEAR_KILLS, chestsOf, grid, worldToCell } from '../../shared/areas.js';
import { QUEST_INDEX, questAvailable, questProgress, questState } from '../quests.js';
import { esc, now, rnd } from './util.js';
import { banner, renderQuests, toast, ui } from './ui-bridge.js';
import { char, saveChar } from './save.js';
import { audio, fx } from './render.js';
import { me, npcs, world } from './state.js';
import { S, calcStats } from './stats.js';
import { refreshNpcMarks } from './area.js';
import { tf } from './variants.js';
import { gainXp } from './actions.js';
import { spawnDrop } from './loot.js';

// ======================================================================
// クエスト
// ======================================================================
export function questEvent(ev) {
  if (!char) return;
  const changed = questProgress(char, ev);
  for (const q of changed) {
    const st = questState(char, q.id);
    if (st.done) { toast(`クエスト達成：「${q.name}」 依頼人に報告しよう`, '#ffd84a', true); audio.sfx('clear'); }
    else toast(`${q.name} ${st.p} / ${q.n}`, '#bfe6ff');
  }
  if (changed.length) { saveChar(); renderQuests(); refreshNpcMarks(); }
}

// エリアの踏破（付きやすい特性がマップでわかるようになる）
export function countClear(ar, how) {
  const def = AREAS[ar];
  if (!def || !char || (!def.bias?.length && !def.kinds?.length)) return;
  char.areas = char.areas || {};
  const st = char.areas[ar] = char.areas[ar] || { k: 0, done: false };
  if (st.done) return;
  st.k++;
  const done = def.type === 'labyrinth' ? how === 'boss' : def.type === 'secret' ? how === 'named' : st.k >= CLEAR_KILLS;
  if (done) {
    st.done = true;
    toast(`${def.name} を踏破！ 出やすい装備と付きやすい特性がマップでわかるようになった`, '#9affc8', true);
    audio.sfx('clear');
  }
}

// 称号を手に入れる（同じ報酬称号は一度だけ）
export function grantTitle(id) {
  if (!char || char.titles[id] || !TITLES[id]) return;
  char.titles[id] = true;
  const it = makeTitle(id);
  char.inv.unshift(it);
  banner('称号を獲得', it.name, RARITIES[it.rarity].color, 3);
  toast(`称号${it.name}：${TITLES[id].desc}`, RARITIES[it.rarity].color, true);
  audio.sfx('clear');
  fx.beam(me.x, me.z, 0xffd84a, 14, 0.9, 1.2);
  saveChar(); ui.refresh();
}

// ドロップ限定の称号: 倒した敵に応じてまれに落ちる（持っていない称号だけ。同じものは二度と落ちない）
export function rollTitleDrop(m) {
  if (!char) return;
  const A = AREAS[m.ar];
  const k = { el: m.el | 0, boss: m.boss, weather: A?.shape === 'open' ? A.weather : null, type: A?.type };
  for (const d of TITLE_DROPS) {
    if (char.titles[d.id] || !d.when(k) || Math.random() >= d.chance) continue;
    char.titles[d.id] = true;
    const it = makeTitle(d.id);
    spawnDrop(it, me.x + rnd(-1.5, 1.5), me.z + rnd(1, 2.5)); // 通知は拾ったときに出る
    saveChar();
    return;
  }
}

export function acceptQuest(id) {
  const q = QUEST_INDEX[id];
  if (!q || questState(char, id) || !questAvailable(char, q)) return;
  char.quests = char.quests || {};
  char.quests[id] = { p: 0 };
  audio.sfx('equip'); saveChar(); renderQuests(); refreshNpcMarks();
  // すでに条件を満たしているもの（到達など）
  if (q.type === 'visit' && world.area === q.target) questEvent({ type: 'visit', area: q.target });
}

export function claimQuest(q) {
  const s = questState(char, q.id);
  if (!s?.done || s.claimed) return;
  s.claimed = true;
  const r = q.reward;
  if (r.rarity != null) {
    const ilvl = Math.max(char.lv, floorLevel(world.floor) + 3);
    // 第1層のクエストは1段低め（序盤は白・緑・青が中心。エピック以上は第2層から）
    const base = world.floor === 1 ? Math.min(r.rarity, 2) : r.rarity;
    const rar = Math.random() < 0.15 ? base + 1 : base;
    const it = makeItem(ilvl, Math.min(5, rar), r.slot ? { slot: r.slot } : {});
    spawnDrop(it, me.x + rnd(-1, 1), me.z + rnd(1, 2));
  }
  if (r.title) grantTitle(r.title);
  if (r.potion) { char.potBonus = (char.potBonus || 0) + r.potion; calcStats(); me.potions = S.maxPot; toast(`ポーションの所持数が ${S.maxPot} になった`, '#6aff8a'); }
  banner('クエスト完了', q.name, '#ffd84a', 2);
  audio.sfx('levelup');
  gainXp(r.xp);
  saveChar(); renderQuests(); refreshNpcMarks();
}

// ======================================================================
// 調べる（F）: 転移門 / NPC / レバー / 宝箱
// ======================================================================
export function nearestInteract() {
  if (me.dead) return null;
  const def = world.def;
  const d = (p) => Math.hypot(p.x - me.x, p.z - me.z);
  if (def.gate && d(def.gate) < 6) return { kind: 'gate', label: '<kbd>F</kbd> 転移門を使う（ポーション補充済み）' };
  for (const n of npcs) {
    if (d(n) >= 3.2) continue;
    if (n.role === 'smith') return { kind: 'smith', npc: n, label: `<kbd>F</kbd> ${esc(n.name)}（鍛冶屋）` };
    return { kind: 'npc', npc: n, label: `<kbd>F</kbd> ${esc(n.name)}と話す` };
  }
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
export const chestCd = (C) => (C.big ? 300 : 600) * 1000;
// 屋内（迷宮区・ダンジョン）の自動マッピング: 歩いた周りのマスを記録し、キャラごとに保存する
export const explored = new Map();
export let exploreDirty = false, exploreSaveT = 0;
export function exploredOf(id) {
  if (!explored.has(id)) {
    const g = grid(AREAS[id]), a = new Uint8Array(g.W * g.H), s = char?.explored?.[id] || '';
    for (let i = 0; i < a.length && i < s.length; i++) a[i] = s.charCodeAt(i) === 49 ? 1 : 0;
    explored.set(id, a);
  }
  return explored.get(id);
}
export function exploreTick() {
  const def = world.def;
  if (!char || def.shape !== 'grid') return;
  const g = grid(def), a = exploredOf(def.id), { c, r } = worldToCell(g, me.x, me.z);
  const R = tf('t_mapper') ? 4 : 2; // 称号「地図職人」は2倍の範囲を記す
  for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
    const cc = c + dc, rr = r + dr;
    if (cc < 0 || rr < 0 || cc >= g.W || rr >= g.H || a[rr * g.W + cc]) continue;
    a[rr * g.W + cc] = 1; exploreDirty = true;
  }
  if (exploreDirty && now() - exploreSaveT > 4) {
    exploreDirty = false; exploreSaveT = now();
    char.explored = char.explored || {};
    for (const [id, arr] of explored) char.explored[id] = arr.join('');
    saveChar();
  }
}
export function chestOpen(C) { return Date.now() - (char.chests?.[C.id] || 0) < chestCd(C); }
