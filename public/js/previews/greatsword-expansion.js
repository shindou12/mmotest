import * as THREE from 'three';
import { makeWeapon } from '../models.js';
import { Root, View, Mediator } from '../ui/core.js';

const normalForms = [
  { id: 0, name: 'バランス型', note: '幅広の両刃と長い握り' },
  { id: 1, name: '大包丁', note: '短く角張った重量刃' },
  { id: 2, name: 'ツヴァイヘンダー', note: '細身の刀身と受け流し鉤' },
  { id: 3, name: 'フランベルジュ', note: '波刃と枝状の鍔' },
  { id: 4, name: '大太刀', note: '長い反りと円形の鍔' },
  { id: 5, name: 'ファルシオン', note: '先端へ重さを寄せた片刃' },
];
const uniqueForms = [
  { id: 'excalibur', name: 'エクスカリバー', style: 6, rarity: 7, note: '聖剣の長い刃・翼状の鍔・蒼い宝石' },
  { id: 'dainsleif', name: 'ダーインスレイヴ', style: 7, rarity: 6, note: '片側の鋸刃・血色の溝・暗い鉄' },
];
const models = new Map();
for (const form of normalForms) models.set(`normal/${form.id}`, makeWeapon('greatsword', 2, form.id));
for (const form of uniqueForms) {
  models.set(`unique/${form.id}/before`, makeWeapon('greatsword', form.rarity, 3));
  models.set(`unique/${form.id}/after`, makeWeapon('greatsword', form.rarity, form.style));
}

class GreatswordScene extends View {
  constructor(el, name, parent) {
    super(el, name, parent);
    this.renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x14212b);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xbfe4ff, 0x5b6050, 1.9));
    const sun = new THREE.DirectionalLight(0xffead1, 2.4);
    sun.position.set(-3, 6, 5);
    this.scene.add(sun);
    for (const model of models.values()) this.scene.add(model);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  }
  set(p) {
    if (this.width !== p.width || this.height !== p.height) {
      this.renderer.setSize(p.width, p.height, false);
      this.width = p.width; this.height = p.height;
    }
    const renderer = this.renderer;
    renderer.setScissorTest(false); renderer.setViewport(0, 0, p.width, p.height); renderer.clear(); renderer.setScissorTest(true);
    for (const cell of p.cells) {
      for (const model of models.values()) model.visible = false;
      const model = models.get(cell.key);
      if (!model) continue;
      model.visible = true; model.rotation.y = p.yaw;
      const drawH = cell.h - cell.captionGap, target = new THREE.Vector3(0, 0.9, 0);
      this.camera.position.copy(target).add(new THREE.Vector3(...p.camera.offset));
      this.camera.lookAt(target);
      this.camera.aspect = cell.w / drawH; this.camera.fov = p.camera.fov; this.camera.updateProjectionMatrix();
      renderer.setViewport(cell.x, cell.y, cell.w, drawH);
      renderer.setScissor(cell.x, cell.y, cell.w, drawH);
      renderer.render(this.scene, this.camera);
    }
    renderer.setScissorTest(false);
  }
}

const mediator = new Mediator({}, null), root = new Root('#root', mediator);
const scene = root.add('scene', '#scene', GreatswordScene);
const captions = root.add('captions', '#captions');
const footer = root.add('footer', 'footer'), controls = footer.add('controls', '#controls');
controls.add('mode', '#mode').on('change', 'select', event => ({ control: 'mode', value: event.target.value }));
controls.add('angle', '#angle').on('change', 'select', event => ({ control: 'angle', value: event.target.value }));
controls.link(event => { event.ctx.source = 'controls'; });
const state = { width: innerWidth, height: innerHeight, mode: 'normal', angle: 'three-quarter' };

function cellsForMode(height, bottom) {
  const cells = [];
  if (state.mode === 'normal') {
    const columns = 3, rows = 2, cellH = Math.floor(height / rows);
    normalForms.forEach((form, index) => {
      const col = index % columns, row = Math.floor(index / columns);
      const x = Math.floor(col * state.width / columns), right = Math.floor((col + 1) * state.width / columns);
      cells.push({ key: `normal/${form.id}`, x, y: bottom + (rows - 1 - row) * cellH, w: right - x, h: cellH, captionGap: state.width < 700 ? 44 : 0, title: form.name, description: form.note, label: index < 4 ? '既存通常' : '追加通常' });
    });
    return cells;
  }
  const columns = 2, rows = uniqueForms.length, cellH = Math.floor(height / rows);
  uniqueForms.forEach((form, row) => {
    for (const [col, version] of ['before', 'after'].entries()) {
      const x = Math.floor(col * state.width / columns), right = Math.floor((col + 1) * state.width / columns);
      cells.push({ key: `unique/${form.id}/${version}`, x, y: bottom + (rows - 1 - row) * cellH, w: right - x, h: cellH, captionGap: state.width < 700 ? 44 : 0, title: form.name, description: version === 'before' ? '現在の共通フランベルジュ形' : form.note, label: version === 'before' ? '現在' : '専用モデル' });
    }
  });
  return cells;
}

function parameters() {
  const top = 118, bottom = 72, height = Math.max(300, state.height - top - bottom);
  const cells = cellsForMode(height, bottom);
  const theta = state.angle === 'front' ? 0 : state.angle === 'side' ? Math.PI / 2 : 0.58;
  return { ...state, cells, yaw: state.angle === 'front' ? 0 : state.angle === 'side' ? Math.PI / 2 : 0.25, camera: { offset: [Math.sin(theta) * (state.width < 700 ? 7 : 5.8), 0.12, Math.cos(theta) * (state.width < 700 ? 7 : 5.8)], fov: state.width < 700 ? 43 : 38 } };
}

function present() {
  const p = parameters(); scene.set(p);
  const key = p.cells.map(cell => `${cell.key}/${cell.label}`).join(',');
  if (captions.layoutKey !== key) {
    captions.layoutKey = key;
    captions.list(p.cells, () => ({ html: '<section class="caption"><small></small><strong></strong><span></span></section>', setup(view) { view.add('label', 'small'); view.add('title', 'strong'); view.add('description', 'span'); } }));
  }
  [...captions.children.values()].forEach((view, index) => {
    const cell = p.cells[index];
    view.set({ style: { left: `${cell.x}px`, top: `${state.height - cell.y - cell.h}px`, width: `${cell.w}px` } });
    view.get('label').set({ text: cell.label });
    view.get('title').set({ text: cell.title });
    view.get('description').set({ text: cell.description });
  });
}

mediator.states = {
  paused: {
    enter: present,
    on: {
      select(event) {
        const { control, value } = event.payload;
        if (control === 'mode' && ['normal', 'unique'].includes(value)) state.mode = value;
        if (control === 'angle' && ['front', 'three-quarter', 'side'].includes(value)) state.angle = value;
        present();
      },
    },
  },
  '*': { on: { resize(event) { Object.assign(state, event.payload); present(); } } },
};
mediator.go('paused');
addEventListener('resize', () => root.emit('resize', { width: innerWidth, height: innerHeight }));
window.greatswordExpansion = { root, mediator, state, scene, models };
window.ready = true;
