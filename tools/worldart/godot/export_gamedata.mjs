// ゲームの共通の表（public/shared/）から、Godot の試作クライアントが使うデータを書き出す（L27）。
//   node tools/worldart/godot/export_gamedata.mjs   → godot/worldart/data/game.json
// 書き出すもの: 武器の表（数値だけ）、レベルごとの基礎の攻撃力・HP・武器の防御、必要経験値、近接の被ダメ軽減、
//   階層（敵の名前・色・形）、屋外のエリア（輪郭 1° ごと・出口・当たり判定・出現位置・ワープポイント）。
// 計算の式（collide・inShape・ダメージ）は godot/worldart/scripts/game/ に GDScript で移してある（元の式と同じ）。
import fs from 'node:fs';
import * as D from '../../../public/shared/data.js';
import { AREAS, CELL, grid, boundR, maxR, exitsOf, obstaclesOf, hazardsOf, chestsOf, spawnPoint, waypointOf, arrival } from '../../../public/shared/areas.js';
import { BALANCE, REVIVE } from '../../../public/shared/balance.js';
import { HEAVY, WEAPON_SKILLS, TREE_SKILLS, SKILL_CD_MULT, TREES } from '../../../public/js/skills.js';
import * as ST0 from '../../../public/js/game/state.js';
import { WTREES, WT_NODE, PROF_MAX, ROW_REQ } from '../../../public/js/weapon-tree.js';
import { TECHNIQUES } from '../../../public/shared/techniques.js';
import { TREE_MOTIONS } from '../../../public/shared/tree-motions.js';
import { MOTION_DURATIONS } from '../../../public/shared/motion-catalog.js';
import { SPEAR_TIMINGS } from '../../../public/shared/skill-timings.js';
import * as HU from '../../../public/js/game/hurt.js';
import * as IN from '../../../public/js/game/input.js';
import * as AC from '../../../public/js/game/actions.js';

