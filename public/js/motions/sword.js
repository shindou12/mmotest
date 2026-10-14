import * as THREE from 'three';
import { aimHand, orientWeapon } from '../pose-rig.js';
import { applyMeleePose } from './melee.js';

// 片手剣の構え: ガード中（守護騎士）だけ独自。ほかは近接の構え
export function applySwordPose(u, s) {
  if (s.guard) {
    // 片手剣のガード（守護騎士）: 剣を横に倒して胸の前で受ける。左手は刃の腹に添える
    const yaw = -1.38, pitch = .22;
    u.armR.position.z = 0;
    const grip = aimHand(u.armR, u.elbowR, new THREE.Vector3(.22, 1.26, .46), new THREE.Vector3(1, -.6, -.3));
    const axis = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    aimHand(u.armL, u.elbowL, grip.clone().addScaledVector(axis, .5), new THREE.Vector3(-1, -.6, -.2));
    orientWeapon(u, yaw, pitch);
    return;
  }
  applyMeleePose(u, s);
}
