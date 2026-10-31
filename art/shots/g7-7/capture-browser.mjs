import fs from 'node:fs';
import path from 'node:path';
import { loadPlaywright, openGame } from '../../../e2e/lib/harness.mjs';

const [baseUrl, outputDir] = process.argv.slice(2);
if (!baseUrl || !outputDir) throw new Error('usage: node capture-browser.mjs <base-url> <output-dir>');
fs.mkdirSync(outputDir, { recursive: true });

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const { page, errors } = await openGame(browser, baseUrl, {
    kind: 'sword', viewport: { width: 1532, height: 869 }, render: true,
  });
  const setup = async () => page.evaluate(async () => {
    const game = window.__game;
    const { AREAS } = await import('/shared/areas.js');
    const weapon = {
      id: 'g77-weapon', slot: 'weapon', kind: 'sword', rarity: 3, ilvl: 18,
      affixes: [['atkp', 3, 7], ['crit', 2, 3]], enh: 1, atk: 25, bm: 1.2,
      name: '紅蓮の細剣', skill: 'retreat', v: 3,
    };
    const armor = {
      id: 'g77-armor', slot: 'armor', armor: 'medium', atype: 'leather', rarity: 2,
      ilvl: 12, affixes: [['hpp', 2, 6]], enh: 0, hp: 14, def: 3,
      base: ['hpp', 4], bm: 1.05, name: '革の鎧', v: 3,
    };
    const c = game.char();
    c.name = 'NpcTest'; c.lv = 5; c.xp = 0; c.gold = 1234;
    c.eq = { weapon: { ...weapon, affixes: weapon.affixes.map((a) => [...a]) }, armor: null, acc: null, title: null };
    c.inv = [weapon, armor];
    c.mats = { shard: 23, gems: { atkp: 1 } };
    c.codex = { atkp: 3 };
    c.titles = {}; c.quests = {};
    const stats = await import('/js/game/stats.js');
    stats.calcStats();
    game.me.hp = game.S().mhp;
    game.me.potions = game.S().maxPot;
    game.world.unlocked = 1;
    game.net.world.box = [{ ...weapon, uid: 1, by: 'NpcTest' }];
    game.net.world.seq = Math.max(game.net.world.seq, 2);
    game.ui().open('play');
    game.ui().quests();
    return { npc: AREAS.f1_town.npcs[0], smith: AREAS.f1_town.npcs[3], box: AREAS.f1_town.box, gate: AREAS.f1_town.gate };
  });
  const points = await setup();
  const interact = async (point, selector, name) => {
    await page.evaluate(async (p) => {
      window.__game.me.x = p.x; window.__game.me.z = p.z; window.__game.me.a = 0;
      await window.__clock.step(350);
    }, point);
    await page.keyboard.press('f');
    await page.waitForFunction((sel) => {
      const el = document.querySelector(sel);
      return el && !el.classList.contains('hidden');
    }, selector);
    await page.evaluate(() => window.__clock.step(120));
    const rect = await page.evaluate((sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return [r.x, r.y, r.width, r.height];
    }, selector);
    console.log('BROWSER_LAYOUT ' + name + ' ' + JSON.stringify(rect));
    await page.screenshot({ path: path.join(outputDir, name + '.png') });
  };

  await interact(points.npc, '#dialog', 'npc');
  await page.locator('#dialog-quests button[data-act="accept"]').click();
  await page.waitForFunction(() => !!window.__game.char().quests?.q_slime);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#dialog')?.classList.contains('hidden'));
  await page.evaluate(() => window.__clock.step(200));
  const questRect = await page.locator('#nav #quests').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height];
  });
  console.log('BROWSER_LAYOUT quests ' + JSON.stringify(questRect));
  await page.screenshot({ path: path.join(outputDir, 'quests.png') });

  await interact(points.smith, '#smith', 'smith');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#smith')?.classList.contains('hidden'));

  await page.evaluate(async (p) => {
    window.__game.me.x = p.x; window.__game.me.z = p.z; window.__game.me.a = 0;
    await window.__clock.step(350);
  }, points.box);
  await page.keyboard.press('f');
  await page.waitForFunction(() => !document.querySelector('#box')?.classList.contains('hidden'));
  await page.waitForFunction(() => document.querySelector('#box-count')?.textContent?.trim() === '1 / 60');
  await page.locator('#box-mine .cell').first().click();
  await page.waitForFunction(() => document.querySelector('#box-count')?.textContent?.trim() === '2 / 60');
  await page.mouse.move(1450, 820);
  await page.evaluate(() => window.__clock.step(120));
  const boxRect = await page.locator('#box').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height];
  });
  console.log('BROWSER_LAYOUT box ' + JSON.stringify(boxRect));
  await page.screenshot({ path: path.join(outputDir, 'box.png') });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#box')?.classList.contains('hidden'));

  await interact(points.gate, '#gate-menu', 'gate');
  if (errors.length) throw new Error('browser errors: ' + JSON.stringify(errors));
  console.log('BROWSER_CAPTURE_OK npc accept quests smith box gate; errors=' + errors.length);
} finally {
  await browser.close();
}
