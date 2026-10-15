// Presentation metadata only. Damage, hit shapes and attack selection stay in sim.js.
export const BOSS_MOVES = Object.freeze({
  'graz/cone': { name:'覇王の薙ぎ払い', title:'Royal Cleave', color:0xffdb86, kind:'cleave' },
  'graz/slam': { name:'王断の一撃', title:'Kingbreaker', color:0xffd270, kind:'overhead' },
  'yugdra/shock': { name:'根脈の波', title:'Rootwake', color:0xa6e78b, kind:'roots' },
  'yugdra/rain': { name:'樹冠の雨', title:'Canopy Rain', color:0xbbe995, kind:'canopy' },
  'skorpio/combo': { name:'双鋏の連撃', title:'Pincer Barrage', color:0xffb16d, kind:'pincers' },
  'skorpio/shot': { name:'毒針の射撃', title:'Venom Volley', color:0xc4ed68, kind:'venom' },
});
export const BOSS_DEMO_MOVES = Object.keys(BOSS_MOVES);
export function bossMoveSpec(identity,pattern,phase=1,speed) {
  const move=BOSS_MOVES[identity+'/'+pattern];if(!move)return null;
  phase=Math.trunc(Math.max(1,Math.min(3,Number(phase)||1)));
  const sp=Number.isFinite(speed)&&speed>0?Math.max(.4,Math.min(1.5,speed)):[1,.9,.78,.68][phase];
  let hits,duration;
  if(pattern==='cone'){hits=[.95*sp];if(phase>1)hits.push(.9*sp+.8);duration=hits.at(-1)+.36;}
  if(pattern==='slam'){hits=[1.1*sp];if(phase>1)hits.push(.5+sp);duration=hits.at(-1)+.40;}
  if(pattern==='shock'){hits=Array.from({length:phase>1?5:4},(_,i)=>(.8+i*.45)*sp);duration=hits.at(-1)+.45;}
  if(pattern==='rain'){hits=[1.2*sp];duration=1.2*sp+1.05;}
  if(pattern==='combo'){hits=Array.from({length:phase+2},(_,i)=>(.75+i*.42)*sp);duration=(.42*(phase+2)+.5)*sp+.12;}
  if(pattern==='shot'){hits=[.7*sp];duration=1.2*sp+.35;}
  return {...move,identity,pattern,phase,sp,hits,duration};
}

// Receipts can precede the first actor snapshot. Keep them until the model exists.
export class BossPlayback {
  constructor(){this.acts=new Map();}
  receive(m,now,identity){
    if(!m||!Number.isFinite(m.id)||!Number.isFinite(now))return false;
    if(typeof m.p!=='string')return false;
    if(m.age!=null&&!Number.isFinite(m.age))return false;
    const key=String(m.seq??m.p),previous=this.acts.get(m.id);
    if(previous?.key===key)return false;
    if(Number.isFinite(m.seq)&&Number.isFinite(previous?.seq)&&m.seq<previous.seq)return false;
    this.acts.set(m.id,{key,seq:m.seq,pattern:m.p,phase:m.phase||1,speed:m.sp,start:now-Math.max(0,Number(m.age)||0),identity});return true;
  }
  sample(id,now,identity){
    const act=this.acts.get(id);if(!act)return null;
    const spec=bossMoveSpec(identity||act.identity,act.pattern,act.phase,act.speed);
    const age=now-act.start;
    if(!spec||age>spec.duration){this.acts.delete(id);return null;}
    return {pattern:act.pattern,phase:act.phase,speed:spec.sp,age:Math.max(0,age),spec,key:act.key};
  }
  cancel(id){this.acts.delete(id);}
  clear(){this.acts.clear();}
}
