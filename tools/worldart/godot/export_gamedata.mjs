// ゲームの共通の表（public/shared/）から、Godot の試作クライアントが使うデータを書き出す（L27）。
//   node tools/worldart/godot/export_gamedata.mjs   → godot/worldart/data/game.json
// 書き出すもの: 武器の表（数値だけ）、レベルごとの基礎の攻撃力・HP・武器の防御、必要経験値、近接の被ダメ軽減、
//   階層（敵の名前・色・形）、屋外のエリア（輪郭 1° ごと・出口・当たり判定・出現位置・ワープポイント）。
// 計算の式（collide・inShape・ダメージ）は godot/worldart/scripts/game/ に GDScript で移してある（元の式と同じ）。
import fs from 'node:fs';
import * as D from '../../../public/shared/data.js';
import { AREAS, CELL, grid, boundR, maxR, exitsOf, obstaclesOf, hazardsOf, chestsOf, spawnPoint, waypointOf, arrival } from '../../../public/shared/areas.js';
import { BALANCE, REVIVE } from '../../../public/shared/balance.js';

const r3 = (v) => Math.round(v * 1000) / 1000;
const scalars = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => ['number', 'string', 'boolean'].includes(typeof v)));
const weapons = Object.fromEntries(Object.entries(D.WEAPONS).map(([k, w]) => [k, scalars(w)]));
const levels = [];
for (let lv = 1; lv <= D.MAX_LEVEL; lv++) {
  levels.push({ lv, atk: r3(D.baseAtk(lv)), hp: r3(D.baseHp(lv)), xp: D.xpToNext(lv), wdef: Object.fromEntries(Object.keys(D.WEAPONS).map((k) => [k, r3(D.weaponDef(k, lv))])) });
}
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const floors = D.FLOORS.map((F) => ({
  n: F.n, name: F.name, ground: hex(F.ground), ground2: hex(F.ground2),
  mobs: F.mobs.map((m) => ({ t: m.t, name: m.name, color: hex(m.color), scale: m.scale ?? null })),
  elites: (F.elites || []).map((m) => ({ t: m.t, name: m.name, color: hex(m.color), scale: m.scale ?? null })),
  boss: F.boss ? { name: F.boss.name, t: F.boss.t, color: hex(F.boss.color), scale: F.boss.scale ?? 1, minions: (F.boss.minions || []).map((m) => ({ t: m.t, name: m.name, color: hex(m.color), scale: m.scale ?? null })) } : null,
}));
const areas = {};
for (const [id, def] of Object.entries(AREAS)) {
  const a = { id, name: def.name, floor: def.floor, type: def.type, shape: def.shape, layout: def.layout || '', exits: exitsOf(def).map((e) => ({ to: e.to, x: r3(e.x), z: r3(e.z), r: e.r })) };
  if (def.shape === 'open') {
    a.outline = [];
    for (let i = 0; i < 360; i++) { const ang = i * Math.PI / 180, r = boundR(def, ang); a.outline.push([r3(Math.sin(ang) * r), r3(-Math.cos(ang) * r)]); }
    a.maxR = r3(maxR(def));
    a.obstacles = obstaclesOf(def).map((o) => ({ kind: o.kind, x: r3(o.x), z: r3(o.z), r: r3(o.r), solid: !!o.solid, ...(o.box ? { box: { x: o.box.x, z: o.box.z, w: o.box.w, d: o.box.d, ry: o.box.ry } } : {}) }));
    a.hazards = hazardsOf(def);
    a.chests = chestsOf(def).map((c) => ({ id: c.id, x: r3(c.x), z: r3(c.z) }));
    a.spawn = spawnPoint(def); a.waypoint = waypointOf(def);
    a.arrivals = Object.fromEntries(def.exits.map((e) => [e.to, arrival(def, e.to)]));
  } else {
    // 屋内のマス目（# 壁 . 床 E 出口 D 扉 L レバー P 感圧板 C 宝箱 B ボス部屋の中心 など）。1 マス CELL m
    const g = grid(def);
    Object.assign(a, { cell: CELL, W: g.W, H: g.H, rows: g.rows, pts: Object.fromEntries(Object.entries(g.pts).map(([k, v]) => [k, v.map((p) => ({ c: p.c, r: p.r, x: p.x, z: p.z }))])),
      gimmick: def.gimmick || '', chests: chestsOf(def).map((c) => ({ id: c.id, x: r3(c.x), z: r3(c.z), big: true })), spawn: spawnPoint(def), waypoint: waypointOf(def) });
  }
  areas[id] = a;
}
const out = {
  note: 'tools/worldart/godot/export_gamedata.mjs が public/shared/ から書く。手で直さない',
  affixes: D.AFFIXES, weightClasses: D.WEIGHT_CLASSES.map((w) => ({ ...w, max: Number.isFinite(w.max) ? w.max : 1e9 })), armorClasses: D.ARMOR_CLASSES,
  balance: BALANCE, revive: REVIVE, treasure: { id: D.TREASURE_ID, t: D.TREASURE_DEF.t, name: D.TREASURE_DEF.name, color: hex(D.TREASURE_DEF.color ?? 0xffd84a), scale: D.TREASURE_DEF.scale ?? 1 }, instinct: D.INSTINCT, defaultWeapon: D.DEFAULT_WEAPON, rarities: D.RARITIES.map((r) => ({ name: r.name, color: r.color })),
  weapons, levels, floors, areas, floorHub: Object.fromEntries(D.FLOORS.map((F) => [F.n, Object.keys(AREAS).find((k) => AREAS[k].floor === F.n && (AREAS[k].type === 'town' || AREAS[k].type === 'camp'))])),
};
fs.writeFileSync(new URL('../../../godot/worldart/data/game.json', import.meta.url), JSON.stringify(out));
console.log('-> godot/worldart/data/game.json', Object.keys(areas).length, 'areas', (JSON.stringify(out).length / 1024).toFixed(0), 'KB');
