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
import { WEAPONS } from '../../shared/data.js';
import { hasWTree } from '../weapon-tree.js';
import { View, Root, Mediator } from './core.js';
import { now, PANELS, CanvasView } from './helpers.js';
import { installItems } from './panels/items.js';
import { installInventory } from './panels/inventory.js';
import { installTree } from './panels/tree.js';
import { installSettings } from './panels/settings.js';
import { installMap } from './panels/map.js';
import { installNpc } from './panels/npc.js';
import { installSmith } from './panels/smith.js';
import { installHud } from './panels/hud.js';
import { installTouch } from './panels/touch.js';
import { installMinimap } from './panels/minimap.js';
import { installFloats } from './panels/floats.js';
import { installMessages } from './panels/messages.js';

export function createUI(game) {
  const ui = { game };
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
  ui.boxItems = []; ui.boxMax = 60;


  // 画面ごとの Presenter（ui/panels/*.js）に渡す部品
  Object.assign(ui, { mediator, root, panels, floatLayer, tooltip, death, vignette, H, INV, TREE, SET, MAP, DLG, GATE, BOX, SM, deathT, T, P });
  // 画面ごとの Presenter（ui/panels/*.js）を P に足す
  installItems(ui);
  installInventory(ui);
  installTree(ui);
  installSettings(ui);
  installMap(ui);
  installNpc(ui);
  installSmith(ui);
  installHud(ui);
  installTouch(ui);
  installMinimap(ui);
  installFloats(ui);
  installMessages(ui);
  const { STICK_R, sm, tc } = ui;

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
    const it = ev.ctx.source === 'box' ? ui.boxItems.find((i) => i.uid === ev.payload.id) : game.findItem(ev.payload.id);
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
      'tree:tab'(ev) { ui.treeTab = ev.payload.tab; game.sfx('ui'); P.tree(); },
      'tree:learn'(ev) { game.learn(ev.payload.node); },
      'tree:slot'(ev) { game.setSlot(ev.payload.slot, ev.payload.skill); },
      'tree:reset'() { if (hasWTree(ui.treeTab)) game.wtResetTree(ui.treeTab); else game.resetTree(); },
      'wt:learn'(ev) { game.wtLearnNode(ev.payload.node); },
      'wt:choose'(ev) { game.wtChooseBranch(ev.payload.node, ev.payload.b); },
    }),
    settings: panelState('settings', {
      'set:change'(ev) { game.setSetting(ev.payload.key, ev.payload.value); P.settings(); },
    }),
    // マップ: 開くたびに今いる階層を表示。ワープできたら閉じる
    map: {
      ...panelState('map', {
        'map:tab'(ev) { ui.mapTab = ev.payload.tab; game.sfx('ui'); P.map(); },
        'map:floor'(ev) { ui.mapFloor = ev.payload.floor; game.sfx('ui'); P.map(); },
        'map:pin'(ev) { P.mapPin(ev.payload.x, ev.payload.y); },
        'map:warp'(ev) { return game.waypointWarp(ev.payload.area) ? 'play' : undefined; },
      }),
      enter() { ui.mapFloor = game.world.floor; showPanel('map'); game.sfx('ui'); },
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
      if (mediator.state === 'map' && ui.mapTab === 'area' && (ui.mapT += dt) > 0.25) { ui.mapT = 0; P.mapArea(); }
    },
    // データが変わったので、開いているパネルとクエスト表示を描き直す
    refresh() {
      if (mediator.is(...PANELS)) panelPresenter[mediator.state](mediator.data);
      if (!mediator.is('login')) P.quests();
    },
    open(state, data) { mediator.go(state, data); },
    close() { if (!mediator.is('login', 'play')) mediator.go('play'); },
    boxItems(items, max) { ui.boxItems = items; ui.boxMax = max || ui.boxMax; if (mediator.is('box')) P.box(); },
    toast: P.toast, banner: P.banner, chat: P.chat, floatText: P.floatText, hurt: P.hurt, party: P.party, quests: P.quests,
  };
}
