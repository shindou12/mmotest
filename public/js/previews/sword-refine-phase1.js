import * as THREE from 'three';
import { makePlayer, makeWeapon, setPlayerWeapon, animatePlayer } from '../models.js';
import { GRIP_Y } from '../pose-rig.js';
import { FLOORS } from '../../shared/data.js';
import { Root, View, Mediator } from '../ui/core.js';
import { makeSwordCandidate } from '../models/prototypes/straight-sword-candidates.js';
import { comparisonParams, VIEWS, SEQUENCES } from './sword-comparison-timeline.js';

const factories = [() => makeWeapon('sword',1,0), () => makeSwordCandidate('refined'), () => makeSwordCandidate('bold')];

// A Passive View: receives poses, transforms and camera parameters from the Presenter.
class SceneView extends View {
  constructor(el,name,parent) {
    super(el,name,parent);
    this.renderer = new THREE.WebGLRenderer({canvas:el,antialias:true,preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(1); this.renderer.setClearColor(0x14212b);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    const floor = FLOORS[0];
    this.scene.add(new THREE.HemisphereLight(floor.hemi[0],floor.hemi[1],1));
    const sun = new THREE.DirectionalLight(floor.sun,2); sun.position.set(20,40,10); sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024); Object.assign(sun.shadow.camera,{left:-6,right:6,top:16,bottom:-6,near:1,far:80}); sun.shadow.bias=-.0005; this.scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120,120),new THREE.MeshToonMaterial({color:0x3b5052}));
    ground.rotation.x=-Math.PI/2; ground.position.y=-.012; ground.receiveShadow=true; this.scene.add(ground);
    this.ground=ground;
    const grid=new THREE.GridHelper(80,40,0x627171,0x465c5b);grid.position.y=.001;grid.material.transparent=true;grid.material.opacity=.35;this.scene.add(grid);this.grid=grid;
    this.camera=new THREE.PerspectiveCamera(50,1,.1,160);
    this.players=factories.map((factory,index)=>{
      const m=makePlayer('#448a9b');setPlayerWeapon(m,'sword',1,0);
      if(index){
        const u=m.userData,old=u.weaponModel,w=factory();old.removeFromParent();
        // The existing hand and grip container remain untouched.
        w.position.y=-GRIP_Y.sword;u.weapon.add(w);u.weaponModel=w;
      }
      this.scene.add(m);return m;
    });
    this.studies=factories.map(factory=>{const w=factory();this.scene.add(w);return w;});
  }
  set(p) {
    if(this.width!==p.width||this.height!==p.height){this.renderer.setSize(p.width,p.height,false);this.width=p.width;this.height=p.height;}
    const r=this.renderer,portrait=p.width<700,top=158,bottom=portrait?140:86,h=p.height-top-bottom;
    r.setScissorTest(false);r.setViewport(0,0,p.width,p.height);r.clear();r.setScissorTest(true);
    this.ground.position.y=p.view==='detail'?-.48:-.012;this.grid.visible=p.view!=='detail';
    for(let i=0;i<3;i++){
      const x=portrait?0:Math.floor(i*p.width/3),w=portrait?p.width:Math.floor((i+1)*p.width/3)-x;
      const cellH=portrait?Math.floor(h/3):h,cellY=portrait?bottom+(2-i)*cellH:bottom;
      this.players.forEach((m,j)=>m.visible=p.view!=='detail'&&i===j);
      this.studies.forEach((m,j)=>m.visible=p.view==='detail'&&i===j);
      this.camera.aspect=w/cellH;
      if(p.view==='detail'){
        const weapon=this.studies[i];weapon.rotation.y=.25+Math.sin(p.time*.65)*.38;
        this.camera.fov=30;this.camera.position.set(0,.55,4.5);this.camera.lookAt(0,.55,0);
      }else{
        const actor=this.players[i];actor.position.set(0,0,p.z);actor.rotation.y=0;
        animatePlayer(actor,p.pose);
        this.camera.fov=p.camera.fov;
        this.camera.position.set(0,p.camera.targetY+Math.sin(p.camera.pitch)*p.camera.dist,p.z+Math.cos(p.camera.pitch)*p.camera.dist);
        this.camera.lookAt(0,p.camera.targetY,p.z);
      }
      this.camera.updateProjectionMatrix();r.setViewport(x,cellY,w,cellH);r.setScissor(x,cellY,w,cellH);r.render(this.scene,this.camera);
    }
    r.setScissorTest(false);
  }
}

const mediator=new Mediator({},null),root=new Root('#root',mediator);
const scene=root.add('scene','#scene',SceneView),viewLabel=root.add('viewLabel','#view-label'),phase=root.add('phase','#phase');
const header=root.add('header','header');header.add('title','h1');header.add('eyebrow','small');
const labels=root.add('labels','#labels');labels.el.querySelectorAll('section').forEach((el,i)=>labels.add('column'+i,el));
const footer=root.add('footer','footer');footer.add('note','#note');
const controls=footer.add('controls','#controls'),pause=controls.add('pause','#pause'),view=controls.add('view','#view'),sequence=controls.add('sequence','#sequence');
controls.add('restart','#restart').on('click','restart');pause.on('click','toggle');
view.on('change','view',e=>({value:e.target.value}));sequence.on('change','sequence',e=>({value:e.target.value}));
controls.link(ev=>{ev.ctx.source='controls';});

const state={time:0,view:'auto',sequence:'auto',mode:'playing',width:innerWidth,height:innerHeight};
function present(){
  const p=comparisonParams(state,state.width,state.height);
  scene.set(p);viewLabel.set({text:p.viewLabel});phase.set({text:p.phase});controls.set({visible:!p.capture});
  pause.set({text:p.paused?'Play':'Pause'});view.set({value:state.view});sequence.set({value:state.sequence});
}
const enter=mode=>()=>{state.mode=mode;present();};
mediator.states={
  playing:{enter:enter('playing'),on:{tick(ev){state.time+=ev.payload.dt;present();},toggle:()=> 'paused'}},
  paused:{enter:enter('paused'),on:{toggle:()=> 'playing'}},
  capture:{enter:enter('capture')},
  '*':{on:{
    view(ev){if(VIEWS.includes(ev.payload.value)){state.view=ev.payload.value;state.time=0;present();}},
    sequence(ev){if(SEQUENCES.includes(ev.payload.value)){state.sequence=ev.payload.value;state.time=0;present();}},
    restart(){state.time=0;present();},
    resize(ev){state.width=ev.payload.width;state.height=ev.payload.height;present();},
    capture(ev){state.time=Math.max(0,ev.payload.time);state.width=1280;state.height=720;state.view='auto';state.sequence='auto';if(this.is('capture'))present();else return 'capture';},
  }},
};
mediator.go('playing');
addEventListener('resize',()=>root.emit('resize',{width:innerWidth,height:innerHeight}));
let last=performance.now();
function frame(t){const dt=Math.min(.05,(t-last)/1000);last=t;if(mediator.is('playing'))root.emit('tick',{dt});requestAnimationFrame(frame);}
requestAnimationFrame(frame);
window.drawFrame=time=>root.emit('capture',{time});
window.swordPreview={root,mediator,scene,state};window.ready=true;
