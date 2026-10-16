// 階層ごとのエリア定義（サーバー・クライアント共通）
//
// エリアの形は2種類:
//   open … 屋外。半径 R を基準に、ell（横・縦の伸び）と wob（輪郭のゆらぎ）でいびつな形にする。
//          obst（障害物）、hazard（毒沼・流砂）、chests（小さな宝箱）、named（ネームド）を種から決定的に配置。
//          出口は ang（北=0°、東=90°）で輪郭上に置く
//   grid … 屋内のマス目（ダンジョン・迷宮区）。map の文字:
//     # 壁  . 床  E 入口（出口）  M 敵の湧き  G 門番（精鋭）  B ボス部屋の中心  C 宝箱
//     L レバー  D 扉  P 感圧板  T / t 罠床（2グループが交互に作動）

export const CELL = 4;

export const AREA_TYPES = {
  town: { name: '町', icon: '⌂', color: '#ffd27a' },
  camp: { name: '野営地', icon: '⛺', color: '#ffd27a' },
  field: { name: 'フィールド', icon: '✿', color: '#8fe08a' },
  hunt: { name: '狩場', icon: '⚔', color: '#ff9a6a' },
  secret: { name: '秘境', icon: '✧', color: '#7fffd4' },
  dungeon: { name: 'ダンジョン', icon: '◈', color: '#b98aff' },
  labyrinth: { name: '迷宮区', icon: '♜', color: '#ff6a8a' },
};

// 障害物の種類（solid: 通れない）
export const OBSTACLES = {
  rock: { solid: true, r: [2, 4] },
  tree: { solid: true, r: [1.6, 2.6] },
  ruin: { solid: true, r: [2.5, 4] },
  crystal: { solid: true, r: [1.5, 2.5] },
  pond: { solid: true, r: [5, 9] },
};
// ハザード（踏むと効果）
export const HAZARDS = {
  poison: { name: '毒沼', desc: '踏んでいる間ダメージ' },
  sand: { name: '流砂', desc: '足を取られて動きが遅くなる' },
};

// ボス部屋（幅11マス = 44m）。迷宮区の上部に置く
const ARENA = [
  '#######################',
  '######...........######',
  '######...........######',
  '######...........######',
  '######...........######',
  '######.....B.....######',
  '######...........######',
  '######...........######',
  '######...........######',
  '######...........######',
  '###########D###########',
];

// 十字の間（第2層・霧の大樹）: 中心3×3の広場から、幅3マス・長さ3マスの通路が4本。南の通路が扉につながる
const ARENA_CROSS = [
  '#######################',
  '##########...##########',
  '##########...##########',
  '##########...##########',
  '#######.........#######',
  '#######....B....#######',
  '#######.........#######',
  '##########...##########',
  '##########...##########',
  '##########...##########',
  '###########D###########',
];

// 砂の回廊（第3層・砂塵の大蠍）: 幅7マス（28m）・長さ18マスの細長い部屋。扉は南の端。部屋の判定は円ではなく長方形（longArena）
const ARENA_LONG = [
  '#######################',
  '########.......########',
  '########.......########',
  '########.......########',
  '########.......########',
  '########.......########',
  '########.......########',
  '########.......########',
  '########.......########',
  '########...B...########',
  '########.......########',
  '########.......########',
  '########.......########',
  '########.......########',
  '########.......########',
  '########.......########',
  '########.......########',
  '########.......########',
  '########.......########',
  '###########D###########',
];

// 迷宮区の迷路部分（31 × 40 マス）: 6〜12マス四方の部屋を、幅3〜4マスの通路でつなぐ。入口（下）から扉（ボス部屋の下）まで長めの道のり
//   K: 番兵（強い精鋭） / w: 群れ（足の速い弱い雑魚が3体） / M: 雑魚
// ボス部屋（幅23マス）を、迷宮区の幅（31マス）に合わせて両脇を壁で埋める
const wide = (rows) => rows.map((r) => '####' + r + '####');

