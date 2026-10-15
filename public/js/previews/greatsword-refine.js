import * as THREE from 'three';
import { makeWeapon, makeWeaponPreview } from '../models.js';
import { GREATSWORDBEFORE } from '../models/prototypes/greatsword-before.js';
import { Root, View, Mediator } from '../ui/core.js';

const forms = [
  { id: 0, name: 'Balanced greatsword', note: 'Broad, centered blade / long leather grip' },
  { id: 1, name: 'Cleaver', note: 'Shorter slab blade / clipped square shoulders' },
  { id: 2, name: 'Zweihänder', note: 'Long narrow blade / parrying hooks / extended grip' },
  { id: 3, name: 'Flamberge', note: 'Wavy edge / muted warm fuller / branch guard' },
];
const models = new Map();
for (const form of forms) {
  models.set(`${form.id}/before`, makeWeaponPreview('greatsword', 0, form.id, GREATSWORDBEFORE[form.id === 0 ? 'base' : form.id === 1 ? 'cleaver' : form.id === 2 ? 'zweihander' : 'flamberge']));
  models.set(`${form.id}/after`, makeWeapon('greatsword', 0, form.id));
}

class GreatswordView extends View {
  constructor(el, name, parent) {
    super(el, name, parent);
    this.renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1); this.renderer.setClearColor(0x14212b); this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xbfe4ff, 0x5b6050, 1.9));
    const sun = new THREE.DirectionalLight(0xffead1, 2.4); sun.position.set(-3, 6, 5); this.scene.add(sun);
    for (const model of models.values()) this.scene.add(model);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  }
  set(p) {
    if (this.width !== p.width || this.height !== p.height) { this.renderer.setSize(p.width, p.height, false); this.width = p.width; this.height = p.height; }
    const r = this.renderer; r.setScissorTest(false); r.setViewport(0, 0, p.width, p.height); r.clear(); r.setScissorTest(true);
    for (const cell of p.cells) {
      for (const model of models.values()) model.visible = false;
      const model = models.get(`${cell.id}/${cell.version}`); model.visible = true; model.rotation.y = p.yaw;
      const drawH = cell.h - cell.captionGap, target = new THREE.Vector3(0, 0.94, 0);
      this.camera.position.copy(target).add(new THREE.Vector3(...p.camera.offset)); this.camera.lookAt(target);
      this.camera.aspect = cell.w / drawH; this.camera.fov = p.camera.fov; this.camera.updateProjectionMatrix();
      r.setViewport(cell.x, cell.y, cell.w, drawH); r.setScissor(cell.x, cell.y, cell.w, drawH); r.render(this.scene, this.camera);
    }
    r.setScissorTest(false);
  }
}

const mediator = new Mediator({}, null), root = new Root('#root', mediator), scene = root.add('scene', '#scene', GreatswordView);
const captions = root.add('captions', '#captions'), footer = root.add('footer', 'footer'), controls = footer.add('controls', '#controls');
const angle = controls.add('angle', '#angle').on('change', 'select', e => ({ value: e.target.value })); controls.link(ev => { ev.ctx.source = 'controls'; });
const state = { width: innerWidth, height: innerHeight, angle: 'three-quarter' };
function parameters() {
  const top = 132, bottom = 80, height = Math.max(280, state.height - top - bottom), cells = [];
  forms.forEach((form, row) => {
    for (const [col, version] of ['before', 'after'].entries()) {
      const w = Math.floor((col + 1) * state.width / 2) - Math.floor(col * state.width / 2), h = Math.floor(height / forms.length);
      cells.push({ id: form.id, version, x: Math.floor(col * state.width / 2), y: bottom + (forms.length - 1 - row) * h, w, h, captionGap: state.width < 700 ? 36 : 0, title: form.name, description: version === 'before' ? 'Current' : form.note, label: version === 'before' ? 'CURRENT' : 'REFINED' });
    }
  });
  const theta = state.angle === 'front' ? 0 : state.angle === 'side' ? Math.PI / 2 : 0.55;
  return { ...state, cells, yaw: state.angle === 'front' ? 0 : state.angle === 'side' ? Math.PI / 2 : 0.24, camera: { offset: [Math.sin(theta) * 5.8, 0.12, Math.cos(theta) * 5.8], fov: state.width < 700 ? 40 : 38 } };
}
function present() {
  const p = parameters(); scene.set(p); const key = p.cells.map(c => `${c.id}/${c.version}`).join(',');
  if (captions.layoutKey !== key) { captions.layoutKey = key; captions.list(p.cells, () => ({ html: '<section class="caption"><small></small><strong></strong><span></span></section>', setup(v) { v.add('label', 'small'); v.add('title', 'strong'); v.add('description', 'span'); } })); }
  [...captions.children.values()].forEach((view, i) => {
    const cell = p.cells[i]; view.set({ style: { left: `${cell.x}px`, top: `${state.height - cell.y - cell.h}px`, width: `${cell.w}px` } });
    view.get('label').set({ text: cell.label }); view.get('title').set({ text: cell.title }); view.get('description').set({ text: cell.description });
  });
  angle.set({ value: state.angle });
}
mediator.states = { paused: { enter: present, on: { select(ev) { if (['front', 'three-quarter', 'side'].includes(ev.payload.value)) { state.angle = ev.payload.value; present(); } } } }, '*': { on: { resize(ev) { Object.assign(state, ev.payload); present(); } } } };
mediator.go('paused'); addEventListener('resize', () => root.emit('resize', { width: innerWidth, height: innerHeight }));
window.greatswordRefine = { root, mediator, state, scene, models }; window.ready = true;
