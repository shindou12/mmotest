// エリアの見た目: 屋外のエリア（フィールド・狩場・町・野営地）
import * as THREE from 'three';
import { AREAS, exitsOf, boundR, angOf, maxR, insideOpen, obstaclesOf, hazardsOf, chestsOf } from '../../shared/areas.js';
import { toon, glow, Batch } from '../toon.js';
import { seeded, hashStr, makeHeight, local, I } from './kit.js';
import { makeSky, makeGate, makePortal, makeGrass, makeFar } from './landmarks.js';
import { makeProp } from './props.js';
import { makeObstacle, makeHazard, makeChest, makeBox } from './obstacles.js';
import { groundDetail } from './textures.js';
import { buildTown } from './town.js';
export { buildTown };

export function buildOpen(def, fdef, opts) {
  const group = new THREE.Group();
  const R = seeded(hashStr(def.id));
  const heightAt = makeHeight(def);
  const anims = [];
  group.add(makeSky(fdef, false));

  // 地面
  const MR = maxR(def);
  const size = (MR + 30) * 2;
  const ground = new THREE.PlaneGeometry(size, size, 150, 150);
  const obst = obstaclesOf(def), haz = hazardsOf(def), chestDefs = chestsOf(def);
  const blockers = [...obst, ...haz, ...chestDefs.map((c) => ({ x: c.x, z: c.z, r: 1.5 })), ...(def.box ? [{ ...def.box, r: 2 }] : [])];
  const nearBlock = (x, z, pad) => blockers.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + pad);
  const hazC = { poison: new THREE.Color(0x3a2a40), sand: new THREE.Color(0xe0c890) };
  ground.rotateX(-Math.PI / 2);
  const pos = ground.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const c1 = new THREE.Color(fdef.ground), c2 = new THREE.Color(fdef.ground2), tmp = new THREE.Color();
  const stoneC = new THREE.Color(0xa8a49a).lerp(c1, 0.15), pathC = c1.clone().lerp(new THREE.Color(0x8a7458), 0.55);
  const plaza = def.type === 'town' ? def.R * 0.62 : def.type === 'camp' ? 9 : 0;
  const exits = exitsOf(def);
  const onPath = (x, z, w) => exits.some((e) => {
    // 中心から各出口への小道
    const L = Math.hypot(e.x, e.z), ux = e.x / L, uz = e.z / L;
    const along = x * ux + z * uz, side = Math.abs(x * uz - z * ux + Math.sin(along * 0.12) * 2.5);
    return along > 0 && along < L && side < w;
  });
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    const k = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2) * Math.cos(z * 0.09);
    tmp.copy(c1).lerp(c2, k * 0.85 + Math.random() * 0.15);
    const r = Math.hypot(x, z);
    if (r < plaza) tmp.copy(stoneC).offsetHSL(0, 0, ((Math.floor(x * 0.8) + Math.floor(z * 0.8)) % 2) * 0.03 + Math.random() * 0.02);
    else if (onPath(x, z, 2.6)) tmp.lerp(pathC, onPath(x, z, 1.7) ? 0.85 : 0.45);
    for (const h of haz) {
      const d = Math.hypot(x - h.x, z - h.z);
      if (d < h.r + 1.2) tmp.lerp(hazC[h.kind], Math.min(1, (h.r + 1.2 - d) / 1.5) * 0.8);
    }
    for (const o of obst) if (o.kind === 'pond' && Math.hypot(x - o.x, z - o.z) < o.r + 1.4) tmp.lerp(new THREE.Color(0x8a7a5a), 0.5);
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  ground.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  ground.computeVertexNormals();
  // 細かいムラの模様は約7m ごとに繰り返す
  const uv = ground.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size / 7, uv.getY(i) * size / 7);
  const gm = new THREE.Mesh(ground, toon(0xffffff, { vertexColors: true, noOcc: true, map: groundDetail() }));
  gm.receiveShadow = true;
  group.add(gm);

  // 外周の崖（輪郭に沿って並べる）とプロップ
  const B = new Batch();
  const wallC = new THREE.Color(fdef.ground).multiplyScalar(0.55);
  // 岩の内側の面が輪郭（boundR）より内へはみ出さないように、岩の大きさぶん外へ置く
  const nWall = Math.round(MR * 1.8);
  for (let ring = 0; ring < 2; ring++) {
    for (let i = 0; i < nWall; i++) {
      const a = (i / nWall) * Math.PI * 2 + R() * 0.08;
      const w = ring ? 5 + R() * 4 : 3 + R() * 2.5, h = ring ? 12 + R() * 14 : 5 + R() * 8;
      const r = boundR(def, a) + w + (ring ? 6 : 1.2) + R() * 1.5;
      const x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (exits.some((e) => Math.hypot(e.x - x, e.z - z) < w + 4)) continue;
      B.add(new THREE.DodecahedronGeometry(1, 1), wallC.clone().offsetHSL(0, 0, (R() - 0.5) * 0.06 + (ring ? -0.03 : 0)), local(I, x, heightAt(x, z) + h * 0.25, z, R() * 0.3, R() * 6, R() * 0.3, w, h, w), { flat: true });
    }
  }
  // 町は家並みの外側（崖ぎわ）にだけ木や岩を置く
  const avoid = (x, z, pad = 3) => Math.hypot(x, z) < (def.type === 'town' ? boundR(def, angOf(x, z)) - 3 : plaza + pad) || !insideOpen(def, x, z, 2) || nearBlock(x, z, 1.5) || exits.some((e) => Math.hypot(e.x - x, e.z - z) < 7) || (def.gate && Math.hypot(x - def.gate.x, z - def.gate.z) < 10) || onPath(x, z, 3) || (def.npcs || []).some((n) => Math.hypot(n.x - x, n.z - z) < 3);
  const sx = def.ell?.[0] ?? 1, sz = def.ell?.[1] ?? 1;
  const scale = (def.R / 68) ** 2 * sx * sz * (def.type === 'hunt' ? 0.6 : def.type === 'field' ? 1.1 : def.type === 'secret' ? 0.9 : 0.7);
  for (const [type, count, col1, col2] of fdef.props) {
    for (let i = 0; i < Math.round(count * scale); i++) {
      const a = R() * Math.PI * 2, r = 4 + Math.sqrt(R()) * (boundR(def, a) - 3);
      const x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (avoid(x, z)) continue;
      makeProp(B, type, local(I, x, heightAt(x, z), z, 0, R() * Math.PI * 2, 0, 0.7 + R() * 0.8), R, col1, col2, fdef);
    }
  }
  // 障害物・ハザード・宝箱・共有ボックス
  for (const o of obst) makeObstacle(B, o, fdef, heightAt, R, group, anims);
  for (const h of haz) { const m = makeHazard(h, heightAt); group.add(m); anims.push(m.userData.anim); }
  const chests = chestDefs.map((c) => {
    const obj = makeChest(false);
    obj.position.set(c.x, heightAt(c.x, c.z), c.z);
    obj.rotation.y = Math.atan2(-c.x, -c.z);
    group.add(obj); anims.push(obj.userData.anim);
    return { ...c, obj };
  });
  let box = null;
  if (def.box) {
    box = makeBox();
    box.position.set(def.box.x, heightAt(def.box.x, def.box.z), def.box.z);
    box.rotation.y = Math.atan2(-def.box.x, -def.box.z);
    group.add(box); anims.push(box.userData.anim);
  }
  if (def.type === 'town') buildTown(B, def, R, heightAt, anims, group, { plaza, onPath });
  if (def.type === 'camp') buildCamp(B, def, R, heightAt, anims, group, nearBlock);
  if (def.type === 'hunt') {
    // 狩場: 木の柵と獣よけの杭
    for (let i = 0; i < 40; i++) {
      const a = R() * Math.PI * 2, r = boundR(def, a) * (0.35 + R() * 0.55);
      const x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (avoid(x, z, 0)) continue;
      const m = local(I, x, heightAt(x, z), z, 0, a + Math.PI / 2, 0);
      for (const s of [-1, 0, 1]) B.add(new THREE.CylinderGeometry(0.12, 0.14, 1.4, 6), 0x7a5a3a, local(m, s * 1.1, 0.7, 0));
      B.add(new THREE.BoxGeometry(2.6, 0.14, 0.12), 0x8a6a48, local(m, 0, 1.0, 0));
      B.add(new THREE.BoxGeometry(2.6, 0.14, 0.12), 0x8a6a48, local(m, 0, 0.55, 0));
    }
  }
  group.add(B.build());
  group.add(makeFar(fdef, R));

  // 草
  const grassAvoid = (x, z) => Math.hypot(x, z) < plaza + 1 || !insideOpen(def, x, z, 0) || nearBlock(x, z, 0.2) || (def.gate && Math.hypot(x - def.gate.x, z - def.gate.z) < 7) || onPath(x, z, 1.6) || exits.some((e) => Math.hypot(e.x - x, e.z - z) < 3);
  const grass = makeGrass(fdef, MR, heightAt, R, grassAvoid, (opts.grass ?? 1) * (def.type === 'town' ? 0.5 : 1), def.R * Math.sqrt(sx * sz));
  if (grass) group.add(grass.mesh);

  // 転移門・出口
  let gate = null;
  if (def.gate) { gate = makeGate(); gate.position.set(def.gate.x, 0, def.gate.z); group.add(gate); anims.push(gate.userData.anim); }
  const portals = exits.map((e) => {
    const p = makePortal(AREAS[e.to].name);
    p.position.set(e.x, heightAt(e.x, e.z), e.z);
    p.rotation.y = Math.atan2(e.x, e.z);
    group.add(p); anims.push(p.userData.anim);
    return { ...e, obj: p };
  });

  return {
    group, gate, portals, heightAt, ringMats: [], lair: null, chests, box,
    light: { hemi: 1.1, sun: fdef.sunI, fogNear: fdef.fogNear, fogFar: fdef.fogFar, fog: fdef.fog },
    update(t, px, pz) { for (const a of anims) a(t); if (grass) { grass.U.uTime.value = t; grass.U.uPlayer.value.set(px, pz); } },
  };
}