const MAPS = {
  // 第1層 迷宮区: 入口の部屋 → 西の広間 → 北西の部屋 → 東の部屋 → 扉前の広間。扉は、入口から東の寄り道の部屋の奥のレバーで開く
  lab1: [
    ...wide(ARENA),
    '##############...##############',
    '##############...##############',
    '##############...##############',
    '########...............########',
    '########...............########',
    '########....K.....K....########',
    '########...............########',
    '########.......M.......########',
    '########...............########',
    '####################...########',
    '##............######...########',
    '##..M........................##',
    '##......K.................M..##',
    '##...........................##',
    '##.........M..####...........##',
    '##............####.......K...##',
    '####....##########....w......##',
    '####....##########...........##',
    '####....##########...........##',
    '####....#######################',
    '####....#######################',
    '####....#######################',
    '##.........####################',
    '##.........####################',
    '##..M......#############......#',
    '##.........#############...L..#',
    '##.........#############......#',
    '##....w....#############......#',
    '##.........#############......#',
    '##.........#############..K...#',
    '##...w.....#############......#',
    '##..................####......#',
    '##..................####......#',
    '######........................#',
    '######........................#',
    '######......................C.#',
    '######..............####......#',
    '###########.........###########',
    '###############E###############',
    '###############################',
  ],
  // 第2層 迷宮区: 入口 → 横長の広間 → 番兵の部屋 → 交互に作動する罠床の通路 → 門番の広間（門番を倒すと扉が開く）。西に宝箱の寄り道
  lab2: [
    ...wide(ARENA_CROSS),
    '##############...##############',
    '##############...##############',
    '#########.............#########',
    '#########..M...G...M..#########',
    '#########.............#########',
    '#########.............#########',
    '#########.............#########',
    '#############.....#############',
    '#############.T.T.#############',
    '#############..t..#############',
    '#############..T..#############',
    '#############.t.t.#############',
    '#############.T.T.#############',
    '#############..t..#############',
    '#############..T..#############',
    '#############.t.t.#############',
    '########...............########',
    '########...............########',
    '########...............########',
    '########...K.......K...########',
    '########.......w.......########',
    '########...............########',
    '########...............########',
    '##################....#########',
    '####.......................####',
    '####....w......M...........####',
    '####..................w....####',
    '####.......................####',
    '#.......######...##############',
    '#....w..######...##############',
    '#.......######...##############',
    '#...K...######...##############',
    '#.......###.........###########',
    '#.......###.........###########',
    '#...................###########',
    '#............M......###########',
    '#.C.................###########',
    '#.......###.........###########',
    '###############E###############',
    '###############################',
  ],
  // 第3層 迷宮区: 入口 → 中央の大広間 → 左右の翼の感圧板（2つを50秒以内に踏むと扉が開く。手分けすると楽）→ 北の通路 → 扉前の広間
  lab3: [
    ...wide(ARENA_LONG),
    '##############...##############',
    '##############...##############',
    '##############...##############',
    '########...............########',
    '########...............########',
    '########...............########',
    '########...K.......K...########',
    '########...............########',
    '########...............########',
    '#C.....#.......M.......#......#',
    '#..P...#...............#...P..#',
    '#......#...............#......#',
    '#......#######...#######......#',
    '#......#######...#######......#',
    '#...K..#######...#######..K...#',
    '#......#######...#######......#',
    '#......#######...#######......#',
    '#..M...#######...#######...M..#',
    '#.............................#',
    '#...........M.....M...........#',
    '##...........................##',
    '##.............K.............##',
    '##...........................##',
    '######...w...........w...######',
    '######...................######',
    '######...................######',
    '##############...##############',
    '##############...##############',
    '##############...##############',
    '##############...##############',
    '##############...##############',
    '##############...##############',
    '###########.........###########',
    '###########.........###########',
    '###########....w....###########',
    '###########.........###########',
    '###########.........###########',
    '###########.........###########',
    '###############E###############',
    '###############################',
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
  // 第3層 埋もれた神殿: 左右対称の回廊の奥、右上の祭壇に宝箱
  dun3: [
    '#################',
    '#.....#####.....#',
    '#..M..#####..C..#',
    '#.....#####.....#',
    '###.#########.###',
    '###.#########.###',
    '###.....M.....###',
    '#######...#######',
    '#######.M.#######',
    '###.....#.....###',
    '###.###.#.###.###',
    '###.#M..#..M#.###',
    '###.#########.###',
    '###.....E.....###',
    '#################',
  ],
};

// 第1〜3層。mapPos はエリアマップ上の表示位置（0〜100）
// 層ごとに接続の形を変えている: 1層=町を中心にした枝分かれ / 2層=一本道 / 3層=野営地から放射状
export const AREAS = {
  // ---------------- 第1層: 町を中心に枝分かれ ----------------
  f1_town: {
    floor: 1, type: 'town', name: 'はじまりの街', shape: 'open', R: 34, wob: 0.05, gate: { x: 0, z: 0 }, box: { x: -10, z: 9 }, mapPos: [50, 82],
    exits: [{ to: 'f1_field', ang: 0 }, { to: 'f1_lake', ang: 255 }],
    npcs: [
      { id: 'captain', name: '衛兵隊長 ガレス', x: -9, z: -6, color: '#c0504a', line: '迷宮区を越えねば、上の層へは行けん。腕を磨いてこい。' },
      { id: 'hunter', name: '狩人 ミラ', x: 10, z: -4, color: '#5aa060', line: '北東の丘はイノシシだらけ。狩りの練習にはもってこいよ。' },
      { id: 'sage', name: '賢者 オルド', x: 6, z: 10, color: '#7a6ad0', line: '草原の西、古井戸の底に古い宝が眠っているという噂じゃ。' },
      { id: 'smith1', role: 'smith', name: '鍛冶屋 グラム', x: 12, z: 6, color: '#8a5a3a', line: '' },
    ],
  },
  f1_field: {
    floor: 1, type: 'field', name: 'ひだまりの草原', shape: 'open', R: 48, ell: [1.4, 0.85], wob: 0.14, mapPos: [50, 52],
    exits: [{ to: 'f1_town', ang: 180 }, { to: 'f1_hunt', ang: 70 }, { to: 'f1_dun', ang: 280 }, { to: 'f1_lab', ang: 5 }],
    obst: { n: 12, kinds: ['rock', 'tree', 'tree', 'pond'] }, chests: 2,
    mobs: { count: 9, perPlayer: 3, lv: [0, 3] },
    // 見た目の作り込み（段階 mapq 2〜4。env/scape.js）。hills: [x, z, 半径, 高さ] / groves・rocks・beds: 群れの数 / singles: 広場のまばらな単体
    // zones: 区画の目印（段階3） / road: 石灯籠の古道になる出口 / tower: 遠景の塔（段階4。ang 方向に dist 先）
    scape: {
      hills: [[44, 14, 15, 2.6], [-34, 22, 12, 1.8], [-34, -24, 12, 1.3], [28, -32, 9, 1.2]],
      groves: 9, rocks: 5, beds: 5, singles: 7,
      zones: [{ kind: 'stones', x: 44, z: 14, r: 7 }, { kind: 'shrine', x: -34, z: -24, r: 5, rot: 0.6 }, { kind: 'bigtree', x: -34, z: 22, r: 4 }],
      road: 'f1_lab', tower: { ang: 4, dist: 150, h: 70 },
    },
  },
  f1_hunt: {
    floor: 1, type: 'hunt', name: 'イノシシの丘', shape: 'open', R: 32, ell: [1, 1.35], wob: 0.22, mapPos: [84, 34],
    exits: [{ to: 'f1_field', ang: 230 }],
    obst: { n: 9, kinds: ['rock'] },
    mobs: { count: 16, perPlayer: 4, lv: [1, 4], only: 1, xp: 1.6, respawn: 0.5 },
  },
  f1_lake: {
    floor: 1, type: 'secret', name: '静かな湖畔', shape: 'open', R: 30, ell: [1.2, 1], wob: 0.1, mapPos: [14, 86],
    exits: [{ to: 'f1_town', ang: 80 }],
    obst: { n: 1, kinds: ['pond'], big: true }, chests: 1,
    named: { name: 'ヌシ・ギガスライム', d: 0, lv: 10, title: 't_lake' },
  },
  f1_dun: {
    floor: 1, type: 'dungeon', name: '古井戸の洞窟', shape: 'grid', map: MAPS.dun1, mapPos: [14, 46],
    exits: [{ to: 'f1_field' }],
    mobs: { lv: [3, 5], elite: true, respawnSec: 40 },
    unique: { name: '古井戸の守り刀', slot: 'weapon', kind: 'dagger', fx: ['vamp'], lore: '井戸の底で錆びずに眠っていた短刀。' },
  },
  f1_lab: {
    floor: 1, type: 'labyrinth', name: '第1層 迷宮区', shape: 'grid', map: MAPS.lab1, mapPos: [50, 14],
    exits: [{ to: 'f1_field' }], gimmick: 'lever',
    mobs: { lv: [4, 6], hp: 1.3, respawnSec: 60, swarm: 2 }, // 迷宮区の敵は強め。swarm: 群れ（w）に使う足の速い敵
  },
  // ---------------- 第2層: 霧の一本道（野営地 → 森 → 群生地 → 迷宮区、森の脇にダンジョン） ----------------
  f2_camp: {
    floor: 2, type: 'camp', name: '霧の野営地', shape: 'open', R: 22, wob: 0.12, gate: { x: 0, z: 2 }, box: { x: -8, z: 6 }, mapPos: [50, 90],
    exits: [{ to: 'f2_field', ang: 0 }],
    npcs: [
      { id: 'ranger', name: '森番 セイル', x: 7, z: -5, color: '#4a8a7a', line: '霧の森の奥、朽ちた大樹の洞には近づくな…と言っても行くんだろう？ 毒沼には気をつけろ。' },
      { id: 'smith2', role: 'smith', name: '旅の鍛冶屋 ボルグ', x: -7, z: -5, color: '#8a5a3a', line: '' },
    ],
  },
  f2_field: {
    floor: 2, type: 'field', name: '霧の森', shape: 'open', R: 44, ell: [0.62, 1.55], wob: 0.18, mapPos: [50, 64],
    exits: [{ to: 'f2_camp', ang: 180 }, { to: 'f2_dun', ang: 265 }, { to: 'f2_hunt', ang: 0 }],
    obst: { n: 20, kinds: ['tree', 'tree', 'rock'] }, hazard: { kind: 'poison', n: 6, r: [2.5, 4] }, chests: 2,
    mobs: { count: 10, perPlayer: 3, lv: [0, 3] },
  },
  f2_dun: {
    floor: 2, type: 'dungeon', name: '朽ちた樹洞', shape: 'grid', map: MAPS.dun2, mapPos: [16, 64],
    exits: [{ to: 'f2_field' }],
    mobs: { lv: [3, 5], elite: true, respawnSec: 40 },
    unique: { name: '樹霊の外套', slot: 'armor', armor: 'light', fx: ['aegis'], lore: '朽ちた大樹の精が編んだという外套。' },
  },
  f2_hunt: {
    floor: 2, type: 'hunt', name: 'キノコの群生地', shape: 'open', R: 34, wob: 0.28, mapPos: [50, 36],
    exits: [{ to: 'f2_field', ang: 180 }, { to: 'f2_lab', ang: 10 }],
    obst: { n: 10, kinds: ['tree'] }, hazard: { kind: 'poison', n: 3, r: [2.5, 3.5] },
    mobs: { count: 16, perPlayer: 4, lv: [1, 4], only: 0, xp: 1.6, respawn: 0.5 },
  },
  f2_lab: {
    floor: 2, type: 'labyrinth', name: '第2層 迷宮区', shape: 'grid', map: MAPS.lab2, mapPos: [50, 10],
    exits: [{ to: 'f2_hunt' }], gimmick: 'gatekeeper',
    mobs: { lv: [4, 6], hp: 1.3, respawnSec: 60, swarm: 0 }, // 迷宮区の敵は強め。swarm: 群れ（w）に使う足の速い敵
  },
  // ---------------- 第3層: オアシスから放射状 ----------------
  f3_camp: {
    floor: 3, type: 'camp', name: 'オアシスの野営地', shape: 'open', R: 28, wob: 0.15, gate: { x: 0, z: 6 }, box: { x: -9, z: 10 }, mapPos: [50, 52],
    exits: [{ to: 'f3_field', ang: 0 }, { to: 'f3_hunt', ang: 95 }, { to: 'f3_canyon', ang: 265 }],
    obst: { n: 1, kinds: ['pond'], at: [0, -8] },
    npcs: [
      { id: 'merchant', name: '行商人 ハサン', x: -7, z: 2, color: '#c08a3a', line: '北の荒野は流砂だらけ、西の谷の奥には迷宮区。砂の下の神殿？ あそこの宝はとびきりだって話さ。' },
      { id: 'smith3', role: 'smith', name: '砂漠の鍛冶屋 ナディア', x: 10, z: 11, color: '#8a5a3a', line: '' },
    ],
  },
  f3_field: {
    floor: 3, type: 'field', name: '砂塵の荒野', shape: 'open', R: 54, ell: [1.25, 1], wob: 0.25, mapPos: [50, 22],
    exits: [{ to: 'f3_camp', ang: 180 }, { to: 'f3_dun', ang: 330 }],
    obst: { n: 12, kinds: ['rock', 'ruin', 'ruin'] }, hazard: { kind: 'sand', n: 7, r: [4, 6] }, chests: 3,
    mobs: { count: 10, perPlayer: 3, lv: [0, 3] },
  },
  f3_dun: {
    floor: 3, type: 'dungeon', name: '埋もれた神殿', shape: 'grid', map: MAPS.dun3, mapPos: [22, 6],
    exits: [{ to: 'f3_field' }],
    mobs: { lv: [3, 5], elite: true, respawnSec: 40 },
    unique: { name: '砂王の盾槍', slot: 'weapon', kind: 'spear', fx: ['thunder'], lore: '砂に沈んだ王が最後まで手放さなかった槍。' },
  },
  f3_hunt: {
    floor: 3, type: 'hunt', name: '蠍の巣', shape: 'open', R: 30, wob: 0.32, mapPos: [86, 52],
    exits: [{ to: 'f3_camp', ang: 270 }],
    obst: { n: 8, kinds: ['rock'] },
    mobs: { count: 16, perPlayer: 4, lv: [1, 4], only: 0, xp: 1.6, respawn: 0.5 },
  },
  f3_canyon: {
    floor: 3, type: 'secret', name: '流砂の谷', shape: 'open', R: 40, ell: [0.55, 1.7], wob: 0.12, mapPos: [16, 52],
    exits: [{ to: 'f3_camp', ang: 90 }, { to: 'f3_lab', ang: 0 }],
    obst: { n: 10, kinds: ['rock'] }, hazard: { kind: 'sand', n: 8, r: [3, 5] }, chests: 1,
    named: { name: '砂鮫ギルガ', d: 0, lv: 26, title: 't_shark' },
    mobs: { count: 6, perPlayer: 2, lv: [2, 4] },
  },
  f3_lab: {
    floor: 3, type: 'labyrinth', name: '第3層 迷宮区', shape: 'grid', map: MAPS.lab3, mapPos: [16, 20],
    exits: [{ to: 'f3_canyon' }], gimmick: 'plates', longArena: true,
    mobs: { lv: [4, 6], hp: 1.3, respawnSec: 60, swarm: 2 }, // 迷宮区の敵は強め。swarm: 群れ（w）に使う足の速い敵
  },
};
export const FLOOR_HUB = { 1: 'f1_town', 2: 'f2_camp', 3: 'f3_camp' };
export const PLATE_WINDOW = 50; // 2つの感圧板は迷路の端と端（約290m）。ソロでも走れば間に合う長さ

// エリアごとの傾向: 出やすい武器種（kinds）と付きやすい特性（affixes）。
// 偏りはゆるめ（武器種は25%でそのエリアの種類から、特性は2倍出やすい）。踏破するとマップに表示される
export const AREA_BIAS = {
  f1_field: { kinds: ['sword', 'bow'], affixes: ['atkp', 'hpp', 'sv_holy'] },
  f1_hunt: { kinds: ['axe', 'greatsword'], affixes: ['aspd', 'move', 'sv_heavy'] },
  f1_lake: { kinds: ['dagger'], affixes: ['vamp', 'sv_drain'] },
  f1_dun: { kinds: ['dagger', 'sword'], affixes: ['crit', 'critd'] },
  f1_lab: { kinds: ['spear', 'greatsword'], affixes: ['def', 'sv_quake'] },
  f2_field: { kinds: ['bow', 'spear'], affixes: ['cdr', 'hpp', 'sv_frost'] },
  f2_hunt: { kinds: ['dagger', 'axe'], affixes: ['aspd', 'crit', 'sv_rapid'] },
  f2_dun: { kinds: ['bow'], affixes: ['def', 'sv_blink'] },
  f2_lab: { kinds: ['sword', 'greatsword'], affixes: ['critd', 'sv_twin'] },
  f3_field: { kinds: ['axe', 'spear'], affixes: ['atkp', 'def'] },
  f3_hunt: { kinds: ['dagger', 'bow'], affixes: ['move', 'critd', 'sv_gale'] },
  f3_dun: { kinds: ['spear'], affixes: ['cdr', 'sv_storm'] },
  f3_canyon: { kinds: ['greatsword', 'axe'], affixes: ['crit', 'sv_giant'] },
  f3_lab: { kinds: ['sword', 'axe'], affixes: ['atkp', 'sv_blaze'] },
};
// エリアごとに出てくる敵（その階層の mobs の番号）。0・1 は元からの2種、2・3 は追加の2種
//   第1層: 2 ケイブバット / 3 ドクキノコ   第2層: 2 ミストマタンゴ / 3 ゴブリンシャーマン
//   第3層: 2 ジャイアントスコーピオン / 3 砂漠の呪術師
export const MOB_POOL = {
  f1_field: [0, 1, 3], f1_dun: [2, 0, 2], f1_lab: [2, 1],
  f2_field: [0, 1, 2], f2_hunt: [2, 2, 0], f2_dun: [3, 1], f2_lab: [3, 0, 1],
  f3_field: [0, 1], f3_hunt: [2, 2, 0], f3_canyon: [2, 3, 0], f3_dun: [3, 1], f3_lab: [2, 3],
};
// 天候: 粒子（particles）、霧の近さ・遠さの倍率（near/far）、霧と空の色を寄せる色（tint/mix）、日差しの強さ（sun）、環境音（amb）
export const WEATHERS = {
  rain: { name: '雨', icon: '🌧', particles: 'downpour', count: 1400, near: 0.4, far: 0.55, tint: 0x5a6880, mix: 0.55, sun: 0.4, amb: 'rain' },
  fog: { name: '霧', icon: '🌫', particles: 'mist', count: 260, near: 0.5, far: 0.7, tint: 0xd4dee2, mix: 0.5, sun: 0.8, amb: 'fog' }, // 雰囲気程度（遠くがかすむくらい）
  sandstorm: { name: '砂嵐', icon: '🌪', particles: 'sand', count: 900, near: 0.5, far: 0.7, tint: 0xd09a58, mix: 0.5, sun: 0.75, amb: 'sandstorm' }, // 雰囲気程度
};
// エリアごとの天候（屋内の迷宮・ダンジョンにはない）
export const AREA_WEATHER = {
  f1_hunt: 'rain', f1_lake: 'rain',
  f2_field: 'fog', f2_hunt: 'fog',
  f3_hunt: 'sandstorm', f3_canyon: 'sandstorm',
};
// 踏破の条件: 迷宮区はボス、秘境はネームドを倒す。ほかは敵を15体倒す
export const CLEAR_KILLS = 15;
for (const [id, a] of Object.entries(AREAS)) {
  if (a.mobs && MOB_POOL[id]) { a.mobs.pool = MOB_POOL[id]; delete a.mobs.only; }
  a.weather = AREA_WEATHER[id] || null;
  a.id = id;
  a.bias = AREA_BIAS[id]?.affixes || [];
  a.kinds = AREA_BIAS[id]?.kinds || [];
}

// ---------------------------------------------------------------------------
// 共通
// ---------------------------------------------------------------------------
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const hashStr = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const rad = (deg) => deg * Math.PI / 180;
// 角度 a（北=0、東=+90°）の向き
export const dirOf = (a) => [Math.sin(a), -Math.cos(a)];
export const angOf = (x, z) => Math.atan2(x, -z);

// ---------------------------------------------------------------------------
// 屋外エリアの形（輪郭）
// ---------------------------------------------------------------------------
const shapeCache = new Map();
function shapeParams(def) {
  if (shapeCache.has(def.id)) return shapeCache.get(def.id);
  const R = seeded(hashStr(def.id) ^ 0x9e37);
  const p = { p1: R() * 6.28, p2: R() * 6.28, p3: R() * 6.28 };
  shapeCache.set(def.id, p);
  return p;
}
// 中心から角度 a 方向の輪郭までの距離
export function boundR(def, a) {
  const [sx, sz] = def.ell || [1, 1];
  const [dx, dz] = dirOf(a);
  const base = 1 / Math.sqrt((dx / (def.R * sx)) ** 2 + (dz / (def.R * sz)) ** 2);
  const w = def.wob || 0, p = shapeParams(def);
  return base * (1 + w * (0.55 * Math.sin(3 * a + p.p1) + 0.3 * Math.sin(5 * a + p.p2) + 0.15 * Math.sin(8 * a + p.p3)));
}
export function maxR(def) {
  if (def.shape === 'grid') { const g = grid(def); return Math.max(g.W, g.H) * CELL / 2; }
  let m = 0;
  for (let i = 0; i < 64; i++) m = Math.max(m, boundR(def, i / 64 * Math.PI * 2));
  return m;
}
export const insideOpen = (def, x, z, pad = 0) => Math.hypot(x, z) < boundR(def, angOf(x, z)) - pad;

// 中心から出口までの道（障害物を置かない）
function nearPath(def, x, z, w) {
  return exitsOf(def).some((e) => {
    const L = Math.hypot(e.x, e.z), ux = e.x / L, uz = e.z / L;
    const along = x * ux + z * uz, side = Math.abs(x * uz - z * ux);
    return along > -2 && along < L + 2 && side < w;
  });
}
const centerFree = (def, x, z, r) => {
  const pts = [def.gate, def.box, ...(def.npcs || [])].filter(Boolean);
  if (def.type === 'town' || def.type === 'camp') pts.push({ x: 0, z: 0 });
  return pts.every((p) => Math.hypot(p.x - x, p.z - z) > r + 6);
};

// 障害物（種から決定的に配置）
const obstCache = new Map();
export function obstaclesOf(def) {
  if (def.shape !== 'open' || !def.obst) return [];
  if (obstCache.has(def.id)) return obstCache.get(def.id);
  const R = seeded(hashStr(def.id) ^ 0x51);
  const list = [];
  const o = def.obst;
  for (let i = 0, tries = 0; i < o.n && tries < 400; tries++) {
    const kind = o.kinds[Math.floor(R() * o.kinds.length)];
    const K = OBSTACLES[kind];
    let r = K.r[0] + R() * (K.r[1] - K.r[0]);
    let x, z;
    if (o.at) { [x, z] = o.at; }
    else if (o.big) { r = boundR(def, 0) * 0.42; x = 0; z = -boundR(def, 0) * 0.1; }
    else {
      const a = R() * Math.PI * 2, f = 0.18 + R() * 0.68, [dx, dz] = dirOf(a);
      const br = boundR(def, a);
      x = dx * br * f; z = dz * br * f;
      if (Math.hypot(x, z) + r > br - 3) continue;
    }
    if (!o.at && !o.big && (nearPath(def, x, z, r + 3) || !centerFree(def, x, z, r))) continue;
    if (list.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r + 3)) continue;
    list.push({ kind, x, z, r, solid: K.solid, seed: Math.floor(R() * 1e6) });
    i++;
  }
  obstCache.set(def.id, list);
  return list;
}

