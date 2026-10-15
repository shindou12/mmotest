import * as THREE from 'three';
import { UNIQUES } from '../../shared/data.js';
import { makePlayer, makeWeapon, setPlayerWeapon, animatePlayer, weaponStyle } from '../models.js';
import { Root, View, Mediator } from '../ui/core.js';
import { sampleSequence } from './sword-comparison-timeline.js';
import { makeNormalSwordCandidate } from '../models/prototypes/normal-sword-candidates.js';

const uniqueNames={amenomurakumo:['Ameno-Murakumo','Cloud bronze / jade / serpent-born'],durandal:['Durandal','Ivory steel / blue grip / knight cross'],laevateinn:['Laevateinn','Scorched iron / ember core / flame branch'],oni_kiba:['Oni Kiba','Forward-hooked blade / bronze guard'],sosei:['Sōsei','Split-tip blade / quiet ring guard']};
const uniques=UNIQUES.filter(d=>d.kind==='sword').map(d=>({item:{...d,unique:d.key},style:weaponStyle({...d,unique:d.key}),name:uniqueNames[d.key]?.[0]||d.name,description:uniqueNames[d.key]?.[1]||d.lore}));
const normals=['Straight sword','Katana','Leaf blade'].map((name,style)=>({item:{kind:'sword',rarity:1},style,name,description:'Adopted A / actual game model'}));
// Passive view: model identities, camera, poses, layout and labels are supplied by the presenter.
class SwordView extends View{
  constructor(el,name,parent){
    super(el,name,parent);this.renderer=new THREE.WebGLRenderer({canvas:el,antialias:true,preserveDrawingBuffer:true});this.renderer.setPixelRatio(1);this.renderer.setClearColor(0x14212b);this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.scene=new THREE.Scene();this.scene.add(new THREE.HemisphereLight(0xbfe4ff,0x5b6050,1.5));const sun=new THREE.DirectionalLight(0xffead1,2);sun.position.set(-3,6,5);this.scene.add(sun);
    this.ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshToonMaterial({color:0x35474a}));this.ground.rotation.x=-Math.PI/2;this.scene.add(this.ground);
    this.grid=new THREE.GridHelper(120,60,0x657477,0x3d5357);this.grid.material.transparent=true;this.grid.material.opacity=.3;this.grid.position.y=-.012;this.scene.add(this.grid);
    this.camera=new THREE.PerspectiveCamera(30,1,.05,200);this.models=new Map();this.actors=new Map();
    for(const [family,list]of Object.entries({normal:normals,unique:uniques}))for(const [index,d]of list.entries()){
      const key=family+'/'+index,rarity=d.item.rarity;
      const after=makeWeapon('sword',rarity,d.style),before=family==='normal'?makeNormalSwordCandidate(index,'before'):makeWeapon('sword',rarity,3);
      this.models.set(key+'/after',after);this.models.set(key+'/before',before);this.scene.add(after,before);
      const actor=makePlayer('#448a9b');setPlayerWeapon(actor,'sword',rarity,d.style);this.actors.set(key,actor);this.scene.add(actor);
    }
  }
  set(p){
    if(this.width!==p.width||this.height!==p.height){this.renderer.setSize(p.width,p.height,false);this.width=p.width;this.height=p.height;}
    const r=this.renderer;r.setScissorTest(false);r.setViewport(0,0,p.width,p.height);r.clear();r.setScissorTest(true);this.ground.position.y=p.groundY;this.grid.visible=p.grid;
    for(const c of p.cells){
      for(const m of this.models.values())m.visible=false;for(const a of this.actors.values())a.visible=false;
      const key=p.family+'/'+c.index,actor=this.actors.get(key),model=this.models.get(key+'/'+c.version);
      if(p.equipped){actor.visible=true;actor.position.set(0,0,p.z);animatePlayer(actor,p.pose);actor.updateMatrixWorld(true);}
      else{model.visible=true;model.rotation.y=p.yaw;}
      const target=p.camera.target==='hand'?actor.userData.hand.getWorldPosition(new THREE.Vector3()):new THREE.Vector3(0,p.camera.targetY,p.equipped?p.z:0);
      this.camera.position.copy(target).add(new THREE.Vector3(...p.camera.offset));this.camera.lookAt(target);const drawH=c.h-p.captionGap;this.camera.aspect=c.w/drawH;this.camera.fov=p.camera.fov;this.camera.updateProjectionMatrix();
      r.setViewport(c.x,c.y,c.w,drawH);r.setScissor(c.x,c.y,c.w,drawH);r.render(this.scene,this.camera);
    }
    r.setScissorTest(false);
  }
}
const mediator=new Mediator({},null),root=new Root('#root',mediator),scene=root.add('scene','#scene',SwordView);
const header=root.add('header','header');header.add('eyebrow','small');header.add('title','h1');header.add('description','p');
const captions=root.add('captions','#captions'),footer=root.add('footer','footer');footer.add('note','#note');const controls=footer.add('controls','#controls'),inputs={};
const play=controls.add('play','#play').on('click','toggle');for(const id of['family','view','pose','angle'])inputs[id]=controls.add(id,'#'+id).on('change','select',e=>({name:id,value:e.target.value}));inputs.time=controls.add('time','#time').on('input','scrub',e=>({time:Number(e.target.value)}));controls.link(ev=>{ev.ctx.source='controls';});
const state={width:innerWidth,height:innerHeight,time:0,family:'unique',view:'detail',pose:'ready',angle:'three-quarter'};
const allowed={family:['normal','unique'],view:['detail','compare','equipped','grip','game'],pose:['ready','combo','heavy','skill'],angle:['three-quarter','front','side']};
function parameters(){
  const portrait=state.width<700,equipped=['equipped','grip','game'].includes(state.view),rows=state.view==='compare'&&!portrait?2:1,top=136,bottom=portrait?170:100,height=state.height-top-bottom,list=state.family==='normal'?normals:uniques,cells=[];
  for(let row=0;row<rows;row++)for(let index=0;index<3;index++){
    const w=portrait?state.width:Math.floor((index+1)*state.width/3)-Math.floor(index*state.width/3),h=portrait?Math.floor(height/3):Math.floor(height/rows),before=rows===2&&row===0;
    cells.push({index,x:portrait?0:Math.floor(index*state.width/3),y:portrait?bottom+(2-index)*h:bottom+(rows-1-row)*h,w,h,version:before?'before':'after',title:list[index].name,description:before?(state.family==='unique'?'Before / shared legendary shape':'Before / original ordinary shape'):list[index].description});
  }
  if(portrait&&state.view==='compare'){
    cells.length=0;
    for(let index=0;index<3;index++)for(let col=0;col<2;col++){
      const w=Math.floor((col+1)*state.width/2)-Math.floor(col*state.width/2),h=Math.floor(height/3);
      cells.push({index,x:Math.floor(col*state.width/2),y:bottom+(2-index)*h,w,h,version:col?'after':'before',title:list[index].name,description:col?'After':'Before'});
    }
  }
  const action=sampleSequence(state.time,state.pose),angle=state.angle==='front'?0:state.angle==='side'?Math.PI/2:.52;
  let camera={targetY:.56,offset:[0,.12,5.0],fov:28};if(equipped)camera={targetY:1.1,offset:[Math.sin(angle)*7.8,1.5,Math.cos(angle)*7.8],fov:35};if(state.view==='grip')camera={target:'hand',offset:[Math.sin(angle)*1.4,.4,Math.cos(angle)*1.4],fov:32};if(state.view==='game')camera={targetY:1.2,offset:[0,7,8.1],fov:50};
  return{...state,cells,captionGap:portrait?38:0,equipped,pose:action.pose,z:action.z,yaw:state.angle==='front'?state.time*.25:state.angle==='side'?Math.PI/2+state.time*.25:.38+state.time*.25,camera,groundY:equipped?-.015:-.49,grid:equipped};
}
function present(){
  const p=parameters();scene.set(p);const key=p.cells.map(c=>c.index+'/'+c.version).join(',');if(captions.layoutKey!==key){captions.layoutKey=key;captions.list(p.cells,()=>({html:'<section class="caption"><strong></strong><span></span></section>',setup(v){v.add('title','strong');v.add('description','span');}}));}
  [...captions.children.values()].forEach((v,i)=>{const c=p.cells[i];v.set({style:{left:c.x+'px',top:(state.height-c.y-c.h)+'px',width:c.w+'px'}});v.get('title').set({text:c.title});v.get('description').set({text:c.description});});play.set({text:mediator.is('playing')?'Pause':'Play'});for(const k of['family','view','pose','angle'])inputs[k].set({value:state[k]});inputs.pose.set({disabled:!p.equipped});inputs.angle.set({disabled:state.view==='game'});inputs.time.set({value:state.time%8});
}
mediator.states={paused:{enter:present,on:{toggle:()=> 'playing'}},playing:{enter:present,on:{toggle:()=> 'paused',tick(ev){state.time+=ev.payload.dt;present();}}},'*':{on:{select(ev){const{name,value}=ev.payload;if(!allowed[name]?.includes(value))return;state[name]=value;if(name==='pose')state.time={ready:0,combo:.10,heavy:.8,skill:.28}[value];present();},scrub(ev){state.time=Math.max(0,Math.min(8,ev.payload.time));present();},resize(ev){Object.assign(state,ev.payload);present();}}}};
mediator.go('paused');addEventListener('resize',()=>root.emit('resize',{width:innerWidth,height:innerHeight}));let last=performance.now();function frame(t){const dt=Math.min(.05,(t-last)/1000);last=t;if(mediator.is('playing'))root.emit('tick',{dt});requestAnimationFrame(frame);}requestAnimationFrame(frame);
window.swordsRefined={root,mediator,state,scene};window.ready=true;
