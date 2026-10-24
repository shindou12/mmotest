import fs from 'node:fs';
import path from 'node:path';
import { loadPlaywright, openGame, startServer } from '../../../e2e/lib/harness.mjs';

const [logPath, mode, outputPath] = process.argv.slice(2);
if (!logPath || !mode || !outputPath) {
  throw new Error('usage: node capture-browser.mjs <godot-log> <tree|inventory> <output.png>');
}
const prefix = mode === 'inventory' ? 'INV_DEMO_STATE_JSON=' : 'TREE_DEMO_STATE_JSON=';
const bytes = fs.readFileSync(logPath);
const log = bytes[0] === 0xff && bytes[1] === 0xfe
  ? bytes.subarray(2).toString('utf16le')
  : bytes.toString('utf8');
const stateLine = log.split(/\r?\n/).find((line) => line.startsWith(prefix));
if (!stateLine) throw new Error(`${prefix} was not found in ${logPath}`);
const fixture = JSON.parse(stateLine.slice(prefix.length));
const kind = fixture.eq?.weapon?.kind || 'sword';
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const { page, errors } = await openGame(browser, server.url, {
    kind, viewport: { width: 1532, height: 869 }, render: true,
  });
  await page.evaluate(async ({ state, selectedMode }) => {
    const character = window.__game.char();
    for (const key of Object.keys(character)) delete character[key];
    Object.assign(character, state);
    const stats = await import('/js/game/stats.js');
    stats.calcStats();
    window.__game.ui().open(selectedMode === 'inventory' ? 'inv' : 'tree');
  }, { state: fixture, selectedMode: mode });
  if (mode === 'tree') {
    await page.waitForFunction(() => !document.querySelector('#tree')?.classList.contains('hidden'));
    await page.waitForTimeout(150);
    const info = await page.evaluate(() => ({
      viewport: [innerWidth, innerHeight],
      tab: document.querySelector('#tree-tabs button.on')?.textContent?.trim(),
      tabs: [...document.querySelectorAll('#tree-tabs button')].map((button) => button.textContent.trim().replace(/\s+/g, ' ')),
      nodes: document.querySelectorAll('#tree-body .wt-node').length,
      learned: [...document.querySelectorAll('#tree-body .wt-node.have .wt-nm')].map((label) => label.textContent.trim()),
      slots: window.__game.char().slots,
      panel: (() => { const r = document.querySelector('#tree').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
      tabsRect: (() => { const r = document.querySelector('#tree-tabs').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
      bodyRect: (() => { const r = document.querySelector('#tree-body').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
      toastsVisible: getComputedStyle(document.querySelector('#toasts')).display !== 'none',
    }));
    await page.screenshot({ path: outputPath });
    console.log(JSON.stringify({ mode, info, errors }));
  } else {
    await page.waitForFunction(() => !document.querySelector('#inv')?.classList.contains('hidden'));
    await page.locator('#inv-grid .cell').first().hover();
    await page.waitForFunction(() => {
      const tooltip = document.querySelector('#tooltip');
      return tooltip && !tooltip.classList.contains('hidden');
    });
    const info = await page.evaluate(() => ({
      viewport: [innerWidth, innerHeight],
      tooltipVisible: !document.querySelector('#tooltip').classList.contains('hidden'),
      tierBadges: [...document.querySelectorAll('#tooltip .tier')].map((badge) => {
        const r = badge.getBoundingClientRect();
        return { text: badge.textContent.trim(), height: r.height };
      }),
      panelZ: getComputedStyle(document.querySelector('#inv')).zIndex,
      tooltipZ: getComputedStyle(document.querySelector('#tooltip')).zIndex,
      connectionTextVisible: [...document.querySelectorAll('#toasts .toast')].some((toast) => toast.textContent.includes('接続中:') && toast.getBoundingClientRect().height > 0),
    }));
    await page.screenshot({ path: outputPath });
    console.log(JSON.stringify({ mode, info, errors }));
  }
} finally {
  await browser.close();
  server.close();
}
