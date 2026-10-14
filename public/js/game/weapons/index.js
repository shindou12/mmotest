// 武器ごとの効果（武器ツリーのクラス・マスター・パッシブ）の登録。武器を足すときは、ここにファイルを1つ足して1行足す
// 各ファイルは install(api) を export し、受け取った道具（game/weapon-api.js）で自分の効果を登録する。並び順が呼ぶ順の基本
import { weaponApi } from '../weapon-api.js';
import installSword from './sword.js';
import installGreatsword from './greatsword.js';
import installDagger from './dagger.js';
import installSpear from './spear.js';
import installAxe from './axe.js';
import installBow from './bow.js';

for (const install of [installSword, installGreatsword, installDagger, installSpear, installAxe, installBow]) install(weaponApi);
