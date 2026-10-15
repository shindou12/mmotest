import * as THREE from 'three';
import { makeWeapon } from '../models.js';
import { SWORD_UNIQUE_STYLES } from '../../shared/weapon-appearances.js';
import { NEW_SWORD_CANDIDATES } from '../models/new-sword-candidates.js';
import { Root, View, Mediator } from '../ui/core.js';

const existing=[
  ['Straight sword','Slender and straight',1],['Katana','Single edge and slight curve',1],['Leaf blade','Symmetric leaf-shaped profile',1],
  ['Crystal-wing sword','Crystal core and winged guard',6],['Ameno-Murakumo','Cloud guard and magatama pommel',7],['Durandal','Crossguard and shield-shaped setting',6],['Laevateinn','Dark wave blade and branch guard',6],
].map(([name,description,rarity],style)=>({key:'existing/'+style,name,description,make:()=>makeWeapon('sword',rarity,style)}));
const candidateNames={'oni-kiba':'Oni Kiba','sosei':'Sōsei'};
const candidateDescriptions={'oni-kiba':'Forward-hooked blade, weighted toward the tip.','sosei':'Slim blade divides into two distinct prongs.'};
const candidates=NEW_SWORD_CANDIDATES.map(d=>({key:'new/'+d.id,name:candidateNames[d.id],description:candidateDescriptions[d.id],make:()=>makeWeapon('sword',6,SWORD_UNIQUE_STYLES[d.id==='oni-kiba'?'oni_kiba':'sosei'])}));
const models=new Map([...candidates,...existing].map(d=>[d.key,d.make()]));

// Passive view: render receives layout, selection, and camera values from the mediator.
class SwordCandidateView extends View{
  constructor(el,name,parent){
    super(el,name,parent);this.renderer=new THREE.WebGLRenderer({canvas:el,antialias:true,preserveDrawingBuffer:true});this.renderer.setPixelRatio(1);this.renderer.setClearColor(0x14212b);this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.scene=new THREE.Scene();this.scene.add(new THREE.HemisphereLight(0xbfe4ff,0x5b6050,1.6));const sun=new THREE.DirectionalLight(0xffead1,2.1);sun.position.set(-3,6,5);this.scene.add(sun);
    this.ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshToonMaterial({color:0x35474a}));this.ground.rotation.x=-Math.PI/2;this.scene.add(this.ground);
    this.grid=new THREE.GridHelper(120,60,0x657477,0x3d5357);this.grid.material.transparent=true;this.grid.material.opacity=.26;this.grid.position.y=-.012;this.scene.add(this.grid);
    for(const model of models.values())this.scene.add(model);
    this.camera=new THREE.PerspectiveCamera(30,1,.05,200);
  }
  set(p){
    if(this.width!==p.width||this.height!==p.height){this.renderer.setSize(p.width,p.height,false);this.width=p.width;this.height=p.height;}
    const r=this.renderer;r.setScissorTest(false);r.setViewport(0,0,p.width,p.height);r.clear();r.setScissorTest(true);this.ground.position.y=-.49;this.grid.visible=p.family==='new';
    for(const c of p.cells){for(const other of models.values())other.visible=false;const model=models.get(c.key);model.visible=true;model.rotation.y=p.yaw;
      const target=new THREE.Vector3(0,.59,0),drawH=c.h-c.captionGap;this.camera.position.copy(target).add(new THREE.Vector3(...p.camera.offset));this.camera.lookAt(target);this.camera.aspect=c.w/drawH;this.camera.fov=p.camera.fov;this.camera.updateProjectionMatrix();
      r.setViewport(c.x,c.y,c.w,drawH);r.setScissor(c.x,c.y,c.w,drawH);r.render(this.scene,this.camera);
    }r.setScissorTest(false);
  }
}

const mediator=new Mediator({},null),root=new Root('#root',mediator),scene=root.add('scene','#scene',SwordCandidateView);
const captions=root.add('captions','#captions'),footer=root.add('footer','footer'),controls=footer.add('controls','#controls');
const family=controls.add('family','#family').on('change','select',e=>({name:'family',value:e.target.value}));
const angle=controls.add('angle','#angle').on('change','select',e=>({name:'angle',value:e.target.value}));
controls.link(ev=>{ev.ctx.source='controls';});
const state={width:innerWidth,height:innerHeight,family:'new',angle:'three-quarter'};
function parameters(){
  const portrait=state.width<700,top=126,bottom=portrait?172:94,height=Math.max(240,state.height-top-bottom),list=state.family==='new'?candidates:existing;
  const columns=state.family==='new'?(portrait?1:2):(portrait?2:4),rows=Math.ceil(list.length/columns),cells=[];
  list.forEach((d,index)=>{const row=Math.floor(index/columns),col=index%columns,w=Math.floor((col+1)*state.width/columns)-Math.floor(col*state.width/columns),h=Math.floor(height/rows);cells.push({key:d.key,index,x:Math.floor(col*state.width/columns),y:bottom+(rows-1-row)*h,w,h,captionGap:portrait?34:0,title:d.name,description:d.description});});
  const angleRad=state.angle==='front'?0:state.angle==='side'?Math.PI/2:.52;
  const camera=state.family==='new'?{offset:[Math.sin(angleRad)*4.9,.12,Math.cos(angleRad)*4.9],fov:30}:{offset:[Math.sin(angleRad)*4.6,.10,Math.cos(angleRad)*4.6],fov:27};
  return{...state,cells,yaw:state.angle==='front'?0:state.angle==='side'?Math.PI/2:.38,camera};
}
function present(){
  const p=parameters();scene.set(p);const key=p.cells.map(c=>c.key).join(',');
  if(captions.layoutKey!==key){captions.layoutKey=key;captions.list(p.cells,()=>({html:'<section class="caption"><strong></strong><span></span></section>',setup(v){v.add('title','strong');v.add('description','span');}}));}
  [...captions.children.values()].forEach((v,i)=>{const c=p.cells[i];v.set({style:{left:c.x+'px',top:(state.height-c.y-c.h)+'px',width:c.w+'px'}});v.get('title').set({text:c.title});v.get('description').set({text:c.description});});
  family.set({value:state.family});angle.set({value:state.angle});
}
mediator.states={paused:{enter:present,on:{select(ev){const{name,value}=ev.payload;if(name==='family'&&['new','existing'].includes(value)||name==='angle'&&['three-quarter','front','side'].includes(value)){state[name]=value;present();}}}},'*':{on:{resize(ev){Object.assign(state,ev.payload);present();}}}};
mediator.go('paused');addEventListener('resize',()=>root.emit('resize',{width:innerWidth,height:innerHeight}));
window.swordsNext={root,mediator,state,scene,models};window.ready=true;
