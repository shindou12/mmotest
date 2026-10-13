// Common locomotion, reactions and animation orchestration.
import { applyAttackMotion } from './weapon-motion.js';
import { updateWeaponPose } from './weapon-pose.js';

export function animatePlayer(model, s) {
  const u = model.userData;
  u.elbowL.rotation.set(0, 0, 0);u.elbowR.rotation.set(0, 0, 0);u.head.rotation.y = 0;
  const walk = s.moving ? Math.sin(s.walkT * 10) : 0;
  u.legs[0].rotation.x = walk * 0.75; u.legs[1].rotation.x = -walk * 0.75;
  if (s.guard) {
    // ガード: 盾を前に突き出して構える
    u.armL.rotation.set(-1.35, 0, 0.45);
    if (u.shield) u.shield.rotation.set(Math.PI / 2, 0, 0);
  } else {
    u.armL.rotation.set(-walk * 0.6, 0, -0.15);
    if (u.shield) u.shield.rotation.set(0, -Math.PI / 2 + 0.25, 0);
  }
  u.body.position.y = s.moving ? Math.abs(Math.cos(s.walkT * 10)) * 0.07 : Math.sin(s.t * 2) * 0.015;
  u.head.rotation.x = s.moving ? 0.05 : Math.sin(s.t * 1.3) * 0.03;
  u.cape.rotation.x = s.moving ? -0.35 - Math.abs(walk) * 0.1 : -0.06 + Math.sin(s.t * 1.7) * 0.03;
  applyAttackMotion(u, s, walk);
  if (s.dodge > 0) { u.body.rotation.x = (1 - s.dodge) * Math.PI * 2; u.body.position.y = 0.4 * Math.sin((1 - s.dodge) * Math.PI); }
  else if (s.down > 0) {
    // ダウン: 仰向けに倒れる（down 1 = 倒れきった状態）。手足を投げ出す
    u.body.rotation.x = -s.down * 1.45; u.body.position.y = 0.12 * s.down;
    u.armR.rotation.set(-2.6 * s.down, 0, 0.5); u.armL.rotation.set(-2.6 * s.down, 0, -0.5);
    u.legs[0].rotation.x = 0.3 * s.down; u.legs[1].rotation.x = -0.15 * s.down;
    u.head.rotation.x = -0.3 * s.down;
  } else if (s.hurt > 0) {
    // のけぞり: 上体が後ろへ反って頭が揺れる
    u.body.rotation.x = -s.hurt * 0.35; u.head.rotation.x = -s.hurt * 0.4;
  } else u.body.rotation.x = 0;
  // 盾の光: ガード中だけ。ガードゲージの残り（gg 0〜1）で 青 → 黄 → 赤
  const gm = u.shield?.userData.gauge;
  if (gm) {
    const gg = s.gg ?? 1;
    gm.opacity = s.guard ? 0.35 + (gg < 0.3 ? Math.abs(Math.sin(s.t * 12)) * 0.3 : 0) : 0;
    gm.color.setHex(gg > 0.6 ? 0x9ad8ff : gg > 0.3 ? 0xffd84a : 0xff4a3a);
  }
  updateWeaponPose(u, s);
  if (u.shield && !(s.down > 0)) {
    // Shield faces forward in body space, regardless of forearm bending.
    u.shield.quaternion.copy(u.armL.quaternion).multiply(u.elbowL.quaternion).invert();
  }
  model.visible = !s.dead;
}

