import * as THREE from 'three';
import { aimHand, orientWeapon, clamp } from '../pose-rig.js';
import { WEAPONS } from '../../shared/data.js';

export function applyMeleePose(u, s) {
  if (s.guard && u.wKind === 'sword') {
    // 片手剣のガード（守護騎士）: 剣を横に倒して胸の前で受ける。左手は刃の腹に添える
    const yaw = -1.38, pitch = .22;
    u.armR.position.z = 0;
    const grip = aimHand(u.armR, u.elbowR, new THREE.Vector3(.22, 1.26, .46), new THREE.Vector3(1, -.6, -.3));
    const axis = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    aimHand(u.armL, u.elbowL, grip.clone().addScaledVector(axis, .5), new THREE.Vector3(-1, -.6, -.2));
    orientWeapon(u, yaw, pitch);
    return;
  }
  const heavyWeapon = !!WEAPONS[u.wKind]?.twoHanded;
  const k = clamp(s.swing ?? -1, 0, 1), dir = (s.combo || 0) % 2 === 0 ? 1 : -1;
  let yaw = -.2, pitch = .25;
  if (s.swing >= 0) {
    const cut = k < .25 ? k / .25 : 1 - (k - .25) / .75 * .3;
    yaw = dir * (1.1 - cut * 2.2);pitch = .10;
  }
  if (s.spin >= 0) { yaw = Math.PI / 2;pitch = 0; }
  if (heavyWeapon) {
    const overhead = s.swing >= 0 && (s.heavy || s.combo === 2);
    if (overhead) { yaw = 0;pitch = k < .24 ? 1.25 + .25 * k / .24 : 1.5 - 1.7 * clamp((k - .24) / .45, 0, 1); }
    else if (!(s.swing >= 0) && !(s.spin >= 0)) pitch = .60;
    const y = overhead ? 1.15 + .53 * Math.sin(Math.PI * clamp(k / .7, 0, 1)) : 1.15;
    u.armR.position.z = 0;
    const grip = aimHand(u.armR, u.elbowR, new THREE.Vector3(-.04, y, overhead ? .22 : .34), new THREE.Vector3(1, -.6, -.2));
    const axis = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    aimHand(u.armL, u.elbowL, grip.clone().addScaledVector(axis, -.18), new THREE.Vector3(-1, -.6, -.2));
  }
  orientWeapon(u, yaw, pitch);
}

export function applyMeleeSwing(u, s, e, dir) {
  u.armR.rotation.set(-1.4 + e * 0.2, 0, dir * (1.4 - e * 2.8));u.armR.position.z = 0;
  u.body.rotation.y = dir * (0.5 - e) * 0.6;
}

// 技の姿勢: 右手の位置と武器の向き。両手持ちは左手も柄に添える
export function applyMeleeTechnique(u, s, t, p) {
  const twoHanded = !!WEAPONS[t.kind]?.twoHanded;
  u.armR.position.z=0;u.body.rotation.y=p.bodyYaw;u.body.rotation.x=p.lean;u.body.position.y+=p.lift;
  const grip=aimHand(u.armR,u.elbowR,new THREE.Vector3(twoHanded?p.x-.34:p.x,p.y,p.z),new THREE.Vector3(1,-.6,-.3));
  if(twoHanded){
   const yaw=p.yaw-p.bodyYaw,axis=new THREE.Vector3(Math.sin(yaw)*Math.cos(p.pitch),Math.sin(p.pitch),Math.cos(yaw)*Math.cos(p.pitch));
   aimHand(u.armL,u.elbowL,grip.clone().addScaledVector(axis,-.18),new THREE.Vector3(-1,-.6,-.2));
  }else if(p.guard>0){u.armL.rotation.set(-1.15*p.guard,0,-.3);u.elbowL.rotation.x=-.4*p.guard;}
  orientWeapon(u,p.yaw-p.bodyYaw,p.pitch);u.head.rotation.y=-p.bodyYaw*.6;
}
