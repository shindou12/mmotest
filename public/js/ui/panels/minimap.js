// 画面: ミニマップ・エリアマップの図形。Presenter（描画パラメータを計算して View に set する）を P に足す。createUI（ui/app.js）が呼ぶ
// ui: 画面の部品と Presenter の入れ物（app.js が作る）。ほかの画面と共有する値は ui.〜 で読み書きする
import { FLOORS, RARITIES } from '../../../shared/data.js';
import { AREAS, CELL, grid, boundR, obstaclesOf, hazardsOf, chestsOf } from '../../../shared/areas.js';
import { hex } from '../helpers.js';
import { terrainOf, navOf } from '../../../shared/terrain/index.js';

// 地形エリアの地図の絵（1m = 1px。歩ける所は高さで濃淡、水・崖・山・道を色分け）。エリアごとに一度だけ描く
const terrainImgs = new Map();
function terrainImage(def) {
  if (terrainImgs.has(def.id)) return terrainImgs.get(def.id);
  const T = terrainOf(def), nav = navOf(def), cv = document.createElement('canvas');
  cv.width = nav.W; cv.height = nav.H;
  const g = cv.getContext('2d'), im = g.createImageData(nav.W, nav.H);
  for (let r = 0; r < nav.H; r++) for (let c = 0; c < nav.W; c++) {
    const x = nav.x0 + c + 0.5, z = nav.z0 + r + 0.5, h = T.groundAt(x, z), i = (r * nav.W + c) * 4;
    let col;
    if (T.deckAt(x, z) > -Infinity) col = [196, 180, 140];
    else if (h < T.WATER - 0.3) col = [58, 120, 190];
    else if (nav.solid[r * nav.W + c]) col = [60, 58, 66];
    else if (T.pathDist(x, z) < 1.8) col = [176, 150, 104];
    else { const k = Math.max(0, Math.min(1, (h + 1) / 12)); col = [72 + k * 60, 128 + k * 50, 66 + k * 30]; }
    im.data[i] = col[0]; im.data[i + 1] = col[1]; im.data[i + 2] = col[2]; im.data[i + 3] = 235;
  }
  g.putImageData(im, 0, 0);
  terrainImgs.set(def.id, cv);
  return cv;
}

