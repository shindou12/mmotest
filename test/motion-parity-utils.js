import { createHash } from 'node:crypto';
import { makePlayer,setPlayerWeapon,animatePlayer } from '../public/js/models.js';
import { HEAVY,WEAPON_SKILLS,TREE_SKILLS } from '../public/js/skills.js';
export function poseHashes(){
 const states=[{}, {moving:true,walkT:.4},{guard:true,gg:.2},{charging:true,charge:.5},{dodge:.4},{down:.8},{hurt:.7},{dead:true}];
 for(const swing of [0,.02,.18,.25,.35,.6,1])for(const combo of [0,1,2])states.push({swing,combo});
 for(const spin of [0,.25,.7,1])states.push({spin});
 for(const sweep of [0,1.9,3.8,6.28])states.push({sweep});
 for(const motion of ['lance','helix','piercer','javelin','whirlspear','whirl','heavy','counter'])for(const motionT of [0,.06,.12,.18,.24,.38,.48,.55,.77,.95])states.push({motion,motionT});
 const results={};
 for(const kind of ['sword','greatsword','spear','dagger','axe','bow'])for(let style=0;style<4;style++){
 const hashes=[];const model=makePlayer('#448a9b');setPlayerWeapon(model,kind,3,style);
 for(let i=0;i<states.length;i++){
 animatePlayer(model,{t:1,moving:false,walkT:0,kind,combo:0,swing:-1,spin:-1,sweep:-1,dodge:0,down:0,hurt:0,...states[i]});model.updateMatrixWorld(true);
 const values=[];model.traverse(o=>{values.push(o.visible,...o.matrixWorld.elements.map(n=>Math.round(n*1e10)/1e10));if(o.isLine)values.push(...o.geometry.attributes.position.array);if(o.material)values.push(o.material.opacity,o.material.color?.getHex());});
 hashes.push(createHash('sha256').update(JSON.stringify(values)).digest('hex'));
 }
 results[kind+'/'+style]=createHash('sha256').update(hashes.join('')).digest('hex');
 }
 return results;
}
export function skillTraces(){
 const traces={};const random=Math.random;Math.random=()=>.5;
 try{for(const [id,skill,level] of [['heavy1',HEAVY.spear,1],['heavy2',HEAVY.spear,2],...['lance','helix','piercer','whirlspear'].map(id=>[id,WEAPON_SKILLS[id]]),...['javelin','whirl'].map(id=>[id,TREE_SKILLS[id]])]){
 const events=[],queue=[];let time=0;const log=name=>(...args)=>events.push([time,name,args]);
 const me={x:2,z:4,a:.3};const c={me,aim:()=>.3,col:()=>0xcfd3da,S:()=>({flags:new Set()}),later:(sec,fn)=>{events.push([time,'later',[sec]]);queue.push({at:time+sec,fn});},fx:{parts:{emit:log('emit'),burst:log('burst')},slash:log('slash'),ringWave:log('ringWave'),lightning:log('lightning')},dash:log('dash'),line:log('line'),circle:log('circle'),proj:log('proj'),sfx:log('sfx'),shake:log('shake'),taunt:log('taunt')};
 skill.run(c,level);while(queue.length){queue.sort((a,b)=>a.at-b.at);const p=queue.shift();time=p.at;p.fn();}traces[id]=events;
 }}finally{Math.random=random;}return traces;
}
