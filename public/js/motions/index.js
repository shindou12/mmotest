// 武器ごとの体の動きの登録表
//   pose(u, s)            毎フレームの構え（手首・武器の向き）
//   swing(u, s, e, dir)   通常攻撃の腕と体の振り（e: 振りの進み 0〜1 / dir: 左右）
//   technique(u, s, t, p) 技の姿勢（p は motions/styles.js から計算した姿勢）
//   afterSwing(u) / rest(u)  振りの後・構えに戻ったときの武器の向き（なければ何もしない）
// 武器の種類を足すときは、motions/<種類>.js に関数を書いてここに登録する。ない種類は近接（MELEE）の動き
import { applyBowPose, applyBowSwing, applyBowTechnique } from './bow.js';
import { applySpearPose, applySpearSwing } from './spear.js';
import { applyMeleePose, applyMeleeSwing, applyMeleeTechnique } from './melee.js';
import { applySwordPose } from './sword.js';

export const MELEE = { pose: applyMeleePose, swing: applyMeleeSwing, technique: applyMeleeTechnique };
export const WEAPON_MOTIONS = {
  sword: { ...MELEE, pose: applySwordPose },
  spear: { ...MELEE, pose: applySpearPose, swing: applySpearSwing },
  bow: {
    pose: applyBowPose, swing: applyBowSwing, technique: applyBowTechnique,
    afterSwing(u) { if (u.weapon) u.weapon.rotation.x = Math.PI / 2; },
    rest(u) { if (u.weapon) u.weapon.rotation.x = 0; },
  },
};
export const weaponMotion = (kind) => (Object.hasOwn(WEAPON_MOTIONS, kind ?? '') ? WEAPON_MOTIONS[kind] : MELEE);
export const techniqueMotion = (kind) => weaponMotion(kind).technique;
