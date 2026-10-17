// エリアの地形・建物・プロップ・草・空・遠景（トゥーン調）
// 部品は env/ の各ファイル（kit・landmarks・props・obstacles・open・grid・ambient）
import * as THREE from 'three';
import { waypointOf } from '../shared/areas.js';
import { makeWaypoint } from './env/landmarks.js';
import { buildOpen } from './env/open.js';
import { buildGrid } from './env/grid.js';
export { textSprite, makeHeight } from './env/kit.js';
export { AmbientParticles } from './env/ambient.js';

// ---------------------------------------------------------------------------
// 共通パーツ
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// エリアの組み立て
// ---------------------------------------------------------------------------
export function buildArea(def, fdef, opts = {}) {
  const fd = { ...fdef, n: def.floor };
  // 天候: 霧を近く濃くし、空と霧の色を天候の色へ寄せ、日差しを弱める
  const W = opts.weather;
  if (W && def.shape !== 'grid') {
    const tint = (c, k) => new THREE.Color(c).lerp(new THREE.Color(W.tint), k).getHex();
    fd.fog = tint(fdef.fog, W.mix); fd.skyTop = tint(fdef.skyTop, W.mix * 0.8); fd.skyBot = tint(fdef.skyBot, W.mix);
    fd.fogNear = fdef.fogNear * W.near; fd.fogFar = fdef.fogFar * W.far; fd.sunI = fdef.sunI * W.sun;
    fd.sun = tint(fdef.sun, W.mix * 0.5);
  }
  const env = def.shape === 'grid' ? buildGrid(def, fd) : buildOpen(def, fd, opts);
  // ワープポイント（町・野営地は転移門が兼ねるので置かない）
  const w = waypointOf(def);
  env.waypoint = null;
  if (!w.hub) {
    const obj = makeWaypoint();
    obj.position.set(w.x, env.heightAt(w.x, w.z), w.z);
    env.group.add(obj);
    env.waypoint = { x: w.x, z: w.z, obj, setOn: obj.userData.setOn };
    const up = env.update;
    env.update = (t, ...rest) => { up(t, ...rest); obj.userData.anim(t); };
  }
  return env;
}

// ---------------------------------------------------------------------------
// 屋外の障害物・ハザード・宝箱・共有ボックス
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// プロップ（バッチに追加）
// ---------------------------------------------------------------------------
