// 戦闘で使う見た目（three.js のメッシュ）を作るところ。ゲームの処理はここで作ったものを置いて動かすだけ
import * as THREE from 'three';
import { makeWeapon } from '../models.js';

// 這いずりのゲージの円の内側・外側の半径
export const RING = [1.35, 1.75];

// 矢の見た目
export function arrowMesh(color, big) {
  // 小さくて見えにくかったので、光る矢じりと長い光の尾を付けて大きめにする
  const g = new THREE.Group();
  const s = big ? 2.0 : 1.5;
  const bright = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35).multiplyScalar(2.2);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, 1.2 * s, 6), new THREE.MeshBasicMaterial({ color: 0xfff4dc }));
  shaft.rotation.x = Math.PI / 2; g.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.13 * s, 0.38 * s, 6), new THREE.MeshBasicMaterial({ color: bright }));
  head.rotation.x = Math.PI / 2; head.position.z = 0.75 * s; g.add(head);
  const glowM = new THREE.MeshBasicMaterial({ color: bright, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28 * s, 10, 8), glowM);
  orb.position.z = 0.7 * s; g.add(orb);
  for (const rz of [0, Math.PI / 2]) {
    const trail = new THREE.Mesh(new THREE.PlaneGeometry(0.3 * s, 3.2 * s), new THREE.MeshBasicMaterial({ color: bright, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    trail.rotation.set(Math.PI / 2, 0, 0); trail.rotateY(rz); trail.position.z = -1.0 * s; g.add(trail);
  }
  g.userData.isArrow = true;
  return g;
}
// 投げた斧の幻影（今の武器のレア度・形の斧を、半透明の一色にする）
export function phantomAxe(color, wr, wst) {
  const group=new THREE.Group(),weapon=makeWeapon('axe',wr,wst),oldMaterials=new Set();
  const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9});
  weapon.traverse(part=>{if(part.material){oldMaterials.add(part.material);part.material=material;}});
  for(const mat of oldMaterials)mat.dispose();weapon.rotation.x=Math.PI/2;group.add(weapon);return group;
}

// ボスの弾の見た目（芯と光の輪）
export function bossProjMesh(m) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(m.r, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(m.c).multiplyScalar(1.6) }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(m.r * 1.7, 14, 10), new THREE.MeshBasicMaterial({ color: m.c, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(core, halo);
  return g;
}

// ---- 弓の照準ガイド: 足元の射程の円（引くほど広がり、最大射程で止まる）と狙いの線
export function makeBowGuide() {
  const group = new THREE.Group();
  const flat = (geo, c, op) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, depthTest: false })); m.rotation.x = -Math.PI / 2; return m; };
  const disc = flat(new THREE.CircleGeometry(1, 96), 0x9affd8, 0.05); // 射程の内側（うっすら）
  const ring = flat(new THREE.RingGeometry(0.975, 1, 128), 0x9affd8, 0.6); // いまの射程
  const max = flat(new THREE.RingGeometry(0.99, 1, 128), 0xffffff, 0.2); // 最大射程（引いている間だけ）
  // 狙いの線（引いている間）
  const aim = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  aim.geometry.translate(0, 0.5, 0);
  aim.geometry.rotateX(Math.PI / 2); // +z 方向へ伸びる
  for (const m of [disc, ring, max, aim]) { m.renderOrder = 4; group.add(m); }
  return { group, disc, ring, max, aim };
}

// スマホの狙いの印（自動ターゲットの輪・狙い線・着弾点）
export function touchGuideMesh() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: 0x9ae8ff, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  line.geometry.translate(0, 0.5, 0); line.geometry.rotateX(Math.PI / 2);
  const spot = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.5, 40), new THREE.MeshBasicMaterial({ color: 0x9ae8ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
  spot.rotation.x = -Math.PI / 2;
  for (const m of [ring, line, spot]) { m.renderOrder = 5; group.add(m); }
  return { group, ring, line, spot };
}

// 這いずりのゲージの円（下地と、残りを示す前景）
export function reviveRingMesh() {
  const mat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.RingGeometry(RING[0] - 0.08, RING[1] + 0.08, 64), mat(0x101820, 0.6));
  const fg = new THREE.Mesh(new THREE.RingGeometry(RING[0], RING[1], 4), mat(0xffd84a, 0.95));
  bg.renderOrder = 20; fg.renderOrder = 21;
  g.add(bg, fg);
  g.rotation.x = -Math.PI / 2;
  return { g, fg };
}
// 前景の円弧（segments: 分割数 / len: 長さのラジアン。12時から回る）
export const reviveRingGeo = (segments, len) => new THREE.RingGeometry(RING[0], RING[1], segments, 1, Math.PI / 2, len);

// ボスの照準線（ボス → 狙われた人）
export function aimLineMesh() {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff4a3a, transparent: true, depthTest: false }));
  line.renderOrder = 7;
  return line;
}

