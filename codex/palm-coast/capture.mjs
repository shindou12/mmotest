import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'file:///C:/Users/shind/AppData/Local/Programs/node22/node_modules/playwright/index.mjs';

const out = 'codex/palm-coast/shots/three-palms';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1680, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
  await page.goto('http://127.0.0.1:8172/codex/palm-coast/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].every(frame => frame.contentWindow.__coastReady && frame.contentWindow.__ready), null, { timeout: 180000, polling: 1000 });
  const reports = await page.evaluate(() => [...document.querySelectorAll('iframe')].map(frame => {
    frame.contentWindow.__pause = true;
    return frame.contentWindow.__coastStudy;
  }));
  if (reports[0].replaced !== 9 || reports[1].replaced !== 3 || reports[1].placements !== 3) throw new Error(`ヤシの置換数が違います: ${JSON.stringify(reports)}`);
  const placementChecks = await page.evaluate(() => {
    const [before, after] = [...document.querySelectorAll('iframe')].map(frame => frame.contentWindow.__world.placed);
    const palms = new Set(['palm2_a', 'palm2_b']);
    const withoutPalms = placement => ({ ...placement,
      assets: Object.fromEntries(Object.entries(placement.assets).filter(([name]) => !palms.has(name))),
      counts: Object.fromEntries(Object.entries(placement.counts).filter(([name]) => !palms.has(name))),
    });
    return {
      nonPalmsMatch: JSON.stringify(withoutPalms(before)) === JSON.stringify(withoutPalms(after)),
      retainedTransformsMatch: [...palms].every(name => after.assets[name].every(item => before.assets[name].some(original => JSON.stringify(original) === JSON.stringify(item)))),
    };
  });
  if (!placementChecks.nonPalmsMatch || !placementChecks.retainedTransformsMatch) throw new Error('意図しない配置変更があります');
  console.log(`PALMS current=${reports[0].replaced}; trial=${reports[1].replaced}; NON_PALMS_MATCH=${placementChecks.nonPalmsMatch}; RETAINED_TRANSFORMS_MATCH=${placementChecks.retainedTransformsMatch}`);
  const views = [];
  const capture = async name => {
    for (const selector of ['iframe[data-current]', 'iframe[data-trial]']) {
      const frameElement = page.locator(selector);
      await frameElement.scrollIntoViewIfNeeded();
      const frame = await (await frameElement.elementHandle()).contentFrame();
      await frame.evaluate(() => window.__renderOnce());
      await frameElement.screenshot({ path: `${out}/${selector.includes('current') ? 'current' : 'trial'}-${name}.png`, timeout: 60000 });
    }
    const cameras = await page.evaluate(() => [...document.querySelectorAll('iframe')].map(frame => {
      const { camera } = frame.contentWindow.__world;
      return { position: camera.position.toArray(), rotation: camera.quaternion.toArray(), fov: camera.fov };
    }));
    if (JSON.stringify(cameras[0]) !== JSON.stringify(cameras[1])) throw new Error(`カメラが一致しません: ${name}`);
    views.push({ name, camera: cameras[0] });
    console.log(`CAPTURED ${name}; CAMERAS_MATCH=true`);
  };
  await capture('wide');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${out}/comparison-wide.png`, fullPage: true, timeout: 60000 });
  await page.getByRole('button', { name: '木の近く', exact: true }).click();
  await page.waitForTimeout(200);
  await capture('near');
  const drag = async () => {
    const trial = page.locator('iframe[data-trial]');
    await trial.scrollIntoViewIfNeeded();
    const box = await trial.boundingBox();
    const x = box.x + 80, y = box.y + box.height * .5;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 300, y, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(200);
  };
  await drag();
  await capture('side');
  await drag();
  await capture('back');
  await page.getByRole('button', { name: '上から', exact: true }).click();
  await page.waitForTimeout(200);
  await capture('top');
  writeFileSync(`${out}/browser-log.json`, JSON.stringify({ reports, placementChecks, views, errors }, null, 2));
  console.log(`PAGE_ERRORS=${JSON.stringify(errors)}`);
  if (errors.length) throw new Error('描画エラーがあります');
} finally {
  await browser.close();
}
