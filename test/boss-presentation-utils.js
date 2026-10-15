export function attackTrace(World,identity,pattern,phase){
 const random=Math.random;let seed=428;
 Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 try{
  const world=new World({unlocked:3}),messages=[];const n={graz:1,yugdra:2,skorpio:3}[identity];
  world.addPlayer(1,m=>messages.push(JSON.parse(JSON.stringify(m))));const p=world.players.get(1);p.joined=true;p.area='f'+n+'_lab';
  const area=world.area(p.area);p.x=area.lair.x;p.z=area.lair.z+7;
  const boss=world.spawnBoss(area);boss.phase=phase;boss.enraged=phase>1;area.bossState='fight';
  const duration=world.bossPattern(area,boss,pattern,p,[p]);
  while(area.timers.length){area.timers.sort((a,b)=>a.at-b.at);const event=area.timers.shift();world.time=event.at;event.fn();}
  return {duration,events:messages.filter(m=>['tele','proj','aim'].includes(m.t))};
 }finally{Math.random=random;}
}
