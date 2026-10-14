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
  FLOORS, WEAPONS, RARITIES, AFFIXES, UNIQUE_FX, MAX_LEVEL, MAX_FLOOR, ARMOR_CLASSES, ARMOR_TYPES, INSTINCT,
  WEAPON_SKILL_POOL, xpToNext, itemWeight, weightClass, salvageValue, SKILL_VARIANTS, isVariant, transcendCount, displayName, affixText, tierLabel, tierColor,
  enhMult, TITLES, TITLE_REQ, titleReqOk, ENH_MAX, ENH_RATE, enhCost, affixCost, skillCost, loreCost, CRAFT_MAX_TIER, affixName, FX_REQ,
} from '../../shared/data.js';
import { AREAS, AREA_TYPES, CELL, CLEAR_KILLS, WEATHERS, grid, boundR, obstaclesOf, hazardsOf, chestsOf, HAZARDS } from '../../shared/areas.js';
import { HEAVY, WEAPON_SKILLS, TREE_SKILLS, TREES, STYLE_COLS, spTotal, spSpent, treeSpent, canLearn } from '../skills.js';
import { WTREES, WT_TAGS, ROW_REQ, PROF_MAX, hasWTree, profLevel, profOf, profNeed, wtOf, wtSpent, wtLeft, wtCanLearn, WT_RESET_COST } from '../weapon-tree.js';
import { QUESTS, questState, questAvailable } from '../quests.js';
import { View, Root, Mediator } from './core.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const now = () => performance.now() / 1000;
const PANELS = ['inv', 'tree', 'settings', 'map', 'dialog', 'gate', 'box', 'smith'];
const GLYPH = { sword: '剣', greatsword: '大', spear: '盾', dagger: '短', axe: '斧', bow: '弓', light: '衣', medium: '鎧', heavy: '甲', acc: '飾', title: '銘' };

