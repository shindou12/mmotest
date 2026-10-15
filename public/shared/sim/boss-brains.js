// ボスごとの行動ロジック（brain）の登録表。data.js のボス定義の brain に名前を書くと使われる。
// brain が無いボスは sim/boss.js の共通ロジック（激昂 65% → 最終形態 35%）で動く。
// brain に必要なもの: spawn(world, A, b) / tick(world, A, b, inArena, dt) → true で行動しない /
//   patterns(b) → 技の名前の配列 / gap(b)・chain(b) → 次の行動までの間隔・連続攻撃の確率 / moves（ボス固有の技）
import { graz } from './bosses/graz.js';
import { yugdra } from './bosses/yugdra.js';

export const BOSS_BRAINS = { graz, yugdra };
