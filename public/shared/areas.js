// 階層ごとのエリア定義（サーバー・クライアント共通）
//
// エリアの形は2種類:
//   open … 円形の屋外エリア（町・野営地・フィールド・狩場）。半径 R、出口は東西南北の端
//   grid … マス目の屋内エリア（ダンジョン・迷宮区）。map の文字:
//     # 壁  . 床  E 入口（出口）  M 敵の湧き  G 門番（精鋭）  B ボス部屋の中心  C 宝箱
//     L レバー  D 扉  P 感圧板  T / t 罠床（2グループが交互に作動）

export const CELL = 4;

export const AREA_TYPES = {
  town: { name: '町', icon: '⌂', color: '#ffd27a' },
  camp: { name: '野営地', icon: '⛺', color: '#ffd27a' },
  field: { name: 'フィールド', icon: '✿', color: '#8fe08a' },
  hunt: { name: '狩場', icon: '⚔', color: '#ff9a6a' },
  dungeon: { name: 'ダンジョン', icon: '◈', color: '#b98aff' },
  labyrinth: { name: '迷宮区', icon: '♜', color: '#ff6a8a' },
};

const L_ARENA = [
  '#####################',
  '#######.......#######',
  '#######.......#######',
  '#######.......#######',
  '#######...B...#######',
  '#######.......#######',
  '#######.......#######',
  '#######.......#######',
  '##########D##########',
];

const MAPS = {
  // 第1層 迷宮区: レバーを引くとボス部屋の扉が開く
  lab1: [
    ...L_ARENA,
    '##.....###.###.....##',
    '##..M..###.###..L..##',
    '##.....###.###.....##',
    '##.....#.....#.....##',
    '###.####..M..####.###',
    '###.####.....####.###',
    '###.......M.......###',
    '#########...#########',
    '#########...#########',
    '#########.E.#########',
    '#########...#########',
    '#####################',
  ],
  // 第2層 迷宮区: 交互に作動する罠床を抜け、門番を倒すと扉が開く
  lab2: [
    ...L_ARENA,
    '#########.G.#########',
    '#########...#########',
    '####......T......####',
    '####.####.t.####.####',
    '####.#M..tTt..M#.####',
    '####.####.t.####.####',
    '####......T......####',
    '#########...#########',
    '#########.M.#########',
    '#########.E.#########',
    '#########...#########',
    '#####################',
  ],
  // 第3層 迷宮区: 離れた2つの感圧板を15秒以内に両方踏むと扉が開く
  lab3: [
    ...L_ARENA,
    '##.....##...##.....##',
    '##..P..##.M.##..P..##',
    '##.....##...##.....##',
    '###.#####...#####.###',
    '###.#####.M.#####.###',
    '###...............###',
    '#########...#########',
    '#######..M.M..#######',
    '#########...#########',
    '#########.E.#########',
    '#####################',
  ],
  dun1: [
    '###############',
    '####.....######',
    '####..C..######',
    '####.....######',
    '######.########',
    '##.....M....###',
    '##.###.###..###',
    '##.#M....#..###',
    '##.#.###.#M.###',
    '##...#...#..###',
    '######.###..###',
    '######.......##',
    '##########.####',
    '##########E####',
    '###############',
  ],
  dun2: [
    '###############',
    '###.......#####',
    '###.M...M.#####',
    '###...#...#####',
    '#####.#.#######',
    '#####.#.......#',
    '#.....#####.C.#',
    '#.###.....#...#',
    '#.#M#.###.#####',
    '#.#.#.#M..#####',
    '#...#.#.###.###',
    '#####.#.....###',
    '#####...#######',
    '#######E#######',
    '###############',
  ],
};
MAPS.dun3 = MAPS.dun1.map((row) => [...row].reverse().join(''));

