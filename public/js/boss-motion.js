// Authored, continuous Transform poses, separate from model construction and VFX.
import * as THREE from 'three';
import { bossMoveSpec } from '../shared/boss-moves.js';
import { plantYugdraRoots } from './yugdra-model.js';

const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const lerp=(a,b,t)=>a+(b-a)*t;
const neutral={bx:0,by:0,ax:-.3,ay:0,az:0,guard:0,yaw:0,pitch:Math.PI/2,left:-.1,right:.1,crown:0,clawL:.04,clawR:.04,jawL:.07,jawR:.07,tail:0,tail2:0};
function interpolate(keys,t){
  if(t<=keys[0][0])return {...neutral,...keys[0][1]};
  for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){
    const [at,A]=keys[i-1],[bt,B]=keys[i],k=ease((t-at)/Math.max(1e-6,bt-at)),p={};
    for(const key of Object.keys(neutral))p[key]=lerp(A[key]??neutral[key],B[key]??neutral[key],k);
    return p;
  }
  return {...neutral,...keys.at(-1)[1]};
}
export function sampleBossPose(identity,pattern,age,phase=1,speed){
  const spec=bossMoveSpec(identity,pattern,phase,speed);if(!spec||!Number.isFinite(age)||age<0||age>spec.duration)return null;
  const hit=spec.hits[0],end=spec.duration;let keys;
  if(spec.kind==='cleave')keys=[[0,{}],[hit-.25,{bx:-.06,by:.34,ax:-.93,ay:.50,az:.18,guard:-.50,yaw:1.13}],[hit-.075,{bx:-.04,by:.30,ax:-.93,ay:.48,az:.18,guard:-.50,yaw:1.13}],[hit+.045,{bx:.08,by:-.35,ax:-.85,ay:-.40,az:.15,guard:-.20,yaw:-1.10}],[hit+.12,{bx:.08,by:-.35,ax:-.85,ay:-.40,az:.15,guard:-.20,yaw:-1.10}],[end,{}]];
  if(spec.kind==='overhead')keys=[[0,{}],[hit-.34,{bx:-.09,by:-.12,ax:-1.52,guard:-.62,pitch:-.22}],[hit-.08,{bx:-.09,by:-.12,ax:-1.52,guard:-.62,pitch:-.22}],[hit+.025,{bx:.08,by:.06,ax:-.38,guard:-.15,pitch:2.09}],[hit+.13,{bx:.08,by:.06,ax:-.38,guard:-.15,pitch:2.09}],[end,{}]];
  if(spec.kind==='roots')keys=[[0,{}],[hit-.22,{bx:-.12,left:-2.35,right:-2.35,crown:-.04}],[hit-.075,{bx:-.12,left:-2.35,right:-2.35,crown:-.04}],[hit+.035,{bx:.14,left:.44,right:.44,crown:.05}],[hit+.17,{bx:.12,left:.40,right:.40,crown:.03}],[hit+.38,{bx:0,left:-.40,right:-.40}],[end,{}]];
  if(spec.kind==='canopy')keys=[[0,{}],[hit*.55,{bx:-.05,left:-1.85,right:-2.02,crown:-.035}],[hit,{bx:-.06,left:-1.92,right:-2.10,crown:.03}],[end-.35,{bx:-.04,left:-1.70,right:-1.86,crown:-.02}],[end,{}]];
  if(spec.kind==='pincers'){
    keys=[[0,{}]];
    spec.hits.forEach((h,i)=>{const last=i===spec.hits.length-1,side=i%2===0?'L':'R',wind={bx:0},strike={bx:0};
      for(const k of last?['L','R']:[side]){wind['claw'+k]=-.30;wind['jaw'+k]=.32;strike['claw'+k]=.37;strike['jaw'+k]=-.14;}
      keys.push([Math.max(.02,h-.23*spec.sp),wind],[h-.065*spec.sp,wind],[h+.018*spec.sp,strike],[h+.08*spec.sp,strike]);
    });keys.push([end,{}]);
  }
  if(spec.kind==='venom')keys=[[0,{}],[hit-.22,{clawL:-.16,clawR:-.16,jawL:.20,jawR:.20,tail:-.18,tail2:.12}],[hit-.055,{clawL:-.16,clawR:-.16,jawL:.20,jawR:.20,tail:-.18,tail2:.12}],[hit+.038,{clawL:.18,clawR:.18,jawL:-.10,jawR:-.10,tail:.22,tail2:-.03}],[hit+.13,{tail:.22,tail2:-.03}],[end,{}]];
  if(spec.hits.length>1&&spec.kind==='cleave'){
    const h=spec.hits[1];keys=keys.filter(k=>k[0]!==end);
    keys.push([h-.25,{bx:-.05,by:Math.PI-.3,ax:-.92,guard:-.42,yaw:1.1}],[h-.065,{by:Math.PI-.3,ax:-.92,guard:-.42,yaw:1.1}],[h+.045,{bx:.07,by:Math.PI+.24,ax:-.85,guard:-.2,yaw:-1.1}],[h+.12,{bx:.07,by:Math.PI+.24,ax:-.85,yaw:-1.1}],[end,{}]);
  }
  if(spec.hits.length>1&&spec.kind==='overhead'){
    const h=spec.hits[1];keys=keys.filter(k=>k[0]!==end);
    keys.push([h-.18,{bx:-.06,ax:-1.4,guard:-.5,pitch:-.12}],[h-.055,{bx:-.06,ax:-1.4,guard:-.5,pitch:-.12}],[h+.025,{bx:.08,ax:-.38,pitch:2.09}],[h+.12,{bx:.08,ax:-.38,pitch:2.09}],[end,{}]);
  }
  keys.sort((a,b)=>a[0]-b[0]);const pose=interpolate(keys,age);
  pose.weight=ease(age/.10)*ease((end-age)/.22);
  pose.trail=spec.hits.some(h=>age>=h-.10&&age<=h+.12);
  pose.hitIndex=Math.max(0,spec.hits.findIndex(h=>age<h+.14));pose.spec=spec;
  return pose;
}

