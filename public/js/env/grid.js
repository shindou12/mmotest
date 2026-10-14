// エリアの見た目: 迷路のエリア（ダンジョン・迷宮区）
import * as THREE from 'three';
import { CELL, AREAS, grid, exitsOf, lairOf, chestsOf } from '../../shared/areas.js';
import { toon, glow, outline, Batch } from '../toon.js';
import { seeded, hashStr, local, I, at, textSprite } from './kit.js';
import { makeSky, makePortal, makeLair } from './landmarks.js';
import { makeChest } from './obstacles.js';

export function buildGrid(def, fdef) {
  const group = new THREE.Group();
  const g = grid(def);
  const R = seeded(hashStr(def.id));
  const anims = [];
  const isLab = def.type === 'labyrinth';
  group.add(makeSky(fdef, true));
  const floorC = new THREE.Color(fdef.ground).lerp(new THREE.Color(0x6a6a72), 0.7).multiplyScalar(0.8);
  const wallC = new THREE.Color(fdef.ground2).lerp(new THREE.Color(isLab ? 0x9a96a4 : 0x8a8274), 0.8).multiplyScalar(isLab ? 0.85 : 0.7);
  const topC = wallC.clone().multiplyScalar(0.7);
  const B = new Batch();
  const H = 3.2;
  const open = (c, r) => r >= 0 && c >= 0 && r < g.H && c < g.W && g.rows[r][c] !== '#';
  for (let r = 0; r < g.H; r++) {
    for (let c = 0; c < g.W; c++) {
      const ch = g.rows[r][c];
      const x = (c - g.W / 2 + 0.5) * CELL, z = (r - g.H / 2 + 0.5) * CELL;
      if (ch === '#') {
        if (![[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dc, dr]) => open(c + dc, r + dr))) continue;
        B.add(new THREE.BoxGeometry(CELL, H, CELL), wallC.clone().offsetHSL(0, 0, (R() - 0.5) * 0.05), local(I, x, H / 2, z), { flat: true });
        B.add(new THREE.BoxGeometry(CELL + 0.1, 0.3, CELL + 0.1), topC, local(I, x, H + 0.15, z), { flat: true });
        // 松明
        if (R() < 0.1) {
          const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dc, dr]) => open(c + dc, r + dr));
          if (dir) {
            const tx = x + dir[0] * (CELL / 2 + 0.15), tz = z + dir[1] * (CELL / 2 + 0.15);
            B.add(new THREE.CylinderGeometry(0.08, 0.06, 0.8, 6), 0x4a3020, local(I, tx, 2.0, tz, dir[1] * 0.4, 0, -dir[0] * 0.4));
            B.add(new THREE.SphereGeometry(0.2, 8, 6), new THREE.Color(0xffa040).multiplyScalar(1.5), local(I, tx + dir[0] * 0.15, 2.5, tz + dir[1] * 0.15), { glowing: true });
          }
        }
        continue;
      }
      const fc = floorC.clone().offsetHSL(0, 0, ((c + r) % 2) * 0.025 + (R() - 0.5) * 0.03);
      if (ch === 'T' || ch === 't') {
        fc.lerp(new THREE.Color(0x6a3a2a), 0.4);
        for (let k = 0; k < 4; k++) B.add(new THREE.ConeGeometry(0.15, 0.35, 5), 0x9a9aa4, local(I, x + (k % 2 - 0.5) * 1.6, 0.17, z + (Math.floor(k / 2) - 0.5) * 1.6), { flat: true });
      }
      B.add(new THREE.BoxGeometry(CELL, 0.2, CELL), fc, local(I, x, -0.1, z), { flat: true });
      if (ch === '.' && R() < 0.05) B.add(new THREE.DodecahedronGeometry(0.3, 0), wallC, local(I, x + (R() - 0.5) * 2, 0.15, z + (R() - 0.5) * 2, R(), R(), R()), { flat: true });
    }
  }
  group.add(B.build());

  // 出口
  const portals = exitsOf(def).map((e) => {
    const p = makePortal(AREAS[e.to].name);
    p.position.set(e.x, 0, e.z);
    group.add(p); anims.push(p.userData.anim);
    return { ...e, obj: p };
  });

  // 扉
  let door = null;
  for (const d of g.pts.D || []) {
    door = new THREE.Group();
    const bar = toon(0x5a5a64);
    for (let k = 0; k < 6; k++) door.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, H, 6), bar), -1.6 + k * 0.64, H / 2, 0));
    door.add(at(new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.3, 0.3), bar), 0, H - 0.3, 0));
    door.add(at(new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.3, 0.3), bar), 0, 0.5, 0));
    const seal = at(new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), glow(new THREE.Color(fdef.boss.accent).multiplyScalar(1.4), { side: THREE.DoubleSide })), 0, H / 2, 0.2);
    door.add(seal);
    door.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    outline(door, 1);
    door.position.set(d.x, 0, d.z);
    group.add(door);
  }

  // レバー
  let lever = null;
  for (const L of g.pts.L || []) {
    lever = new THREE.Group();
    lever.add(at(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.8), toon(0x6a6a74)), 0, 0.3, 0));
    const stick = new THREE.Group(); stick.position.y = 0.6; lever.add(stick);
    stick.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 8), toon(0x8a6a4a)), 0, 0.65, 0));
    stick.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), toon(0xd04a3a)), 0, 1.3, 0));
    stick.rotation.z = 0.6;
    lever.userData.stick = stick;
    lever.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    outline(lever, 1);
    lever.add(at(textSprite('レバー', '#ffd27a', 3, '[F] 引く'), 0, 2.8, 0));
    lever.position.set(L.x, 0, L.z);
    group.add(lever);
  }

  // 宝箱
  const chests = chestsOf(def).map((c) => {
    const obj = makeChest(true);
    obj.position.set(c.x, 0, c.z);
    group.add(obj); anims.push(obj.userData.anim);
    return { ...c, obj };
  });

  // 感圧板
  const plates = (g.pts.P || []).map((P) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.15, 24), new THREE.MeshToonMaterial({ color: 0x8a8aa0, emissive: 0x40c0ff, emissiveIntensity: 0 }));
    m.position.set(P.x, 0.08, P.z); m.receiveShadow = true;
    group.add(m);
    const lab = at(textSprite('感圧板', '#9ae8ff', 3), P.x, 2.2, P.z); group.add(lab);
    return m;
  });

  // ボス部屋
  const lair = lairOf(def);
  let ringMats = [];
  if (lair) {
    const L = makeLair(lair, fdef.boss.accent, fdef.ground);
    group.add(L.group); ringMats = L.ringMats; anims.push(L.group.userData.anim);
  }

  return {
    group, gate: null, portals, door, lever, chests, box: null, plates, lair, ringMats, heightAt: () => 0,
    light: { hemi: 0.75, sun: fdef.sunI * 0.45, fogNear: 14, fogFar: 60, fog: new THREE.Color(fdef.fog).multiplyScalar(0.25).getHex() },
    update(t) { for (const a of anims) a(t); },
  };
}