export function buildCamp(B, def, R, heightAt, anims, group, nearBlock) {
  // テントと焚き火
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * 0.3 + i * Math.PI * 0.45, r = 12, x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (nearBlock(x, z, 3) || (def.npcs || []).some((n) => Math.hypot(n.x - x, n.z - z) < 4) || exitsOf(def).some((e) => Math.hypot(e.x - x, e.z - z) < 7)) continue;
    const m = local(I, x, heightAt(x, z), z, 0, a + Math.PI, 0);
    B.add(new THREE.CylinderGeometry(0.01, 2.2, 2.6, 4), [0xc8b490, 0x8aa08a, 0xb08a6a, 0x9a9ab8][i], local(m, 0, 1.3, 0, 0, Math.PI / 4, 0, 1, 1, 1.4));
    B.add(new THREE.BoxGeometry(0.8, 1.2, 0.05), 0x3a2a1a, local(m, 0, 0.6, 1.55));
  }
  const fx = 6, fz = 6;
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; B.add(new THREE.DodecahedronGeometry(0.35, 0), 0x6a6a6a, local(I, fx + Math.sin(a) * 1, 0.15, fz + Math.cos(a) * 1), { flat: true }); }
  for (let k = 0; k < 3; k++) B.add(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), 0x5a3a20, local(I, fx, 0.2, fz, Math.PI / 2, k * 1.05, 0));
  const fire = new THREE.Group();
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 8), glow(new THREE.Color(0xff8a20).multiplyScalar(1.6)));
  const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 8), glow(new THREE.Color(0xffe060).multiplyScalar(1.6)));
  f1.position.y = 0.6; f2.position.y = 0.5; fire.add(f1, f2);
  fire.position.set(fx, 0, fz);
  group.add(fire);
  anims.push((t) => { const s = 1 + Math.sin(t * 13) * 0.12; f1.scale.set(1, s, 1); f2.scale.set(1, 2 - s, 1); });
}
