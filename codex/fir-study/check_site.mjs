// ローカルの配布物だけで、単体・版切り替え・砂浜が動くか確かめる。
import { chromium } from 'file:///C:/Users/shind/AppData/Local/Programs/node22/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({ headless: true });
const errors = [];
const requests = new Set();
mkdirSync('codex/fir-study/shots/site-v5', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1680, height: 1080 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', r => errors.push(`${r.failure()?.errorText}: ${r.url()}`));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()}: ${r.url()}`); });
  page.on('request', r => { if (/^https?:/.test(r.url())) requests.add(new URL(r.url()).origin); });
  await page.goto('http://127.0.0.1:8184/', { waitUntil: 'networkidle' });
  const ready = () => page.waitForFunction(() => [...document.querySelectorAll('iframe')].every(f => f.contentWindow.__treeReady));
  await ready();
  if (await page.locator('#version').inputValue() !== 'v5') throw new Error('既定の版が違います');
  await page.screenshot({ path: 'codex/fir-study/shots/site-v5/unit.png', fullPage: true });
  for (const v of ['v1', 'v2', 'v3', 'v4', 'v5']) {
    await page.locator('#version').selectOption(v);
    await page.waitForFunction(v => document.querySelector('iframe[data-trial]').contentWindow.__treeReady && document.querySelector('iframe[data-trial]').contentWindow.__tree.model === `fir_soft_${v}`, v);
  }
  await page.getByRole('button', { name: '真上', exact: true }).click();
  await page.waitForTimeout(150);
  const trial = page.locator('iframe[data-trial]');
  await trial.screenshot({ path: 'codex/fir-study/shots/site-v5/top.png' });
  await page.getByRole('link', { name: '砂浜で見る', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].every(f => f.contentWindow.__ready && f.contentWindow.__firStudy), null, { timeout: 180000 });
  await page.evaluate(() => [...document.querySelectorAll('iframe')].forEach(f => { f.contentWindow.__pause = true; }));
  await page.getByRole('button', { name: '木の近く', exact: true }).click();
  await page.waitForTimeout(250);
  await page.evaluate(() => [...document.querySelectorAll('iframe')].forEach(f => f.contentWindow.__renderOnce()));
  await page.locator('iframe[data-trial]').scrollIntoViewIfNeeded();
  await page.locator('iframe[data-trial]').screenshot({ path: 'codex/fir-study/shots/site-v5/coast.png' });
  const world = await page.evaluate(() => [...document.querySelectorAll('iframe')].map(f => ({ fir: f.contentWindow.__firStudy, palms: f.contentWindow.__coastStudy.placements })));
  if (world[1].fir.replaced !== 1 || world.some(w => w.palms !== 3)) throw new Error('配置が違います');
  if ([...requests].some(origin => origin !== 'http://127.0.0.1:8184')) throw new Error('外部の実行依存があります');
  writeFileSync('codex/fir-study/shots/site-v5/browser-log.json', JSON.stringify({ versions: ['v1', 'v2', 'v3', 'v4', 'v5'], world, origins: [...requests], errors }, null, 2));
  console.log(`SITE_CHECK versions=5; REPLACED=1; PALMS=3,3; EXTERNAL_DEPENDENCIES=0; PAGE_ERRORS=${JSON.stringify(errors)}`);
  if (errors.length) throw new Error('描画エラーがあります');
} finally { await browser.close(); }
