// 武器ごとの体の動きの登録表
//   pose(u, s)            毎フレームの構え（手首・武器の向き）
//   swing(u, s, e, dir)   通常攻撃の腕と体の振り（e: 振りの進み 0〜1 / dir: 左右）
//   technique(u, s, t, p) 技の姿勢（p は motions/styles.js から計算した姿勢）
//   afterSwing(u) / rest(u)  振りの後・構えに戻ったときの武器の向き（なければ何もしない）
// 武器の種類を足すときは、js/weapons/<武器>.js に motion を書く。ない種類は近接（MELEE）の動き
import * as THREE from 'three';
import { applyMeleePose, applyMeleeSwing, applyMeleeTechnique } from './melee.js';
import { WEAPON_DEFS } from '../weapons/index.js';
import { aimHand, orientWeapon, ease } from '../pose-rig.js';
import { spearPose } from '../spear-motion.js';

export const MELEE = { pose: applyMeleePose, swing: applyMeleeSwing, technique: applyMeleeTechnique };
// 武器ごとの動きは js/weapons/<武器>.js の motion（近接の動きに上書きする）
// 武器のファイルの構えの関数に渡す道具（武器のファイルは three.js を直接読まない）
const RIG = { THREE, aimHand, orientWeapon, ease, applyMeleePose, spearPose };
export const WEAPON_MOTIONS = Object.fromEntries(WEAPON_DEFS.filter((d) => d.motion).map((d) => [d.wk, { ...MELEE, ...d.motion(RIG) }]));
export const weaponMotion = (kind) => (Object.hasOwn(WEAPON_MOTIONS, kind ?? '') ? WEAPON_MOTIONS[kind] : MELEE);
export const techniqueMotion = (kind) => weaponMotion(kind).technique;
