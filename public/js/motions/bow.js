import * as THREE from 'three';
import { aimHand, clamp, ease } from '../pose-rig.js';

export function applyBowPose(u, s) {
    const active = s.charging || s.swing >= 0;
    const draw = s.charging ? clamp(s.charge ?? 1, 0, 1) : s.swing >= 0 ? 1 - clamp(s.swing / .25, 0, 1) : 0;
    // Turn the torso side-on while the bow and head keep facing the aim direction.
    // Moving the bow forward alone lets its deep curve/string cut through the chest.
    const stance = s.bowStance ?? 1.0;
    u.body.rotation.y = stance;u.head.rotation.y = -stance;
    const aim = new THREE.Vector3(-Math.sin(stance), 0, Math.cos(stance));
    const grip = aimHand(u.armL, u.elbowL, new THREE.Vector3(-.10, s.bowHeight ?? (active ? 1.36 : 1.25), .53), new THREE.Vector3(-1, -.7, 0));
    const details = u.weaponModel.userData.bow;
    if (active && details) {
      const pull = .22 * draw;
      aimHand(u.armR, u.elbowR, grip.clone().addScaledVector(aim, details.sx - pull), new THREE.Vector3(1, 0, -.7));
      const pos = details.string.geometry.attributes.position;pos.setX(1, details.sx - pull);pos.needsUpdate = true;
      details.arrow.visible = s.charging || s.swing < .15;
      details.arrow.position.x = details.sx - pull;
    } else if (details) {
      details.string.geometry.attributes.position.setX(1, details.sx);details.string.geometry.attributes.position.needsUpdate = true;
      details.arrow.visible = false;
    }
    // Bow limbs remain vertical; its model's -90 degree yaw puts the string toward the torso.
    const handOrientation = u.armL.quaternion.clone().multiply(u.elbowL.quaternion);
    u.weapon.quaternion.copy(handOrientation).invert().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -stance));
}

export function applyBowSwing(u, s, e) {
  u.armR.rotation.set(-Math.PI / 2, 0, 0.1);u.armR.position.z = 0;
  u.armL.rotation.set(-Math.PI / 2 + 0.2, 0, -0.6 + e * 0.3);
  u.body.rotation.y = 0;
}

// 技（矢の技）の姿勢: 引き具合 p.draw で弓を引き、始めと終わりは構えから溶け込む
export function applyBowTechnique(u, s, t, p) {
  const time=s.motionT||0,blend=ease(Math.min(1,time/.08))*ease(Math.max(0,Math.min(1,(t.duration-time)/.12)));
  applyBowPose(u,{...s,charging:true,charge:p.draw,swing:-1,bowStance:1+p.bodyYaw,bowHeight:1.25+.11*blend});
  const idle=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.25,0,.12));u.armR.quaternion.copy(idle.slerp(u.armR.quaternion.clone(),blend));
  u.elbowR.quaternion.slerp(new THREE.Quaternion(),1-blend);
  u.weaponModel.userData.bow.arrow.visible=p.draw>.03;
  u.body.rotation.x=p.lean;u.body.position.y+=p.lift;
}
