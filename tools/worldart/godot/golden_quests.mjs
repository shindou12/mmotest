// quests.js / progress.js / data.js の計算結果を GDScript と照合するための期待値を作る。
//   node tools/worldart/godot/golden_quests.mjs
// QUESTS_GOLDEN_PATH に一時ファイルの絶対パスを出す。ゲームの data/ には生成しない。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as D from '../../../public/shared/data.js';
import { QUESTS, questAvailable, questProgress } from '../../../public/js/quests.js';
import { wirePorts, state } from '../../../public/js/game/ports.js';
import { smithAffix, smithEnhance, smithLore, smithSkill } from '../../../public/js/game/items.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const quest = (id) => QUESTS.find((q) => q.id === id);
const suite = (cases) => cases.map(({ input, expected }) => ({ in: input, out: expected }));

const progressCases = [
  { quests: { q_slime: { p: 7 } }, events: [{ type: 'kill', name: 'グリーンスライム', area: 'f1_field' }] },
  { quests: { q_boar: { p: 0 } }, events: [{ type: 'kill', name: 'フレンジーボア', area: 'f1_field' }] },
  { quests: { q_well: { p: 0 } }, events: [{ type: 'chest', area: 'f1_dun' }] },
  { quests: { q_lab1: { p: 0 } }, events: [{ type: 'boss', floor: 1 }] },
  { quests: { q_mist: { p: 0 } }, events: [{ type: 'visit', area: 'f2_camp' }] },
  { quests: { q_slime: { p: 8, done: true } }, events: [{ type: 'kill', name: 'グリーンスライム', area: 'f1_field' }] },
];
const questProgressCases = progressCases.map((input) => {
  const char = { quests: clone(input.quests) }, changed = [];
  for (const event of input.events) changed.push(...questProgress(char, event).map((q) => q.id));
  return { input, expected: { quests: char.quests, changed } };
});

const availabilityCases = [
  { id: 'q_slime', quests: {} },
  { id: 'q_lab1', quests: {} },
  { id: 'q_lab1', quests: { q_slime: { p: 8, done: true } } },
  { id: 'q_lab1', quests: { q_slime: { p: 8, done: true, claimed: true } } },
  { id: 'q_slime', quests: { q_slime: { p: 0 } } },
].map((input) => ({ input, expected: !!questAvailable({ quests: input.quests }, quest(input.id)) }));

const rewardInputs = [
  { id: 'q_slime', lv: 1, floor: 1, roll: 0.1 },
  { id: 'q_slime', lv: 3, floor: 1, roll: 0.2 },
  { id: 'q_lab2', lv: 12, floor: 2, roll: 0.1 },
  { id: 'q_mist', lv: 1, floor: 2, roll: 0.15 },
  { id: 'q_lab3', lv: 30, floor: 3, roll: 0.0 },
];
const rewardCases = rewardInputs.map((input) => {
  const q = quest(input.id), reward = clone(q.reward);
  let item = null;
  if (reward.rarity != null) {
    const ilvl = Math.max(input.lv, D.floorLevel(input.floor) + 3);
    const base = input.floor === 1 ? Math.min(reward.rarity, 2) : reward.rarity;
    item = { ilvl, grade: Math.min(5, input.roll < 0.15 ? base + 1 : base) };
  }
  return { input, expected: { reward, item } };
});

const costItems = [
  { slot: 'weapon', ilvl: 1, enh: 0 },
  { slot: 'armor', ilvl: 18, enh: 5 },
  { slot: 'acc', ilvl: 80, enh: 9 },
];
const costCases = costItems.map((item) => ({
  input: item,
  expected: { enhance: D.enhCost(item), affix: D.affixCost(item), skill: D.skillCost(item), lore: D.loreCost(item) },
}));

wirePorts({
  state: { char: null, me: { x: 0, z: 0 }, started: true, saveChar() {}, ui: { refresh() {} } },
  view: { audio: { sfx() {} }, fx: { beam() {}, ringWave() {} } },
  stats: { calcStats() {} },
  screen: { toast() {}, banner() {}, ui: { refresh() {} } },
});