// 数値は丸めない（GDScript の式を元の JavaScript と 1e-6 で照合するため。丸めると輪郭・能力値が 1e-3 ずれる）
const scalars = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => ['number', 'string', 'boolean'].includes(typeof v)));
const weapons = Object.fromEntries(Object.entries(D.WEAPONS).map(([k, w]) => [k, scalars(w)]));
const levels = [];
for (let lv = 1; lv <= D.MAX_LEVEL; lv++) {
  levels.push({ lv, atk: (D.baseAtk(lv)), hp: (D.baseHp(lv)), xp: D.xpToNext(lv), wdef: Object.fromEntries(Object.keys(D.WEAPONS).map((k) => [k, (D.weaponDef(k, lv))])) });
}
// 技の表（G1-2）: 関数でない項目だけ（名前・kind・cd・motion・duration など）。cd は skills.js が SKILL_CD_MULT（1.2）を掛けた後の値、
// 武器ツリーのスキル（WT_SKILLS）は最初から掛けた値。技の中身（run）は GDScript の scripts/game/skills/ に移してある
const skillTable = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, scalars(v)]));
const skills = { cdMult: SKILL_CD_MULT, heavy: skillTable(HEAVY), weapon: skillTable(WEAPON_SKILLS), tree: skillTable(TREE_SKILLS) };
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const floors = D.FLOORS.map((F) => ({
  n: F.n, name: F.name, ground: hex(F.ground), ground2: hex(F.ground2),
  mobs: F.mobs.map((m) => ({ t: m.t, name: m.name, color: hex(m.color), scale: m.scale ?? null })),
  elites: (F.elites || []).map((m) => ({ t: m.t, name: m.name, color: hex(m.color), scale: m.scale ?? null })),
  boss: F.boss ? { name: F.boss.name, t: F.boss.t, color: hex(F.boss.color), scale: F.boss.scale ?? 1, minions: (F.boss.minions || []).map((m) => ({ t: m.t, name: m.name, color: hex(m.color), scale: m.scale ?? null })) } : null,
}));
// areas.js boundR の式の値（R・ell・sq・wob と shapeParams の p1〜p3）。shapeParams は書き出されていないので同じ式で作り、
// 下で元の boundR と 3600 の角度で一致することを確かめる（ずれたら止まる）
const seededJs = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const hashStrJs = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
function boundParams(def) {
  const R = seededJs(hashStrJs(def.id) ^ 0x9e37), p1 = R() * 6.28, p2 = R() * 6.28, p3 = R() * 6.28;
  const b = { R: def.R, ell: def.ell || [1, 1], sq: def.sq || 2, wob: def.wob || 0, p1, p2, p3 };
  for (let i = 0; i < 3600; i++) {
    const a = i / 3600 * Math.PI * 2 - Math.PI, dx = Math.sin(a), dz = -Math.cos(a);
    const base = 1 / (Math.abs(dx / (b.R * b.ell[0])) ** b.sq + Math.abs(dz / (b.R * b.ell[1])) ** b.sq) ** (1 / b.sq);
    const v = base * (1 + b.wob * (0.55 * Math.sin(3 * a + p1) + 0.3 * Math.sin(5 * a + p2) + 0.15 * Math.sin(8 * a + p3)));
    if (v !== boundR(def, a)) throw new Error(`boundParams が boundR と違う: ${def.id} a=${a} ${v} != ${boundR(def, a)}`);
  }
  return b;
}
const areas = {};
for (const [id, def] of Object.entries(AREAS)) {
  const a = { id, name: def.name, floor: def.floor, type: def.type, shape: def.shape, layout: def.layout || '', weather: def.weather || null, exits: exitsOf(def).map((e) => ({ to: e.to, x: (e.x), z: (e.z), r: e.r })) };
  if (def.shape === 'open') {
    a.outline = [];
    for (let i = 0; i < 360; i++) { const ang = i * Math.PI / 180, r = boundR(def, ang); a.outline.push([(Math.sin(ang) * r), (-Math.cos(ang) * r)]); }
    a.maxR = (maxR(def));
    a.bound = boundParams(def);
    a.obstacles = obstaclesOf(def).map((o) => ({ kind: o.kind, x: (o.x), z: (o.z), r: (o.r), solid: !!o.solid, ...(o.box ? { box: { x: o.box.x, z: o.box.z, w: o.box.w, d: o.box.d, ry: o.box.ry } } : {}) }));
    a.hazards = hazardsOf(def);
    a.chests = chestsOf(def).map((c) => ({ id: c.id, x: (c.x), z: (c.z) }));
    a.spawn = spawnPoint(def); a.waypoint = waypointOf(def);
    a.arrivals = Object.fromEntries(def.exits.map((e) => [e.to, arrival(def, e.to)]));
  } else {
    // 屋内のマス目（# 壁 . 床 E 出口 D 扉 L レバー P 感圧板 C 宝箱 B ボス部屋の中心 など）。1 マス CELL m
    const g = grid(def);
    Object.assign(a, { cell: CELL, W: g.W, H: g.H, rows: g.rows, pts: Object.fromEntries(Object.entries(g.pts).map(([k, v]) => [k, v.map((p) => ({ c: p.c, r: p.r, x: p.x, z: p.z }))])),
      gimmick: def.gimmick || '', chests: chestsOf(def).map((c) => ({ id: c.id, x: (c.x), z: (c.z), big: true })), spawn: spawnPoint(def), waypoint: waypointOf(def) });
  }
  areas[id] = a;
}
const out = {
  note: 'tools/worldart/godot/export_gamedata.mjs が public/shared/ から書く。手で直さない',
  affixes: D.AFFIXES, weightClasses: D.WEIGHT_CLASSES.map((w) => ({ ...w, max: Number.isFinite(w.max) ? w.max : 1e9 })), armorClasses: D.ARMOR_CLASSES,
  balance: BALANCE, revive: REVIVE, treasure: { id: D.TREASURE_ID, t: D.TREASURE_DEF.t, name: D.TREASURE_DEF.name, color: hex(D.TREASURE_DEF.color ?? 0xffd84a), scale: D.TREASURE_DEF.scale ?? 1 }, instinct: D.INSTINCT, defaultWeapon: D.DEFAULT_WEAPON, rarities: D.RARITIES.map((r) => ({ name: r.name, color: r.color })),
  // スキル変化 SV のうち戦闘の式が使う値（G1-3a）: stunValue の SV.quake(t)。t は 0〜8 の添字（ティアは 1〜7）
  // G4: SV の全部（関数は t = 0〜8 の添字で並べた配列、定数はそのまま）。スキル変化の名前・色は skillVariants
  sv: Object.fromEntries(Object.entries(D.SV).map(([k, v]) => [k, typeof v === 'function' ? Array.from({ length: 9 }, (_, t) => v(t)) : v])),
  skillVariants: Object.fromEntries(Object.entries(D.SKILL_VARIANTS).map(([k, v]) => [k, { name: v.name, icon: v.icon, ...(v.color !== undefined ? { color: v.color } : {}) }])),
  // G4: 被弾・ガード・回転なぎ払いの表（hurt.js REACT / input.js GUARD・GUARD_BY / actions.js SWEEP）
  hurt: { REACT: HU.REACT, GUARD: IN.GUARD, GUARD_BY: IN.GUARD_BY, SWEEP: AC.SWEEP },
  skills, wtrees: WTREES, wtnode: WT_NODE, wtConst: { profMax: PROF_MAX, rowReq: ROW_REQ }, techniques: TECHNIQUES, treeMotions: TREE_MOTIONS, motionDurations: MOTION_DURATIONS, skillTimings: SPEAR_TIMINGS,
  // G1-3b: 武器スキルの候補・旧スキルツリー（stat・style）・状態の定数・自分の状態の初期値（state.js の me。モデルは除く）
  weaponSkillPool: D.WEAPON_SKILL_POOL, trees: TREES, consts: { chargeMin: ST0.CHARGE_MIN, chargeMax: ST0.CHARGE_MAX, dodgeCd: ST0.DODGE_CD },
  meInit: JSON.parse(JSON.stringify({ ...ST0.me, model: undefined })),
  weapons, levels, floors, areas, floorHub: Object.fromEntries(D.FLOORS.map((F) => [F.n, Object.keys(AREAS).find((k) => AREAS[k].floor === F.n && (AREAS[k].type === 'town' || AREAS[k].type === 'camp'))])),
};
fs.writeFileSync(new URL('../../../godot/worldart/data/game.json', import.meta.url), JSON.stringify(out));
console.log('-> godot/worldart/data/game.json', Object.keys(areas).length, 'areas', (JSON.stringify(out).length / 1024).toFixed(0), 'KB');
