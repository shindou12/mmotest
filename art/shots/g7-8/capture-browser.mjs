import fs from 'node:fs';
import path from 'node:path';
import { loadPlaywright } from '../../../e2e/lib/harness.mjs';

const [baseUrl, outputDir] = process.argv.slice(2);
if (!baseUrl || !outputDir) throw new Error('usage: node capture-browser.mjs <base-url> <output-dir>');
fs.mkdirSync(outputDir, { recursive: true });

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const createPage = async () => {
  const context = await browser.newContext({ viewport: { width: 1532, height: 869 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push('PAGE ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CON ' + m.text()); });
  return { context, page };
};
const screenshot = async (page, name) => {
  await page.screenshot({ path: path.join(outputDir, name + '.png') });
  console.log(`BROWSER_SHOT ${name} 1532x869`);
};
const login = async (page, query = '?low') => {
  await page.goto(baseUrl + '/' + query, { waitUntil: 'domcontentloaded' });
  await page.locator('#lstart').waitFor({ state: 'visible', timeout: 60000 });
};
const prepareLogin = async (page, query) => {
  await login(page, query);
  await page.locator('#lcolor').evaluate((el) => {
    el.value = '#3aa0ff';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.locator('#lweapon [data-k="greatsword"]').click();
};
const start = async (page) => {
  await page.locator('#lstart').click();
  await page.waitForFunction(() => !document.querySelector('#hud')?.classList.contains('hidden'), null, { timeout: 60000 });
};

try {
  const fresh = await createPage();
  await prepareLogin(fresh.page, '?low');
  await screenshot(fresh.page, 'login');

  await fresh.page.evaluate(() => {
    const weapon = {
      id: 'g78-login', slot: 'weapon', kind: 'greatsword', rarity: 1, ilvl: 1, bm: 1.2,
      affixes: [], enh: 0, v: 3, weight: 4, atk: 6, name: '初心者の大剣', skill: 'gt_wave',
    };
    const character = {
      name: 'G7-8', color: '#3aa0ff', lv: 5, xp: 0, gold: 1234, inv: [],
      eq: { weapon, armor: null, acc: null, title: null }, tree: {}, slots: [null, null], quests: {},
      mats: { shard: 0, gems: {} }, codex: {}, titles: {}, areas: {}, waypoints: {}, explored: {},
      chests: {}, pin: null, potBonus: 0, autoSalvage: false, prof: {}, profBest: 0, wt: {},
    };
    localStorage.setItem('eterna_coop_hard_char_v1', JSON.stringify(character));
  });
  await fresh.page.reload({ waitUntil: 'domcontentloaded' });
  await fresh.page.locator('#lexisting').waitFor({ state: 'visible' });
  await screenshot(fresh.page, 'login-existing');
  console.log('BROWSER_LOGIN_EXISTING ' + (await fresh.page.locator('#lexisting').innerText()));
  await fresh.context.close();

  const chat = await createPage();
  await prepareLogin(chat.page, `?low&server=${encodeURIComponent('ws://127.0.0.1:8080/ws')}`);
  await start(chat.page);
  await chat.page.waitForFunction(() => document.querySelector('#chat-log')?.textContent.includes('サーバーに接続しました'), null, { timeout: 30000 });
  const chatInput = chat.page.locator('#chat-in');
  await chat.page.keyboard.press('Enter');
  await chatInput.fill('G7-8 chat preview');
  await chatInput.press('Enter');
  await chat.page.waitForFunction(() => document.querySelector('#chat-log')?.textContent.includes('G7-8 chat preview'), null, { timeout: 30000 });
  await chatInput.focus();
  await screenshot(chat.page, 'chat');
  await chatInput.evaluate((el) => el.blur());
  await chat.page.evaluate(() => {
    window.__game.me.dead = true;
    window.__game.me.deathAt = performance.now() / 1000 + 12.3;
  });
  await chat.page.waitForTimeout(80);
  await screenshot(chat.page, 'death');
  await chat.context.close();

  const debug = await createPage();
  await prepareLogin(debug.page, '?low&debug');
  await start(debug.page);
  await debug.page.keyboard.press('F2');
  await debug.page.waitForFunction(() => document.querySelector('#dbg') && !document.querySelector('#dbg').classList.contains('hidden'));
  await screenshot(debug.page, 'debug');
  await debug.context.close();

  if (errors.length) throw new Error('browser errors: ' + JSON.stringify(errors));
  console.log('BROWSER_CAPTURE_OK login, login-existing, chat roundtrip, debug F2, death; errors=0');
} finally {
  await browser.close();
}