function rigParts(u){return [u.body,u.head,u.arm,u.guardArm,u.cape,u.weaponModel,...(u.arms||[]),...(u.legs2||[]),u.treeCrown,...(u.scorpionClaws||[]).flatMap(c=>[c.arm,c.claw,...c.fingers.map(f=>f.node)]),...(u.tailJoints||[]).map(j=>j.node)].filter(Boolean);}
export function captureBossRig(u){if(!u.identity)return;u.motionRest=rigParts(u).map(node=>({node,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()}));}
export function resetBossRig(u){for(const r of u.motionRest||[]){r.node.position.copy(r.position);r.node.quaternion.copy(r.quaternion);r.node.scale.copy(r.scale);}}
const Y=new THREE.Vector3(0,1,0),q1=new THREE.Quaternion(),q2=new THREE.Quaternion(),q3=new THREE.Quaternion();
function orientSword(u,p){
  const d=new THREE.Vector3(Math.sin(p.pitch)*Math.sin(p.yaw),Math.cos(p.pitch),Math.sin(p.pitch)*Math.cos(p.yaw));
  q1.setFromUnitVectors(Y,d).multiply(q2.setFromAxisAngle(Y,Math.PI/2));
  u.body.updateWorldMatrix(true,false);u.grip.updateWorldMatrix(true,false);
  u.body.getWorldQuaternion(q2);u.grip.getWorldQuaternion(q3);q3.premultiply(q2.invert());
  u.weaponModel.quaternion.copy(q3.invert().multiply(q1));
}
export function applyBossMotion(u,s){
  const p=sampleBossPose(u.identity,s.bossMove,s.bossTime,s.bossPhase,s.bossSpeed);if(!p)return null;
  const w=p.weight;
  u.body.rotation.x=lerp(u.body.rotation.x,p.bx,w);u.body.rotation.y=p.by*w;
  if(u.identity==='graz'){
    u.arm.rotation.x=lerp(u.arm.rotation.x,p.ax,w);u.arm.rotation.y=p.ay*w;u.arm.rotation.z=p.az*w;
    u.guardArm.rotation.x=p.guard*w;u.cape.rotation.x-=Math.sin(Math.PI*Math.min(1,s.bossTime/p.spec.duration))*.10*w;
    if(w>.001)orientSword(u,{...p,pitch:lerp(Math.PI/2,p.pitch,w),yaw:p.yaw*w});
  }
  if(u.identity==='yugdra'){
    u.arms[0].rotation.x=lerp(u.arms[0].rotation.x,p.left,w);u.arms[1].rotation.x=lerp(u.arms[1].rotation.x,p.right,w);
    u.arms[0].rotation.z=-.12*w;u.arms[1].rotation.z=.12*w;
    u.treeCrown.rotation.z+=p.crown*w;plantYugdraRoots(u);
  }
  if(u.identity==='skorpio'){
    u.body.rotation.x=0;
    for(const c of u.scorpionClaws){const side=c.side<0?'L':'R';c.arm.rotation.y=c.side*lerp(c.arm.rotation.y*c.side,p['claw'+side],w);c.arm.rotation.x=-.10*w;
      for(const f of c.fingers)f.node.rotation.y=f.side*lerp(f.node.rotation.y*f.side,p['jaw'+side],w);}
    u.tailJoints[0].node.rotation.x=lerp(u.tailJoints[0].node.rotation.x,u.tailJoints[0].rest+p.tail,w);
    u.tailJoints[2].node.rotation.x=lerp(u.tailJoints[2].node.rotation.x,u.tailJoints[2].rest+p.tail2,w);
  }
  return p;
}