function itemSummary(item) {
  if (!item) return null;
  const fields = ['slot', 'kind', 'name', 'rarity', 'ilvl', 'enh', 'affixes', 'skill', 'fx', 'lore', 'req', 'from'];
  return Object.fromEntries(fields.filter((key) => Object.hasOwn(item, key)).map((key) => [key, clone(item[key])]));
}

function runSmith(input) {
  const item = clone(input.item);
  const char = {
    gold: input.gold,
    mats: clone(input.mats),
    codex: clone(input.codex || {}),
    inv: [item],
    eq: { weapon: null, armor: null, acc: null },
  };
  state.char = char;
  const random = Math.random;
  Math.random = () => input.roll;
  let result;
  if (input.op === 'enhance') result = smithEnhance(item.id);
  else if (input.op === 'affix') result = smithAffix(item.id, input.slot, input.key);
  else if (input.op === 'skill') result = smithSkill(item.id, input.skill);
  else if (input.op === 'lore') result = smithLore(item.id);
  else throw new Error(`unknown smith case: ${input.op}`);
  Math.random = random;
  const resultSummary = Object.fromEntries(['ok', 'msg', 'enh', 'tier'].filter((key) => Object.hasOwn(result, key)).map((key) => [key, result[key]]));
  const items = char.inv.map(itemSummary);
  return { result: resultSummary, gold: char.gold, mats: char.mats, items, equipped: Object.fromEntries(Object.entries(char.eq).map(([key, value]) => [key, itemSummary(value)])) };
}

const smithInputs = [
  { op: 'enhance', roll: 0.5, gold: 10000, mats: { shard: 100, gems: {} }, item: { id: 'enhance-ok', slot: 'weapon', kind: 'sword', name: '銀の剣', rarity: 3, ilvl: 18, enh: 5, bm: 1.2, affixes: [['atkp', 3, 7], ['crit', 2, 3]], atk: 25, v: 3 } },
  { op: 'enhance', roll: 0.5, gold: 10000, mats: { shard: 100, gems: {} }, item: { id: 'enhance-fail', slot: 'armor', armor: 'medium', name: '鎖帷子', rarity: 2, ilvl: 20, enh: 9, bm: 1.0, affixes: [['def', 3, 3.5]], hp: 30, def: 3, v: 3 } },
  { op: 'affix', roll: 0.9, slot: 0, key: 'atkp', gold: 10000, mats: { shard: 0, gems: { atkp: 1 } }, codex: { atkp: 3 }, item: { id: 'affix', slot: 'weapon', kind: 'sword', name: '鉄の剣', rarity: 2, ilvl: 10, enh: 0, bm: 1.05, affixes: [['crit', 2, 3]], atk: 18, skill: 'retreat', v: 3 } },
  { op: 'skill', roll: 0.0, skill: 'vorpal', gold: 10000, mats: { shard: 0, gems: {} }, item: { id: 'skill', slot: 'weapon', kind: 'sword', name: '初期の剣', rarity: 1, ilvl: 1, enh: 0, bm: 1.2, affixes: [], atk: 6, skill: 'retreat', v: 3 } },
  { op: 'lore', roll: 0.0, gold: 10000, mats: { shard: 100, gems: {} }, item: { id: 'lore', slot: 'weapon', kind: 'sword', name: '神話の剣', rarity: 6, ilvl: 22, enh: 3, affixes: [['atkp', 4, 9]], atk: 60, skill: 'retreat', fx: ['wave', 'thunder'], lore: '夜明けの誓い', v: 3 } },
];
const smithCases = smithInputs.map((input) => ({ input, expected: runSmith(input) }));

const suites = {
  quest_progress: suite(questProgressCases),
  quest_available: suite(availabilityCases),
  quest_rewards: suite(rewardCases),
  smith_costs: suite(costCases),
  smith_results: suite(smithCases),
};
const total = Object.values(suites).reduce((sum, cases) => sum + cases.length, 0);
const output = process.env.QUESTS_GOLDEN_OUT || path.join(os.tmpdir(), 'godot_quests_golden.json');
fs.writeFileSync(output, JSON.stringify({ suites }));
for (const [name, cases] of Object.entries(suites)) console.log(`${name}: ${cases.length} 件`);
console.log(`期待値 ${total} 件`);
console.log(`QUESTS_GOLDEN_PATH=${output}`);
