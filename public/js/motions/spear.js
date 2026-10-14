import * as THREE from 'three';
import { spearPose } from '../spear-motion.js';
import { aimHand, orientWeapon } from '../pose-rig.js';

export function applySpearPose(u, s) {
    const p = spearPose(s);
    u.armR.position.z = 0;
    u.body.rotation.y = p.yaw;
    if (!(s.dodge > 0) && !(s.hurt > 0)) u.body.rotation.x = p.lean;
    const grip = aimHand(u.armR, u.elbowR, new THREE.Vector3(p.x, p.y, p.z), new THREE.Vector3(1, -.6, -.3));
    // Thrust stays on the aiming line while the torso turns; sweeps extend sideways.
    const yaw = p.lateral ? Math.PI / 2 * (p.side ?? 1) : -p.yaw;
    orientWeapon(u, yaw, p.pitch);
    // 竜騎士（盾を背負っている）: 左手も柄の後ろを握って両手で持つ
    if (s.shieldBack && grip) {
      const axis = new THREE.Vector3(Math.sin(yaw) * Math.cos(p.pitch), Math.sin(p.pitch), Math.cos(yaw) * Math.cos(p.pitch));
      aimHand(u.armL, u.elbowL, grip.clone().addScaledVector(axis, -.3), new THREE.Vector3(-1, -.6, -.2));
    }
    if (p.step) { u.legs[0].rotation.x = -p.step;u.legs[1].rotation.x = p.step; }
}

export function applySpearSwing(u) {
  u.armR.position.z = 0;u.body.rotation.y = 0;
}
