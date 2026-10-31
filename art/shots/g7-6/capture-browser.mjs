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
  await page.evaluate(async () => {
    const c = window.__game.char();
    c.name = 'MapTest';
    c.waypoints = { f1_town: true, f1_field: true };
    c.areas = { f1_town: { done: true, k: 15 }, f1_field: { done: true, k: 15 } };
    c.pin = { area: 'f1_field', x: -21, z: 20 };
    c.quests = {};
    if (window.__game.world.area !== 'f1_field') window.__game.api.waypointWarp('f1_field');
    for (let i = 0; i < 60 && window.__game.world.area !== 'f1_field'; i++) await window.__clock.step(50);
    window.__game.me.x = -26.11;
    window.__game.me.z = 27.95;
    window.__game.me.a = Math.PI;
    await window.__clock.step(250);
  });
  await page.waitForFunction(() => window.__game.world.area === 'f1_field');

  for (const name of ['area', 'floor']) {
    if (name === 'area') {
      await page.evaluate(() => {
        const ui = window.__game.ui();
        ui.mapTab = 'area';
        ui.mapFloor = 1;
        ui.open('map');
      });
    } else {
      await page.locator('#map-tabs button[data-tab="floor"]').click();
    }
    await page.waitForFunction(() => !document.querySelector('#map')?.classList.contains('hidden'));
    await page.waitForTimeout(120);
    const info = await page.evaluate(() => ({
      panel: (() => { const r = document.querySelector('#map').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
      tab: document.querySelector('#map-tabs button.on')?.textContent?.trim(),
      title: document.querySelector('#map-title')?.textContent?.trim(),
      header: (() => { const r = document.querySelector('#map .inv-head').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
      tabs: (() => { const r = document.querySelector('#map-tabs').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
      areaWrap: (() => { const r = document.querySelector('#map-area-wrap').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
      canvas: (() => { const r = document.querySelector('#map-area').getBoundingClientRect(); return [r.width, r.height]; })(),
      legend: (() => { const r = document.querySelector('#map-area-wrap .map-legend').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
      svg: (() => { const r = document.querySelector('#map-svg').getBoundingClientRect(); return [r.width, r.height]; })(),
      info: (() => { const r = document.querySelector('#map-info').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
    }));
    await page.screenshot({ path: path.join(outputDir, `${name}.png`) });
    console.log(JSON.stringify({ name, info, errors }));
  }

  await page.evaluate(() => window.__game.ui().open('settings'));
  await page.waitForFunction(() => !document.querySelector('#settings')?.classList.contains('hidden'));
  await page.waitForTimeout(120);
  const info = await page.evaluate(() => ({
    panel: (() => { const r = document.querySelector('#settings').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
    header: (() => { const r = document.querySelector('#settings .inv-head').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
    groups: [...document.querySelectorAll('#settings .set-group')].map((el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }),
    rows: [...document.querySelectorAll('#settings .set-row')].map((el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }),
    footer: (() => { const r = document.querySelector('#settings > .dim').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })(),
    quality: document.querySelector('#set-quality')?.value,
    fx: document.querySelector('#set-fx')?.value,
    volumes: [...document.querySelectorAll('#settings input[type=range]')].map((el) => el.value),
  }));
  await page.screenshot({ path: path.join(outputDir, 'settings.png') });
  console.log(JSON.stringify({ name: 'settings', info, errors }));
  if (errors.length) throw new Error(`browser errors: ${JSON.stringify(errors)}`);
} finally {
  await browser.close();
}