export function installMinimap(ui) {
  const { game, H, MAP, P } = ui;
  // エリアの図形の一覧（ミニマップとエリアマップで共通）
  //   v: { W, H, full }  full = エリア全体を収める（エリアマップ）。屋内は歩いたマスだけ描く（自動マッピング）
  const areaShapes = (v) => {
    const me = game.me, world = game.world, def = world.def, env = game.env();
    const indoor = def.shape === 'grid', g = indoor ? grid(def) : null;
    const seen = indoor ? game.explored(def.id) : null;
    const known = (x, z) => {
      if (!indoor) return true;
      const c = Math.floor(x / CELL + g.W / 2), r = Math.floor(z / CELL + g.H / 2);
      return c >= 0 && r >= 0 && c < g.W && r < g.H && !!seen[r * g.W + c];
    };
    const terrain = def.shape === 'terrain';
    const outR = indoor ? 0 : terrain ? 0 : Math.max(...Array.from({ length: 32 }, (_, i) => boundR(def, i / 32 * Math.PI * 2))) + 4;
    let sc, cx = 0, cz = 0;
    if (terrain) { const n = navOf(def); if (v.full) sc = Math.min(v.W / (n.W + 8), v.H / (n.H + 8)); else { sc = v.W / 2 / 40; cx = me.x; cz = me.z; } } // 地形エリアは広いので、ミニマップは自分の周り
    else if (v.full && indoor) sc = Math.min(v.W / (g.W * CELL + 8), v.H / (g.H * CELL + 8));
    else if (v.full) {
      // 屋外は輪郭の外接矩形に合わせて拡大する
      const bx = [], bz = [];
      for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2, r = boundR(def, a); bx.push(Math.sin(a) * r); bz.push(-Math.cos(a) * r); }
      const x0 = Math.min(...bx), x1 = Math.max(...bx), z0 = Math.min(...bz), z1 = Math.max(...bz);
      cx = (x0 + x1) / 2; cz = (z0 + z1) / 2;
      sc = Math.min(v.W / (x1 - x0 + 16), v.H / (z1 - z0 + 16));
    } else { sc = v.W / 2 / (indoor ? 30 : outR); if (indoor) { cx = me.x; cz = me.z; } }
    const p = (x, z) => [v.W / 2 + (x - cx) * sc, v.H / 2 + (z - cz) * sc];
    const k = v.full ? 1.5 : 1; // 大きな地図では記号も大きく
    const label = (x, z, text, fill, dy = -12) => { if (v.full) { const [px, py] = p(x, z); sh.push({ t: 'text', x: px, y: py + dy, text, fill, size: 12 }); } };
    const sh = [{ t: 'bg', fill: indoor ? '#0c0e16dd' : '#0a0c14aa' }];
    if (indoor) {
      for (let r = 0; r < g.H; r++) for (let c = 0; c < g.W; c++) {
        const ch = g.rows[r][c];
        if (ch === '#' || !seen[r * g.W + c]) continue;
        const [x, y] = p((c - g.W / 2) * CELL, (r - g.H / 2) * CELL);
        sh.push({ t: 'rect', x, y, w: CELL * sc + 0.5, h: CELL * sc + 0.5, fill: ch === 'D' ? (world.door ? '#6a8a6a' : '#c04a4a') : ch === 'T' || ch === 't' ? '#6a4a3a' : '#4a5064' });
      }
      for (const [ch, col, nm] of [['L', '#ff9a4a', 'レバー'], ['P', '#6ad0ff', '感圧板']]) {
        for (const q of g.pts[ch] || []) {
          if (!known(q.x, q.z)) continue;
          const [x, y] = p(q.x, q.z); sh.push({ t: 'rect', x: x - 3 * k, y: y - 3 * k, w: 6 * k, h: 6 * k, fill: col });
          label(q.x, q.z, nm, col);
        }
      }
    } else if (terrain) {
      const n = navOf(def), [x, y] = p(n.x0, n.z0);
      sh.push({ t: 'img', img: terrainImage(def), x, y, w: n.W * sc, h: n.H * sc });
    } else {
      // 輪郭（いびつな形）
      const pts = Array.from({ length: 64 }, (_, i) => { const a = i / 64 * Math.PI * 2, r = boundR(def, a); return p(Math.sin(a) * r, -Math.cos(a) * r); });
      sh.push({ t: 'poly', pts, close: true, fill: hex(FLOORS[world.floor - 1].ground) + 'aa', stroke: 'rgba(255,255,255,.35)', lw: 2 });
      for (const o of obstaclesOf(def)) { const [x, y] = p(o.x, o.z); sh.push({ t: 'circle', x, y, r: Math.max(1.5, o.r * sc), fill: o.kind === 'pond' ? '#3a8ad0cc' : '#20242ecc' }); }
      for (const h of hazardsOf(def)) { const [x, y] = p(h.x, h.z); sh.push({ t: 'circle', x, y, r: Math.max(1.5, h.r * sc), fill: h.kind === 'poison' ? '#8a3ab0aa' : '#e0c890aa' }); }
      if (def.box) { const [x, y] = p(def.box.x, def.box.z); sh.push({ t: 'rect', x: x - 3.5 * k, y: y - 3.5 * k, w: 7 * k, h: 7 * k, fill: '#7ae0ff' }); label(def.box.x, def.box.z, '共有ボックス', '#7ae0ff'); }
    }
    const mapper = !!game.S?.tfx?.has('t_mapper'); // 称号「地図職人」: 宝箱は歩く前から映る
    for (const c of chestsOf(def)) {
      if (!known(c.x, c.z) && !mapper) continue;
      const [x, y] = p(c.x, c.z); sh.push({ t: 'rect', x: x - 3 * k, y: y - 3 * k, w: 6 * k, h: 6 * k, fill: game.chestOpen(c) ? '#6a6a6a' : '#ffd27a' });
    }
    if (def.gate) { const [x, y] = p(def.gate.x, def.gate.z); sh.push({ t: 'circle', x, y, r: 5 * k, fill: '#6ad0ff' }); label(def.gate.x, def.gate.z, '転移門', '#6ad0ff', -14); }
    const wp = env?.waypoint;
    if (wp && known(wp.x, wp.z)) {
      const on = game.waypointOk(def.id), [x, y] = p(wp.x, wp.z), r = 5 * k;
      sh.push({ t: 'poly', pts: [[x, y - r], [x + r * 0.7, y], [x, y + r], [x - r * 0.7, y]], close: true, fill: on ? '#6ad8ff' : '#4a5464', stroke: '#e8f6ff', lw: 1 });
      label(wp.x, wp.z, on ? 'ワープポイント' : 'ワープポイント（未解放）', on ? '#9ae8ff' : '#8a96a8', -14);
    }
    if (env?.lair && known(env.lair.x, env.lair.z)) {
      const [x, y] = p(env.lair.x, env.lair.z); sh.push({ t: 'circle', x, y, r: env.lair.r * sc, stroke: hex(FLOORS[world.floor - 1].boss.accent), lw: 2 });
      label(env.lair.x, env.lair.z, `♜ ${FLOORS[world.floor - 1].boss.name}`, hex(FLOORS[world.floor - 1].boss.accent), 0);
    }
    for (const q of env?.portals || []) {
      if (!known(q.x, q.z)) continue;
      const [x, y] = p(q.x, q.z); sh.push({ t: 'poly', pts: [[x, y - 5 * k], [x + 5 * k, y + 4 * k], [x - 5 * k, y + 4 * k]], close: true, fill: '#bfe6ff' });
      label(q.x, q.z, `→ ${AREAS[q.to]?.name || ''}`, '#bfe6ff', -14);
    }
    for (const n of game.npcs) {
      const [x, y] = p(n.x, n.z); sh.push({ t: 'circle', x, y, r: 3.5 * k, fill: n.mark ? '#ffd84a' : '#e0e0e0' });
      label(n.x, n.z, n.role === 'smith' ? `⚒ ${n.name}` : n.name, n.mark ? '#ffd84a' : '#e0e0e0');
    }
    for (const d of game.drops) { const [x, y] = p(d.x, d.z); sh.push({ t: 'rect', x: x - 2 * k, y: y - 2 * k, w: 4 * k, h: 4 * k, fill: RARITIES[d.it.rarity].color }); }
    for (const mb of game.mobs.values()) {
      if (!known(mb.x, mb.z)) continue;
      const [x, y] = p(mb.x, mb.z);
      sh.push({ t: 'circle', x, y, r: (mb.kind === 2 ? 6 : mb.elite === 3 ? 5 : mb.elite ? 3 : 2) * k, fill: mb.kind === 2 ? '#ff2a2a' : mb.elite === 3 ? '#ff6ad0' : mb.elite ? '#ffb030' : '#ff7a6a' });
      if (mb.elite === 3) label(mb.x, mb.z, mb.name, '#ff6ad0');
      // 目覚めた主はミニマップの外でも、縁に★で向きを示す
      if (mb.elite === 3 && !v.full) {
        const dx = x - v.W / 2, dy = y - v.H / 2, d = Math.hypot(dx, dy), max = v.W / 2 - 9;
        if (d > max) sh.push({ t: 'text', x: v.W / 2 + dx / d * max, y: v.H / 2 + dy / d * max, text: '★', fill: '#ff6ad0', size: 14 });
      }
    }
    for (const o of game.others.values()) { const [x, y] = p(o.x, o.z); sh.push({ t: 'circle', x, y, r: 3.5 * k, fill: '#7f7' }); label(o.x, o.z, o.name || '', '#7f7'); }
    // ピン（ミニマップでは範囲外なら縁に寄せて向きを示す）
    const pin = game.char?.pin;
    if (pin && pin.area === def.id) {
      let [x, y] = p(pin.x, pin.z);
      const dx = x - v.W / 2, dy = y - v.H / 2, d = Math.hypot(dx, dy), max = v.W / 2 - 9;
      if (!v.full && d > max) { x = v.W / 2 + dx / d * max; y = v.H / 2 + dy / d * max; }
      sh.push({ t: 'circle', x, y: y - 6 * k, r: 5 * k, fill: '#ffd84a', stroke: '#000', lw: 1.5 });
      sh.push({ t: 'poly', pts: [[x - 3 * k, y - 4 * k], [x + 3 * k, y - 4 * k], [x, y + 2 * k]], close: true, fill: '#ffd84a' });
      if (v.full) { const m = Math.round(Math.hypot(pin.x - me.x, pin.z - me.z)); sh.push({ t: 'text', x, y: y - 20, text: `📍 ${m}m`, fill: '#ffd84a', size: 12 }); }
    }
    v.tf = { cx, cz, sc };
    const [x, y] = p(me.x, me.z);
    if (v.full) sh.push({ t: 'circle', x, y, r: 11, stroke: '#ffffff88', lw: 2 });
    sh.push({ t: 'arrow', x, y, a: -me.a + Math.PI, fill: '#fff' });
    return sh;
  };
  // ミニマップ
  P.minimap = () => { const el = H.minimap.el; H.minimap.draw(areaShapes({ W: el.width, H: el.height })); };
  // エリアマップ（M の「エリア」タブ）: エリア全体を大きく描く
  let areaTf = null;
  P.mapArea = () => { const el = MAP.area.el, v = { W: el.width, H: el.height, full: true }; MAP.area.draw(areaShapes(v)); areaTf = v.tf; };
  // エリアマップをクリックした所（キャンバスの座標）にピンを立てる。今のピンの近くなら外す
  P.mapPin = (px, py) => {
    if (!areaTf) return;
    const el = MAP.area.el, def = game.world.def;
    const x = (px - el.width / 2) / areaTf.sc + areaTf.cx, z = (py - el.height / 2) / areaTf.sc + areaTf.cz;
    const old = game.char.pin;
    if (old && old.area === def.id && Math.hypot(old.x - x, old.z - z) < 14 / areaTf.sc) game.setPin(null);
    else game.setPin({ area: def.id, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
    P.mapArea();
  };
}
