// 画面（UI）の組み立て
//
// すべてのコンポーネントは Root を頂点とする階層に置く:
//   Root
//   ├ canvas（ゲーム画面: マウス操作）
//   ├ login（名前・色・初期武器・開始）
//   ├ hud（自分の枠・ボス・パーティ・クエスト・ミニマップ・ホットバー・チャット・案内・トースト・バナー…）
//   ├ inv / tree / settings / map / dialog / gate / box（パネル）
//   ├ float（ダメージ数字・仲間の名札）/ tooltip / death / vignette
//
// 各コンポーネントは Passive View（core.js の View）。描画パラメータは下の Presenter が計算して set() する。
// クリックやキー入力は UI イベントとして親へバブリングし、途中の link() が文脈（どのパネルのどの項目か）を足す。
// 最後に Root から Mediator（ステートマシン）へ届き、今の状態に応じて「何をするか」を裁定する。
import {
  FLOORS, WEAPONS, RARITIES, AFFIXES, UNIQUE_FX, MAX_LEVEL, MAX_FLOOR, ARMOR_CLASSES, ARMOR_TYPES, INSTINCT, BOW_ZONE,
  WEAPON_SKILL_POOL, xpToNext, itemWeight, weightClass,
} from '../../shared/data.js';
import { AREAS, AREA_TYPES, CELL, grid, boundR, obstaclesOf, hazardsOf, chestsOf, HAZARDS } from '../../shared/areas.js';
import { HEAVY, WEAPON_SKILLS, TREE_SKILLS, TREES, STYLE_COLS, spTotal, spSpent, treeSpent, canLearn } from '../skills.js';
import { QUESTS, questState, questAvailable } from '../quests.js';
import { View, Root, Mediator } from './core.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const now = () => performance.now() / 1000;
const PANELS = ['inv', 'tree', 'settings', 'map', 'dialog', 'gate', 'box'];
const GLYPH = { sword: '剣', greatsword: '大', spear: '盾', dagger: '短', axe: '斧', bow: '弓', light: '衣', medium: '鎧', heavy: '甲', acc: '飾' };

// ミニマップ: 図形の一覧を受け取って描くだけの View
class CanvasView extends View {
  draw(shapes) {
    const g = this.el.getContext('2d'), W = this.el.width;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); g.clip();
    for (const s of shapes) {
      g.fillStyle = s.fill || 'transparent'; g.strokeStyle = s.stroke || 'transparent'; g.lineWidth = s.lw || 1;
      g.beginPath();
      if (s.t === 'bg') { g.fillRect(0, 0, W, W); continue; }
      if (s.t === 'rect') { g.fillRect(s.x, s.y, s.w, s.h); continue; }
      if (s.t === 'circle') g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      if (s.t === 'poly') s.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (s.t === 'arrow') {
        g.save(); g.translate(s.x, s.y); g.rotate(s.a);
        g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(-4, 5); g.closePath(); g.fill(); g.restore(); continue;
      }
      if (s.close) g.closePath();
      if (s.fill) g.fill();
      if (s.stroke) g.stroke();
    }
    g.restore();
  }
}