// 第1〜3層。mapPos はエリアマップ上の表示位置（0〜100）
export const AREAS = {
  // ---------------- 第1層 ----------------
  f1_town: {
    floor: 1, type: 'town', name: 'はじまりの街', shape: 'open', R: 34, gate: { x: 0, z: 0 }, mapPos: [50, 86],
    exits: [{ to: 'f1_field', dir: 'n' }],
    npcs: [
      { id: 'captain', name: '衛兵隊長 ガレス', x: -9, z: -6, color: '#c0504a', line: '迷宮区を越えねば、上の層へは行けん。腕を磨いてこい。' },
      { id: 'hunter', name: '狩人 ミラ', x: 10, z: -4, color: '#5aa060', line: '東の丘はイノシシだらけ。狩りの練習にはもってこいよ。' },
      { id: 'sage', name: '賢者 オルド', x: 6, z: 10, color: '#7a6ad0', line: '西の古井戸の底に、古い宝が眠っているという噂じゃ。' },
    ],
  },
  f1_field: {
    floor: 1, type: 'field', name: 'ひだまりの草原', shape: 'open', R: 52, mapPos: [50, 56],
    exits: [{ to: 'f1_town', dir: 's' }, { to: 'f1_hunt', dir: 'e' }, { to: 'f1_dun', dir: 'w' }, { to: 'f1_lab', dir: 'n' }],
    mobs: { count: 9, perPlayer: 3, lv: [0, 3] },
  },
  f1_hunt: {
    floor: 1, type: 'hunt', name: 'イノシシの丘', shape: 'open', R: 40, mapPos: [84, 56],
    exits: [{ to: 'f1_field', dir: 'w' }],
    mobs: { count: 16, perPlayer: 4, lv: [1, 4], only: 1, xp: 1.6, respawn: 0.5 },
  },
  f1_dun: {
    floor: 1, type: 'dungeon', name: '古井戸の洞窟', shape: 'grid', map: MAPS.dun1, mapPos: [16, 56],
    exits: [{ to: 'f1_field' }],
    mobs: { lv: [3, 5], elite: true, respawnSec: 40 },
    unique: { name: '古井戸の守り刀', slot: 'weapon', kind: 'dagger', fx: ['vamp'], lore: '井戸の底で錆びずに眠っていた短刀。' },
  },
  f1_lab: {
    floor: 1, type: 'labyrinth', name: '第1層 迷宮区', shape: 'grid', map: MAPS.lab1, mapPos: [50, 18],
    exits: [{ to: 'f1_field' }], gimmick: 'lever',
    mobs: { lv: [2, 4], respawnSec: 50 },
  },
  // ---------------- 第2層 ----------------
  f2_camp: {
    floor: 2, type: 'camp', name: '霧の野営地', shape: 'open', R: 24, gate: { x: 0, z: 2 }, mapPos: [50, 86],
    exits: [{ to: 'f2_field', dir: 'n' }],
    npcs: [{ id: 'ranger', name: '森番 セイル', x: 7, z: -5, color: '#4a8a7a', line: '霧の森の奥、朽ちた大樹の洞には近づくな…と言っても行くんだろう？' }],
  },
  f2_field: {
    floor: 2, type: 'field', name: '霧の森', shape: 'open', R: 52, mapPos: [50, 56],
    exits: [{ to: 'f2_camp', dir: 's' }, { to: 'f2_hunt', dir: 'e' }, { to: 'f2_dun', dir: 'w' }, { to: 'f2_lab', dir: 'n' }],
    mobs: { count: 10, perPlayer: 3, lv: [0, 3] },
  },
  f2_hunt: {
    floor: 2, type: 'hunt', name: 'キノコの群生地', shape: 'open', R: 40, mapPos: [84, 56],
    exits: [{ to: 'f2_field', dir: 'w' }],
    mobs: { count: 16, perPlayer: 4, lv: [1, 4], only: 0, xp: 1.6, respawn: 0.5 },
  },
  f2_dun: {
    floor: 2, type: 'dungeon', name: '朽ちた樹洞', shape: 'grid', map: MAPS.dun2, mapPos: [16, 56],
    exits: [{ to: 'f2_field' }],
    mobs: { lv: [3, 5], elite: true, respawnSec: 40 },
    unique: { name: '樹霊の外套', slot: 'armor', fx: ['aegis'], lore: '朽ちた大樹の精が編んだという外套。' },
  },
  f2_lab: {
    floor: 2, type: 'labyrinth', name: '第2層 迷宮区', shape: 'grid', map: MAPS.lab2, mapPos: [50, 18],
    exits: [{ to: 'f2_field' }], gimmick: 'gatekeeper',
    mobs: { lv: [2, 4], respawnSec: 50 },
  },
  // ---------------- 第3層 ----------------
  f3_camp: {
    floor: 3, type: 'camp', name: 'オアシスの野営地', shape: 'open', R: 24, gate: { x: 0, z: 2 }, mapPos: [50, 86],
    exits: [{ to: 'f3_field', dir: 'n' }],
    npcs: [{ id: 'merchant', name: '行商人 ハサン', x: -7, z: -4, color: '#c08a3a', line: '砂の下の神殿？ あそこの宝はとびきりだって話さ。' }],
  },
  f3_field: {
    floor: 3, type: 'field', name: '砂塵の荒野', shape: 'open', R: 52, mapPos: [50, 56],
    exits: [{ to: 'f3_camp', dir: 's' }, { to: 'f3_hunt', dir: 'e' }, { to: 'f3_dun', dir: 'w' }, { to: 'f3_lab', dir: 'n' }],
    mobs: { count: 10, perPlayer: 3, lv: [0, 3] },
  },
  f3_hunt: {
    floor: 3, type: 'hunt', name: '蠍の巣', shape: 'open', R: 40, mapPos: [84, 56],
    exits: [{ to: 'f3_field', dir: 'w' }],
    mobs: { count: 16, perPlayer: 4, lv: [1, 4], only: 0, xp: 1.6, respawn: 0.5 },
  },
  f3_dun: {
    floor: 3, type: 'dungeon', name: '埋もれた神殿', shape: 'grid', map: MAPS.dun3, mapPos: [16, 56],
    exits: [{ to: 'f3_field' }],
    mobs: { lv: [3, 5], elite: true, respawnSec: 40 },
    unique: { name: '砂王の盾槍', slot: 'weapon', kind: 'spear', fx: ['thunder'], lore: '砂に沈んだ王が最後まで手放さなかった槍。' },
  },
  f3_lab: {
    floor: 3, type: 'labyrinth', name: '第3層 迷宮区', shape: 'grid', map: MAPS.lab3, mapPos: [50, 18],
    exits: [{ to: 'f3_field' }], gimmick: 'plates',
    mobs: { lv: [2, 4], respawnSec: 50 },
  },
};
export const FLOOR_HUB = { 1: 'f1_town', 2: 'f2_camp', 3: 'f3_camp' };
export const PLATE_WINDOW = 15;

