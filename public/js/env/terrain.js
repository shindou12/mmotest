// エリアの見た目: 地形エリア（shape: 'terrain'）。地形ごとの見た目（terrain-meadow.js など）に、出口・宝箱を足す
import { AREAS, exitsOf, chestsOf } from '../../shared/areas.js';
import { terrainOf } from '../../shared/terrain/index.js';
import { makePortal } from './landmarks.js';
import { makeChest } from './obstacles.js';
import { buildMeadow } from './terrain-meadow.js';

const SCENES = { meadow: buildMeadow };

export function buildTerrain(def, fdef, opts) {
  const S = SCENES[def.terrain](opts), T = terrainOf(def), anims = [];
  const group = S.group, heightAt = S.heightAt;
  // 出口: 切り通しの中に門を立てる（谷の外を向く）
  const dirs = new Map(T.EXITS.map((e) => [e.to, e.dir]));
  const portals = exitsOf(def).map((e) => {
    const p = makePortal(AREAS[e.to].name), [dx, dz] = dirs.get(e.to);
    p.position.set(e.x, heightAt(e.x, e.z), e.z); p.rotation.y = Math.atan2(dx, dz);
    group.add(p); anims.push(p.userData.anim);
    return { ...e, obj: p };
  });
  const chests = chestsOf(def).map((c) => {
    const obj = makeChest(false);
    obj.position.set(c.x, heightAt(c.x, c.z), c.z); obj.rotation.y = Math.atan2(-c.x, -c.z);
    group.add(obj); anims.push(obj.userData.anim);
    return { ...c, obj };
  });
  return {
    group, gate: null, portals, heightAt, ringMats: [], lair: null, chests, box: null,
    light: { hemi: S.light.hemi, sun: S.light.sun, fog: S.light.fog, fogNear: S.light.fogNear, fogFar: S.light.fogFar },
    update(t, px, pz) { for (const a of anims) a(t); S.update(t, px, pz); },
  };
}
