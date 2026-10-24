// エリアごとの人物の光を書き出す（G2-3）。ブラウザ版 game/area.js enterArea・env.js buildArea・env/open.js・env/grid.js の光の決め方と同じ。
//   node tools/worldart/godot/export_arealight.mjs   → godot/worldart/data/area_light.json
// 値（ToonLook.set_light に渡す）: sun（日差しの色 #rrggbb）, sun_i（日差しの強さ）, sky・ground（半球光の空と地面の色）, hemi_i（半球光の強さ）
//   屋外: hemi_i 1.1、日差しは階層の sun・sunI。天候があれば sun_i に W.sun を掛け、色を W.tint へ W.mix*0.5 寄せる（env.js）。
//   屋内（grid）: hemi_i 0.75、sun_i = sunI * 0.45、天候なし。
import fs from 'node:fs';
import * as THREE from 'three';
import * as D from '../../../public/shared/data.js';
import { AREAS, WEATHERS } from '../../../public/shared/areas.js';

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const out = {};
for (const [id, def] of Object.entries(AREAS)) {
  const F = D.FLOORS[def.floor - 1];
  const indoor = def.shape === 'grid';
  const W = indoor ? null : WEATHERS[def.weather];
  let sun = F.sun, sunI = indoor ? F.sunI * 0.45 : F.sunI;
  if (W) { sun = new THREE.Color(F.sun).lerp(new THREE.Color(W.tint), W.mix * 0.5).getHex(); sunI = F.sunI * W.sun; }
  out[id] = { sun: hex(sun), sun_i: sunI, sky: hex(F.hemi[0]), ground: hex(F.hemi[1]), hemi_i: indoor ? 0.75 : 1.1 };
}
fs.writeFileSync(new URL('../../../godot/worldart/data/area_light.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('-> godot/worldart/data/area_light.json', Object.keys(out).length, 'areas');
