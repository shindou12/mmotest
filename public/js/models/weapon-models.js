// 武器のモデル（形）の登録表。中身は js/weapons/<武器>.js の model（base = 基本の形 / styles = 形違い 1・2、伝説・神器の専用形 3）
// makeWeapon が kind と style で選ぶ（ない kind は sword の形）
// k: 材質と道具 { g（入れ物）, steel, gold, grip, gem, edge(輪郭の光), handle(柄), rc(レア度の色), rarity(飾りの段階), glowM, blade }。prep は形違いの前に作る道具
import * as THREE from 'three';
import { WEAPON_DEFS } from '../weapons/index.js';
import { mesh, sphere, cone, cyl, lathe, extrude, bowString } from './kit.js';
import { toon } from '../toon.js';

// 武器のファイルの形の関数に渡す道具（武器のファイルは three.js を直接読まない。サーバーも同じファイルを読むため）
const KIT = { THREE, mesh, sphere, cone, cyl, lathe, extrude, bowString, toon };
export const WEAPON_MODELS = Object.fromEntries(WEAPON_DEFS.map((d) => [d.wk, d.model(KIT)]));