// ハザード（毒沼・流砂）
const hazCache = new Map();
export function hazardsOf(def) {
  if (def.shape !== 'open' || !def.hazard) return [];
  if (hazCache.has(def.id)) return hazCache.get(def.id);
  const R = seeded(hashStr(def.id) ^ 0x77);
  const h = def.hazard, obst = obstaclesOf(def), list = [];
  for (let tries = 0; list.length < h.n && tries < 300; tries++) {
    const a = R() * Math.PI * 2, f = 0.25 + R() * 0.6, [dx, dz] = dirOf(a), br = boundR(def, a);
    const r = h.r[0] + R() * (h.r[1] - h.r[0]);
    const x = dx * br * f, z = dz * br * f;
    if (Math.hypot(x, z) + r > br - 2 || !centerFree(def, x, z, r)) continue;
    if (exitsOf(def).some((e) => Math.hypot(e.x - x, e.z - z) < r + 5)) continue;
    if (obst.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r + 1)) continue;
    if (list.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r + 2)) continue;
    list.push({ kind: h.kind, x, z, r });
  }
  hazCache.set(def.id, list);
  return list;
}

// 小さな宝箱（屋外）。屋内の宝箱は map の C
const chestCache = new Map();
export function chestsOf(def) {
  if (chestCache.has(def.id)) return chestCache.get(def.id);
  let list = [];
  if (def.shape === 'grid') {
    list = (grid(def).pts.C || []).map((p, i) => ({ id: `${def.id}_C${i}`, x: p.x, z: p.z, big: true }));
  } else if (def.chests) {
    const R = seeded(hashStr(def.id) ^ 0x3c);
    const obst = obstaclesOf(def), haz = hazardsOf(def);
    for (let tries = 0; list.length < def.chests && tries < 300; tries++) {
      const a = R() * Math.PI * 2, f = 0.6 + R() * 0.25, [dx, dz] = dirOf(a), br = boundR(def, a);
      const x = dx * br * f, z = dz * br * f;
      if ([...obst, ...haz].some((q) => Math.hypot(q.x - x, q.z - z) < q.r + 2)) continue;
      if (exitsOf(def).some((e) => Math.hypot(e.x - x, e.z - z) < 8)) continue;
      if (list.some((q) => Math.hypot(q.x - x, q.z - z) < 12)) continue;
      list.push({ id: `${def.id}_c${list.length}`, x, z, big: false });
    }
  }
  chestCache.set(def.id, list);
  return list;
}