for (const [id, a] of Object.entries(AREAS)) a.id = id;

// ---------------------------------------------------------------------------
// マス目エリアの補助
// ---------------------------------------------------------------------------
const gridCache = new Map();
export function grid(def) {
  if (gridCache.has(def.id)) return gridCache.get(def.id);
  const rows = def.map, H = rows.length, W = rows[0].length;
  const pts = {};
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch !== '#' && ch !== '.') (pts[ch] = pts[ch] || []).push({ c, r, ...cellToWorldWH(W, H, c, r) });
  }));
  const g = { W, H, rows, pts };
  gridCache.set(def.id, g);
  return g;
}
function cellToWorldWH(W, H, c, r) { return { x: (c - W / 2 + 0.5) * CELL, z: (r - H / 2 + 0.5) * CELL }; }
export const cellToWorld = (g, c, r) => cellToWorldWH(g.W, g.H, c, r);
export const worldToCell = (g, x, z) => ({ c: Math.floor(x / CELL + g.W / 2), r: Math.floor(z / CELL + g.H / 2) });
export function solidAt(g, c, r, doorOpen) {
  if (r < 0 || c < 0 || r >= g.H || c >= g.W) return true;
  const ch = g.rows[r][c];
  return ch === '#' || (ch === 'D' && !doorOpen);
}

