// 画面とセーブの記録テスト（時計と乱数を固定したブラウザ）:
//  - セーブ: 旧形式を含むセーブデータを読み込み、移行したあとのキャラデータと保存内容
//  - 画面: 装備・スキルツリー・マップ・設定の DOM の形（タグ・id・class・style・文字）
//  - 通し: 町 → フィールド → 戦闘 → 武器ツリー → スキル使用まで、コンソールエラーが出ないこと
// 期待値を作り直すときだけ GOLDEN_UPDATE=1（リファクタリング中は作り直さない）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { loadPlaywright, startServer, openGame } from './lib/harness.mjs';

const FIX = new URL('./fixtures/app.json', import.meta.url);
const OUT = process.env.GOLDEN_DUMP;
const hash = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, 24);
const KEY = 'eterna_coop_hard_char_v1';

// 旧形式のセーブ（旧ツリーのポイント・旧スキルのスロット・古い形の装備）
const item = (o) => ({ id: o.id, slot: 'weapon', kind: 'sword', rarity: 1, ilvl: 3, atk: 9, affixes: [], ...o });
const SAVES = {
  legacyTrees: {
    name: '古参', color: '#c05050', lv: 12, xp: 40, gold: 900, inv: [item({ id: 'i1', kind: 'spear', rarity: 2, affixes: [['atkp', 2]] })],
    eq: { weapon: item({ id: 'w1', name: '初心者の片手剣', skill: 'vorpal' }), armor: { id: 'a1', slot: 'armor', armor: 'medium', rarity: 1, ilvl: 2, hp: 30, def: 2, affixes: [] }, acc: null },
    tree: { sword_norm: 3, sword_heavy: 2, sword_parry_node: 1, gs_guillotine_node: 1, greatsword_norm: 2, dagger_flank_node: 1, spear_a1: 1, spear_fan_node: 1, axe_norm: 3, axe_cap: 1, bow_norm: 2, bow_a1: 1, st_str: 2 },
    slots: ['sword_parry', 'shieldbash'], quests: {},
  },
  newTrees: {
    name: '熟練', color: '#3aa0ff', lv: 20, xp: 0, gold: 50, inv: [], eq: { weapon: item({ id: 'w2', kind: 'dagger' }), armor: null, acc: null, title: null },
    tree: {}, slots: ['dk_flank', null], quests: {}, prof: { dagger: { lv: 9, xp: 5 }, sword: { lv: 3, xp: 0 } }, profBest: 9,
    wt: { dagger: { lv: { dk_flank: 3, dk_agile: 2, dk_venom: 1 }, br: { dk_flank: 'A' }, ks1: 'dk_venom', ks2: null } }, mats: { shard: 3, gems: {} }, titles: {}, codex: {},
  },
};

const NORMALIZE_DOM = () => {
  const walk = (n) => {
    if (n.nodeType === 3) { const t = n.textContent.replace(/\s+/g, ' ').trim(); return t ? t : null; }
    if (n.nodeType !== 1) return null;
    if (n.tagName === 'SCRIPT') return null;
    const kids = [...n.childNodes].map(walk).filter((x) => x !== null);
    return [n.tagName, n.id || '', n.getAttribute('class') || '', n.getAttribute('style') || '', n.tagName === 'INPUT' ? n.value : '', ...kids];
  };
  return walk(document.body);
};

test('saves, screens and the town-to-skill run match the recorded golden', { timeout: 1800_000 }, async () => {
  const { chromium } = await loadPlaywright();
  const srv = await startServer();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const result = {};
  try {
    // セーブの読み込みと移行
    for (const [name, save] of Object.entries(SAVES)) {
      const ctx = await browser.newContext();
      await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(save)]);
      const { page, errors } = await openGame(ctx, srv.url, { kind: 'bow' });
      const r = await page.evaluate((k) => ({ char: window.__game.char(), stored: localStorage.getItem(k), S: Object.fromEntries(Object.entries(window.__game.S()).filter(([, v]) => ['number', 'string', 'boolean'].includes(typeof v))) }), KEY);
      result[`save/${name}`] = { char: hash(r.char), stored: hash(r.stored), S: hash(r.S), wt: r.char.wt, slots: r.char.slots, tree: r.char.tree, errors };
      if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/save-${name}.json`, JSON.stringify(r, null, 1)); }
      await ctx.close();
    }
    // 通しと画面
    const { page, errors } = await openGame(browser, srv.url, { kind: 'sword', viewport: { width: 1280, height: 720 } });
    const dom = async (label) => {
      const d = await page.evaluate(NORMALIZE_DOM);
      result[`dom/${label}`] = { hash: hash(d), size: JSON.stringify(d).length };
      if (OUT) fs.writeFileSync(`${OUT}/dom-${label}.json`, JSON.stringify(d));
    };
    const step = (ms) => page.evaluate((ms) => window.__clock.step(ms), ms);
    await dom('town');
    for (const [btn, label] of [['#s-inv', 'inventory'], ['#s-tree', 'tree'], ['#s-map', 'map'], ['#s-set', 'settings']]) {
      await page.evaluate((sel) => document.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true })), btn);
      await step(300); await dom(label);
      await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      await step(300);
    }
    await dom('closed');
    const run = await page.evaluate(async () => {
      const G = window.__game, A = G.api, c = G.char(), C = window.__clock, D = G.dbg, me = G.me;
      const sent = []; const send = G.net.send.bind(G.net); G.net.send = (m) => { sent.push(m.t); return send(m); };
      G.net.send({ t: 'wp', to: 'f1_field' });
      for (let i = 0; i < 100 && G.world.area !== 'f1_field'; i++) await C.step(100);
      await C.step(1000);
      const mob = [...G.mobs.values()].filter((m) => m.hp > 0).sort((a, b) => a.id - b.id)[0];
      me.x = mob.x; me.z = mob.z - 2.5; A.input.setTouch(true);
      const aim = () => { if (mob.hp > 0) A.input.aim(Math.atan2(mob.x - me.x, mob.z - me.z), 0); if (me.hp < 30) me.hp = 80; };
      for (let i = 0; i < 6; i++) { D.press(true); await C.step(60, aim); D.press(false); await C.step(500, aim); }
      c.prof = { sword: { lv: 6, xp: 0 } }; c.profBest = 6;
      A.wtLearnNode('sw_aircut'); A.wtLearnNode('sw_light');
      await C.step(300, aim);
      D.tree(0); await C.step(1500, aim);
      return { area: G.world.area, sent: Object.entries(sent.reduce((a, t) => ((a[t] = (a[t] || 0) + 1), a), {})), slots: c.slots, wt: c.wt.sword, hp: me.hp, mobHp: Math.round(mob.hp), xp: c.xp, lv: c.lv };
    });
    result.run = run;
    await dom('after-run');
    result.errors = errors;
    await page.close();
  } finally { await browser.close(); srv.close(); }
  if (process.env.GOLDEN_UPDATE) { fs.writeFileSync(FIX, JSON.stringify(result, null, 1)); return; }
  assert.deepEqual(result.errors, [], 'no console errors on the town-to-skill run');
  const golden = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  for (const [k, v] of Object.entries(golden)) assert.deepEqual(result[k], v, k);
});
