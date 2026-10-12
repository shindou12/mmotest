// サブクエスト（町や野営地のNPCから受ける）
// type: kill（指定の敵を倒す・エリア指定可）/ chest（宝箱を開ける）/ boss（階層ボスを倒す）/ visit（エリアに着く）
// reward: xp と装備（rarity 以上を保証）、ポーション最大数アップなど

export const QUESTS = [
  {
    id: 'q_slime', npc: 'captain', name: 'スライム退治',
    desc: 'ひだまりの草原でグリーンスライムを8体倒す', type: 'kill', target: 'グリーンスライム', area: 'f1_field', n: 8,
    reward: { xp: 180, rarity: 2, title: 't_guard' },
  },
  {
    id: 'q_boar', npc: 'hunter', name: '猪狩り',
    desc: 'イノシシの丘でフレンジーボアを15体倒す', type: 'kill', target: 'フレンジーボア', area: 'f1_hunt', n: 15,
    reward: { xp: 380, rarity: 2, slot: 'armor', title: 't_wind' },
  },
  {
    id: 'q_well', npc: 'sage', name: '古井戸の調査',
    desc: '古井戸の洞窟の最奥にある宝箱を開ける', type: 'chest', target: 'f1_dun', n: 1,
    reward: { xp: 450, rarity: 3, slot: 'acc', title: 't_delver' },
  },
  {
    id: 'q_lab1', npc: 'captain', name: '迷宮区の主', after: 'q_slime',
    desc: '第1層 迷宮区のボス「コボルド王 グラズ」を倒す', type: 'boss', target: 1, n: 1,
    reward: { xp: 900, rarity: 3, title: 't_mapper' },
  },
  {
    id: 'q_mist', npc: 'sage', name: '霧の向こうへ', after: 'q_lab1',
    desc: '第2層の「霧の野営地」にたどり着く', type: 'visit', target: 'f2_camp', n: 1,
    reward: { xp: 300, potion: 1, title: 't_traveler' },
  },
  {
    id: 'q_hollow', npc: 'ranger', name: '樹洞の秘宝',
    desc: '朽ちた樹洞の最奥にある宝箱を開ける', type: 'chest', target: 'f2_dun', n: 1,
    reward: { xp: 900, rarity: 3, title: 't_treasure' },
  },
  {
    id: 'q_wolf', npc: 'ranger', name: '霧の狼',
    desc: '霧の森でミストウルフを12体倒す', type: 'kill', target: 'ミストウルフ', area: 'f2_field', n: 12,
    reward: { xp: 800, rarity: 2, slot: 'weapon', title: 't_blood' },
  },
  {
    id: 'q_lab2', npc: 'ranger', name: '大樹の守り手', after: 'q_hollow',
    desc: '第2層 迷宮区のボス「霧の大樹 ユグドラ」を倒す', type: 'boss', target: 2, n: 1,
    reward: { xp: 1800, rarity: 3, title: 't_breaker' },
  },
  {
    id: 'q_golem', npc: 'merchant', name: '砂の巨人',
    desc: '砂塵の荒野でサンドゴーレムを10体倒す', type: 'kill', target: 'サンドゴーレム', area: 'f3_field', n: 10,
    reward: { xp: 1400, rarity: 2, slot: 'armor', title: 't_hawk' },
  },
  {
    id: 'q_temple', npc: 'merchant', name: '埋もれた神殿',
    desc: '埋もれた神殿の最奥にある宝箱を開ける', type: 'chest', target: 'f3_dun', n: 1,
    reward: { xp: 1600, rarity: 3, title: 't_relic' },
  },
  {
    id: 'q_lab3', npc: 'merchant', name: '砂塵の王', after: 'q_temple',
    desc: '第3層 迷宮区のボス「砂塵の大蠍 スコルピオ」を倒す', type: 'boss', target: 3, n: 1,
    reward: { xp: 3000, rarity: 4, title: 't_phoenix' },
  },
  // ---- 新しい敵のクエスト（報酬は称号）----
  {
    id: 'q_bat', npc: 'hunter', name: '洞窟の羽音',
    desc: '古井戸の洞窟でケイブバットを10体倒す', type: 'kill', target: 'ケイブバット', area: 'f1_dun', n: 10,
    reward: { xp: 420, rarity: 2, title: 't_night' },
  },
  {
    id: 'q_mush', npc: 'sage', name: '毒キノコ採り',
    desc: 'ひだまりの草原でドクキノコを6体倒す', type: 'kill', target: 'ドクキノコ', area: 'f1_field', n: 6,
    reward: { xp: 260, potion: 1, title: 't_spore' },
  },
  {
    id: 'q_shaman', npc: 'ranger', name: 'まじない師の影',
    desc: '朽ちた樹洞でゴブリンシャーマンを8体倒す', type: 'kill', target: 'ゴブリンシャーマン', area: 'f2_dun', n: 8,
    reward: { xp: 1000, rarity: 3, slot: 'acc', title: 't_spell' },
  },
  {
    id: 'q_scorp', npc: 'merchant', name: '大蠍の尾',
    desc: '蠍の巣でジャイアントスコーピオンを10体倒す', type: 'kill', target: 'ジャイアントスコーピオン', area: 'f3_hunt', n: 10,
    reward: { xp: 1500, rarity: 3, slot: 'weapon', title: 't_shell' },
  },
];
export const QUEST_INDEX = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

// クエストの状態: undefined（未受注）/ { p: 進捗, done: 達成, claimed: 報告済み }
export function questState(char, id) { return char.quests?.[id]; }
export function questAvailable(char, q) {
  if (char.quests?.[q.id]) return false;
  return !q.after || char.quests?.[q.after]?.claimed;
}

// 進捗イベント（kill / chest / boss / visit）
export function questProgress(char, ev) {
  const changed = [];
  for (const q of QUESTS) {
    const st = char.quests?.[q.id];
    if (!st || st.done) continue;
    let hit = false;
    if (q.type === 'kill' && ev.type === 'kill' && ev.name === q.target && (!q.area || q.area === ev.area)) hit = true;
    if (q.type === 'chest' && ev.type === 'chest' && ev.area === q.target) hit = true;
    if (q.type === 'boss' && ev.type === 'boss' && ev.floor === q.target) hit = true;
    if (q.type === 'visit' && ev.type === 'visit' && ev.area === q.target) hit = true;
    if (!hit) continue;
    st.p = Math.min(q.n, st.p + 1);
    if (st.p >= q.n) st.done = true;
    changed.push(q);
  }
  return changed;
}