// 頭割り（全ボス共通の「集まる」）: 足元の黄色い円（弾ける範囲）と、そこへ向かって縮む輪＋内向きの矢印、頭上の黄色い輪。
// setProgress(k, t): k = 0→1 で外側の輪が START 倍の大きさから円の縁まで縮む。矢印は輪に沿って並び、内側へ流れる
export function stackMarkMesh(r) {
  const START = 2.6, ARROWS = 8, Y = 0xffd84a;
  const mat = (op) => new THREE.MeshBasicMaterial({ color: Y, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
  const flat = (geo, op) => { const m = new THREE.Mesh(geo, mat(op)); m.rotation.x = -Math.PI / 2; m.renderOrder = 6; return m; };
  const g = new THREE.Group();
  const disc = flat(new THREE.CircleGeometry(r, 48), 0.16); disc.position.y = 0.07;
  const edge = flat(new THREE.RingGeometry(r - 0.14, r, 48), 0.85); edge.position.y = 0.08;
  const outer = flat(new THREE.RingGeometry(0.97, 1, 64), 0.9); outer.position.y = 0.09;
  // 内向きの矢印（くの字）: ローカル -Z が内側
  const chevron = new THREE.Shape([[-0.55, 0.3], [0, -0.25], [0.55, 0.3], [0.55, 0.05], [0, -0.5], [-0.55, 0.05]].map(([x, y]) => new THREE.Vector2(x, y)));
  const arrowGeo = new THREE.ShapeGeometry(chevron);
  const arrows = [];
  for (let i = 0; i < ARROWS; i++) {
    const piv = new THREE.Group(); piv.rotation.y = (i / ARROWS) * Math.PI * 2;
    const a = flat(arrowGeo, 0.95); a.rotation.z = Math.PI; a.position.y = 0.1; piv.add(a); g.add(piv); arrows.push(a);
  }
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 6, 32), mat(0.95)); halo.rotation.x = Math.PI / 2; halo.position.y = 3.3;
  g.add(disc, edge, outer, halo);
  g.setProgress = (k, t) => {
    const cur = r * (START - (START - 1) * Math.min(1, k));
    outer.scale.setScalar(cur);
    for (const a of arrows) a.position.z = cur - 0.35 - ((t * 1.6) % 1) * Math.min(1.2, cur - r + 0.3); // 輪から内側へ流れる
    halo.rotation.z = t * 3;
    disc.material.opacity = 0.16 + 0.14 * k;
  };
  return g;
}

// 罠（弓）: 地面の輪と、6本の杭
export function trapMesh(o) {
  const g = new THREE.Group(), col = o.color ?? 0xffc860;
  const ring = new THREE.Mesh(new THREE.RingGeometry(o.r - 0.12, o.r, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 5), new THREE.MeshLambertMaterial({ color: 0xd8c8a8 }));
    const a = i / 6 * Math.PI * 2; sp.position.set(Math.sin(a) * o.r * 0.45, 0.15, Math.cos(a) * o.r * 0.45); g.add(sp);
  }
  return { g, ring, col };
}

// 旗手の旗（盾槍）: 旗竿・旗・効果範囲の輪
export function bannerMesh() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), new THREE.MeshLambertMaterial({ color: 0x8a6a40 }));
  pole.position.y = 1.6; g.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshBasicMaterial({ color: 0x6ab0ff, side: THREE.DoubleSide }));
  flag.position.set(0.55, 2.8, 0); g.add(flag);
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.8, 5, 48), new THREE.MeshBasicMaterial({ color: 0x6ab0ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
  return { g, flag, ring };
}

// 色（数値・文字列）を three.js の色に
export const toColor = (c) => new THREE.Color(c);
// 手の位置（ワールド座標）を追うもの。手がないときは前の位置のまま
export function handTracker() {
  const v = new THREE.Vector3();
  return (model) => { model.userData.hand?.getWorldPosition(v); return v; };
}

// 飛び道具（strikes.proj の shape）の形の登録表。形を足すときはここに足す（shape がない・知らないときは斬撃波）
//   make(color, fx, wr, wst): メッシュ / wave: 斬撃波として扱う（斬撃波を強める効果が乗る） / tick(w, dt): 毎フレームの見た目
export const PROJ_SHAPES = {
  wave: {
    wave: true,
    make: (color, fx) => fx.waveMesh(color),
    tick(w) { w.mesh.material.opacity = 0.9 * (1 - w.t / w.life); w.mesh.scale.setScalar(1 + w.t * 1.5); },
  },
  // 投げた斧: 今の武器の斧の幻影が回りながら飛ぶ
  axe: {
    wave: false,
    make: (color, fx, wr, wst) => phantomAxe(color, wr, wst),
    tick(w, dt) { w.mesh.children[0].rotation.z += dt * 18; w.mesh.traverse((part) => { if (part.material) part.material.opacity = .9 * (1 - w.t / w.life); }); },
  },
};
export const projShape = (shape) => (Object.hasOwn(PROJ_SHAPES, shape ?? '') ? PROJ_SHAPES[shape] : PROJ_SHAPES.wave);
