import * as THREE from 'three';
import { makePlayer, setPlayerWeapon, animatePlayer } from '../models.js';
import { Root, View, Mediator } from '../ui/core.js';
import { TREE_MOTIONS } from '../../shared/tree-motions.js';

// Rendering only. The presenter supplies poses, viewport rectangles and camera settings.
class SwordView extends View {
  constructor(el,name,parent){
    super(el,name,parent);
    this.renderer=new THREE.WebGLRenderer({canvas:el,antialias:true,preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(1);this.renderer.setClearColor(0x14212b);
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.scene=new THREE.Scene();this.scene.add(new THREE.HemisphereLight(0xbfe4ff,0x5b6050,1.5));
    const sun=new THREE.DirectionalLight(0xffead1,2);sun.position.set(4,7,5);this.scene.add(sun);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshToonMaterial({color:0x35474a}));floor.rotation.x=-Math.PI/2;floor.position.y=-.015;this.scene.add(floor);
    const grid=new THREE.GridHelper(40,40,0x657477,0x3d5357);grid.position.y=-.01;grid.material.transparent=true;grid.material.opacity=.35;this.scene.add(grid);
    this.camera=new THREE.PerspectiveCamera(35,1,.05,200);
    this.players=Array.from({length:3},()=>{const m=makePlayer('#448a9b');this.scene.add(m);return m;});
  }
  set(p){
    this.renderer.setSize(p.width,p.height,false);const r=this.renderer;
    r.setScissorTest(false);r.setViewport(0,0,p.width,p.height);r.clear();r.setScissorTest(true);
    for(let i=0;i<3;i++){
      this.players.forEach((m,j)=>m.visible=i===j);const m=this.players[i];
      setPlayerWeapon(m,'sword',1,p.style);animatePlayer(m,p.poses[i]);m.updateMatrixWorld(true);
      const cell=p.cells[i],target=p.camera.target==='hand'?m.userData.hand.getWorldPosition(new THREE.Vector3()):new THREE.Vector3(0,1.2,0);
      this.camera.position.copy(target).add(new THREE.Vector3(...p.camera.offset));this.camera.lookAt(target);this.camera.fov=p.camera.fov;this.camera.aspect=cell.w/cell.h;this.camera.updateProjectionMatrix();
      r.setViewport(cell.x,cell.y,cell.w,cell.h);r.setScissor(cell.x,cell.y,cell.w,cell.h);r.render(this.scene,this.camera);
    }
    r.setScissorTest(false);
  }
}
const mediator=new Mediator({},null),root=new Root('#root',mediator),scene=root.add('scene','#scene',SwordView);
const header=root.add('header','header');header.add('eyebrow','small');header.add('title','h1');
const labels=root.add('labels','#labels');labels.el.querySelectorAll('section').forEach((el,i)=>labels.add('pose'+i,el));
const footer=root.add('footer','footer');footer.add('note','#note');const controls=footer.add('controls','#controls');
const play=controls.add('play','#play').on('click','toggle');
const camera=controls.add('camera','#camera').on('change','camera',e=>({value:e.target.value}));
const style=controls.add('style','#style').on('change','style',e=>({value:Number(e.target.value)}));
controls.link(ev=>{ev.ctx.source='controls';});
const state={time:0,camera:'body',style:0,width:innerWidth,height:innerHeight};
const CAMERAS={body:{offset:[3,1.3,5.4],fov:35},grip:{target:'hand',offset:[.8,.45,1.25],fov:30},side:{offset:[5,1.1,.7],fov:35},game:{offset:[0,7.1,8.0],fov:50}};
function present(){
  const t=state.time,loop=t%2;
  const base={t,kind:'sword',moving:false,walkT:0,combo:0,swing:-1,spin:-1,sweep:-1,dodge:0,down:0,hurt:0,guard:false,charging:false,motion:''};
  const poses=[{...base},{...base,charging:loop<1.1,charge:.85,swing:loop<1.1?.02:(loop-1.1)/.9,combo:2},{...base,motion:'sw_slant',motionT:mediator.is('playing')?t%TREE_MOTIONS.sw_slant.duration:.28}];
  const portrait=state.width<700,bottom=portrait?130:85,top=portrait?140:155,h=state.height-top-bottom;
  const cells=poses.map((_,i)=>portrait?{x:0,y:bottom+(2-i)*h/3,w:state.width,h:h/3}:{x:Math.floor(i*state.width/3),y:bottom,w:Math.floor((i+1)*state.width/3)-Math.floor(i*state.width/3),h});
  scene.set({...state,poses,cells,camera:CAMERAS[state.camera]});play.set({text:mediator.is('playing')?'Pause':'Play'});camera.set({value:state.camera});style.set({value:state.style});
}
mediator.states={paused:{enter:present,on:{toggle:()=> 'playing'}},playing:{enter:present,on:{toggle:()=> 'paused',tick(ev){state.time+=ev.payload.dt;present();}}},'*':{on:{camera(ev){if(CAMERAS[ev.payload.value]){state.camera=ev.payload.value;present();}},style(ev){if([0,1,2,3].includes(ev.payload.value)){state.style=ev.payload.value;present();}},resize(ev){Object.assign(state,ev.payload);present();}}}};
mediator.go('paused');addEventListener('resize',()=>root.emit('resize',{width:innerWidth,height:innerHeight}));
let last=performance.now();function frame(t){const dt=Math.min(.05,(t-last)/1000);last=t;if(mediator.is('playing'))root.emit('tick',{dt});requestAnimationFrame(frame);}requestAnimationFrame(frame);
window.swordPreview={root,mediator,scene,state};window.ready=true;
