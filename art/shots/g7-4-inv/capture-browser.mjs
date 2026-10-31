import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, openGame, startServer } from '../../../e2e/lib/harness.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const log = fs.readFileSync(path.join(dir, 'godot.log'), 'utf8');
const stateLine = log.split(/\r?\n/).find((line) => line.startsWith('INV_DEMO_STATE_JSON='));
if (!stateLine) throw new Error('Godot demo state was not found in godot.log');
const fixture = JSON.parse(stateLine.slice('INV_DEMO_STATE_JSON='.length));
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const { page, errors } = await openGame(browser, server.url, {
    kind: 'sword', viewport: { width: 1532, height: 869 }, render: true,
  });
  await page.evaluate(async (state) => {
    const character = window.__game.char();
    for (const key of Object.keys(character)) delete character[key];
    Object.assign(character, state);
    const stats = await import('/js/game/stats.js');
    stats.calcStats();
  }, fixture);
  await page.evaluate(() => window.__game.ui().open('inv'));
  await page.waitForFunction(() => !document.querySelector('#inv')?.classList.contains('hidden'));
  await page.locator('#inv-grid .cell').first().hover();
  await page.waitForFunction(() => {
    const tooltip = document.querySelector('#tooltip');
    return tooltip && !tooltip.classList.contains('hidden');
  });
  const info = await page.evaluate(() => ({
    viewport: [innerWidth, innerHeight],
    panel: (() => { const r = document.querySelector('#inv').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
    header: (() => { const r = document.querySelector('#inv .inv-head').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
    body: (() => { const r = document.querySelector('#inv .inv-body').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
    stats: (() => { const r = document.querySelector('#stats').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
    tooltip: (() => { const r = document.querySelector('#tooltip').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
    items: document.querySelectorAll('#inv-grid .cell').length,
    gridColumns: getComputedStyle(document.querySelector('#inv-grid')).gridTemplateColumns.split(' ').length,
    grid: (() => { const r = document.querySelector('#inv-grid').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
    weight: window.__game.S().weight,
    tooltipVisible: !document.querySelector('#tooltip').classList.contains('hidden'),
    character: { name: window.__game.char().name, equipment: Object.keys(window.__game.char().eq).length, items: window.__game.char().inv.length },
  }));
  await page.screenshot({ path: path.join(dir, 'browser.png') });
  const summary = JSON.stringify({ info, errors });
  fs.writeFileSync(path.join(dir, 'browser.log'), summary + '\n');
  console.log(summary);
} finally {
  await browser.close();
  server.close();
}
