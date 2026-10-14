import * as THREE from 'three';
import { TECHNIQUES } from '../shared/techniques.js';
import { TREE_MOTIONS } from '../shared/tree-motions.js';
import { aimHand, orientWeapon } from './pose-rig.js';
import { applyBowPose } from './motions/bow.js';
const base={yaw:0,pitch:.25,bodyYaw:0,lean:0,x:.3,y:1.24,z:.28,guard:0,lift:0,leg:0,draw:0};
const ease=k=>k*k*(3-2*k);
// Distinct authored silhouettes built from a small set of continuous rig parameters.
function profile(style,i){
 const sign=i%2?-1:1;
 switch(style){
 case 'parry':return [{pitch:1.25,z:.2,guard:1},{pitch:.05,z:.56,bodyYaw:.12,leg:.2}];
 case 'aircut':return [{yaw:-.9,pitch:.8,bodyYaw:-.3},{yaw:.55,pitch:.05,bodyYaw:.2,z:.5}];
 case 'sideturn':return [{yaw:1.2,pitch:.15,lean:-.08},{yaw:-.8,pitch:.1,bodyYaw:-.45,leg:.2}];
 case 'dance':return [{pitch:.3,guard:.4},{pitch:1.4,y:1.5,z:.18,bodyYaw:.15,guard:1}];
 case 'guillotine':return [{pitch:1.55,y:1.72,z:.18,lean:-.12},{pitch:-.45,y:1.13,z:.5,lean:.22,leg:.35}];
 case 'rising':return [{pitch:-.6,y:1.0,z:.4,lean:.16},{pitch:1.2,y:1.64,z:.28,lean:-.06,leg:.25}];
 case 'broad':return [{yaw:-1.3,pitch:.05,bodyYaw:-.5},{yaw:1.3,pitch:.05,bodyYaw:.6,z:.45,leg:.2}];
 case 'recoil':return [{pitch:1.4,y:1.65,z:.12,lean:-.1},{pitch:-.1,y:1.16,z:.52,lean:.15}];
 case 'siege':return [{pitch:.4,y:1.35,guard:.4},{pitch:.9,y:1.52,z:.18,lean:.1,guard:1,leg:.3}];
 case 'fanthrust':return [{yaw:(i-1)*.5,z:.22},{yaw:(i-1)*.5,pitch:0,z:.56,bodyYaw:(i-1)*.2,leg:.12}];
 case 'lowsweep':return [{yaw:-1.2,pitch:-.35,y:1.08},{yaw:1.1,pitch:-.35,y:.98,x:.5,z:.18,bodyYaw:.65,lean:.2}];
 case 'shieldpress':return [{pitch:0,z:.18,guard:1,lean:.12},{pitch:0,z:.48,guard:1,lean:.23,leg:.3}];
 case 'stake':return [{pitch:1.3,y:1.6,z:.14},{pitch:-.65,y:1.08,z:.5,lean:.22,guard:.4}];
 case 'intercept':return [{pitch:0,z:.22,guard:1},{pitch:0,z:.55,guard:1,leg:.15}];
 case 'flank':return [{yaw:1.4,pitch:.2,bodyYaw:.35,y:1.15},{yaw:-.85,pitch:0,z:.47,bodyYaw:-.35,lean:.13}];
 case 'vital':return [{pitch:0,z:.12,y:1.08,lean:.1},{pitch:0,z:.57,y:1.08,lean:.22,leg:.22}];
 case 'bleed':return [{yaw:-sign*1.0,pitch:sign*.5,y:1.16},{yaw:sign*.85,pitch:-sign*.25,bodyYaw:sign*.3,z:.46}];
 case 'pin':return [{pitch:1.1,z:.18,y:1.55},{pitch:.05,z:.54,y:1.4,bodyYaw:.25,guard:.3}];
 case 'quicken':return [{yaw:.3,pitch:.2,z:.18},{yaw:-.6,pitch:.4,guard:.8,lean:.12,leg:.35}];
 case 'hook':return i===0?[{yaw:.75,pitch:-.1,z:.48},{yaw:-.85,pitch:-.1,z:.15,bodyYaw:-.3}]:[{pitch:1.2,y:1.65,z:.16},{pitch:-.3,z:.51,lean:.2,leg:.2}];
 case 'execute':return [{pitch:1.65,y:1.75,z:.16,bodyYaw:-.2},{pitch:-.5,z:.51,y:1.12,lean:.25,leg:.3}];
 case 'return':return i===0?[{yaw:-.6,pitch:1.0,y:1.6},{yaw:.2,pitch:.15,z:.53,bodyYaw:.3}]:[{pitch:.05,z:.53},{pitch:.8,z:.23,bodyYaw:-.15}];
 case 'blood':return [{yaw:-1.5,pitch:.15,bodyYaw:-.6},{yaw:1.25,pitch:.15,bodyYaw:.5,z:.48,guard:.3}];
 case 'rush':return [{pitch:.1,z:.3,lean:.2},{pitch:-.35,z:.55,lean:.28,leg:.4}];
 case 'double':return [{draw:1,bodyYaw:i?.08:0},{draw:0,bodyYaw:i?-.1:0}];
 case 'tether':return [{draw:1,lean:.03},{draw:0,lean:-.05}];
 case 'sideshot':return [{draw:1,lift:.1,leg:.3},{draw:0,lift:.12,bodyYaw:i?.18:-.1}];
 case 'trap':return [{draw:.8,lean:.18,lift:-.1},{draw:0,lean:.25,lift:-.16,guard:.2}];
 case 'slant':case 'slantspin':
  if(style==='slantspin'&&i===3)return [{yaw:-1.2,pitch:.1,bodyYaw:-.6,guard:.3,lean:.05},{yaw:1.1,pitch:.1,bodyYaw:Math.PI*2-.4,z:.5,lean:.15,leg:.3}];
  return [{yaw:-sign*1.1,pitch:.2,bodyYaw:-sign*.35,lean:.1},{yaw:sign*1.0,pitch:.05,bodyYaw:sign*.4,z:.5,lean:.18,leg:.3}];
 case 'risingtwin':return i===0?[{pitch:-.6,y:1.0,z:.4,lean:.16},{pitch:1.2,y:1.64,z:.28,lean:-.06,leg:.25}]:[{pitch:1.5,y:1.74,z:.16,lean:-.14,leg:.2},{pitch:-.45,y:1.12,z:.5,lean:.24,leg:.35}];
 case 'coat':return [{pitch:.95,y:1.32,z:.32,guard:1,bodyYaw:-.1},{yaw:.7,pitch:.15,bodyYaw:.3,z:.48,guard:.2,lean:.08}];
 case 'flanktwin':return [{yaw:sign*1.4,pitch:.2,bodyYaw:sign*.35,y:1.15},{yaw:-sign*.85,pitch:0,z:.47,bodyYaw:-sign*.35,lean:.13}];
 case 'bleedspin':return i===0?[{yaw:-1.0,pitch:.3,bodyYaw:-.4,y:1.16},{yaw:.9,pitch:-.2,bodyYaw:Math.PI,z:.46,lean:.1}]:[{yaw:-.9,pitch:.25,bodyYaw:Math.PI+.4,y:1.16},{yaw:.9,pitch:-.2,bodyYaw:Math.PI*2-.3,z:.46,lean:.1,leg:.3}];
 case 'blink':return [{yaw:-1.25,pitch:.2,bodyYaw:-.3,lean:.35,y:1.05,leg:.4},{yaw:1.3,pitch:.05,bodyYaw:.5,lean:.3,z:.5,leg:.4}];
 case 'throw3':return [{yaw:-.5,pitch:1.0,y:1.5,z:.12,bodyYaw:-.3},{yaw:.35,pitch:.05,y:1.3,z:.56,bodyYaw:.25,lean:.12}];
 case 'brave':return [{pitch:.4,y:1.3,z:.3,guard:.3},{pitch:1.55,y:1.78,z:.12,lean:-.12,guard:1}];
 case 'fan3':return [{yaw:-1.45,pitch:.15,bodyYaw:-.6,z:.25},{yaw:1.45,pitch:.15,bodyYaw:.65,z:.52,lean:.12,leg:.25}];
 case 'sidelong':return [{yaw:1.3,pitch:.15,lean:-.12,bodyYaw:.3,leg:.35},{yaw:-.95,pitch:.1,bodyYaw:-.55,z:.5,lean:.2,leg:.3}];
 case 'lightwave':return [{pitch:1.5,y:1.72,z:.16,lean:-.15},{pitch:-.05,y:1.3,z:.6,lean:.28,leg:.4}];
 case 'riposte':return [{yaw:-1.35,pitch:.05,bodyYaw:-.55,y:1.12,z:.2,guard:.6,lean:-.04},{yaw:1.45,pitch:.12,bodyYaw:.75,z:.52,lean:.18,leg:.38}];
 case 'gtriposte':return [{yaw:-.95,pitch:-.55,y:1.0,z:.34,bodyYaw:-.45,lean:.12},{yaw:.75,pitch:1.15,y:1.62,z:.3,bodyYaw:.5,lean:-.1,leg:.35}];
 case 'bash':return [{pitch:.2,z:.18,guard:1,lean:-.1,bodyYaw:-.5},{pitch:.1,z:.3,guard:1,lean:.35,bodyYaw:.35,leg:.5}];
 case 'bashrush':return [{pitch:.15,z:.15,guard:1,lean:.3,leg:.45,y:1.1},{pitch:.1,z:.32,guard:1,lean:.38,bodyYaw:.15,leg:.5}];
 case 'clang':return [{pitch:1.2,y:1.6,z:.2,guard:1,lean:-.12},{pitch:.3,y:1.35,z:.35,guard:1,lean:.05,leg:.2}];
 case 'lowspin':return [{yaw:-1.2,pitch:-.35,y:1.08,bodyYaw:-.4},{yaw:1.1,pitch:-.35,y:.98,x:.5,z:.18,bodyYaw:Math.PI*2-.3,lean:.2,leg:.3}];
 case 'hooktwin':return i===0?[{yaw:.75,pitch:-.1,z:.48},{yaw:-.85,pitch:-.1,z:.15,bodyYaw:-.3}]:i===1?[{pitch:1.2,y:1.65,z:.16},{pitch:-.3,z:.51,lean:.2,leg:.2}]:[{pitch:1.6,y:1.78,z:.12,lean:-.15,bodyYaw:.2},{pitch:-.55,y:1.08,z:.52,lean:.3,leg:.4}];
 case 'roar':return [{pitch:.6,y:1.4,z:.25,lean:.1},{pitch:1.5,y:1.8,z:.1,lean:-.25,guard:1,leg:.25}];
 case 'rushtwin':return i===0?[{pitch:.1,z:.3,lean:.2},{pitch:-.35,z:.55,lean:.28,leg:.4}]:[{pitch:1.4,y:1.7,z:.14,lean:-.1,bodyYaw:-.25},{pitch:-.6,y:1.05,z:.48,lean:.32,leg:.45,bodyYaw:.15}];
 case 'axethrow':return [{yaw:.4,pitch:1.5,y:1.75,z:.05,lean:-.2,bodyYaw:-.35},{yaw:-.1,pitch:.1,y:1.35,z:.6,lean:.25,bodyYaw:.3,leg:.35}];
 case 'broadwide':return [{yaw:-1.6,pitch:.05,bodyYaw:-1.0,lean:-.05,leg:.2},{yaw:1.6,pitch:.05,bodyYaw:1.15,z:.48,lean:.15,leg:.4}];
 case 'pinfan':return [{yaw:-1.2,pitch:.35,y:1.35,z:.2,bodyYaw:-.45},{yaw:1.0,pitch:.1,y:1.3,z:.56,bodyYaw:.4,lean:.12,leg:.2}];
 case 'staketri':{const s2=[.4,0,-.4][i];return [{yaw:s2,pitch:.35,y:1.38,z:.3,bodyYaw:s2*.5,lean:.1},{yaw:s2,pitch:-.45,y:1.15,z:.48,bodyYaw:s2*.5,lean:.22,leg:.2}];}
 case 'hookspin':return i===0?[{yaw:.9,pitch:-.05,z:.45,bodyYaw:-.5},{yaw:-.6,pitch:-.05,z:.4,bodyYaw:Math.PI*2-.4,lean:.1,leg:.25}]:[{pitch:1.2,y:1.65,z:.16,bodyYaw:Math.PI*2},{pitch:-.3,z:.51,lean:.2,leg:.2,bodyYaw:Math.PI*2}];
 case 'returntri':return i===0?[{yaw:-1.3,pitch:.5,y:1.45,bodyYaw:-.6},{yaw:1.2,pitch:.1,z:.55,bodyYaw:.55,lean:.1}]:[{pitch:.05,z:.53},{pitch:.8,z:.23,bodyYaw:-.15}];
 case 'execsweep':return [{yaw:-1.5,pitch:.15,y:1.25,bodyYaw:-.8,lean:-.05},{yaw:1.4,pitch:0,y:1.15,z:.5,bodyYaw:.85,lean:.2,leg:.4}];
 case 'backshot':return [{draw:1,lean:-.18,lift:.18,bodyYaw:-.1},{draw:0,lean:-.24,lift:.26,bodyYaw:.08}];
 case 'chime':return [{draw:.3,guard:1},{draw:0,bodyYaw:-.2,lean:-.1,guard:1}];
 default:return [{},{z:.5}];
 }
}
// 跳んで叩きつける（グランド・スラム）: しゃがむ → 跳び上がって振りかぶる → 着地と同時に叩きつけ → 残心
const CUSTOM={
 pivot:[{at:0,bodyYaw:Math.PI,yaw:-.8,pitch:.2,lean:.1},{at:.18,bodyYaw:.3,yaw:.5,pitch:.1,z:.45,lean:.15,leg:.3},{at:.3}],
 smoke:[{at:0},{at:.08,pitch:-.35,y:1.0,z:.32,lean:.22,lift:-.1,leg:.3},{at:.22,pitch:.6,y:1.45,z:.2,lean:-.35,lift:.55,leg:-.3,guard:.6},{at:.4,pitch:.3,y:1.25,lean:-.1,lift:.08,leg:.2},{at:.55}],
 dive:[{at:0},{at:.1,pitch:.4,y:1.3,z:.22,lift:-.18,lean:.2,leg:.4},{at:.28,pitch:1.3,y:1.72,z:.16,lift:1.35,lean:-.22,leg:-.3},{at:.44,pitch:-1.2,y:1.5,z:.42,lift:1.0,lean:.35,leg:-.1},{at:.55,pitch:-1.3,y:1.1,z:.5,lift:0,lean:.32,leg:.45},{at:.7,pitch:-1.2,y:1.12,z:.48,lift:-.08,lean:.25,leg:.35},{at:.85}],
 fanleap:[{at:0},{at:.08,pitch:.3,z:.2,lift:-.12,leg:.35},{at:.2,pitch:.6,y:1.5,z:.2,lift:.9,lean:-.1,leg:-.2},{at:.24,yaw:-.5,pitch:-.6,z:.55,lift:.5,lean:.3},{at:.32,yaw:0,pitch:-.6,z:.58,lift:.2,lean:.3},{at:.4,yaw:.5,pitch:-.6,z:.55,lift:0,lean:.3,leg:.35},{at:.75}],
 stomp:[{at:0},{at:.12,pitch:.5,y:1.4,z:.25,lean:-.12,lift:.12,leg:-.6},{at:.24,pitch:.7,y:1.45,z:.22,lean:-.18,lift:.2,leg:-.75},{at:.3,pitch:.2,y:1.2,z:.35,lean:.2,lift:-.12,leg:.5},{at:.45,pitch:.2,y:1.22,z:.33,lean:.15,lift:-.08,leg:.4},{at:.6}],
 fullshot:[{at:0,draw:1,lean:.04},{at:.04,draw:0,lean:-.2,bodyYaw:.18,lift:.04},{at:.18,draw:0,lean:-.1,bodyYaw:.1},{at:.4}],
 chimeleap:[{at:0},{at:.1,draw:.3,guard:1},{at:.2,draw:0,bodyYaw:-.2,lean:-.1,guard:1},{at:.4,draw:0,lean:-.3,lift:.35,guard:.5},{at:.6,lean:-.1,lift:.05},{at:.75}],
 slam:[{at:0},{at:.09,pitch:.9,y:1.32,z:.2,lift:-.16,lean:.18,leg:.35},{at:.22,pitch:1.55,y:1.74,z:.16,lift:1.15,lean:-.18,leg:-.25},{at:.36,pitch:-.5,y:1.1,z:.52,lift:0,lean:.26,leg:.4},{at:.52,pitch:-.45,y:1.1,z:.5,lift:-.06,lean:.22,leg:.35},{at:.8}],
};
export const ALL_MOTIONS=Object.freeze({...TECHNIQUES,...TREE_MOTIONS});
export const TECHNIQUE_FRAMES=Object.freeze(Object.fromEntries(Object.values(ALL_MOTIONS).map(t=>{
 if(CUSTOM[t.style])return [t.id,CUSTOM[t.style].map(f=>({...base,...f}))];
 const frames=[{at:0,...base}];
 t.hits.forEach((hit,i)=>{const [wind,impact]=profile(t.style,i),previous=t.hits[i-1]||0,next=t.hits[i+1]||t.duration;
 frames.push({at:Math.max(previous+.02,hit-.12),...base,...wind},{at:hit,...base,...impact},{at:Math.min(hit+.10,next-.02),...base,...impact});});
 // 一回転で終わる動き（旋）は、最後の向きを一周ぶんにして巻き戻らないようにする
 frames.push({at:t.duration,...base,bodyYaw:t.style==='slantspin'||t.style==='bleedspin'||t.style==='lowspin'||t.style==='hookspin'?Math.PI*2:0});return [t.id,frames.sort((a,b)=>a.at-b.at)];
})));
export function sampleTechnique(id,time){
 const frames=TECHNIQUE_FRAMES[id];if(!frames)return null;
 if(time<=0)return {...frames[0]};
 let a=frames[0],b=frames.at(-1);for(let i=1;i<frames.length;i++){b=frames[i];if(time<=b.at)break;a=b;}
 const k=ease(Math.max(0,Math.min(1,(time-a.at)/Math.max(.00001,b.at-a.at))));const p={};for(const key of Object.keys(base))p[key]=a[key]+(b[key]-a[key])*k;return p;
}
export function applyTechniquePose(u,s){
 const t=ALL_MOTIONS[s.motion];if(!t||t.kind!==u.wKind||s.down>0||s.dodge>0||s.hurt>0)return false;
 const p=sampleTechnique(t.id,s.motionT||0);
 if(t.kind==='bow'){
  const time=s.motionT||0,blend=ease(Math.min(1,time/.08))*ease(Math.max(0,Math.min(1,(t.duration-time)/.12)));
  applyBowPose(u,{...s,charging:true,charge:p.draw,swing:-1,bowStance:1+p.bodyYaw,bowHeight:1.25+.11*blend});
  const idle=new THREE.Quaternion().setFromEuler(new THREE.Euler(-.25,0,.12));u.armR.quaternion.copy(idle.slerp(u.armR.quaternion.clone(),blend));
  u.elbowR.quaternion.slerp(new THREE.Quaternion(),1-blend);
  u.weaponModel.userData.bow.arrow.visible=p.draw>.03;
  u.body.rotation.x=p.lean;u.body.position.y+=p.lift;
 }else{
  u.armR.position.z=0;u.body.rotation.y=p.bodyYaw;u.body.rotation.x=p.lean;u.body.position.y+=p.lift;
  const grip=aimHand(u.armR,u.elbowR,new THREE.Vector3(t.kind==='greatsword'||t.kind==='axe'?p.x-.34:p.x,p.y,p.z),new THREE.Vector3(1,-.6,-.3));
  if(t.kind==='greatsword'||t.kind==='axe'){
   const yaw=p.yaw-p.bodyYaw,axis=new THREE.Vector3(Math.sin(yaw)*Math.cos(p.pitch),Math.sin(p.pitch),Math.cos(yaw)*Math.cos(p.pitch));
   aimHand(u.armL,u.elbowL,grip.clone().addScaledVector(axis,-.18),new THREE.Vector3(-1,-.6,-.2));
  }else if(p.guard>0){u.armL.rotation.set(-1.15*p.guard,0,-.3);u.elbowL.rotation.x=-.4*p.guard;}
  orientWeapon(u,p.yaw-p.bodyYaw,p.pitch);u.head.rotation.y=-p.bodyYaw*.6;
 }
 if(p.leg){u.legs[0].rotation.x=-p.leg;u.legs[1].rotation.x=p.leg;}
 return true;
}
