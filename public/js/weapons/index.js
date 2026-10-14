// 武器の登録表。武器を足すときは、weapons/ に1ファイル（ツリー・スキル・強攻撃・武器スキル・形・構え・効果）足してここに1行足す（並び順はツリーの表示順で、効果を呼ぶ順の基本）
import sword from './sword.js';
import greatsword from './greatsword.js';
import dagger from './dagger.js';
import spear from './spear.js';
import axe from './axe.js';
import bow from './bow.js';

export const WEAPON_DEFS = [sword, greatsword, dagger, spear, axe, bow];
