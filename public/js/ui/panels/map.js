// 画面: マップ（階層・エリア・クエストの目的地）。Presenter（描画パラメータを計算して View に set する）を P に足す。createUI（ui/app.js）が呼ぶ
// ui: 画面の部品と Presenter の入れ物（app.js が作る）。ほかの画面と共有する値は ui.〜 で読み書きする
import { FLOORS, WEAPONS, AFFIXES, SKILL_VARIANTS, isVariant } from '../../../shared/data.js';
import { AREAS, AREA_TYPES, CLEAR_KILLS, WEATHERS, grid, HAZARDS } from '../../../shared/areas.js';
import { QUESTS, questState } from '../../quests.js';
import { esc } from '../helpers.js';

export function installMap(ui) {
  const { game, MAP, P, panels } = ui;
  ui.mapTab = 'area'; ui.mapT = 0; ui.mapFloor = 1;
  P.map = () => {
    const world = game.world, f = world.floor, def = world.def;
    panels.map.set({ cls: { 't-area': ui.mapTab === 'area', 't-floor': ui.mapTab === 'floor' } });
    for (const [t, v] of MAP.tabs.children) v.set({ cls: { on: ui.mapTab === t } });
    if (ui.mapTab === 'area') {
      const T = AREA_TYPES[def.type], W = WEATHERS[def.weather];
      MAP.title.set({ text: `${T.icon} ${def.name}` });
      const st = game.char.areas?.[def.id];
      let rate = '';
      if (def.shape === 'grid') {
        const g = grid(def), seen = game.explored(def.id);
        let n = 0, tot = 0;
        for (let i = 0; i < seen.length; i++) if (g.rows[Math.floor(i / g.W)][i % g.W] !== '#') { tot++; n += seen[i]; }
        rate = `　探索率 ${Math.round(n / tot * 100)}%（歩いた場所が地図に記されます）`;
      }
      const qs = questTargets()[def.id];
      MAP.sub.set({ text: `第${f}層 ${T.name}${W ? `　${W.icon} ${W.name}` : ''}${st?.done ? '　✔ 踏破' : ''}${rate}${qs ? `　！${qs.join('、')}` : ''}` });
      P.mapArea();
      return;
    }
    MAP.sub.set({ text: '◇ 解放したワープポイント・転移門のあるエリアをクリックすると、そこへワープします' });
    // 階層の切り替え（解放済みの階層だけ）
    const top = Math.max(1, Math.min(world.unlocked || 1, 3));
    MAP.floors.set({ html: Array.from({ length: top }, (_, i) => `<button data-f="${i + 1}" class="${i + 1 === ui.mapFloor ? 'on' : ''}">第${i + 1}層</button>`).join('') });
    for (const b of MAP.floors.el.querySelectorAll('button')) MAP.floors.add('f' + b.dataset.f, b).on('click', 'map:floor', () => ({ floor: +b.dataset.f }));
    renderFloor(ui.mapFloor);
  };
  // 進行中のクエストの目的地（エリアID → クエスト名の一覧）
  const questTargets = () => {
    const out = {};
    for (const q of QUESTS) {
      const s = questState(game.char, q.id);
      if (!s || s.claimed) continue;
      const ar = q.type === 'kill' ? q.area : q.type === 'boss' ? Object.values(AREAS).find((a) => a.type === 'labyrinth' && a.floor === q.target)?.id : q.target;
      if (ar) (out[ar] = out[ar] || []).push(q.name + (s.done ? '（報告できる）' : ''));
    }
    return out;
  };
  const renderFloor = (f) => {
    const world = game.world, roster = game.roster(), qt = questTargets();
    const list = Object.values(AREAS).filter((a) => a.floor === f);
    const pos = (a) => [a.mapPos[0] * 6, a.mapPos[1] * 4];
    let svg = '';
    const seen = new Set();
    for (const a of list) for (const e of a.exits) {
      const key = [a.id, e.to].sort().join('-'), b = AREAS[e.to];
      if (seen.has(key) || !b || b.floor !== f) continue;
      seen.add(key);
      const [x1, y1] = pos(a), [x2, y2] = pos(b);
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="edge"/>`;
    }
    for (const a of list) {
      const [x, y] = pos(a), T = AREA_TYPES[a.type], cur = a.id === world.area;
      const here = roster.filter((r) => r[7] === a.name && r[0] !== game.me.id).length;
      const extra = a.unique ? `宝：${a.unique.name}` : a.named ? `ネームド：${a.named.name}` : a.type === 'hunt' ? '経験値 1.6倍'
        : a.type === 'labyrinth' ? `ボス：${FLOORS[f - 1].boss.name}` : a.box ? `共有ボックス・NPC ${a.npcs?.length || 0}人` : '';
      const haz = a.hazard ? HAZARDS[a.hazard.kind].name : '';
      const W = WEATHERS[a.weather], done = game.char.areas?.[a.id]?.done;
      const wp = game.waypointOk(a.id), warp = wp && !cur;
      svg += `<g class="node ${cur ? 'cur' : ''} ${warp ? 'warp' : ''}" data-wp="${warp ? a.id : ''}" transform="translate(${x},${y})">
        <circle r="30" style="stroke:${T.color}"/>
        <text class="ic" y="8" style="fill:${T.color}">${T.icon}</text>
        <text class="wp ${wp ? 'on' : ''}" x="-30" y="-22">${a.gate ? '⛩' : '◇'}</text>
        ${W ? `<text class="wx" x="30" y="-22">${W.icon}</text>` : ''}
        ${done ? '<text class="done" x="28" y="26">✔</text>' : ''}
        ${qt[a.id] ? `<text class="qm" x="-28" y="26">！</text><title>クエスト：${esc(qt[a.id].join('、'))}</title>` : ''}
        <text class="nm" y="50">${esc(a.name)}</text>
        <text class="ty" y="66">${T.name}${haz ? '・' + haz : ''}${here ? `・仲間${here}人` : ''}</text>
        ${extra ? `<text class="ex" y="81">${esc(extra)}</text>` : ''}
        ${cur ? '<text class="you" x="38" y="-6" style="text-anchor:start">◀ 現在地</text>' : ''}
      </g>`;
    }
    MAP.title.set({ text: `第${f}層 ${FLOORS[f - 1].name}` });
    MAP.svg.set({ html: svg });
    for (const n of MAP.svg.el.querySelectorAll('g.node.warp')) MAP.svg.add('wp_' + n.dataset.wp, n).on('click', 'map:warp', () => ({ area: n.dataset.wp }));
    // エリアの傾向（踏破すると、出やすい武器種と付きやすい特性がわかる）
    const st = game.char.areas || {};
    const rows = list.filter((a) => a.bias.length || a.kinds.length).map((a) => {
      const s = st[a.id] || { k: 0 };
      const T = AREA_TYPES[a.type];
      const how = a.type === 'labyrinth' ? 'ボスを倒すと判明' : a.type === 'secret' ? 'ネームドを倒すと判明' : `敵を${CLEAR_KILLS}体倒すと判明（${Math.min(s.k, CLEAR_KILLS)}/${CLEAR_KILLS}）`;
      const body = s.done
        ? `<span class="mi-k">出やすい：${a.kinds.map((k) => WEAPONS[k].name).join('・')}</span><span class="mi-a">付きやすい：${a.bias.map((k) => (isVariant(k) ? `<b class="sv">${SKILL_VARIANTS[k].icon}${SKILL_VARIANTS[k].name}</b>` : AFFIXES[k].name)).join('・')}</span>`
        : `<span class="dim">？？？　${how}</span>`;
      return `<div class="mi${s.done ? ' done' : ''}"><span class="mi-n" style="color:${T.color}">${T.icon} ${esc(a.name)}${s.done ? ' <i>踏破</i>' : ''}</span>${body}</div>`;
    });
    MAP.info.set({ html: rows.join('') });
  };
}