// ネームドの出現位置（中心から少し離れた場所）
export function namedSpot(def) {
  if (!def.named) return null;
  const R = seeded(hashStr(def.id) ^ 0x4d);
  const obst = obstaclesOf(def);
  for (let tries = 0; tries < 100; tries++) {
    const a = R() * Math.PI * 2, f = 0.35 + R() * 0.3, [dx, dz] = dirOf(a), br = boundR(def, a);
    const x = dx * br * f, z = dz * br * f;
    if (obst.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + 4)) continue;
    return { x, z };
  }
  return { x: 0, z: 0 };
}

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

// 壁・輪郭・障害物との当たり判定
export function collide(def, x, z, rad = 0.5, doorOpen = false) {
  if (def.shape === 'open') {
    for (const o of obstaclesOf(def)) {
      if (!o.solid) continue;
      const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz), min = o.r + rad;
      if (d < min) { const k = d > 1e-4 ? min / d : 1; x = o.x + (d > 1e-4 ? dx : min) * k; z = o.z + (d > 1e-4 ? dz : 0) * k; }
    }
    const a = angOf(x, z), max = boundR(def, a) - 1, d = Math.hypot(x, z);
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
      if (prev.size > 800) break;
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
const exitCache = new Map();
export function exitsOf(def) {
  if (exitCache.has(def.id)) return exitCache.get(def.id);
  let list;
  if (def.shape === 'open') {
    list = def.exits.map((e) => {
      const a = rad(e.ang), [dx, dz] = dirOf(a), r = boundR(def, a) - 4;
      return { to: e.to, x: dx * r, z: dz * r, r: 3 };
    });
  } else {
    const g = grid(def);
    list = (g.pts.E || []).map((p, i) => ({ to: def.exits[i]?.to ?? def.exits[0].to, x: p.x, z: p.z, r: 2.2 }));
  }
  exitCache.set(def.id, list);
  return list;
}
// from エリアから来たときの出現位置（出口の少し内側）
export function arrival(def, from) {
  const ex = exitsOf(def).find((e) => e.to === from);
  if (!ex) return spawnPoint(def);
  if (def.shape === 'open') {
    const d = Math.hypot(ex.x, ex.z) || 1;
    return collide(def, ex.x - ex.x / d * 6, ex.z - ex.z / d * 6, 0.6);
  }
  const g = grid(def), { c, r } = worldToCell(g, ex.x, ex.z);
  for (const [dc, dr] of [[0, -1], [0, 1], [1, 0], [-1, 0]]) {
    if (!solidAt(g, c + dc, r + dr, false) && g.rows[r + dr][c + dc] !== 'E') return cellToWorld(g, c + dc, r + dr);
  }
  return { x: ex.x, z: ex.z };
}
// 死亡時などの基本の出現位置
export function spawnPoint(def) {
  if (def.gate) return { x: def.gate.x, z: def.gate.z + 7 };
  return arrival(def, def.exits[0].to);
}
// ワープポイント: 触れると解放され、マップからそこへ飛べる。町・野営地は転移門がその役目（最初から使える）
export function waypointOf(def) {
  if (def.gate) return { ...spawnPoint(def), hub: true };
  if (def.shape === 'grid') return spawnPoint(def);
  // 屋外: 中央付近で、障害物・毒沼・流砂・出口から離れた所
  const obs = obstaclesOf(def), haz = hazardsOf(def), ex = exitsOf(def);
  for (let k = 0; k < 40; k++) {
    const a = k * 2.4, r = k * 1.5;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (!insideOpen(def, x, z, 4)) continue;
    if (obs.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 3) || haz.some((h) => Math.hypot(h.x - x, h.z - z) < h.r + 3)) continue;
    if (ex.some((e) => Math.hypot(e.x - x, e.z - z) < 8) || (def.box && Math.hypot(def.box.x - x, def.box.z - z) < 5)) continue;
    return { x, z };
  }
  return spawnPoint(def);
}
export function lairOf(def) {
  if (def.type !== 'labyrinth') return null;
  const g = grid(def), b = g.pts.B[0];
  if (!def.longArena) return { x: b.x, z: b.z, r: 20 };
  // 細長い部屋: B のある列から左右・上下に床が続く範囲を長方形にする（扉の手前まで）
  const open = (c, r) => r >= 0 && r < g.H && c >= 0 && c < g.W && (g.rows[r][c] === '.' || g.rows[r][c] === 'B');
  let c0 = b.c, c1 = b.c, r0 = b.r, r1 = b.r;
  while (open(c0 - 1, b.r)) c0--;
  while (open(c1 + 1, b.r)) c1++;
  while (open(b.c, r0 - 1)) r0--;
  while (open(b.c, r1 + 1)) r1++;
  const lo = cellToWorld(g, c0, r0), hi = cellToWorld(g, c1, r1), h = CELL / 2;
  const box = { x0: lo.x - h, x1: hi.x + h, z0: lo.z - h, z1: hi.z + h };
  return { x: b.x, z: b.z, r: (box.x1 - box.x0) / 2, box };
}
// ボス部屋の中か（pad: 外側への余裕。負なら内側へ狭める）。細長い部屋は長方形、それ以外は円
export function inLair(L, x, z, pad = 0) {
  if (L.box) return x > L.box.x0 - pad && x < L.box.x1 + pad && z > L.box.z0 - pad && z < L.box.z1 + pad;
  return Math.hypot(x - L.x, z - L.z) < L.r + pad;
}