// 壁との当たり判定。open エリアは円の中に収める
export function collide(def, x, z, rad = 0.5, doorOpen = false) {
  if (def.shape === 'open') {
    const d = Math.hypot(x, z), max = def.R - 1;
    return d > max ? { x: x * max / d, z: z * max / d } : { x, z };
  }
  const g = grid(def);
  for (let pass = 0; pass < 2; pass++) {
    const { c, r } = worldToCell(g, x, z);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!solidAt(g, c + dc, r + dr, doorOpen)) continue;
      const cx = (c + dc - g.W / 2) * CELL, cz = (r + dr - g.H / 2) * CELL;
      const nx = Math.max(cx, Math.min(x, cx + CELL)), nz = Math.max(cz, Math.min(z, cz + CELL));
      const dx = x - nx, dz = z - nz, d = Math.hypot(dx, dz);
      if (d < rad) {
        if (d > 1e-4) { x = nx + dx / d * rad; z = nz + dz / d * rad; }
        else { // 中心が壁の中: 一番近い辺へ押し出す
          const opts = [[cx - rad - x, 0], [cx + CELL + rad - x, 0], [0, cz - rad - z], [0, cz + CELL + rad - z]];
          opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
          x += opts[0][0]; z += opts[0][1];
        }
      }
    }
  }
  return { x, z };
}

// 迷路の中で目標へ向かう次の地点（幅優先探索）
export function pathStep(def, x, z, tx, tz, doorOpen) {
  if (def.shape === 'open') return { x: tx, z: tz };
  const g = grid(def);
  const s = worldToCell(g, x, z), t = worldToCell(g, tx, tz);
  if (s.c === t.c && s.r === t.r) return { x: tx, z: tz };
  const key = (c, r) => r * g.W + c;
  const prev = new Map([[key(s.c, s.r), -1]]);
  const q = [[s.c, s.r]];
  while (q.length) {
    const [c, r] = q.shift();
    if (c === t.c && r === t.r) break;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr, k = key(nc, nr);
      if (prev.has(k) || solidAt(g, nc, nr, doorOpen)) continue;
      prev.set(k, key(c, r));
      if (prev.size > 600) break;
      q.push([nc, nr]);
    }
  }
  // 目標から出発点の隣までさかのぼる
  const sk = key(s.c, s.r);
  let k = key(t.c, t.r);
  if (!prev.has(k)) return { x: tx, z: tz };
  while (prev.get(k) !== sk) {
    k = prev.get(k);
    if (k === -1 || k === undefined) return { x: tx, z: tz };
  }
  return cellToWorld(g, k % g.W, Math.floor(k / g.W));
}

// ---------------------------------------------------------------------------
// 出口・到着地点
// ---------------------------------------------------------------------------
const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
export function exitsOf(def) {
  if (def.shape === 'open') {
    return def.exits.map((e) => {
      const [dx, dz] = DIRS[e.dir];
      return { to: e.to, x: dx * (def.R - 4), z: dz * (def.R - 4), dir: e.dir, r: 3 };
    });
  }
  const g = grid(def);
  return (g.pts.E || []).map((p, i) => ({ to: def.exits[i]?.to ?? def.exits[0].to, x: p.x, z: p.z, r: 2.2 }));
}
// from エリアから来たときの出現位置（出口の少し内側）
export function arrival(def, from) {
  const ex = exitsOf(def).find((e) => e.to === from);
  if (!ex) return spawnPoint(def);
  if (def.shape === 'open') {
    const d = Math.hypot(ex.x, ex.z) || 1;
    return { x: ex.x - ex.x / d * 6, z: ex.z - ex.z / d * 6 };
  }
  const g = grid(def), { c, r } = worldToCell(g, ex.x, ex.z);
  for (const [dc, dr] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) {
    if (!solidAt(g, c + dc, r + dr, false) && g.rows[r + dr][c + dc] !== 'E') return cellToWorld(g, c + dc, r + dr);
  }
  return { x: ex.x, z: ex.z };
}
// 死亡時などの基本の出現位置
export function spawnPoint(def) {
  if (def.gate) return { x: def.gate.x, z: def.gate.z + 6 };
  return arrival(def, def.exits[0].to);
}
export function lairOf(def) {
  if (def.type !== 'labyrinth') return null;
  const b = grid(def).pts.B[0];
  return { x: b.x, z: b.z, r: 13 };
}
