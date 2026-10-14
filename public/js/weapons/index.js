// 武器ツリーの登録表。武器を足すときは、weapons/ に1ファイル足してここに1行足す（並び順はツリーの表示順）
import sword from './sword.js';
import greatsword from './greatsword.js';
import dagger from './dagger.js';
import spear from './spear.js';
import axe from './axe.js';
import bow from './bow.js';

export const WEAPON_DEFS = [sword, greatsword, dagger, spear, axe, bow];
