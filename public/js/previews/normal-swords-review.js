import * as THREE from 'three';
import { makePlayer, setPlayerWeapon, animatePlayer } from '../models.js';
import { GRIP_Y } from '../pose-rig.js';
import { Root, View, Mediator } from '../ui/core.js';
import { NORMAL_SWORD_FORMS, makeNormalSwordCandidate } from '../models/prototypes/normal-sword-candidates.js';
import { sampleSequence } from './sword-comparison-timeline.js';
const variants=['before','A','B'];

// Passive rendering of the camera, cells, actor poses and model identifiers supplied by present().
class SwordBoard extends View {
  constructor(el,name,parent){
    super(el,name,parent);
    this.renderer=new THREE.WebGLRenderer({canvas:el,antialias:true,preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(1);this.renderer.setClearColor(0x14212b);this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.scene=new THREE.Scene();this.scene.add(new THREE.HemisphereLight(0xbfe4ff,0x5b6050,1.5));
    const sun=new THREE.DirectionalLight(0xffead1,2);sun.position.set(-3,6,5);this.scene.add(sun);
    this.ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshToonMaterial({color:0x35474a}));this.ground.rotation.x=-Math.PI/2;this.scene.add(this.ground);
    this.grid=new THREE.GridHelper(120,60,0x657477,0x3d5357);this.grid.material.transparent=true;this.grid.material.opacity=.3;this.grid.position.y=-.012;this.scene.add(this.grid);
    this.camera=new THREE.PerspectiveCamera(30,1,.05,200);
    this.entries=NORMAL_SWORD_FORMS.flatMap(form=>variants.map(variant=>{
      const actor=makePlayer('#448a9b');setPlayerWeapon(actor,'sword',1,form.style);this.scene.add(actor);
      return{style:form.style,variant,actor};
    }));
    this.modelCache=new Map();
  }
  model(style,variant,rarity,actor){
    const key=[style,variant,rarity,actor?'actor':'study'].join('/');
    if(!this.modelCache.has(key))this.modelCache.set(key,makeNormalSwordCandidate(style,variant,rarity));
    return this.modelCache.get(key);
  }
  set(p){
    if(this.width!==p.width||this.height!==p.height){this.renderer.setSize(p.width,p.height,false);this.width=p.width;this.height=p.height;}
    const r=this.renderer;r.setScissorTest(false);r.setViewport(0,0,p.width,p.height);r.clear();r.setScissorTest(true);
    this.ground.position.y=p.groundY;this.grid.visible=p.grid;
    for(const cell of p.cells){
      const entry=this.entries[cell.style*3+cell.column];
      for(const e of this.entries)e.actor.visible=false;
      for(const m of this.modelCache.values())if(m.parent===this.scene)m.visible=false;
      const model=this.model(cell.style,variants[cell.column],p.rarity,p.equipped);
      const actor=entry.actor;
      if(p.equipped){
        const u=actor.userData;
        if(u.weaponModel!==model){u.weaponModel.removeFromParent();model.position.set(0,-GRIP_Y.sword,0);model.rotation.set(0,0,0);u.weapon.add(model);u.weaponModel=model;}
        actor.visible=true;actor.position.set(0,0,p.z);animatePlayer(actor,p.pose);actor.updateMatrixWorld(true);
      }else{
        if(model.parent!==this.scene)this.scene.add(model);model.visible=true;model.position.set(0,0,0);model.rotation.set(0,p.weaponYaw,0);
      }
      const target=p.camera.target==='hand'?actor.userData.hand.getWorldPosition(new THREE.Vector3()):new THREE.Vector3(0,p.camera.targetY,p.equipped?p.z:0);
      this.camera.position.copy(target).add(new THREE.Vector3(...p.camera.offset));this.camera.lookAt(target);this.camera.aspect=cell.w/cell.h;this.camera.fov=p.camera.fov;this.camera.updateProjectionMatrix();
      r.setViewport(cell.x,cell.y,cell.w,cell.h);r.setScissor(cell.x,cell.y,cell.w,cell.h);r.render(this.scene,this.camera);
    }
    r.setScissorTest(false);
  }
}
const mediator=new Mediator({},null),root=new Root('#root',mediator),scene=root.add('scene','#scene',SwordBoard);
const header=root.add('header','header');header.add('eyebrow','small');header.add('title','h1');header.add('subtitle','p');
const columns=root.add('columns','#columns');columns.el.querySelectorAll('section').forEach((el,i)=>{const c=columns.add('column'+i,el);c.add('title','h2');c.add('description','p');});
const captions=root.add('captions','#captions');const footer=root.add('footer','footer');footer.add('note','#note');const controls=footer.add('controls','#controls');
const play=controls.add('play','#play').on('click','toggle'),inputs={};
for(const id of ['view','form','pose','angle','rarity'])inputs[id]=controls.add(id,'#'+id).on('change','select',e=>({name:id,value:e.target.value}));
inputs.time=controls.add('time','#time').on('input','scrub',e=>({time:Number(e.target.value)}));controls.link(ev=>{ev.ctx.source='controls';});
const state={width:innerWidth,height:innerHeight,time:0,view:'overview',form:0,pose:'ready',angle:'three-quarter',rarity:1};
const allowed={view:['overview','detail','lineup','equipped','grip','game'],form:['0','1','2'],pose:['ready','combo','heavy','skill'],angle:['three-quarter','front','side'],rarity:['0','1','3','5']};
function parameters(){
  const portrait=state.width<700,overview=state.view==='overview',lineup=state.view==='lineup',equipped=['lineup','equipped','grip','game'].includes(state.view);
  const top=portrait?134:174,bottom=portrait?180:100,height=state.height-top-bottom;
  const styles=overview&&!portrait?[0,1,2]:[state.form],cells=[];
  for(const [row,style]of styles.entries())for(let column=0;column<3;column++){
    const w=portrait?state.width:Math.floor((column+1)*state.width/3)-Math.floor(column*state.width/3),h=portrait?Math.floor(height/3):Math.floor(height/styles.length);
    const x=portrait?0:Math.floor(column*state.width/3),y=portrait?bottom+(2-column)*h:bottom+(styles.length-1-row)*h;
    const form=NORMAL_SWORD_FORMS[style],description=column===0?'Original':form[variants[column]];
    cells.push({x,y,w,h,style,column,title:portrait?`${form.label} · ${description}`:form.label,description:portrait?'':description,selected:style===0&&column===1});
  }
  if(lineup){
    cells.length=0;
    for(const [index,form]of NORMAL_SWORD_FORMS.entries()){
      const w=portrait?state.width:Math.floor((index+1)*state.width/3)-Math.floor(index*state.width/3),h=portrait?Math.floor(height/3):height;
      cells.push({x:portrait?0:Math.floor(index*state.width/3),y:portrait?bottom+(2-index)*h:bottom,w,h,style:form.style,column:1,title:form.label,description:form.A,selected:form.style===0});
    }
  }
  const action=sampleSequence(state.time,state.pose),angle=state.angle==='front'?0:state.angle==='side'?Math.PI/2:.52;
  const yaw=state.angle==='front'?0:state.angle==='side'?Math.PI/2:.38;
  let camera={targetY:.52,offset:[0,.12,4.55],fov:28};
  if(equipped)camera={targetY:1.1,offset:[Math.sin(angle)*7.4,1.5,Math.cos(angle)*7.4],fov:35};
  if(state.view==='grip')camera={target:'hand',offset:[Math.sin(angle)*1.4,.4,Math.cos(angle)*1.4],fov:32};
  if(state.view==='game')camera={targetY:1.2,offset:[0,7.0,8.1],fov:50};
  return{...state,cells,equipped,pose:action.pose,z:action.z,weaponYaw:yaw+(equipped?0:state.time*.25),camera,groundY:equipped?-.015:-.49,grid:equipped};
}
function present(){
  const p=parameters();scene.set(p);
  const key=p.cells.map(c=>c.style+'/'+c.column).join(',');
  if(captions.layoutKey!==key){captions.layoutKey=key;captions.list(p.cells,c=>({html:'<section class="caption"><strong></strong><span></span></section>',setup(v){v.add('title','strong');v.add('description','span');}}));}
  [...captions.children.values()].forEach((v,i)=>{const c=p.cells[i];v.set({style:{left:c.x+'px',top:(state.height-c.y-c.h)+'px',width:c.w+'px'},cls:{selected:c.selected}});v.get('title').set({text:c.title});v.get('description').set({text:c.description});});
  columns.set({visible:state.view!=='lineup'});
  play.set({text:mediator.is('playing')?'Pause':'Play'});
  for(const key of ['view','form','pose','angle','rarity'])inputs[key].set({value:state[key]});inputs.time.set({value:state.time%8});
  inputs.form.set({disabled:state.view==='lineup'||state.view==='overview'&&state.width>=700});inputs.angle.set({disabled:state.view==='game'});inputs.pose.set({disabled:!p.equipped});
}
mediator.states={
  paused:{enter:present,on:{toggle:()=> 'playing'}},
  playing:{enter:present,on:{toggle:()=> 'paused',tick(ev){state.time+=ev.payload.dt;present();}}},
  '*':{on:{
    select(ev){const {name,value}=ev.payload;if(!allowed[name]?.includes(value))return;state[name]=['form','rarity'].includes(name)?Number(value):value;if(name==='pose')state.time={ready:0,combo:.10,heavy:.8,skill:.28}[value];present();},
    scrub(ev){state.time=Math.max(0,Math.min(8,ev.payload.time));present();},
    resize(ev){Object.assign(state,ev.payload);present();},
  }},
};
mediator.go('paused');addEventListener('resize',()=>root.emit('resize',{width:innerWidth,height:innerHeight}));
let last=performance.now();function frame(t){const dt=Math.min(.05,(t-last)/1000);last=t;if(mediator.is('playing'))root.emit('tick',{dt});requestAnimationFrame(frame);}requestAnimationFrame(frame);
window.normalSwords={root,mediator,state,scene,parameters};window.ready=true;
