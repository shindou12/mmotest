import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'file:///C:/Users/shind/AppData/Local/Programs/node22/node_modules/playwright/index.mjs';
const version = process.argv[2] || 'v5';
const out = `codex/fir-study/shots/${version}`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1680, height: 1080 }, deviceScaleFactor: 1 });
  page.on('requestfailed', request => errors.push(`${request.failure()?.errorText}: ${request.url()}`));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
  await page.goto(`http://127.0.0.1:8172/codex/fir-study/?version=${version}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].every(frame => frame.contentWindow.__treeReady));
  const models = await page.evaluate(() => [...document.querySelectorAll('iframe')].map(frame => {
    frame.contentWindow.__treeFreeze = true;
    const { model, triangles } = frame.contentWindow.__tree;
    return { model, triangles };
  }));
  const trial = page.locator('iframe[data-trial]');
  const capture = async name => {
    await page.evaluate(() => [...document.querySelectorAll('iframe')].forEach(frame => frame.contentWindow.__treeRender()));
    await trial.screenshot({ path: `${out}/${name}.png` });
  };
  await capture('front');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${out}/comparison.png`, fullPage: true });
  const drag = async () => {
    await trial.scrollIntoViewIfNeeded();
    const box = await trial.boundingBox();
    const x = box.x + 60, y = box.y + box.height * .5;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 300, y, { steps: 20 }); await page.mouse.up();
    await page.waitForTimeout(150);
  };
  await drag(); await capture('right');
  await drag(); await capture('back');
  await drag(); await capture('left');
  await page.getByRole('button', { name: '真上', exact: true }).click();
  await page.waitForTimeout(150); await capture('top');
  await page.getByRole('button', { name: '横', exact: true }).click();
  await page.waitForTimeout(150); await capture('low');
  writeFileSync(`${out}/browser-log.json`, JSON.stringify({ models, errors }, null, 2));
  console.log(`FIR_CAPTURE version=${version}; views=6; models=${JSON.stringify(models)}`);
  console.log(`PAGE_ERRORS=${JSON.stringify(errors)}`);
  if (errors.length) throw new Error('描画エラーがあります');
} finally { await browser.close(); }