// ミニマップ: 図形の一覧を受け取って描くだけの View
// 図形の一覧を描くだけの Passive View（round: 円形に切り抜く＝ミニマップ）
class CanvasView extends View {
  draw(shapes) {
    const g = this.el.getContext('2d'), W = this.el.width, H = this.el.height;
    g.clearRect(0, 0, W, H);
    g.save();
    if (this.round !== false) { g.beginPath(); g.arc(W / 2, H / 2, Math.min(W, H) / 2, 0, Math.PI * 2); g.clip(); }
    for (const s of shapes) {
      g.fillStyle = s.fill || 'transparent'; g.strokeStyle = s.stroke || 'transparent'; g.lineWidth = s.lw || 1;
      g.beginPath();
      if (s.t === 'bg') { g.fillRect(0, 0, W, H); continue; }
      if (s.t === 'text') {
        g.font = `bold ${s.size || 12}px sans-serif`; g.textAlign = s.align || 'center'; g.textBaseline = 'middle';
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(s.text, s.x, s.y); g.fillText(s.text, s.x, s.y);
        continue;
      }
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
  root.link(() => game.characterLost ? true : undefined);

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
    mode: '#mode-tag', help: '#help', topbar: '#topbar', stamina: '#stamina', vitals: '#vitals', gold: '#gold',
  })) H[k] = hud.add(k, sel, k === 'minimap' ? CanvasView : View);
  H.hpBar = H.hp.parent.add('hpBar', H.hp.el.parentElement);
  H.chargeFill = H.charge.add('fill', H.charge.el.firstElementChild);
  H.staminaFg = H.stamina.add('fg', '#stamina-fg');
  H.goldN = H.gold.add('n', '#gold-n');
  H.slots = {};
  for (const bar of [H.hotbar, H.topbar]) {
    for (const el of bar.el.querySelectorAll('.slot')) {
      const id = el.id.replace('s-', '');
      const v = bar.add(id, el);
      v.cd = el.querySelector('.cd') ? v.add('cd', '.cd') : null;
      v.nm = el.querySelector('.nm') ? v.add('nm', '.nm') : null;
      H.slots[id] = v;
    }
  }
  H.atkName = H.charge.add('atkName', '#atk-name');
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
    auto: panels.inv.add('auto', '#inv-auto'), autoLbl: panels.inv.add('autoLbl', '#inv-auto-lbl'),
    eq: {},
  };
  INV.salvage.on('click', 'inv:salvageCommon');
  INV.auto.on('input', 'inv:autoSalvage', (e) => ({ v: +e.target.value }));
  for (const el of panels.inv.el.querySelectorAll('.eq')) INV.eq[el.dataset.slot] = panels.inv.add('eq_' + el.dataset.slot, el.querySelector('.cell'));
  INV.grid.link((ev) => { ev.ctx.source = 'inv'; });
  for (const [slot, v] of Object.entries(INV.eq)) {
    v.link((ev) => { ev.ctx.source = 'equipped'; ev.payload.id = v.data; ev.payload.slot = slot; });
    v.on('click', 'item:click', (e) => ({ x: e.clientX, y: e.clientY }));
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
  const MAP = {
    title: panels.map.add('title', '#map-title'), sub: panels.map.add('sub', '#map-sub'), tabs: panels.map.add('tabs', '#map-tabs'),
    floors: panels.map.add('floors', '#map-floors'), svg: panels.map.add('svg', '#map-svg'), info: panels.map.add('info', '#map-info'), area: panels.map.add('area', '#map-area', CanvasView),
  };
  MAP.area.round = false;
  MAP.area.on('click', 'map:pin', (e) => {
    const r = MAP.area.el.getBoundingClientRect();
    return { x: (e.clientX - r.left) * MAP.area.el.width / r.width, y: (e.clientY - r.top) * MAP.area.el.height / r.height };
  });
  for (const b of MAP.tabs.el.querySelectorAll('button')) MAP.tabs.add(b.dataset.tab, b).on('click', 'map:tab', () => ({ tab: b.dataset.tab }));
  const DLG = { title: panels.dialog.add('title', '#dialog-title'), line: panels.dialog.add('line', '#dialog-line'), list: panels.dialog.add('list', '#dialog-quests') };
  const GATE = { list: panels.gate.add('list', '#gate-list') };
  const BOX = { mine: panels.box.add('mine', '#box-mine'), shared: panels.box.add('shared', '#box-shared'), count: panels.box.add('count', '#box-count') };
  const SM = {
    title: panels.smith.add('title', '#smith-title'), mats: panels.smith.add('mats', '#smith-mats'), tabs: panels.smith.add('tabs', '#smith-tabs'),
    list: panels.smith.add('list', '#smith-list'), detail: panels.smith.add('detail', '#smith-detail'),
  };
  for (const b of SM.tabs.el.querySelectorAll('button')) SM.tabs.add(b.dataset.tab, b).on('click', 'smith:tab', () => ({ tab: b.dataset.tab }));
  SM.list.link((ev) => { ev.ctx.source = 'smith'; });
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

  const glyphOf = (it) => GLYPH[it.slot === 'title' ? 'title' : it.slot === 'armor' ? (it.armor || 'medium') : it.slot === 'acc' ? 'acc' : it.kind];
  const enhTag = (it) => (it.enh ? `<span class="enh">+${it.enh}</span>` : '');
  P.itemCell = (it, { showUp = false, eq = false, sel = false } = {}) => {
    const c = RARITIES[it.rarity].color;
    const up = showUp && it.slot !== 'title' && game.itemPower(it) > game.itemPower(game.char.eq[it.slot]) ? '<span class="up">▲</span>' : '';
    const sv = it.affixes.some(([k]) => isVariant(k)) ? '<span class="svb" title="スキル変化">✧</span>' : '';
    const tr = it.affixes.some(([, t]) => t >= 6) ? ' trans' : '';
    if (eq) return `<div class="cell r${it.rarity}${tr}" style="border-color:${c};color:${c}"><span class="gi">${glyphOf(it)}</span><span>${esc(displayName(it))}${enhTag(it)}<br><small class="dim">${it.slot === 'title' ? '称号' : `iLv${it.ilvl}・重さ${itemWeight(it)}`}</small></span></div>`;
    return `<div class="cell r${it.rarity}${tr}${sel ? ' sel' : ''}" style="border-color:${c};color:${c}">${up}${sv}<span class="lv">${it.slot === 'title' ? '' : it.ilvl}</span><span class="gi">${glyphOf(it)}</span><span style="font-size:9px;max-width:58px;overflow:hidden;white-space:nowrap">${esc(displayName(it))}</span>${enhTag(it)}${it.by ? `<span class="by">${esc(it.by)}</span>` : ''}</div>`;
  };
  // 特性の1行（ティアのバッジ付き）
  const affixRow = (a) => {
    const [k, t] = a;
    const sv = isVariant(k);
    return `<div class="afx${sv ? ' sv' : ''}${t >= 6 ? ' trans' : ''}"><span class="tier" style="--tc:${tierColor(t)}">${tierLabel(t)}</span><span>${sv ? `<b>${SKILL_VARIANTS[k].icon} スキル変化「${SKILL_VARIANTS[k].name}」</b><br>${esc(SKILL_VARIANTS[k].desc(t))}` : esc(affixText(a))}</span></div>`;
  };
  // 称号の効果（説明と条件）
  const titleInfo = (it) => {
    const lines = it.title ? [TITLES[it.title].desc] : (it.fx || []).map((f) => UNIQUE_FX[f]);
    const ok = titleReqOk(it.req, game.S?.wk);
    return `<div class="ttl-fx">${lines.map((l) => `<div>✦ ${esc(l)}</div>`).join('')}</div>`
      + (it.req ? `<div class="req${ok ? '' : ' ng'}">${TITLE_REQ[it.req]}${ok ? '' : '（今の武器では効かない）'}</div>` : '')
      + (it.title ? `<div class="dim">入手：${esc(TITLES[it.title].src)}</div>` : it.from ? `<div class="dim">${esc(it.from)}を伝承化したもの</div>` : '');
  };
  // 項目のセル（Passive View）。どの項目かは data に持たせ、親へ伝わる途中で文脈として付く
  const cellSetup = (v) => {
    v.link((ev) => { ev.payload.id = v.data; });
    v.on('click', 'item:click', (e) => ({ x: e.clientX, y: e.clientY })).on('contextmenu', 'item:context').on('mouseenter', 'item:hover', (e) => ({ x: e.clientX, y: e.clientY }))
      .on('mousemove', 'item:move', (e) => ({ x: e.clientX, y: e.clientY })).on('mouseleave', 'item:leave');
    v.link((ev) => { if (ev.type === 'item:context') ev.preventDefault = true; });
  };

  const passiveLines = (kind) => [...WEAPONS[kind].passive, ...(WEAPONS[kind].melee ? [`生存本能：常に被ダメージ-${INSTINCT.dr}%`] : [])];
  P.itemTip = (it, compare) => {
    const S = game.S, char = game.char;
    const r = RARITIES[it.rarity];
    const atype = it.slot === 'armor' ? ARMOR_TYPES.find((t) => t.id === it.atype) : null;
    if (it.slot === 'title') {
      return `<div class="tn" style="color:${r.color}">${esc(it.name)}</div><div class="dim">${r.name} 称号（ステータスなし）</div>${titleInfo(it)}`
        + (it.lore ? `<div class="lore">${esc(it.lore)}</div>` : '');
    }
    const type = it.slot === 'weapon' ? WEAPONS[it.kind].name : it.slot === 'armor' ? `防具（${ARMOR_CLASSES[it.armor || 'medium'].name}${atype ? '・' + atype.name : ''}）` : '装飾品';
    let h = `<div class="tn" style="color:${r.color}">${esc(displayName(it))}${enhTag(it)}</div><div class="dim">${r.name} ${type} ・ iLv${it.ilvl} ・ 重さ ${itemWeight(it)}</div>`;    const e = enhMult(it), ev = (v) => Math.round(v * e * 10) / 10;
    h += '<div class="base">';
    if (it.atk) h += `<div>攻撃力 <b>+${ev(it.atk)}</b></div>`;
    if (it.hp) h += `<div>HP <b>+${ev(it.hp)}</b></div>`;
    if (it.def) h += `<div>被ダメ軽減 <b>+${ev(it.def)}%</b></div>`;
    h += '</div>';
    if (it.base) h += `<div class="basefx">基本効果：${AFFIXES[it.base[0]].name} +${it.base[1]}${AFFIXES[it.base[0]].unit}</div>`;
    if (it.affixes.length) h += `<div class="afxs">${it.affixes.map(affixRow).join('')}</div>`;
    if (it.fx) for (const f of it.fx) h += `<div class="fx">✦ ${UNIQUE_FX[f]}</div>`;
    if (it.slot === 'weapon') {
      const sid = it.skill && WEAPON_SKILLS[it.skill]?.kind === it.kind ? it.skill : WEAPON_SKILL_POOL[it.kind][0];
      const ws = WEAPON_SKILLS[sid];
      h += `<div class="wsk">武器スキル「${ws.name}」<br><span class="dim">${ws.desc}（CT ${ws.cd}秒）</span></div>`;
      if (WEAPONS[it.kind].guard) h += '<div class="dim">強攻撃を溜めている間はガード（離すと強攻撃）</div>';
    }
    if (it.lore) h += `<div class="lore">${esc(it.lore)}</div>`;
    if (it.by) h += `<div class="dim">入れた人：${esc(it.by)}</div>`;
    h += `<div style="color:#ffd86a">分解すると ${salvageValue(it).toLocaleString()} G</div>`;
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
    // 分解の対象（このレア度以下）: 自動分解と一括分解で共通
    const lim = char.autoSalvage ?? -1, limName = lim < 0 ? '' : RARITIES[lim].name;
    INV.auto.set({ value: lim });
    INV.autoLbl.set({ text: lim < 0 ? 'なし' : lim === 0 ? '粗悪だけ' : `${limName}以下`, style: { color: lim < 0 ? '' : RARITIES[lim].color } });
    INV.salvage.set({ text: lim < 0 ? '一括分解' : `${limName}以下を一括分解`, disabled: lim < 0 });
    if (char.inv.length) INV.grid.list(char.inv, (it) => ({ html: P.itemCell(it, { showUp: true }), data: it.id, setup: cellSetup }));
    else INV.grid.list([], () => ({})).set({ html: '<div class="dim">アイテムなし。モンスターを倒そう！</div>' });
    const st = [
      ['攻撃力', Math.round(S.atk)], ['最大HP', S.mhp], ['会心率', S.crit.toFixed(1) + '%'], ['会心ダメージ', S.critd.toFixed(0) + '%'],
      ['攻撃速度', '+' + S.aspd.toFixed(1) + '%'], ['移動速度', '+' + S.move.toFixed(1) + '%'], ['被ダメ軽減', S.def.toFixed(1) + '%'],
      ['HP吸収', S.vamp.toFixed(1) + '%'], ['スキル短縮', S.cdr.toFixed(0) + '%'],
    ];
    if (S.W.ranged) st.push(['射程', `${S.bowBase}m（最大射程 ${S.bowMax}m）`], ['弓を引く速さ', `毎秒${+S.bowDraw.toFixed(1)}m（最大まで${S.chargeMax.toFixed(2)}秒）`]);
    INV.stats.set({
      html: `<b>Lv${char.lv} ${esc(char.name)}</b> <span class="dim">${S.W.name}</span>`
        + `<div><span class="dim">所持ゴールド</span><span style="color:#ffd86a">${(char.gold || 0).toLocaleString()} G</span></div>`
        + `<div class="wrow"><span class="dim">装備重量</span><span><b style="color:${S.wc.color}">${S.weight.toFixed(1)}（${S.wc.name}）</b></span></div>`
        + `<div class="wbar"><i style="width:${clamp(S.weight / 22 * 100, 0, 100)}%;background:${S.wc.color}"></i></div>`
        + `<div><span class="dim">回避のクールタイム</span><span>${S.dodgeCd.toFixed(2)}秒</span></div>`
        + st.map(([k, v]) => `<div><span class="dim">${k}</span><span>${v}</span></div>`).join('')
        + `<div><span class="dim">強化の欠片</span><span>${char.mats.shard || 0}</span></div>`
        + (S.sv ? `<div class="dim" style="margin-top:4px">スキル変化</div><div style="color:#c8a0ff;font-size:11px">${SKILL_VARIANTS[S.sv.key].icon} ${SKILL_VARIANTS[S.sv.key].name}（${tierLabel(S.sv.t)}）</div>` : '')
        + (S.title ? `<div class="dim" style="margin-top:4px">称号</div><div style="font-size:11px;color:${S.titleOn ? '#ffe7a0' : '#888'}">${esc(S.title.name)}${S.titleOn ? '' : '（今の武器では無効）'}</div>` : '')
        + [...S.fx].filter((f) => UNIQUE_FX[f]).map((f) => `<div style="color:#ffd27a;font-size:11px">✦ ${UNIQUE_FX[f]}</div>`).join('')
        + '<div class="dim" style="margin-top:6px;font-size:10px">武器パッシブはスキルツリー（K）の武器タブ最上段に表示されます</div>',
    });
  };

  let treeTab = null;
  P.tree = () => {
    const S = game.S, char = game.char, tree = char.tree;
    if (!treeTab) treeTab = S.wk;
    TREE.sp.set({ html: `残りスキルポイント <b>${spTotal(char.lv) - spSpent(tree)}</b>` });
    const tabs = [['sword', '片手剣'], ['greatsword', '大剣'], ['axe', '大斧'], ['spear', '盾槍'], ['dagger', '短剣'], ['bow', '弓'], ['stat', 'ステータス'], ['style', 'プレイスタイル']];
    TREE.tabs.list(tabs, ([id, nm], i) => ({
      html: `<button class="${treeTab === id ? 'on' : ''} ${i === 6 ? 'gap' : ''}">${nm}<small>${id === S.wk ? '装備中・' : ''}${hasWTree(id) ? `熟練${profLevel(char, id)}` : `${treeSpent(tree, id)}pt`}</small></button>`,
      data: id, setup: (v) => v.on('click', 'tree:tab', () => ({ tab: id })),
    }));
    TREE.reset.set({ text: '振り直し' });
    if (hasWTree(treeTab)) { weaponTree(treeTab); return; }
    const T = TREES[treeTab], spent = treeSpent(tree, treeTab);
    const isWeapon = !['stat', 'style'].includes(treeTab);
    const rows = [];
    // 武器ツリーの最上段: その武器を装備しているだけで効く武器パッシブ
    if (isWeapon) rows.push({ passive: passiveLines(treeTab), on: treeTab === S.wk });
    if (isWeapon && treeTab !== S.wk) rows.push({ note: `このツリーの効果は「${T.name}」を装備しているときだけ有効です` });
    if (treeTab === 'style') rows.push({ cols: true });
    for (let tier = 0; tier < 4; tier++) rows.push({ tier, need: tier * 2, open: spent >= tier * 2, nodes: T.nodes.filter((n) => n.tier === tier) });
    TREE.body.list(rows, (row, ri) => {
      if (row.passive) {
        return {
          html: `<div class="tree-passive ${row.on ? 'on' : ''}"><div class="tp-h"><span>武器パッシブ</span><small>${row.on ? '装備中・常に有効' : '装備すると有効'}</small></div>`
            + `<div class="tp-list">${row.passive.map((t) => `<div class="tp">◇ ${esc(t)}</div>`).join('')}</div></div>`,
        };
      }
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
            const slotBtns = n.active && r > 0 ? `<div class="slotbtns">${[0, 1].map((i) => `<button data-slot="${i}" class="${char.slots?.[i] === n.active ? 'on' : ''}">${'QE'[i]}</button>`).join('')}</div>` : '';
            return {
              name: n.id, data: n.id,
              html: `<div class="node ${r ? 'have' : ''} ${canLearn(char, n.id) ? 'can' : ''} ${n.active ? 'active' : ''}">
                <div class="nn">${n.role ? `<small class="skill-role">${esc(n.role)}</small>` : ''}${n.active ? '◆ ' : ''}${esc(n.name)}</div><div class="pips">${pips}</div>
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

  // 新しい武器ツリー（熟練度でポイント。スキル・パッシブは3lvで A/B に分岐、クラス・マスターは1つずつ）
  const WT_KIND_NAME = { skill: 'スキル', passive: 'パッシブ', ks1: 'クラス', ks2: 'マスター' };
  const weaponTree = (wk) => {
    const S = game.S, char = game.char, T = WTREES[wk], st = wtOf(char, wk);
    const pl = profLevel(char, wk), own = profOf(char, wk), left = wtLeft(char, wk), spent = wtSpent(st);
    TREE.sp.set({ html: `${esc(T.name)}の残りポイント <b>${left}</b>` });
    TREE.reset.set({ text: spent ? `振り直し（${WT_RESET_COST(spent)}G）` : '振り直し' });
    const tag = (t) => `<span class="wt-tag t-${t}">${WT_TAGS[t].icon} ${WT_TAGS[t].name}</span>`;
    const xpK = own.lv >= PROF_MAX || own.lv < pl ? 1 : own.xp / profNeed(own.lv);
    const rows = [{ head: true }];
    if (wk !== S.wk) rows.push({ note: `このツリーの効果は「${T.name}」を装備しているときだけ有効です` });
    T.rows.forEach((r, ri) => rows.push({ r, ri }));
    TREE.body.list(rows, (row) => {
      if (row.head) {
        return { html: `<div class="wt-head"><div class="wt-prof">熟練度 <b>${pl}</b><small>/ ${PROF_MAX}</small></div>
          <div class="wt-bar"><i style="width:${(xpK * 100).toFixed(1)}%"></i></div>
          <div class="dim">${own.lv < pl ? `ほかの武器の最大熟練度（${char.profBest}）の半分から始まっています。` : ''}この武器を装備して敵を倒すと上がる。熟練度1つで1ポイント</div></div>` };
      }
      if (row.note) return { html: `<div class="tree-note">${esc(row.note)}</div>` };
      const { r, ri } = row, req = ROW_REQ[ri], open = pl >= req;
      const isKs = r.kind === 'ks1' || r.kind === 'ks2';
      const nodes = r.kind === 'ks2' && st.ks1 ? r.nodes.filter((n) => n.from === st.ks1) : r.nodes;
      const kindName = WT_KIND_NAME[r.kind];
      const ksName = st.ks1 ? T.rows[2].nodes.find((q) => q.id === st.ks1).name : '';
      const excl = r.kind === 'ks1' ? '<div class="wt-excl">― クラスをひとつ選ぶ ―</div>' : r.kind === 'ks2' ? `<div class="wt-excl k2">― ${st.ks1 ? `${esc(ksName)}を極める：どちらかひとつ` : '選んだクラスごとに、ふたつの道'} ―</div>` : '';
      return {
        name: 'wtrow' + ri,
        html: `<div class="wt-row ${open ? '' : 'locked'}"><div class="wt-req"><b>${req}</b><small>${kindName}${open ? '' : ' 🔒'}</small></div><div class="wt-body">${excl}<div class="wt-nodes n${nodes.length}"></div></div></div>`,
        setup: (rv) => {
          rv.add('nodes', '.wt-nodes').list(nodes, (n) => {
            const can = wtCanLearn(char, n.id);
            if (isKs) {
              const sel = st[r.kind] === n.id, other = st[r.kind] && !sel;
              return {
                name: n.id, data: n.id,
                html: `<div class="wt-node ks ${r.kind === 'ks2' ? 'k2' : ''} ${sel ? 'have' : ''} ${other ? 'other' : ''} ${can ? 'can' : ''}">
                  <div class="wt-top"><span class="wt-ic"><span>${n.icon}</span></span><b class="wt-nm">${esc(n.name)}</b><small class="wt-kind k-${r.kind}">${kindName}</small></div>
                  <div class="wt-desc">${esc(n.desc)}</div><div class="wt-tags">${n.tags.map(tag).join('')}</div></div>`,
                setup: (nv) => { nv.link((ev) => { ev.payload.node = n.id; }); nv.on('click', 'wt:learn'); },
              };
            }
            const lv = st.lv[n.id] || 0, b = lv === 3 ? st.br[n.id] : null;
            const pips = [0, 1, 2].map((k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('');
            const tags = [...new Set([...(n.tags || []), ...(b ? n[b].tags || [] : [])])];
            const brCls = (k) => (b === k ? 'chosen' : b ? 'lost' : lv === 3 ? 'pick' : '');
            const slotBtns = n.id in TREE_SKILLS && lv > 0 ? `<div class="slotbtns">${[0, 1].map((k) => `<button data-slot="${k}" class="${char.slots?.[k] === n.id ? 'on' : ''}">${'QE'[k]}</button>`).join('')}</div>` : '';
            const val = lv ? n.lv[Math.min(1, lv - 1)] : n.lv[0];
            return {
              name: n.id, data: n.id,
              html: `<div class="wt-node ${r.kind} ${lv ? 'have' : ''} ${can ? 'can' : ''}">
                <div class="wt-top"><span class="wt-ic"><span>${n.icon}</span></span><b class="wt-nm">${esc(n.name)}</b><span class="pips">${pips}</span></div>
                <div class="wt-val"><small class="wt-kind k-${r.kind}">${r.kind === 'skill' ? 'スキル・Q/Eで使う' : 'パッシブ・常に効く'}</small> ${esc(n.base)}　<b>${esc(val)}</b>${r.kind === 'skill' ? `<span class="dim">　CT ${TREE_SKILLS[n.id].cd}秒</span>` : ''}</div>
                <div class="wt-tags">${tags.map(tag).join('')}</div>
                <div class="wt-br">${['A', 'B'].map((k) => `<div class="${brCls(k)}" data-br="${k}"><b>${k}：${esc(n[k].name)}</b>${esc(n[k].desc)}</div>`).join('')}</div>${slotBtns}</div>`,
              setup: (nv) => {
                nv.link((ev) => { ev.payload.node = n.id; ev.payload.skill = n.id; });
                for (const el of nv.el.querySelectorAll('[data-br]')) {
                  if (lv === 3 && !b) nv.add('br' + el.dataset.br, el).on('click', 'wt:choose', (e) => { e.stopPropagation(); return { b: el.dataset.br }; });
                }
                for (const el of nv.el.querySelectorAll('.slotbtns button')) {
                  nv.add('slot' + el.dataset.slot, el).on('click', 'tree:slot', (e) => { e.stopPropagation(); return { slot: Number(el.dataset.slot) }; });
                }
                nv.on('click', 'wt:learn');
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

  let mapTab = 'area', mapT = 0, mapFloor = 1;
  P.map = () => {
    const world = game.world, f = world.floor, def = world.def;
    panels.map.set({ cls: { 't-area': mapTab === 'area', 't-floor': mapTab === 'floor' } });
    for (const [t, v] of MAP.tabs.children) v.set({ cls: { on: mapTab === t } });
    if (mapTab === 'area') {
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
    MAP.floors.set({ html: Array.from({ length: top }, (_, i) => `<button data-f="${i + 1}" class="${i + 1 === mapFloor ? 'on' : ''}">第${i + 1}層</button>`).join('') });
    for (const b of MAP.floors.el.querySelectorAll('button')) MAP.floors.add('f' + b.dataset.f, b).on('click', 'map:floor', () => ({ floor: +b.dataset.f }));
    renderFloor(mapFloor);
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

  P.dialog = (npc) => {
    const char = game.char;
    const qs = QUESTS.filter((q) => q.npc === npc.id).filter((q) => questState(char, q.id) || questAvailable(char, q));
    DLG.title.set({ text: npc.name });
    DLG.line.set({ text: `「${npc.line}」` });
    if (!qs.length) { DLG.list.list([], () => ({})).set({ html: '<div class="dim">今はお願いしたいことはないよ。</div>' }); return; }
    DLG.list.list(qs, (q) => {
      const s = questState(char, q.id);
      const rw = [`経験値 ${q.reward.xp}`, q.reward.rarity != null ? `${q.reward.rarity >= 4 ? '伝説の' : `特性${q.reward.rarity}つ付きの`}${q.reward.slot ? { weapon: '武器', armor: '防具', acc: '装飾品' }[q.reward.slot] : '装備'}` : '', q.reward.potion ? `ポーション所持数 +${q.reward.potion}` : '', q.reward.title ? `称号「${TITLES[q.reward.title].name}」（${TITLES[q.reward.title].desc}）` : ''].filter(Boolean).join('・');
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

  // ---- 鍛冶屋（原神の武器強化・FF14の禁断/マテリア画面ふう: 左にタブ、中央に装備一覧、右に詳細と実行ボタン） ----
  const sm = { tab: 'enh', id: null, slot: null, key: null, skill: null, msg: '', ok: null, npc: '鍛冶屋' };
  const SMITH_FILTER = {
    enh: (it) => it.slot !== 'title',
    affix: (it) => it.slot !== 'title' && it.affixes.length > 0,
    skill: (it) => it.slot === 'weapon',
    lore: (it) => it.rarity >= 6 && it.fx?.length && it.slot !== 'title',
    codex: () => false,
  };
  const smithItems = () => {
    const c = game.char;
    const worn = ['weapon', 'armor', 'acc'].map((s) => c.eq[s]).filter(Boolean);
    return [...worn, ...c.inv].filter(SMITH_FILTER[sm.tab]);
  };
  // 費用の表示（足りないものは赤）
  const costRow = (cost) => {
    const c = game.char, chips = [];
    if (cost.gold) chips.push([`◎ ${cost.gold.toLocaleString()} G`, (c.gold || 0) >= cost.gold, `所持 ${(c.gold || 0).toLocaleString()}`]);
    if (cost.shard) chips.push([`◆ 強化の欠片 ×${cost.shard}`, (c.mats.shard || 0) >= cost.shard, `所持 ${c.mats.shard || 0}`]);
    if (cost.gemKey) chips.push([`◇ ${affixName(cost.gemKey)}の宝石 ×${cost.gem}`, (c.mats.gems[cost.gemKey] || 0) >= cost.gem, `所持 ${c.mats.gems[cost.gemKey] || 0}`]);
    return `<div class="cost">${chips.map(([t, ok, have]) => `<span class="chip ${ok ? '' : 'short'}">${t}<small>${have}</small></span>`).join('')}</div>`;
  };
  const canPay = (cost) => {
    const c = game.char;
    return (c.gold || 0) >= (cost.gold || 0) && (c.mats.shard || 0) >= (cost.shard || 0) && (!cost.gemKey || (c.mats.gems[cost.gemKey] || 0) >= (cost.gem || 0));
  };
  const head = (it) => `<div class="sd-head" style="--rc:${RARITIES[it.rarity].color}"><span class="gi">${glyphOf(it)}</span><div><b>${esc(displayName(it))}${enhTag(it)}</b><small>${RARITIES[it.rarity].name}・iLv${it.ilvl}${game.char.inv.includes(it) ? '' : '・装備中'}</small></div></div>`;
  const doBtn = (label, enabled) => ({ html: `<button class="sd-do" ${enabled ? '' : 'disabled'}>${label}</button>`, setup: (v) => v.on('click', 'smith:do') });
  const msgBlock = () => (sm.msg ? [{ html: `<div class="sd-msg ${sm.ok ? 'ok' : 'ng'}">${esc(sm.msg)}</div>` }] : []);

  P.smith = () => {
    const c = game.char;
    SM.title.set({ text: sm.npc });
    SM.mats.set({ html: `<span>◎ ${(c.gold || 0).toLocaleString()} G</span><span>◆ 強化の欠片 ${c.mats.shard || 0}</span>` });
    for (const [k, v] of SM.tabs.children) v.set({ cls: { on: k === sm.tab } });
    panels.smith.set({ cls: { codex: sm.tab === 'codex' } });
    const items = smithItems();
    if (!items.some((i) => i.id === sm.id)) sm.id = items[0]?.id ?? null;
    SM.list.list(items, (it) => ({ html: P.itemCell(it, { sel: it.id === sm.id }).replace('class="cell', `class="cell${c.inv.includes(it) ? '' : ' worn'}`), data: it.id, setup: cellSetup }));
    if (!items.length && sm.tab !== 'codex') SM.list.set({ html: `<div class="dim">${{ enh: '強化できる装備がありません', affix: '特性の付いた装備がありません', skill: '武器がありません', lore: '伝説・神器の装備がありません' }[sm.tab]}</div>` });
    const it = items.find((i) => i.id === sm.id);
    const blocks = [];
    if (sm.tab === 'codex') {
      // 特性リスト: 分解で解放した特性と、付与できる最高ティア
      blocks.push({ html: '<div class="sd-h">特性リスト<small>装備を分解すると、付いていた特性とティアがここに追加されます。鍛冶屋で付けられるのは T5 まで（超越はドロップのみ）</small></div>' });
      const keys = [...Object.keys(AFFIXES), ...Object.keys(SKILL_VARIANTS)];
      blocks.push({
        html: `<div class="codex">${keys.map((k) => {
          const t = c.codex[k] || 0, gems = c.mats.gems[k] || 0, sv = isVariant(k);
          const pips = Array.from({ length: CRAFT_MAX_TIER }, (_, i) => `<i class="${i < t ? 'on' : ''}" style="--tc:${tierColor(i + 1)}"></i>`).join('');
          return `<div class="cx ${t ? '' : 'locked'} ${sv ? 'sv' : ''}"><span class="cx-n">${t ? (sv ? `${SKILL_VARIANTS[k].icon} ${SKILL_VARIANTS[k].name}` : AFFIXES[k].name) : '？？？'}</span><span class="pips">${pips}</span><span class="cx-g">◇ ${gems}</span>${sv && t ? `<small>${esc(SKILL_VARIANTS[k].desc(t))}</small>` : ''}</div>`;
        }).join('')}</div>`,
      });
    } else if (!it) {
      blocks.push({ html: '<div class="dim sd-empty">左の一覧から装備を選んでください</div>' });
    } else if (sm.tab === 'enh') {
      const e = it.enh || 0, max = e >= ENH_MAX, cost = enhCost(it), rate = ENH_RATE[e] ?? 0;
      const pips = Array.from({ length: ENH_MAX }, (_, i) => `<i class="${i < e ? 'on' : ''} ${i >= 5 ? 'hi' : ''}"></i>`).join('');
      const m0 = enhMult(it), m1 = enhMult({ enh: e + 1 });
      const stat = (label, v, unit = '') => (v ? `<div class="sd-stat"><span>${label}</span><b>${Math.round(v * m0 * 10) / 10}${unit}</b>${max ? '' : `<span class="arrow">→</span><b class="up">${Math.round(v * m1 * 10) / 10}${unit}</b>`}</div>` : '');
      blocks.push({ html: head(it) });
      blocks.push({ html: `<div class="enh-pips">${pips}<span>+${e} / +${ENH_MAX}</span></div>` });
      blocks.push({ html: `<div class="sd-stats">${stat('攻撃力', it.atk)}${stat('HP', it.hp)}${stat('被ダメ軽減', it.def, '%')}</div>` });
      if (!max) {
        blocks.push({ html: `<div class="sd-rate ${rate < 1 ? 'risk' : ''}">成功率 <b>${Math.round(rate * 100)}%</b>${rate < 1 ? '<small>失敗しても強化値は下がりません（素材とゴールドは消費）</small>' : '<small>+5 までは必ず成功します</small>'}</div>` });
        blocks.push({ html: costRow(cost) });
      }
      blocks.push(doBtn(max ? '最大まで強化済み' : `強化する（+${e} → +${e + 1}）`, !max && canPay(cost)));
    } else if (sm.tab === 'affix') {
      blocks.push({ html: head(it) });
      blocks.push({ html: '<div class="sd-h">付け替える特性<small>置き換える枠を選びます</small></div>' });
      it.affixes.forEach((a, idx) => blocks.push({
        html: `<div class="slotrow ${sm.slot === idx ? 'sel' : ''}">${affixRow(a)}</div>`,
        setup: (v) => v.on('click', 'smith:slot', () => ({ idx })),
      }));
      const keys = [...Object.keys(AFFIXES), ...(it.slot === 'weapon' ? Object.keys(SKILL_VARIANTS) : [])];
      blocks.push({ html: '<div class="sd-h">付ける特性<small>特性リストで解放したものだけ。ティアはランダム（低いほど出やすい）</small></div>' });
      blocks.push({
        html: `<div class="keys">${keys.map((k) => {
          const t = c.codex[k] || 0, gems = c.mats.gems[k] || 0;
          const dup = it.affixes.some((a, i) => i !== sm.slot && a[0] === k) || (isVariant(k) && it.affixes.some((a, i) => i !== sm.slot && isVariant(a[0])));
          const off = !t || !gems || dup;
          return `<button class="key ${sm.key === k ? 'sel' : ''} ${isVariant(k) ? 'sv' : ''}" data-k="${k}" ${off ? 'disabled' : ''}>${t ? affixName(k).replace('スキル変化', '') : '？？？'}<small>${t ? `T1〜T${t}・◇${gems}` : '未解放'}${dup ? '・重複' : ''}</small></button>`;
        }).join('')}</div>`,
        setup: (v) => { for (const b of v.el.querySelectorAll('button.key')) v.add('k_' + b.dataset.k, b).on('click', 'smith:key', () => ({ key: b.dataset.k })); },
      });
      const cur = it.affixes[sm.slot];
      if (cur && cur[1] >= 6) blocks.push({ html: `<div class="sd-warn">⚠ ${tierLabel(cur[1])} の特性が消えます（超越は鍛冶屋では付け直せません）</div>` });
      const cost = { ...affixCost(it), gemKey: sm.key };
      if (sm.key) blocks.push({ html: costRow(cost) });
      blocks.push(doBtn('特性を付け替える', sm.slot != null && !!sm.key && canPay(cost)));
    } else if (sm.tab === 'skill') {
      blocks.push({ html: head(it) });
      blocks.push({ html: '<div class="sd-h">武器スキル<small>この武器種のスキルから選べます</small></div>' });
      for (const id of WEAPON_SKILL_POOL[it.kind]) {
        const s = WEAPON_SKILLS[id], curr = it.skill === id;
        blocks.push({
          html: `<div class="skrow ${sm.skill === id ? 'sel' : ''} ${curr ? 'cur' : ''}"><b>${s.name}</b>${curr ? '<i>現在</i>' : ''}<small>${esc(s.desc)}（CT ${s.cd}秒）</small></div>`,
          setup: (v) => { if (!curr) v.on('click', 'smith:skill', () => ({ id })); },
        });
      }
      const cost = skillCost(it);
      blocks.push({ html: costRow(cost) });
      blocks.push(doBtn('スキルを変更する', !!sm.skill && canPay(cost)));
    } else if (sm.tab === 'lore') {
      const req = (it.fx || []).map((f) => FX_REQ[f]).find(Boolean);
      blocks.push({ html: head(it) });
      blocks.push({
        html: `<div class="lore-prev"><div class="lp-arrow">▼ 伝承化</div><div class="lp-t" style="color:${RARITIES[it.rarity].color}">「${esc(it.name)}」の伝承</div><div class="dim">称号（4つ目の装備枠・ステータスなし）</div>`
          + `${(it.fx || []).map((f) => `<div class="fx">✦ ${UNIQUE_FX[f]}</div>`).join('')}${req ? `<div class="req">${TITLE_REQ[req]}</div>` : ''}</div>`,
      });
      blocks.push({ html: '<div class="sd-warn">⚠ 元の装備はなくなります（ステータスと特性は失われ、固有効果だけが称号として残ります）</div>' });
      const cost = loreCost(it);
      blocks.push({ html: costRow(cost) });
      blocks.push(doBtn('伝承化する', canPay(cost)));
    }
    SM.detail.list([...blocks, ...msgBlock()], (b, i) => ({ html: `<div class="sd-b">${b.html}</div>`, name: 'b' + i, setup: b.setup }));
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
      visible: roster.length > 1, // ソロのときは出さない
      html: '<div class="dim" style="margin-bottom:6px">オンライン ' + roster.length + '人</div>' + roster.map(([id, name, lv, floor, hp, mhp, color, aname]) => `
      <div class="pm"><div class="nm"><span style="color:${esc(color)}">${esc(name)}${id === game.me.id ? ' (自分)' : ''}</span><span class="dim">Lv${lv}</span></div>
      <div class="dim" style="font-size:10px">${floor}層 ${esc(aname || '')}</div>
      <div class="bar hp"><div style="width:${clamp(hp / mhp * 100, 0, 100)}%"></div></div></div>`).join(''),
    });
  };

  let stamSeen = -9, lastGold = -1, goldPopT = 0;
  // クールタイムの影（--p: 残りの割合。丸いボタンは時計回りに減る扇形で表示）
  const setCd = (v, val, max) => {
    const p = clamp(max > 0 ? val / max * 100 : 0, 0, 100).toFixed(1) + '%';
    v.cd?.set({ style: { height: p, '--p': p } });
    v.set({ cls: { ready: val <= 0 } });
  };
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
    // 所持ゴールド: 増えたら少し弾む
    const gold = char.gold || 0;
    if (gold !== lastGold) {
      if (gold > lastGold && lastGold >= 0) { H.gold.set({ cls: { gain: true } }); clearTimeout(goldPopT); goldPopT = setTimeout(() => H.gold.set({ cls: { gain: false } }), 160); }
      lastGold = gold;
      H.goldN.set({ text: gold.toLocaleString() });
    }
    H.atkName.set({ text: HEAVY[S.wk].name });
    H.skillName.set({ text: S.ws.name });
    H.wsKey.set({ text: '右クリック' });
    H.slots.guard.set({ visible: !!S.guard, cls: { active: me.guarding } });
    setCd(H.slots.skill, me.wsCd, S.ws.cd * (1 - S.cdr / 100));
    for (let i = 0; i < 2; i++) {
      const id = char.slots?.[i], v = H.slots['t' + (i + 1)];
      const usable = id && S.actives.has(id);
      v.nm.set({ text: id ? TREE_SKILLS[id].name : '未設定' });
      v.set({ cls: { off: !usable } });
      setCd(v, usable ? (me.tcd[id] || 0) : 1, usable ? game.skillCd(id) : 1);
    }
    setCd(H.slots.dodge, me.dodgeCd, S.dodgeCd);
    H.dodgeW.set({ text: S.wc.name, style: { color: S.wc.color } });
    // 自キャラの横の輪: 回避の回復（原神のスタミナのように、減ったときだけ出る）
    const q = game.project(me.x, 1.4, me.z);
    // 盾槍でガード中・ガードゲージが減っている間は、同じ輪でガードゲージを見せる（青 → 黄 → 赤）
    const ggShow = S.guard && (me.guarding || me.gg < 100);
    const stam = ggShow ? clamp(me.gg / 100, 0, 1) : S.dodgeCd > 0 ? 1 - clamp(me.dodgeCd / S.dodgeCd, 0, 1) : 1;
    if (stam < 1 || ggShow) stamSeen = t;
    const ggCol = stam > 0.6 ? '#9ad8ff' : stam > 0.3 ? '#ffd84a' : '#ff4a3a';
    H.stamina.set({ visible: t - stamSeen < 0.6 && !me.dead, cls: { full: stam >= 1 && !ggShow, guard: ggShow }, style: { left: q.x + 44 + 'px', top: q.y - 52 + 'px' } });
    H.staminaFg.set({ attr: { 'stroke-dasharray': `${(stam * 100).toFixed(1)} 100` }, style: { stroke: ggShow ? ggCol : '' } });
    H.charge.set({ style: { left: q.x + 'px', top: q.y + 34 + 'px' } });
    setCd(H.slots.pot, me.potions > 0 ? me.potCd : 1, 1);
    const left = spTotal(char.lv) - spSpent(char.tree) + (hasWTree(S.wk) ? Math.max(0, wtLeft(char, S.wk)) : 0);
    H.spBadge.set({ text: left > 0 ? String(left) : '', visible: left > 0 });
    // 溜めゲージ
    const charging = me.charging && me.chargeT >= game.CHARGE_MIN;
    H.charge.set({ visible: charging, cls: { max: me.chargeLv === 2 } });
    if (charging) H.chargeFill.set({ style: { width: clamp((me.chargeT - game.CHARGE_MIN) / (game.CHARGE_MAX - game.CHARGE_MIN) * 100, 0, 100) + '%' } });
    // バフ
    const status = me.buffs.map((b) => `<span style="color:${hex(b.color)}">✦ ${esc(b.label)}${b.t > 1e6 ? '' : ` ${b.t.toFixed(1)}s`}</span>`);
    if (me.dStack > 0) status.push(`<span style="color:#9fe">⚡ 連撃 攻速+${me.dStack * (game.S.dStackPer || 0)}%</span>`);
    if (me.crawl) status.push('<span style="color:#ff9a8a">✚ 這いずり中（足元の円が仲間の攻撃で減り、なくなると起き上がる）</span>');
    if (me.guarding && me.counter) status.push('<span style="color:#bfe0ff">⛨ カウンター準備（離すとガードカウンター）</span>');
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
    if (me.dead) deathT.set({ text: `キャラクターデータ消失。${Math.max(0, me.deadT).toFixed(1)} 秒後に新規キャラ作成へ` });
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
  const USE_LABEL = { gate: '転移門', npc: '話す', box: 'ボックス', lever: 'レバー', chest: '宝箱', smith: '鍛冶屋' };
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
      setCd(v, usable ? (me.tcd[id] || 0) : 1, usable ? game.skillCd(id) : 1);
    }
    setCd(B.dodge, me.dodgeCd, S.dodgeCd);
    B.guard.set({ visible: !!S.guard, cls: { pressed: me.guarding } });
    B.pot.num.set({ text: String(me.potions) });
    setCd(B.pot, me.potions > 0 ? me.potCd : 1, 1);
    const it = game.nearestInteract();
    B.use.set({ visible: !!it });
    if (it) B.use.nm.set({ text: USE_LABEL[it.kind] || '調べる' });
    const left = spTotal(char.lv) - spSpent(char.tree) + (hasWTree(S.wk) ? Math.max(0, wtLeft(char, S.wk)) : 0);
    T.sp.set({ text: left > 0 ? String(left) : '' });
  };

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
    const outR = indoor ? 0 : Math.max(...Array.from({ length: 32 }, (_, i) => boundR(def, i / 32 * Math.PI * 2))) + 4;
    let sc, cx = 0, cz = 0;
    if (v.full && indoor) sc = Math.min(v.W / (g.W * CELL + 8), v.H / (g.H * CELL + 8));
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
    lootLabels();
  };

  // ---- 落とし物の名札（レア度で色分け。重なったら上へ積む。クリックで拾う） ----
  const loot = new Map();
  const lootLabels = () => {
    const live = new Set();
    const list = [];
    for (const d of game.drops) {
      if (!d.landed) continue;
      live.add(d.id);
      let v = loot.get(d.id);
      if (!v) {
        const el = document.createElement('div');
        floatLayer.el.appendChild(el);
        v = new View(el, 'loot' + d.id, floatLayer);
        const stars = transcendCount(d.it);
        v.set({ cls: { loot: true, ['r' + d.it.rarity]: true, tx: stars > 0 }, attr: { title: `${RARITIES[d.it.rarity].name}${stars ? `・超越の特性 ${stars}つ` : ''}（クリックで拾う）` } });
        v.set({ html: (stars ? `<span class="stars">${'★'.repeat(stars)}</span>` : '') + esc(d.it.name) });
        v.on('click', 'loot:pick', () => ({ id: d.id }));
        v.size = { w: el.offsetWidth, h: el.offsetHeight };
        loot.set(d.id, v);
      }
      const q = game.project(d.x, 0.3, d.z);
      if (q.vis) list.push({ v, q });
      else v.set({ style: { display: 'none' } });
    }
    for (const [id, v] of loot) if (!live.has(id)) { v.remove(); loot.delete(id); }
    // 手前（画面の下）の札から置き、重なる札はその上へずらす
    list.sort((a, b) => b.q.y - a.q.y);
    const placed = [];
    for (const { v, q } of list) {
      const { w, h } = v.size;
      const x = q.x - w / 2;
      let y = q.y - h - 4;
      for (let n = 0; n < 30; n++) {
        const hit = placed.find((p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h + 2 && y + h + 2 > p.y);
        if (!hit) break;
        y = hit.y - h - 2;
      }
      placed.push({ x, y, w, h });
      v.set({ style: { display: '', left: x + 'px', top: y + 'px' } });
    }
  };

  // ---- 通知 ----
  P.toast = (text, color = '#fff', big = false) => {
    const el = document.createElement('div');
    H.toasts.el.appendChild(el);
    const v = new View(el, 'toast', H.toasts);
    v.set({ cls: { toast: true, big }, style: { 'border-color': color, color }, text });
    setTimeout(() => v.remove(), 6000);
    while (H.toasts.el.children.length > 5) H.toasts.el.firstChild.remove();
  };
  let bannerUntil = 0, bannerPrio = 0;
  P.banner = (top, main, color, prio = 0) => {
    if (now() < bannerUntil && prio < bannerPrio) return;
    bannerUntil = now() + 4.5; bannerPrio = prio;
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
  const panelPresenter = { inv: P.inv, tree: P.tree, settings: P.settings, map: P.map, gate: P.gate, box: P.box, dialog: (d) => P.dialog(d.npc), smith: P.smith };
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
        'loot:pick'(ev) { if (this.is('play')) game.lootClick(ev.payload.id); },
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
        this.kind = info?.kind || [...L.weapons.children].find(([, v]) => v.el.classList.contains('on'))?.[0] || 'sword';
        for (const [k, v] of L.weapons.children) v.set({ cls: { on: k === this.kind } });
        L.start.set({ text: info ? `つづきから（${WEAPONS[info.kind].name}）` : `${WEAPONS[this.kind].name}で新規開始` });
      },
      exit() { login.set({ visible: false }); hud.set({ visible: true }); },
      on: {
        'login:weapon'(ev) {
          if (!WEAPONS[ev.payload.kind]) return undefined;
          this.kind = ev.payload.kind;
          for (const [k, v] of L.weapons.children) v.set({ cls: { on: k === this.kind } });
          L.start.set({ text: `${WEAPONS[this.kind].name}で新規開始` });
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
          L.start.set({ text: `${WEAPONS[this.kind].name}で新規開始` });
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
            H.mode.set({ text: ok ? '協力ハード / ONLINE' : '協力ハード / SOLO（サーバー未接続・3人基準）' });
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
        // 装備中の欄をクリックすると外す（武器以外）
        if (ev.ctx.source === 'equipped') { game.unequip(ev.payload.slot); P.hideTip(); return; }
        if (ev.ctx.source !== 'inv') return;
        if (touchSelect(this, ev)) { invActions.set({ visible: true }); return; }
        game.equip(ev.payload.id); this.sel = null; P.hideTip(); invActions.set({ visible: false });
      },
      'item:context'(ev) { if (ev.ctx.source === 'inv') { game.salvage(ev.payload.id); P.hideTip(); } },
      'inv:salvageCommon'() { game.salvageCommon(); },
      'inv:autoSalvage'(ev) { game.setAutoSalvage(ev.payload.v); },
      invAction(ev) {
        if (!this.sel) return;
        if (ev.payload.what === 'use') game.equip(this.sel); else game.salvage(this.sel);
        this.sel = null; P.hideTip(); invActions.set({ visible: false });
      },
    }),
    // 鍛冶屋: タブ → 装備 → （特性の枠・付ける特性・スキル）を選んで実行
    smith: panelState('smith', {
      'smith:tab'(ev) { sm.tab = ev.payload.tab; sm.slot = sm.key = sm.skill = null; sm.msg = ''; game.sfx('ui'); P.smith(); },
      'item:click'(ev) {
        if (ev.ctx.source !== 'smith') return;
        sm.id = ev.payload.id; sm.slot = sm.key = sm.skill = null; sm.msg = '';
        game.sfx('ui'); P.hideTip(); P.smith();
      },
      'item:context': () => undefined,
      'smith:slot'(ev) { if (sm.slot !== ev.payload.idx) sm.key = null; sm.slot = ev.payload.idx; sm.msg = ''; P.smith(); },
      'smith:key'(ev) { sm.key = ev.payload.key; sm.msg = ''; P.smith(); },
      'smith:skill'(ev) { sm.skill = ev.payload.id; sm.msg = ''; P.smith(); },
      'smith:do'() {
        let r;
        if (sm.tab === 'enh') r = game.smithEnhance(sm.id);
        if (sm.tab === 'affix') r = game.smithAffix(sm.id, sm.slot, sm.key);
        if (sm.tab === 'skill') { r = game.smithSkill(sm.id, sm.skill); if (r.ok) sm.skill = null; }
        if (sm.tab === 'lore') { r = game.smithLore(sm.id); if (r.ok) sm.id = null; }
        if (!r) return;
        sm.msg = r.msg; sm.ok = r.ok;
        P.smith();
        // 結果の演出（詳細欄が光る）
        SM.detail.set({ cls: { 'fx-ok': false, 'fx-ng': false } });
        void SM.detail.el.offsetWidth;
        SM.detail.set({ cls: { 'fx-ok': r.ok, 'fx-ng': !r.ok } });
      },
    }),
    tree: panelState('tree', {
      'tree:tab'(ev) { treeTab = ev.payload.tab; game.sfx('ui'); P.tree(); },
      'tree:learn'(ev) { game.learn(ev.payload.node); },
      'tree:slot'(ev) { game.setSlot(ev.payload.slot, ev.payload.skill); },
      'tree:reset'() { if (hasWTree(treeTab)) game.wtResetTree(treeTab); else game.resetTree(); },
      'wt:learn'(ev) { game.wtLearnNode(ev.payload.node); },
      'wt:choose'(ev) { game.wtChooseBranch(ev.payload.node, ev.payload.b); },
    }),
    settings: panelState('settings', {
      'set:change'(ev) { game.setSetting(ev.payload.key, ev.payload.value); P.settings(); },
    }),
    // マップ: 開くたびに今いる階層を表示。ワープできたら閉じる
    map: {
      ...panelState('map', {
        'map:tab'(ev) { mapTab = ev.payload.tab; game.sfx('ui'); P.map(); },
        'map:floor'(ev) { mapFloor = ev.payload.floor; game.sfx('ui'); P.map(); },
        'map:pin'(ev) { P.mapPin(ev.payload.x, ev.payload.y); },
        'map:warp'(ev) { return game.waypointWarp(ev.payload.area) ? 'play' : undefined; },
      }),
      enter() { mapFloor = game.world.floor; showPanel('map'); game.sfx('ui'); },
    },
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
    if (it.kind === 'smith') { sm.npc = it.npc.name; sm.msg = ''; return 'smith'; }
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
    frame(dt) {
      P.hud(); P.touch(); P.minimap(); P.floats(dt);
      // 開いているエリアマップは動きに合わせて描き直す（4回/秒）
      if (mediator.state === 'map' && mapTab === 'area' && (mapT += dt) > 0.25) { mapT = 0; P.mapArea(); }
    },
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