export function createUI(game) {
  // ==================================================================
  // コンポーネントの階層
  // ==================================================================
  const mediator = new Mediator({}, null);
  const root = new Root(document.body, mediator);

  const canvas = root.add('canvas', '#c');
  const login = root.add('login', '#login');
  const hud = root.add('hud', '#hud');
  const panels = {};
  for (const p of PANELS) panels[p] = root.add(p, '#' + (p === 'gate' ? 'gate-menu' : p));
  const floatLayer = root.add('float', '#float');
  const tooltip = root.add('tooltip', '#tooltip');
  const death = root.add('death', '#death');
  const vignette = root.add('vignette', '#vignette');

  // ---- ログイン ----
  const L = {
    name: login.add('name', '#lname'), color: login.add('color', '#lcolor'), weapons: login.add('weapons', '#lweapon'),
    weaponWrap: login.add('weaponWrap', '#lweapon-wrap'), existing: login.add('existing', '#lexisting'),
    start: login.add('start', '#lstart'), fresh: login.add('fresh', '#lnew'),
  };
  L.start.on('click', 'login:start');
  L.fresh.on('click', 'login:new');
  L.name.on('keydown', 'login:key', (e) => ({ key: e.key }));
  for (const b of L.weapons.el.querySelectorAll('button')) L.weapons.add(b.dataset.k, b).on('click', 'login:weapon', () => ({ kind: b.dataset.k }));

  // ---- HUD ----
  const H = {};
  for (const [k, sel] of Object.entries({
    meName: '#me-name', meLv: '#me-lv', hp: '#me-hp', hpT: '#me-hp-t', xp: '#me-xp', xpT: '#me-xp-t', floor: '#me-floor', buffs: '#buffs',
    boss: '#boss', bossName: '#boss-name', bossHp: '#boss-hp', bossLag: '#boss-hp-lag', bossStunBar: '#boss-stun-bar', bossStun: '#boss-stun',
    bossStunT: '#boss-stun-t', bossTarget: '#boss-target', party: '#party', quests: '#quests', minimap: '#minimap', charge: '#charge',
    hotbar: '#hotbar', chat: '#chat', chatLog: '#chat-log', chatIn: '#chat-in', prompt: '#prompt', toasts: '#toasts', banner: '#banner',
    mode: '#mode-tag', help: '#help',
  })) H[k] = hud.add(k, sel, k === 'minimap' ? CanvasView : View);
  H.hpBar = H.hp.parent.add('hpBar', H.hp.el.parentElement);
  H.chargeFill = H.charge.add('fill', H.charge.el.firstElementChild);
  H.slots = {};
  for (const el of H.hotbar.el.querySelectorAll('.slot')) {
    const id = el.id.replace('s-', '');
    const v = H.hotbar.add(id, el);
    v.cd = el.querySelector('.cd') ? v.add('cd', '.cd') : null;
    v.nm = v.add('nm', '.nm');
    H.slots[id] = v;
  }
  H.atkName = H.slots.atk.add('atkName', '#atk-name');
  H.skillName = H.slots.skill.add('skillName', '#skill-name');
  H.wsKey = H.slots.skill.add('wsKey', '#ws-key');
  H.dodgeW = H.slots.dodge.add('dodgeW', '#dodge-w');
  H.potN = H.slots.pot.add('potN', '#pot-n');
  H.spBadge = H.slots.tree.add('spBadge', '#sp-badge');
  for (const p of ['inv', 'map', 'tree']) H.slots[p].on('click', 'open', () => ({ panel: p }));
  H.slots.set.on('click', 'open', () => ({ panel: 'settings' }));
  H.chatIn.on('focus', 'chat:focus');
  H.chatIn.on('blur', 'chat:blur');
  H.chatIn.on('keydown', 'chat:key', (e) => ({ key: e.key, text: e.target.value }));
  H.hotbar.link((ev) => { ev.ctx.from = 'hotbar'; });

  // ---- パネル共通: 閉じるボタンと、どのパネルからのイベントかという文脈 ----
  for (const [p, v] of Object.entries(panels)) {
    v.link((ev) => { ev.ctx.panel = p; });
    const close = v.el.querySelector('[data-close]');
    if (close) v.add('close', close).on('click', 'panel:close');
  }
  const INV = {
    grid: panels.inv.add('grid', '#inv-grid'), stats: panels.inv.add('stats', '#stats'), salvage: panels.inv.add('salvage', '#inv-salvage'),
    eq: {},
  };
  INV.salvage.on('click', 'inv:salvageCommon');
  for (const el of panels.inv.el.querySelectorAll('.eq')) INV.eq[el.dataset.slot] = panels.inv.add('eq_' + el.dataset.slot, el.querySelector('.cell'));
  INV.grid.link((ev) => { ev.ctx.source = 'inv'; });
  for (const v of Object.values(INV.eq)) {
    v.link((ev) => { ev.ctx.source = 'equipped'; ev.payload.id = v.data; });
    v.on('mouseenter', 'item:hover', (e) => ({ x: e.clientX, y: e.clientY })).on('mousemove', 'item:move', (e) => ({ x: e.clientX, y: e.clientY })).on('mouseleave', 'item:leave');
  }
  const TREE = { tabs: panels.tree.add('tabs', '#tree-tabs'), body: panels.tree.add('body', '#tree-body'), sp: panels.tree.add('sp', '#sp-left'), reset: panels.tree.add('reset', '#tree-reset') };
  TREE.reset.on('click', 'tree:reset');
  const SET = {};
  for (const k of ['master', 'music', 'sfx', 'amb']) {
    const v = panels.settings.add(k, '#set-' + k);
    v.out = v.add('out', v.el.nextElementSibling);
    v.on('input', 'set:change', (e) => ({ key: k, value: e.target.value / 100 }));
    SET[k] = v;
  }
  SET.quality = panels.settings.add('quality', '#set-quality').on('change', 'set:change', (e) => ({ key: 'quality', value: e.target.value }));
  for (const k of ['shake', 'dmgnum', 'occlusion']) SET[k] = panels.settings.add(k, '#set-' + k).on('change', 'set:change', (e) => ({ key: k, value: e.target.checked }));
  const MAP = { title: panels.map.add('title', '#map-title'), svg: panels.map.add('svg', '#map-svg') };
  const DLG = { title: panels.dialog.add('title', '#dialog-title'), line: panels.dialog.add('line', '#dialog-line'), list: panels.dialog.add('list', '#dialog-quests') };
  const GATE = { list: panels.gate.add('list', '#gate-list') };
  const BOX = { mine: panels.box.add('mine', '#box-mine'), shared: panels.box.add('shared', '#box-shared'), count: panels.box.add('count', '#box-count') };
  BOX.mine.link((ev) => { ev.ctx.source = 'inv'; });
  BOX.shared.link((ev) => { ev.ctx.source = 'box'; });
  const deathT = death.add('t', '#death-t');

  // ---- スマホ（横持ち）の操作: 左にスティック、右に攻撃ボタンを中心としたボタン群 ----
  const tp = (list) => [...list].map((t) => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
  const NP = { passive: false };
  const T = { layer: hud.add('touch', '#touch'), btn: {} };
  T.zone = T.layer.add('zone', '#t-stick-zone');
  T.stick = T.zone.add('stick', '#t-stick');
  T.knob = T.stick.add('knob', '#t-knob');
  T.zone.on('touchstart', 'stick:start', (e) => ({ t: tp(e.changedTouches)[0] }), NP)
    .on('touchmove', 'stick:move', (e) => ({ ts: tp(e.changedTouches) }), NP)
    .on('touchend', 'stick:end', (e) => ({ ts: tp(e.changedTouches) }), NP)
    .on('touchcancel', 'stick:end', (e) => ({ ts: tp(e.changedTouches) }), NP);
  T.cluster = T.layer.add('cluster', '#t-cluster');
  for (const el of T.cluster.el.querySelectorAll('.tb')) {
    const act = el.id.replace('tb-', '');
    const v = T.cluster.add(act, el);
    v.cd = el.querySelector('.cd') ? v.add('cd', '.cd') : null;
    v.nm = el.querySelector('small') ? v.add('nm', 'small') : null;
    v.num = el.querySelector('b') ? v.add('num', 'b') : null;
    v.link((ev) => { ev.payload.act = act; });
    v.on('touchstart', 'tbtn:down', (e) => ({ t: tp(e.changedTouches)[0] }), NP)
      .on('touchmove', 'tbtn:move', (e) => ({ ts: tp(e.changedTouches) }), NP)
      .on('touchend', 'tbtn:up', (e) => ({ ts: tp(e.changedTouches) }), NP)
      .on('touchcancel', 'tbtn:up', (e) => ({ ts: tp(e.changedTouches) }), NP);
    T.btn[act] = v;
  }
  T.menu = T.layer.add('menu', '#t-menu');
  for (const b of T.menu.el.querySelectorAll('button')) T.menu.add(b.dataset.panel, b).on('click', 'open', () => ({ panel: b.dataset.panel }));
  T.sp = T.menu.add('sp', '#t-sp');
  // スティック・ボタンのタッチは、ブラウザのスクロールやマウスの代替イベントを起こさない
  T.layer.link((ev) => { if (ev.dom?.type?.startsWith('touch')) ev.preventDefault = true; });
  // 画面（ゲーム）を2本指でつまむとズーム
  canvas.on('touchstart', 'pinch', (e) => ({ ts: tp(e.touches) }), NP)
    .on('touchmove', 'pinch', (e) => ({ ts: tp(e.touches) }), NP)
    .on('touchend', 'pinch', (e) => ({ ts: tp(e.touches) }), NP);
  canvas.link((ev) => { if (ev.dom?.type?.startsWith('touch')) ev.preventDefault = true; });
  // インベントリ（スマホ）: 選んだ装備への操作
  const invActions = root.add('invActions', '#inv-actions');
  invActions.add('use', '#ia-use').on('click', 'invAction', () => ({ what: 'use' }));
  invActions.add('salvage', '#ia-salvage').on('click', 'invAction', () => ({ what: 'salvage' }));
  const isTouch = new URLSearchParams(location.search).has('touch') || matchMedia('(hover: none) and (pointer: coarse)').matches;
  addEventListener('touchstart', () => root.emit('device:touch'), { once: true, passive: true });

  // ---- ウィンドウ全体の入力も Root 配下のイベントとして流す ----
  addEventListener('keydown', (e) => {
    if (e.target === H.chatIn.el || e.target === L.name.el) return;
    const ev = root.emit('key:down', { key: e.key.toLowerCase(), repeat: e.repeat }, e);
    if (ev.preventDefault) e.preventDefault();
  });
  addEventListener('keyup', (e) => root.emit('key:up', { key: e.key.toLowerCase() }, e));
  addEventListener('blur', () => root.emit('window:blur'));
  addEventListener('mouseup', (e) => root.emit('pointer:up', { button: e.button }, e));
  canvas.on('mousedown', 'pointer:down', (e) => ({ button: e.button, x: e.clientX, y: e.clientY }));
  canvas.on('mousemove', 'pointer:move', (e) => ({ x: e.clientX, y: e.clientY }));
  canvas.on('contextmenu', 'pointer:menu', () => ({}));
  canvas.el.addEventListener('wheel', (e) => { root.emit('pointer:wheel', { dy: e.deltaY }); e.preventDefault(); }, { passive: false });
  canvas.link((ev) => { if (ev.type === 'pointer:menu') ev.preventDefault = true; });

  // ==================================================================
  // Presenter（描画パラメータを計算して View に渡す）
  // ==================================================================
  const P = {};
  let boxItems = [], boxMax = 60;

  P.itemCell = (it, { showUp = false, eq = false } = {}) => {
    const c = RARITIES[it.rarity].color;
    const up = showUp && game.itemPower(it) > game.itemPower(game.char.eq[it.slot]) ? '<span class="up">▲</span>' : '';
    const g = GLYPH[it.slot === 'armor' ? (it.armor || 'medium') : it.slot === 'acc' ? 'acc' : it.kind];
    if (eq) return `<div class="cell r${it.rarity}" style="border-color:${c};color:${c}"><span class="gi">${g}</span><span>${esc(it.name)}<br><small class="dim">iLv${it.ilvl}・重さ${itemWeight(it)}</small></span></div>`;
    return `<div class="cell r${it.rarity}" style="border-color:${c};color:${c}">${up}<span class="lv">${it.ilvl}</span><span class="gi">${g}</span><span style="font-size:9px;max-width:58px;overflow:hidden;white-space:nowrap">${esc(it.name)}</span>${it.by ? `<span class="by">${esc(it.by)}</span>` : ''}</div>`;
  };
  // 項目のセル（Passive View）。どの項目かは data に持たせ、親へ伝わる途中で文脈として付く
  const cellSetup = (v) => {
    v.link((ev) => { ev.payload.id = v.data; });
    v.on('click', 'item:click', (e) => ({ x: e.clientX, y: e.clientY })).on('contextmenu', 'item:context').on('mouseenter', 'item:hover', (e) => ({ x: e.clientX, y: e.clientY }))
      .on('mousemove', 'item:move', (e) => ({ x: e.clientX, y: e.clientY })).on('mouseleave', 'item:leave');
    v.link((ev) => { if (ev.type === 'item:context') ev.preventDefault = true; });
  };

  const passiveLines = (kind) => [...WEAPONS[kind].passive, ...(WEAPONS[kind].melee ? [`生存本能：HPが${INSTINCT.hp * 100}%を切ると${INSTINCT.sec}秒間 被ダメージ-${INSTINCT.dr}%（CT ${INSTINCT.cd}秒）`] : [])];
  P.itemTip = (it, compare) => {
    const S = game.S, char = game.char;
    const r = RARITIES[it.rarity];
    const atype = it.slot === 'armor' ? ARMOR_TYPES.find((t) => t.id === it.atype) : null;
    const type = it.slot === 'weapon' ? WEAPONS[it.kind].name : it.slot === 'armor' ? `防具（${ARMOR_CLASSES[it.armor || 'medium'].name}${atype ? '・' + atype.name : ''}）` : '装飾品';
    let h = `<div class="tn" style="color:${r.color}">${esc(it.name)}</div><div class="dim">${r.name} ${type} ・ iLv${it.ilvl} ・ 重さ ${itemWeight(it)}</div>`;
    if (it.atk) h += `<div>攻撃力 +${it.atk}</div>`;
    if (it.hp) h += `<div>HP +${it.hp}</div>`;
    if (it.def) h += `<div>被ダメ軽減 +${it.def}%</div>`;
    if (it.trait) h += `<div style="color:#ffe0a0">特性：${AFFIXES[it.trait[0]].name} +${it.trait[1]}${AFFIXES[it.trait[0]].unit}</div>`;
    for (const [k, v] of it.affixes) h += `<div style="color:#9fd8ff">${AFFIXES[k].name} +${v}${AFFIXES[k].unit}</div>`;
    if (it.fx) for (const f of it.fx) h += `<div class="fx">✦ ${UNIQUE_FX[f]}</div>`;
    if (it.slot === 'weapon') {
      const sid = it.skill && WEAPON_SKILLS[it.skill]?.kind === it.kind ? it.skill : WEAPON_SKILL_POOL[it.kind][0];
      const ws = WEAPON_SKILLS[sid];
      h += `<div class="wsk">武器スキル「${ws.name}」<br><span class="dim">${ws.desc}（CT ${ws.cd}秒）</span></div>`;
      if (WEAPONS[it.kind].guard) h += '<div class="dim">右クリック長押しでガード</div>';
      h += passiveLines(it.kind).map((t) => `<div style="color:#bfe0ff">◇ ${esc(t)}</div>`).join('');
    }
    if (it.lore) h += `<div class="lore">${esc(it.lore)}</div>`;
    if (it.by) h += `<div class="dim">入れた人：${esc(it.by)}</div>`;
    const cur = char.eq[it.slot];
    if (compare && cur && cur.id !== it.id) {
      const d = game.itemPower(it) - game.itemPower(cur);
      h += `<div class="cmp" style="color:${d >= 0 ? '#6f6' : '#f77'}">装備中と比較: 戦力 ${d >= 0 ? '+' : ''}${d}</div>`;
      const dw = itemWeight(it) - itemWeight(cur);
      if (dw) h += `<div class="cmp" style="color:${dw < 0 ? '#6f6' : '#fc8'}">重さ ${dw > 0 ? '+' : ''}${dw.toFixed(1)} → ${weightClass(S.weight + dw).name}</div>`;
    }
    return h;
  };
  P.tip = (html, x, y) => {
    if (html != null) tooltip.set({ html, visible: true });
    const w = tooltip.el.offsetWidth, h = tooltip.el.offsetHeight;
    tooltip.set({ style: { left: Math.min(x + 16, innerWidth - w - 8) + 'px', top: Math.min(y + 10, innerHeight - h - 10) + 'px' } });
  };
  P.hideTip = () => { tooltip.set({ visible: false }); };

  P.inv = () => {
    const S = game.S, char = game.char;
    for (const [slot, v] of Object.entries(INV.eq)) {
      const it = char.eq[slot];
      v.data = it?.id;
      v.set({ html: it ? P.itemCell(it, { eq: true }).replace(/^<div[^>]*>|<\/div>$/g, '') : 'なし', style: { 'border-color': it ? RARITIES[it.rarity].color : '', color: it ? RARITIES[it.rarity].color : '#666' } });
    }
    if (char.inv.length) INV.grid.list(char.inv, (it) => ({ html: P.itemCell(it, { showUp: true }), data: it.id, setup: cellSetup }));
    else INV.grid.list([], () => ({})).set({ html: '<div class="dim">アイテムなし。モンスターを倒そう！</div>' });
    const st = [
      ['攻撃力', Math.round(S.atk)], ['最大HP', S.mhp], ['会心率', S.crit.toFixed(1) + '%'], ['会心ダメージ', S.critd.toFixed(0) + '%'],
      ['攻撃速度', '+' + S.aspd.toFixed(1) + '%'], ['移動速度', '+' + S.move.toFixed(1) + '%'], ['被ダメ軽減', S.def.toFixed(1) + '%'],
      ['HP吸収', S.vamp.toFixed(1) + '%'], ['スキル短縮', S.cdr.toFixed(0) + '%'],
    ];
    if (S.W.ranged) st.push(['適性エリア', `${S.optimal}m の内側 ${BOW_ZONE.min}〜${S.zoneMax}m`]);
    INV.stats.set({
      html: `<b>Lv${char.lv} ${esc(char.name)}</b> <span class="dim">${S.W.name}</span>`
        + `<div class="wrow"><span class="dim">装備重量</span><span><b style="color:${S.wc.color}">${S.weight.toFixed(1)}（${S.wc.name}）</b></span></div>`
        + `<div class="wbar"><i style="width:${clamp(S.weight / 22 * 100, 0, 100)}%;background:${S.wc.color}"></i></div>`
        + `<div><span class="dim">回避のクールタイム</span><span>${S.dodgeCd.toFixed(2)}秒</span></div>`
        + st.map(([k, v]) => `<div><span class="dim">${k}</span><span>${v}</span></div>`).join('')
        + `<div class="dim" style="margin-top:4px">武器パッシブ（${S.W.name}）</div>`
        + passiveLines(S.wk).map((t) => `<div style="color:#bfe0ff;font-size:11px">◇ ${esc(t)}</div>`).join('')
        + [...S.fx].filter((f) => UNIQUE_FX[f]).map((f) => `<div style="color:#ffd27a;font-size:11px">✦ ${UNIQUE_FX[f]}</div>`).join(''),
    });
  };

  let treeTab = null;
  P.tree = () => {
    const S = game.S, char = game.char, tree = char.tree;
    if (!treeTab) treeTab = S.wk;
    TREE.sp.set({ html: `残りスキルポイント <b>${spTotal(char.lv) - spSpent(tree)}</b>` });
    const tabs = [['sword', '片手剣'], ['greatsword', '大剣'], ['axe', '大斧'], ['spear', '盾槍'], ['dagger', '短剣'], ['bow', '弓'], ['stat', 'ステータス'], ['style', 'プレイスタイル']];
    TREE.tabs.list(tabs, ([id, nm], i) => ({
      html: `<button class="${treeTab === id ? 'on' : ''} ${i === 6 ? 'gap' : ''}">${nm}<small>${id === S.wk ? '装備中・' : ''}${treeSpent(tree, id)}pt</small></button>`,
      data: id, setup: (v) => v.on('click', 'tree:tab', () => ({ tab: id })),
    }));
    const T = TREES[treeTab], spent = treeSpent(tree, treeTab);
    const isWeapon = !['stat', 'style'].includes(treeTab);
    const rows = [];
    if (isWeapon && treeTab !== S.wk) rows.push({ note: `このツリーの効果は「${T.name}」を装備しているときだけ有効です` });
    if (treeTab === 'style') rows.push({ cols: true });
    for (let tier = 0; tier < 4; tier++) rows.push({ tier, need: tier * 2, open: spent >= tier * 2, nodes: T.nodes.filter((n) => n.tier === tier) });
    TREE.body.list(rows, (row, ri) => {
      if (row.note) return { html: `<div class="tree-note">${esc(row.note)}</div>` };
      if (row.cols) return { html: `<div class="tree-cols">${STYLE_COLS.map((c) => `<div>${c}</div>`).join('')}</div>` };
      return {
        name: 'tier' + ri,
        html: `<div class="tier ${row.open ? '' : 'locked'}"><div class="tier-l">段階${row.tier + 1}<small>${row.need ? `${row.need}pt〜` : ''}</small></div><div class="tier-n ${treeTab === 'style' ? 'cols3' : ''}"></div></div>`,
        setup: (tv) => {
          const nodesV = tv.add('nodes', '.tier-n');
          nodesV.list(row.nodes, (n) => {
            const r = tree[n.id] || 0;
            const pips = Array.from({ length: n.max }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('');
            const slotBtns = n.active && r > 0 ? `<div class="slotbtns">${[0, 1].map((i) => `<button data-slot="${i}" class="${char.slots?.[i] === n.active ? 'on' : ''}">${i + 1}</button>`).join('')}</div>` : '';
            return {
              name: n.id, data: n.id,
              html: `<div class="node ${r ? 'have' : ''} ${canLearn(char, n.id) ? 'can' : ''} ${n.active ? 'active' : ''}">
                <div class="nn">${n.active ? '◆ ' : ''}${esc(n.name)}</div><div class="pips">${pips}</div>
                <div class="nd">${esc(n.desc)}${n.active ? `<br><span class="dim">CT ${TREE_SKILLS[n.active].cd}秒</span>` : ''}</div>${slotBtns}</div>`,
              setup: (nv) => {
                nv.link((ev) => { ev.payload.node = n.id; ev.payload.skill = n.active; });
                for (const b of nv.el.querySelectorAll('.slotbtns button')) {
                  nv.add('slot' + b.dataset.slot, b).on('click', 'tree:slot', (e) => { e.stopPropagation(); return { slot: Number(b.dataset.slot) }; });
                }
                nv.on('click', 'tree:learn');
              },
            };
          });
        },
      };
    });
  };

  P.settings = () => {
    const s = game.settings;
    for (const k of ['master', 'music', 'sfx', 'amb']) { SET[k].set({ value: Math.round(s[k] * 100) }); SET[k].out.set({ text: String(Math.round(s[k] * 100)) }); }
    SET.quality.set({ value: s.quality });
    SET.shake.set({ checked: s.shake }); SET.dmgnum.set({ checked: s.dmgnum }); SET.occlusion.set({ checked: s.occlusion !== false });
  };

  P.map = () => {
    const world = game.world, f = world.floor, roster = game.roster();
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
      svg += `<g class="node ${cur ? 'cur' : ''}" transform="translate(${x},${y})">
        <circle r="30" style="stroke:${T.color}"/>
        <text class="ic" y="8" style="fill:${T.color}">${T.icon}</text>
        <text class="nm" y="50">${esc(a.name)}</text>
        <text class="ty" y="66">${T.name}${haz ? '・' + haz : ''}${here ? `・仲間${here}人` : ''}</text>
        ${extra ? `<text class="ex" y="81">${esc(extra)}</text>` : ''}
        ${cur ? '<text class="you" x="38" y="-22" style="text-anchor:start">◀ 現在地</text>' : ''}
      </g>`;
    }
    MAP.title.set({ text: `第${f}層 ${FLOORS[f - 1].name}` });
    MAP.svg.set({ html: svg });
  };

  P.dialog = (npc) => {
    const char = game.char;
    const qs = QUESTS.filter((q) => q.npc === npc.id).filter((q) => questState(char, q.id) || questAvailable(char, q));
    DLG.title.set({ text: npc.name });
    DLG.line.set({ text: `「${npc.line}」` });
    if (!qs.length) { DLG.list.list([], () => ({})).set({ html: '<div class="dim">今はお願いしたいことはないよ。</div>' }); return; }
    DLG.list.list(qs, (q) => {
      const s = questState(char, q.id);
      const rw = [`経験値 ${q.reward.xp}`, q.reward.rarity != null ? `${RARITIES[q.reward.rarity].name}以上の${q.reward.slot ? { weapon: '武器', armor: '防具', acc: '装飾品' }[q.reward.slot] : '装備'}` : '', q.reward.potion ? `ポーション所持数 +${q.reward.potion}` : ''].filter(Boolean).join('・');
      let btn;
      if (!s) btn = '<button data-act="accept">受ける</button>';
      else if (s.claimed) btn = '<span class="dim">完了</span>';
      else if (s.done) btn = '<button class="claim" data-act="claim">報告する</button>';
      else btn = `<span class="dim">${s.p} / ${q.n}</span>`;
      return {
        data: q.id,
        html: `<div class="quest ${s?.claimed ? 'claimed' : ''}"><div><b>${esc(q.name)}</b><div class="dim">${esc(q.desc)}</div><div class="rw">報酬：${rw}</div></div>${btn}</div>`,
        setup: (v) => {
          v.link((ev) => { ev.payload.quest = q.id; });
          const b = v.el.querySelector('button[data-act]');
          if (b) v.add('btn', b).on('click', b.dataset.act === 'accept' ? 'quest:accept' : 'quest:claim');
        },
      };
    });
  };

  P.gate = () => {
    const world = game.world;
    GATE.list.list(FLOORS.slice(0, MAX_FLOOR), (f) => ({
      data: f.n,
      html: `<button class="${f.n === world.floor ? 'cur' : ''}"><b>第${f.n}層</b> ${f.n <= world.unlocked ? f.name : '？？？'} <span class="dim" style="float:right">推奨Lv${1 + (f.n - 1) * 5}〜</span></button>`,
      setup: (v) => { v.set({ disabled: f.n > world.unlocked }); v.on('click', 'gate:warp', () => ({ floor: f.n })); },
    }));
  };

  P.box = () => {
    const char = game.char;
    BOX.count.set({ text: `${boxItems.length} / ${boxMax}` });
    BOX.mine.list(char.inv, (it) => ({ html: P.itemCell(it), data: it.id, setup: cellSetup }));
    if (!char.inv.length) BOX.mine.set({ html: '<div class="dim">インベントリは空です</div>' });
    BOX.shared.list(boxItems, (it) => ({ html: P.itemCell(it), data: it.uid, setup: cellSetup }));
    if (!boxItems.length) BOX.shared.set({ html: '<div class="dim">共有ボックスは空です。装備をクリックして入れよう</div>' });
  };

  P.quests = () => {
    const char = game.char;
    const active = QUESTS.filter((q) => { const s = questState(char, q.id); return s && !s.claimed; });
    H.quests.set({
      visible: active.length > 0,
      html: '<div class="dim">クエスト</div>' + active.map((q) => {
        const s = questState(char, q.id);
        return `<div class="qi ${s.done ? 'done' : ''}"><b>${esc(q.name)}</b><span>${s.done ? '達成！報告しよう' : `${s.p} / ${q.n}`}</span><small>${esc(q.desc)}</small></div>`;
      }).join(''),
    });
  };

  P.party = () => {
    const roster = game.roster();
    H.party.set({
      html: '<div class="dim" style="margin-bottom:6px">オンライン ' + roster.length + '人</div>' + roster.map(([id, name, lv, floor, hp, mhp, color, aname]) => `
      <div class="pm"><div class="nm"><span style="color:${esc(color)}">${esc(name)}${id === game.me.id ? ' (自分)' : ''}</span><span class="dim">Lv${lv}</span></div>
      <div class="dim" style="font-size:10px">${floor}層 ${esc(aname || '')}</div>
      <div class="bar hp"><div style="width:${clamp(hp / mhp * 100, 0, 100)}%"></div></div></div>`).join(''),
    });
  };

  const setCd = (v, val, max) => { v.cd?.set({ style: { height: clamp(max > 0 ? val / max * 100 : 0, 0, 100) + '%' } }); v.set({ cls: { ready: val <= 0 } }); };
  P.hud = () => {
    const S = game.S, me = game.me, char = game.char, t = now();
    H.meName.set({ text: char.name });
    H.meLv.set({ text: 'Lv ' + char.lv });
    const hpPct = clamp(me.hp / S.mhp * 100, 0, 100);
    H.hp.set({ style: { width: hpPct + '%' } });
    H.hpBar.set({ cls: { low: hpPct < 30 } });
    H.hpT.set({ text: `${Math.ceil(me.hp)} / ${S.mhp}` });
    const need = xpToNext(char.lv);
    H.xp.set({ style: { width: (char.lv >= MAX_LEVEL ? 100 : char.xp / need * 100) + '%' } });
    H.xpT.set({ text: char.lv >= MAX_LEVEL ? 'MAX' : `${char.xp} / ${need}` });
    const def = game.world.def;
    H.floor.set({ text: def.name.startsWith('第') ? def.name : `第${def.floor}層 ${def.name}` });
    H.potN.set({ text: String(me.potions) });
    H.atkName.set({ text: HEAVY[S.wk].name });
    H.skillName.set({ text: S.ws.name });
    H.wsKey.set({ text: S.W.guard ? 'E' : '右 / E' });
    H.slots.guard.set({ visible: !!S.W.guard, cls: { active: me.guarding } });
    setCd(H.slots.skill, me.wsCd, S.ws.cd * (1 - S.cdr / 100));
    for (let i = 0; i < 2; i++) {
      const id = char.slots?.[i], v = H.slots['t' + (i + 1)];
      const usable = id && S.actives.has(id);
      v.nm.set({ text: id ? TREE_SKILLS[id].name : '未設定' });
      v.set({ cls: { off: !usable } });
      setCd(v, usable ? (me.tcd[id] || 0) : 1, usable ? TREE_SKILLS[id].cd * (1 - S.cdr / 100) : 1);
    }
    setCd(H.slots.dodge, me.dodgeCd, S.dodgeCd);
    H.dodgeW.set({ text: S.wc.name, style: { color: S.wc.color } });
    setCd(H.slots.pot, me.potions > 0 ? me.potCd : 1, 1);
    const left = spTotal(char.lv) - spSpent(char.tree);
    H.spBadge.set({ text: left > 0 ? String(left) : '', visible: left > 0 });
    // 溜めゲージ
    const charging = me.charging && me.chargeT >= game.CHARGE_MIN;
    H.charge.set({ visible: charging, cls: { max: me.chargeLv === 2 } });
    if (charging) H.chargeFill.set({ style: { width: clamp((me.chargeT - game.CHARGE_MIN) / (game.CHARGE_MAX - game.CHARGE_MIN) * 100, 0, 100) + '%' } });
    // バフ
    const status = me.buffs.map((b) => `<span style="color:${hex(b.color)}">✦ ${esc(b.label)} ${b.t.toFixed(1)}s</span>`);
    if (me.dStack > 0) status.push(`<span style="color:#9fe">⚡ 連撃 攻速+${me.dStack * 4}%</span>`);
    if (me.nextAtkBonus > 1.01) status.push(`<span style="color:#bfe0ff">⛨ 反撃準備 +${Math.round((me.nextAtkBonus - 1) * 100)}%</span>`);
    if (S.W.melee) {
      const cd = INSTINCT.cd - (t - me.instinctT);
      status.push(cd > 0 ? `<span class="dim">生存本能 ${Math.ceil(cd)}s</span>` : '<span style="color:#ff9a8a">♥ 生存本能</span>');
    }
    const hz = game.hazard();
    if (hz) status.push(`<span style="color:${hz.kind === 'poison' ? '#c08aff' : '#e0c890'}">⚠ ${HAZARDS[hz.kind].name}</span>`);
    H.buffs.set({ html: status.join('　') });
    // ボス
    const boss = game.boss();
    H.boss.set({ visible: !!boss });
    if (boss) {
      H.bossName.set({ text: `Lv${boss.lv} ${boss.name}`, cls: { enraged: !!boss.enraged } });
      const pct = clamp(boss.hp / boss.mhp * 100, 0, 100) + '%';
      H.bossHp.set({ style: { width: pct } }); H.bossLag.set({ style: { width: pct } });
      const tname = boss.target === me.id ? 'あなた' : game.others.get(boss.target)?.name;
      H.bossTarget.set({ text: (tname ? `ターゲット：${tname}` : '') + (boss.hateT != null ? `　ヘイトリセットまで ${Math.max(0, boss.hateT).toFixed(0)}秒` : ''), cls: { me: boss.target === me.id } });
      const stunned = boss.stunT > 0;
      H.bossStun.set({ style: { width: (stunned ? 100 : clamp(boss.stunPct || 0, 0, 100)) + '%' } });
      H.bossStunBar.set({ cls: { stunned } });
      H.bossStunT.set({ text: stunned ? `STUN ${boss.stunT.toFixed(1)}秒（被ダメ1.3倍）` : 'スタン' });
    }
    // 調べる・ボス部屋の案内
    const it = game.nearestInteract();
    const lair = game.env()?.lair, world = game.world;
    const nearLair = lair && !boss && world.bossState !== 'fight' && Math.hypot(me.x - lair.x, me.z - lair.z) < lair.r + 4;
    if (it) H.prompt.set({ visible: true, html: it.label });
    else if (nearLair && world.bossState === 'cleared') H.prompt.set({ visible: true, text: 'ボスは討伐済み。しばらくすると再挑戦できます' });
    else if (nearLair) H.prompt.set({ visible: true, text: '⚠ ボス部屋：魔法陣の中に入ると戦闘開始' });
    else H.prompt.set({ visible: false });
    // 死亡
    death.set({ visible: me.dead });
    if (me.dead) deathT.set({ text: `${Math.max(0, me.deadT).toFixed(1)} 秒後に${world.def.gate ? '転移門' : 'エリアの入口'}で復活` });
  };

  // ---- スマホの操作ボタン ----
  const tc = { on: false, stick: null, btn: {}, pinch: 0 };
  const STICK_R = 60;
  P.stick = (dx = 0, dy = 0) => {
    const zr = T.zone.el.getBoundingClientRect();
    const o = tc.stick || { ox: zr.left + 100, oy: zr.bottom - 96 };
    T.stick.set({ cls: { active: !!tc.stick }, style: { left: (o.ox - zr.left) + 'px', top: (o.oy - zr.top) + 'px' } });
    T.knob.set({ style: { transform: `translate(${dx}px, ${dy}px)` } });
  };
  const USE_LABEL = { gate: '転移門', npc: '話す', box: 'ボックス', lever: 'レバー', chest: '宝箱' };
  P.touch = () => {
    root.set({ cls: { touch: tc.on, playing: !mediator.is('login'), chatting: mediator.is('chat') } });
    if (!tc.on) return;
    T.layer.set({ visible: mediator.is('play') });
    if (!mediator.is('play')) return;
    const S = game.S, me = game.me, char = game.char, B = T.btn;
    B.atk.nm.set({ text: `${S.W.name}・長押し${HEAVY[S.wk].name}` });
    B.atk.set({ cls: { charging: me.charging && me.chargeT >= game.CHARGE_MIN } });
    B.skill.nm.set({ text: S.ws.name });
    setCd(B.skill, me.wsCd, S.ws.cd * (1 - S.cdr / 100));
    for (let i = 0; i < 2; i++) {
      const id = char.slots?.[i], v = B['t' + (i + 1)];
      const usable = id && S.actives.has(id);
      v.nm.set({ text: id ? TREE_SKILLS[id].name : '未設定' });
      v.set({ cls: { off: !usable } });
      setCd(v, usable ? (me.tcd[id] || 0) : 1, usable ? TREE_SKILLS[id].cd * (1 - S.cdr / 100) : 1);
    }
    setCd(B.dodge, me.dodgeCd, S.dodgeCd);
    B.guard.set({ visible: !!S.W.guard, cls: { pressed: me.guarding } });
    B.pot.num.set({ text: String(me.potions) });
    setCd(B.pot, me.potions > 0 ? me.potCd : 1, 1);
    const it = game.nearestInteract();
    B.use.set({ visible: !!it });
    if (it) B.use.nm.set({ text: USE_LABEL[it.kind] || '調べる' });
    const left = spTotal(char.lv) - spSpent(char.tree);
    T.sp.set({ text: left > 0 ? String(left) : '' });
  };

  // ミニマップ: 図形の一覧を作って View に渡す
  P.minimap = () => {
    const W = H.minimap.el.width, me = game.me, world = game.world, def = world.def, env = game.env();
    const indoor = def.shape === 'grid';
    const extent = indoor ? 30 : Math.max(...Array.from({ length: 32 }, (_, i) => boundR(def, i / 32 * Math.PI * 2))) + 4;
    const sc = W / 2 / extent;
    const cx = indoor ? me.x : 0, cz = indoor ? me.z : 0;
    const p = (x, z) => [W / 2 + (x - cx) * sc, W / 2 + (z - cz) * sc];
    const sh = [{ t: 'bg', fill: indoor ? '#0c0e16dd' : '#0a0c14aa' }];
    if (indoor) {
      const g = grid(def);
      for (let r = 0; r < g.H; r++) for (let c = 0; c < g.W; c++) {
        const ch = g.rows[r][c];
        if (ch === '#') continue;
        const [x, y] = p((c - g.W / 2) * CELL, (r - g.H / 2) * CELL);
        sh.push({ t: 'rect', x, y, w: CELL * sc + 0.5, h: CELL * sc + 0.5, fill: ch === 'D' ? (world.door ? '#6a8a6a' : '#c04a4a') : ch === 'T' || ch === 't' ? '#6a4a3a' : '#4a5064' });
      }
      for (const [ch, col] of [['L', '#ff9a4a'], ['P', '#6ad0ff']]) for (const q of g.pts[ch] || []) { const [x, y] = p(q.x, q.z); sh.push({ t: 'rect', x: x - 3, y: y - 3, w: 6, h: 6, fill: col }); }
    } else {
      // 輪郭（いびつな形）
      const pts = Array.from({ length: 64 }, (_, i) => { const a = i / 64 * Math.PI * 2, r = boundR(def, a); return p(Math.sin(a) * r, -Math.cos(a) * r); });
      sh.push({ t: 'poly', pts, close: true, fill: hex(FLOORS[world.floor - 1].ground) + 'aa', stroke: 'rgba(255,255,255,.35)', lw: 2 });
      for (const o of obstaclesOf(def)) { const [x, y] = p(o.x, o.z); sh.push({ t: 'circle', x, y, r: Math.max(1.5, o.r * sc), fill: o.kind === 'pond' ? '#3a8ad0cc' : '#20242ecc' }); }
      for (const h of hazardsOf(def)) { const [x, y] = p(h.x, h.z); sh.push({ t: 'circle', x, y, r: Math.max(1.5, h.r * sc), fill: h.kind === 'poison' ? '#8a3ab0aa' : '#e0c890aa' }); }
      if (def.box) { const [x, y] = p(def.box.x, def.box.z); sh.push({ t: 'rect', x: x - 3.5, y: y - 3.5, w: 7, h: 7, fill: '#7ae0ff' }); }
    }
    for (const c of chestsOf(def)) { const [x, y] = p(c.x, c.z); sh.push({ t: 'rect', x: x - 3, y: y - 3, w: 6, h: 6, fill: game.chestOpen(c) ? '#6a6a6a' : '#ffd27a' }); }
    if (def.gate) { const [x, y] = p(def.gate.x, def.gate.z); sh.push({ t: 'circle', x, y, r: 5, fill: '#6ad0ff' }); }
    if (env?.lair) { const [x, y] = p(env.lair.x, env.lair.z); sh.push({ t: 'circle', x, y, r: env.lair.r * sc, stroke: hex(FLOORS[world.floor - 1].boss.accent), lw: 2 }); }
    for (const q of env?.portals || []) { const [x, y] = p(q.x, q.z); sh.push({ t: 'poly', pts: [[x, y - 5], [x + 5, y + 4], [x - 5, y + 4]], close: true, fill: '#bfe6ff' }); }
    for (const n of game.npcs) { const [x, y] = p(n.x, n.z); sh.push({ t: 'circle', x, y, r: 3.5, fill: n.mark ? '#ffd84a' : '#e0e0e0' }); }
    for (const d of game.drops) { const [x, y] = p(d.x, d.z); sh.push({ t: 'rect', x: x - 2, y: y - 2, w: 4, h: 4, fill: RARITIES[d.it.rarity].color }); }
    for (const mb of game.mobs.values()) {
      const [x, y] = p(mb.x, mb.z);
      sh.push({ t: 'circle', x, y, r: mb.kind === 2 ? 6 : mb.elite === 3 ? 5 : mb.elite ? 3 : 2, fill: mb.kind === 2 ? '#ff2a2a' : mb.elite === 3 ? '#ff6ad0' : mb.elite ? '#ffb030' : '#ff7a6a' });
    }
    for (const o of game.others.values()) { const [x, y] = p(o.x, o.z); sh.push({ t: 'circle', x, y, r: 3.5, fill: '#7f7' }); }
    const [x, y] = p(me.x, me.z);
    sh.push({ t: 'arrow', x, y, a: -me.a + Math.PI, fill: '#fff' });
    H.minimap.draw(sh);
  };

  // ---- 浮かぶ文字・仲間の名札（ゲーム空間の位置 → 画面の位置） ----
  const floats = [];
  const plates = new Map();
  let floatSeq = 0;
  P.floatText = (x, y, z, text, cls) => {
    const s = game.settings;
    if (!s.dmgnum && (cls === '' || cls === 'crit' || cls === 'poison' || cls === undefined)) return;
    const el = document.createElement('div');
    floatLayer.el.appendChild(el);
    const v = new View(el, 'f' + floatSeq++, floatLayer);
    v.set({ cls: { dmg: true, [cls || 'n']: true }, text: String(text) });
    floats.push({ v, x: x + (Math.random() - 0.5) * 0.8, y, z, t: 0 });
  };
  P.floats = (dt) => {
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.t += dt;
      const q = game.project(f.x, f.y + f.t * 1.5, f.z);
      f.v.set({ style: { left: q.x + 'px', top: q.y + 'px', opacity: String(1 - Math.max(0, f.t - 0.6) / 0.4) } });
      if (f.t > 1) { f.v.remove(); floats.splice(i, 1); }
    }
    for (const [id, v] of plates) if (!game.others.has(id)) { v.remove(); plates.delete(id); }
    for (const o of game.others.values()) {
      let v = plates.get(o.id);
      if (!v) {
        const el = document.createElement('div');
        el.className = 'plate player';
        el.innerHTML = '<div class="pn"></div><div class="pb"><div></div></div>';
        floatLayer.el.appendChild(el);
        v = new View(el, 'plate' + o.id, floatLayer);
        v.add('name', '.pn'); v.add('hp', '.pb > div');
        plates.set(o.id, v);
      }
      const q = game.project(o.x, 2.6, o.z);
      v.set({ style: { display: q.vis && !o.dead ? '' : 'none', left: q.x + 'px', top: q.y + 'px' } });
      v.get('name').set({ text: `Lv${o.lv} ${o.name}` });
      v.get('hp').set({ style: { width: clamp(o.hp / o.mhp * 100, 0, 100) + '%' } });
    }
  };

  // ---- 通知 ----
  P.toast = (text, color = '#fff', big = false) => {
    const el = document.createElement('div');
    H.toasts.el.appendChild(el);
    const v = new View(el, 'toast', H.toasts);
    v.set({ cls: { toast: true, big }, style: { 'border-color': color, color }, text });
    setTimeout(() => v.remove(), 3600);
    while (H.toasts.el.children.length > 5) H.toasts.el.firstChild.remove();
  };
  let bannerUntil = 0, bannerPrio = 0;
  P.banner = (top, main, color, prio = 0) => {
    if (now() < bannerUntil && prio < bannerPrio) return;
    bannerUntil = now() + 2.5; bannerPrio = prio;
    H.banner.set({ html: `<div class="b1">${esc(top)}</div><div class="b2" style="color:${color}">${esc(main)}</div>`, cls: { show: false } });
    void H.banner.el.offsetWidth;
    H.banner.set({ cls: { show: true } });
  };
  P.chat = (from, text, color) => {
    const el = document.createElement('div');
    H.chatLog.el.appendChild(el);
    const v = new View(el, 'line', H.chatLog);
    if (from) v.set({ html: `<b style="color:${esc(color)}">${esc(from)}</b>: ${esc(text)}` });
    else v.set({ text, style: { color } });
    while (H.chatLog.el.children.length > 60) H.chatLog.el.firstChild.remove();
    H.chatLog.el.scrollTop = H.chatLog.el.scrollHeight;
  };
  P.hurt = () => {
    vignette.set({ style: { 'box-shadow': 'inset 0 0 160px rgba(255,0,0,.55)' } });
    setTimeout(() => vignette.set({ style: { 'box-shadow': 'inset 0 0 120px rgba(255,0,0,0)' } }), 180);
  };

  // パネルの再描画（開いているものだけ）
  const panelPresenter = { inv: P.inv, tree: P.tree, settings: P.settings, map: P.map, gate: P.gate, box: P.box, dialog: (d) => P.dialog(d.npc) };
  const showPanel = (name, data) => {
    for (const p of PANELS) panels[p].set({ visible: p === name });
    P.hideTip();
    invActions.set({ visible: false });
    mediator.sel = null;
    if (name) panelPresenter[name](data);
  };

  // ==================================================================
  // Mediator（ステートマシン）
  //   login → play ⇄ inv / tree / settings / map / dialog / gate / box / chat
  // ==================================================================
  const panelState = (name, extra = {}) => ({
    enter(data) { showPanel(name, data); game.sfx('ui'); },
    exit() { showPanel(null); },
    refresh(data) { panelPresenter[name](data); },
    on: {
      open: (ev) => (ev.payload.panel === name ? 'play' : ev.payload.panel), // 同じボタンでもう一度押すと閉じる
      ...extra,
    },
  });
  const itemTip = (ev) => {
    const it = ev.ctx.source === 'box' ? boxItems.find((i) => i.uid === ev.payload.id) : game.findItem(ev.payload.id);
    if (it) P.tip(P.itemTip(it, ev.ctx.source !== 'equipped'), ev.payload.x, ev.payload.y);
  };
  const KEY_PANEL = { i: 'inv', tab: 'inv', k: 'tree', m: 'map', o: 'settings' };
  const AIMABLE = new Set(['atk', 'skill', 't1', 't2']);
  const enableTouch = () => {
    if (tc.on) return;
    tc.on = true;
    game.input.setTouch(true);
    P.touch(); P.stick();
  };
  // パネルを開くなどでプレイ画面を離れるとき、押しっぱなしの操作を離す
  const releaseTouch = () => {
    if (tc.stick) { tc.stick = null; game.input.stick(0, 0); P.stick(); }
    for (const act of Object.keys(tc.btn)) {
      if (act === 'atk' || act === 'guard') game.input.button(act, false);
      T.btn[act].set({ cls: { pressed: false, aiming: false } });
      delete tc.btn[act];
    }
    game.input.aim(null);
  };
  // スマホでは、装備のタップ1回目で詳細を出し、2回目（または下のボタン）で操作する
  const touchSelect = (mediatorSelf, ev) => {
    if (!tc.on || mediatorSelf.sel === ev.payload.id) return false;
    mediatorSelf.sel = ev.payload.id;
    itemTip(ev);
    return true;
  };

  mediator.states = {
    // ---------- 全状態で共通 ----------
    '*': {
      on: {
        'key:down'(ev) {
          const k = ev.payload.key;
          if (this.is('login')) return undefined;
          if (k === 'escape') return this.is('play') ? 'settings' : 'play';
          if (KEY_PANEL[k]) { ev.preventDefault = true; return this.is(KEY_PANEL[k]) ? 'play' : KEY_PANEL[k]; }
          if (k === 'enter') { ev.preventDefault = true; return 'chat'; }
          if (k === 'h') { H.help.set({ visible: H.help.el.classList.contains('hidden') }); return undefined; }
          if (k === 'f') return this.handleInteract();
          if (k === ' ' || k === 'shift') ev.preventDefault = true;
          if (!ev.payload.repeat) game.input.keyDown(k);
          return undefined;
        },
        'key:up'(ev) { game.input.keyUp(ev.payload.key); },
        'window:blur'() { game.input.blur(); },
        // スマホ操作中は、タッチから作られるマウスの代替イベントを無視する
        'pointer:down'(ev) { if (!this.is('login') && !tc.on) game.input.pointerDown(ev.payload.button); },
        'pointer:up'(ev) { if (!this.is('login') && !tc.on) game.input.pointerUp(ev.payload.button); },
        // ---- スマホ ----
        'device:touch'() { enableTouch(); },
        'stick:start'(ev) {
          const t = ev.payload.t;
          if (!this.is('play') || tc.stick || !t) return;
          tc.stick = { id: t.id, ox: t.x, oy: t.y };
          P.stick();
        },
        'stick:move'(ev) {
          const s = tc.stick, t = s && ev.payload.ts.find((q) => q.id === s.id);
          if (!t) return;
          let dx = t.x - s.ox, dy = t.y - s.oy;
          const d = Math.hypot(dx, dy);
          if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
          game.input.stick(dx / STICK_R, dy / STICK_R); // 画面の上 = 奥（-z）なので、そのまま x / z になる
          P.stick(dx, dy);
        },
        'stick:end'(ev) {
          const s = tc.stick;
          if (!s || !ev.payload.ts.some((q) => q.id === s.id)) return;
          tc.stick = null;
          game.input.stick(0, 0);
          P.stick();
        },
        // ボタン: 攻撃・ガード・回避・ポーションは押した瞬間、スキルは離した瞬間に出す（引っぱると狙える）
        'tbtn:down'(ev) {
          const { act, t } = ev.payload;
          if (!this.is('play') || !t) return undefined;
          tc.btn[act] = { id: t.id, ox: t.x, oy: t.y, aiming: false };
          T.btn[act].set({ cls: { pressed: true } });
          if (act === 'use') return this.handleInteract();
          if (['atk', 'guard', 'dodge', 'pot'].includes(act)) game.input.button(act, true);
          return undefined;
        },
        'tbtn:move'(ev) {
          const { act } = ev.payload, b = tc.btn[act];
          const t = b && AIMABLE.has(act) && ev.payload.ts.find((q) => q.id === b.id);
          if (!t) return;
          const dx = t.x - b.ox, dy = t.y - b.oy, d = Math.hypot(dx, dy);
          if (d > 16) { b.aiming = true; game.input.aim(Math.atan2(dx, dy), Math.min(1, d / 120)); }
          else if (b.aiming) { b.aiming = false; game.input.aim(null); } // 真ん中に戻すと自動ターゲットへ
          T.btn[act].set({ cls: { aiming: b.aiming } });
        },
        'tbtn:up'(ev) {
          const { act } = ev.payload, b = tc.btn[act];
          if (!b || !ev.payload.ts.some((q) => q.id === b.id)) return;
          delete tc.btn[act];
          T.btn[act].set({ cls: { pressed: false, aiming: false } });
          if (['skill', 't1', 't2'].includes(act)) game.input.button(act, true);
          if (act === 'atk' || act === 'guard') game.input.button(act, false);
          game.input.aim(null);
        },
        pinch(ev) {
          const ts = ev.payload.ts;
          if (ts.length < 2) { tc.pinch = 0; return; }
          const d = Math.hypot(ts[0].x - ts[1].x, ts[0].y - ts[1].y);
          if (tc.pinch) game.input.zoomBy(tc.pinch / d);
          tc.pinch = d;
        },
        'pointer:move'(ev) { game.input.pointerMove(ev.payload.x, ev.payload.y); },
        'pointer:wheel'(ev) { if (!this.is('login')) game.input.wheel(ev.payload.dy); },
        open: (ev) => ev.payload.panel,
        'panel:close': () => 'play',
        'chat:focus': () => 'chat',
        'item:hover': itemTip,
        'item:move': (ev) => P.tip(null, ev.payload.x, ev.payload.y),
        // スマホではタップの後にマウスの代替イベント（leave）が来るので、選択中は詳細を出したままにする
        'item:leave'() { if (!(tc.on && this.sel)) P.hideTip(); },
      },
    },
    // ---------- ログイン ----------
    login: {
      enter() {
        const info = game.loginInfo();
        login.set({ visible: true }); hud.set({ visible: false });
        L.name.set({ value: info?.name || '', focus: true });
        if (info) {
          L.color.set({ value: info.color });
          L.existing.set({ text: `つづきから：Lv${info.lv} ${info.name}（${WEAPONS[info.kind].name}）` });
          L.weaponWrap.set({ style: { display: 'none' } });
          L.fresh.set({ visible: true });
        }
        this.kind = 'sword';
      },
      exit() { login.set({ visible: false }); hud.set({ visible: true }); },
      on: {
        'login:weapon'(ev) {
          this.kind = ev.payload.kind;
          for (const [k, v] of L.weapons.children) v.set({ cls: { on: k === this.kind } });
          game.sfx('ui');
        },
        // 最初からはじめる（誤操作防止のため2回押しで実行）
        'login:new'() {
          const info = game.loginInfo();
          if (info && now() - (this.newArmT || 0) > 5) {
            this.newArmT = now();
            L.fresh.set({ cls: { armed: true }, text: `Lv${info.lv} のデータが消えます。もう一度押すと最初から` });
            return undefined;
          }
          game.resetChar();
          L.fresh.set({ cls: { armed: false }, text: '最初からはじめる' });
          L.existing.set({ text: '新しいキャラクターではじめます' });
          L.weaponWrap.set({ style: { display: '' } });
          L.fresh.set({ visible: false });
          L.name.set({ focus: true });
          return undefined;
        },
        'login:key'(ev) { if (ev.payload.key === 'Enter') this.handle({ type: 'login:start', payload: {}, ctx: {}, path: [] }); },
        'login:start'() {
          if (this.starting) return undefined;
          this.starting = true;
          if (tc.on) game.fullscreen(); // スマホ: 全画面＋横向き固定（対応ブラウザのみ）
          L.start.set({ disabled: true, text: '接続中…' });
          game.start({ name: L.name.el.value.trim() || 'プレイヤー', color: L.color.el.value, kind: this.kind }).then((ok) => {
            H.mode.set({ text: ok ? 'ONLINE' : 'SOLO MODE（サーバー未接続）' });
            this.go('play');
            P.quests(); P.party();
            setTimeout(() => H.help.set({ visible: false }), 15000);
          });
          return undefined;
        },
      },
    },
    // ---------- プレイ中（パネルなし） ----------
    play: { enter() { showPanel(null); H.chatIn.set({ focus: false }); }, exit() { releaseTouch(); }, on: {} },
    // ---------- チャット入力中: ゲームのキー操作は止める ----------
    chat: {
      enter() { root.set({ cls: { chatting: true } }); H.chatIn.set({ focus: true }); game.input.blur(); },
      exit() { root.set({ cls: { chatting: false } }); H.chatIn.set({ focus: false, value: '' }); },
      on: {
        'chat:key'(ev) {
          if (ev.payload.key === 'Enter') { const t = ev.payload.text.trim(); if (t) game.chat(t); return 'play'; }
          if (ev.payload.key === 'Escape') return 'play';
          return undefined;
        },
        // スマホ: キーボードを閉じたらチャットも閉じる
        'chat:blur': () => (tc.on ? 'play' : undefined),
        'key:down': () => undefined,
        'chat:focus': () => undefined,
      },
    },
    inv: panelState('inv', {
      'item:click'(ev) {
        if (ev.ctx.source !== 'inv') return;
        if (touchSelect(this, ev)) { invActions.set({ visible: true }); return; }
        game.equip(ev.payload.id); this.sel = null; P.hideTip(); invActions.set({ visible: false });
      },
      'item:context'(ev) { if (ev.ctx.source === 'inv') { game.salvage(ev.payload.id); P.hideTip(); } },
      'inv:salvageCommon'() { game.salvageCommon(); },
      invAction(ev) {
        if (!this.sel) return;
        if (ev.payload.what === 'use') game.equip(this.sel); else game.salvage(this.sel);
        this.sel = null; P.hideTip(); invActions.set({ visible: false });
      },
    }),
    tree: panelState('tree', {
      'tree:tab'(ev) { treeTab = ev.payload.tab; game.sfx('ui'); P.tree(); },
      'tree:learn'(ev) { game.learn(ev.payload.node); },
      'tree:slot'(ev) { game.setSlot(ev.payload.slot, ev.payload.skill); },
      'tree:reset'() { game.resetTree(); },
    }),
    settings: panelState('settings', {
      'set:change'(ev) { game.setSetting(ev.payload.key, ev.payload.value); P.settings(); },
    }),
    map: panelState('map'),
    dialog: panelState('dialog', {
      'quest:accept'(ev) { game.acceptQuest(ev.payload.quest); P.dialog(this.data.npc); },
      'quest:claim'(ev) { game.claimQuest(ev.payload.quest); P.dialog(this.data.npc); },
    }),
    gate: panelState('gate', {
      'gate:warp'(ev) { game.warp(ev.payload.floor); return 'play'; },
    }),
    // 共有ボックス: 同じセルでも「自分の持ち物」をクリックすると入れる、「箱の中」をクリックすると取り出す
    box: {
      ...panelState('box', {
        'item:click'(ev) {
          if (touchSelect(this, ev)) return;
          this.sel = null;
          if (ev.ctx.source === 'inv') game.boxPut(ev.payload.id);
          if (ev.ctx.source === 'box') game.boxTake(ev.payload.id);
          P.hideTip();
        },
        'item:context': () => undefined,
      }),
      exit() { showPanel(null); game.boxClose(); },
    },
  };
  // F キー: 近くにあるものに応じて、開くパネルや操作を決める
  mediator.handleInteract = function () {
    const it = game.nearestInteract();
    if (!it) return undefined;
    if (it.kind === 'gate') return 'gate';
    if (it.kind === 'npc') return ['dialog', { npc: it.npc }];
    if (it.kind === 'box') { game.boxOpen(); return 'box'; }
    game.interact(it);
    return undefined;
  };
  mediator.go('login');
  if (isTouch) enableTouch();

  // ==================================================================
  // ゲーム側から呼ぶ窓口（Presenter への通知）
  // ==================================================================
  return {
    root, mediator,
    get state() { return mediator.state; },
    frame(dt) { P.hud(); P.touch(); P.minimap(); P.floats(dt); },
    // データが変わったので、開いているパネルとクエスト表示を描き直す
    refresh() {
      if (mediator.is(...PANELS)) panelPresenter[mediator.state](mediator.data);
      if (!mediator.is('login')) P.quests();
    },
    open(state, data) { mediator.go(state, data); },
    close() { if (!mediator.is('login', 'play')) mediator.go('play'); },
    boxItems(items, max) { boxItems = items; boxMax = max || boxMax; if (mediator.is('box')) P.box(); },
    toast: P.toast, banner: P.banner, chat: P.chat, floatText: P.floatText, hurt: P.hurt, party: P.party, quests: P.quests,
  };
}
