import { TECHNIQUES } from '../shared/techniques.js';
import { TREE_MOTIONS } from '../shared/tree-motions.js';
import { ease } from './pose-rig.js';
import { techniqueMotion } from './motions/index.js';
import { BASE as base, STYLES, DEFAULT_STYLE, KEYFRAMES, FULL_TURN } from './motions/styles.js';
// 技のモーションの計算（形ごとの姿勢のデータは motions/styles.js）
// 形のデータから i 回目の当たりの [振りかぶり, 当たり] を取る（hits が足りないときは最後のもの）
const profile=(style,i)=>{const d=Object.hasOwn(STYLES,style)?STYLES[style]:DEFAULT_STYLE;return d.hits?d.hits[Math.min(i,d.hits.length-1)]:d.pose;};
export const ALL_MOTIONS=Object.freeze({...TECHNIQUES,...TREE_MOTIONS});
export const TECHNIQUE_FRAMES=Object.freeze(Object.fromEntries(Object.values(ALL_MOTIONS).map(t=>{
 if(KEYFRAMES[t.style])return [t.id,KEYFRAMES[t.style].map(f=>({...base,...f}))];
 const frames=[{at:0,...base}];
 t.hits.forEach((hit,i)=>{const [wind,impact]=profile(t.style,i),previous=t.hits[i-1]||0,next=t.hits[i+1]||t.duration;
 frames.push({at:Math.max(previous+.02,hit-.12),...base,...wind},{at:hit,...base,...impact},{at:Math.min(hit+.10,next-.02),...base,...impact});});
 frames.push({at:t.duration,...base,bodyYaw:FULL_TURN.has(t.style)?Math.PI*2:0});return [t.id,frames.sort((a,b)=>a.at-b.at)];
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
 techniqueMotion(t.kind)(u,s,t,p);
 if(p.leg){u.legs[0].rotation.x=-p.leg;u.legs[1].rotation.x=p.leg;}
 return true;
}
