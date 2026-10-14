// 武器の効果（game/weapons/*.js）に渡す道具。具体的なモジュールをここでまとめて、役目ごとの小さな形（ポート）にする
//
// 武器のファイルは state・stats・combat などを直接 import せず、install(api) の引数で受け取る。
// これで武器の効果が使えるものはこの一覧に限られ、テストや別の実装に差し替えることもできる。
//
//   player  自分の状態と能力値（S は計算し直されるので、使うたびに player.S を読む）・バフ・回復
//   field   敵・エリア・地面の高さ・狙い
//   attack  当てる（strikes）・スキルに渡す道具を足す（extendCombat）・時間差（later）
//   tree    武器ツリーの共通の道具（目立たないバフ・クールタイム短縮・粒子の間引き）
//   show    エフェクト・音・文字・画面の揺れ・見た目の部品
//   party   仲間・敵への合図
//   register  効果を登録する（game/weapon-fx.js）
import { me, mobs, world } from './state.js';
import { S, addBuff, hasBuff } from './stats.js';
import { addShake, aimAngle, aimPoint, dealDamage, later } from './combat.js';
import { ATK_TYPES, cutCds, quietBuff, wtEmit } from './tree-effects.js';
import { SWEEP, extendCombat, heal, party, strikes } from './actions.js';
import { audio, fx } from './render.js';
import { floatText } from './ui-bridge.js';
import { heightAt } from './area.js';
import { setHitStop } from './hurt.js';
import { bannerMesh, handTracker, trapMesh } from './meshes.js';
import { registerWeaponFx } from './weapon-fx.js';

export const weaponApi = {
  player: { me, get S() { return S; }, addBuff, hasBuff, heal, setHitStop },
  field: { mobs, world, heightAt, aimAngle, aimPoint },
  attack: { strikes, dealDamage, extendCombat, SWEEP, ATK_TYPES, later },
  tree: { quietBuff, cutCds, wtEmit },
  show: { fx, audio, floatText, addShake, trapMesh, bannerMesh, handTracker },
  party: { taunt: party.taunt },
  register: registerWeaponFx,
};
