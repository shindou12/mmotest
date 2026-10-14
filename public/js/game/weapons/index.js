// 武器ごとの効果（武器ツリーのクラス・マスター・パッシブ）を登録する。中身は js/weapons/<武器>.js の effects（install(api)）
// 受け取る道具は game/weapon-api.js。並び順（weapons/index.js の WEAPON_DEFS）が呼ぶ順の基本
import { weaponApi } from '../weapon-api.js';
import { WEAPON_DEFS } from '../../weapons/index.js';

for (const d of WEAPON_DEFS) d.effects?.(weaponApi);
