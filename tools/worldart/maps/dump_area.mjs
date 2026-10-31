// ゲームのエリア（public/shared/areas.js）の遊びに関わる形を書き出す（第 3 世代の地図を作る材料）。
//   node tools/worldart/maps/dump_area.mjs f1_field > art/blender/f1_field_area.json
// 輪郭（boundR を 1° ごと）、出口、ワープポイント、障害物（岩・木・池。当たり判定）、宝箱、出現位置、ゲームの地面の高さ（2m 格子）
import { AREAS, boundR, maxR, exitsOf, obstaclesOf, hazardsOf, chestsOf, spawnPoint, arrival, waypointOf } from '../../../public/shared/areas.js';
import { makeHeight } from '../../../public/js/env/kit.js';

const id = process.argv[2] || 'f1_field';
const def = AREAS[id];
const r3 = (v) => Math.round(v * 1000) / 1000;
const outline = [];
for (let i = 0; i < 360; i++) { const a = i * Math.PI / 180, r = boundR(def, a); outline.push([r3(Math.sin(a) * r), r3(-Math.cos(a) * r)]); }
const H = makeHeight(def), MR = maxR(def), hs = [];
for (let z = -Math.ceil(MR); z <= Math.ceil(MR); z += 2) { const row = []; for (let x = -Math.ceil(MR); x <= Math.ceil(MR); x += 2) row.push(r3(H(x, z))); hs.push(row); }
const out = {
  id, name: def.name, type: def.type, floor: def.floor, R: def.R, ell: def.ell, maxR: r3(MR), outline,
  exits: exitsOf(def).map((e) => ({ to: e.to, name: AREAS[e.to].name, x: r3(e.x), z: r3(e.z), r: e.r })),
  arrivals: Object.fromEntries(def.exits.map((e) => [e.to, arrival(def, e.to)])),
  spawn: spawnPoint(def), waypoint: waypointOf(def),
  obstacles: obstaclesOf(def).map((o) => ({ kind: o.kind, x: r3(o.x), z: r3(o.z), r: r3(o.r), solid: o.solid })),
  hazards: hazardsOf(def), chests: chestsOf(def).map((c) => ({ id: c.id, x: r3(c.x), z: r3(c.z) })),
  heights: { x0: -Math.ceil(MR), z0: -Math.ceil(MR), step: 2, rows: hs },
};
console.log(JSON.stringify(out));
