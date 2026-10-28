import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'file:///C:/Users/shind/AppData/Local/Programs/node22/node_modules/playwright/index.mjs';
const version = process.argv[2] || 'v5';
const out = `codex/fir-study/shots/world-${version}`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1680, height: 1080 }, deviceScaleFactor: 1 });
  page.on('requestfailed', request => errors.push(`${request.failure()?.errorText}: ${request.url()}`));
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`); });
  await page.goto(`http://127.0.0.1:8172/codex/fir-study/coast.html?version=${version}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].every(frame => frame.contentWindow.__firStudy && frame.contentWindow.__ready), null, { timeout: 180000, polling: 1000 });
  const checks = await page.evaluate(() => {
    const windows = [...document.querySelectorAll('iframe')].map(frame => frame.contentWindow);
    windows.forEach(window => { window.__pause = true; });
    const [before, after] = windows.map(window => window.__world.placed);
    const normalized = structuredClone(after);
    const row = after.assets.fir_study[0];
    if (!before.assets.fir_study) {
      delete normalized.assets.fir_study; delete normalized.counts.fir_study;
      normalized.assets.fir4_c = before.assets.fir4_c; normalized.counts.fir4_c = before.counts.fir4_c;
    }
    return {
      fir: windows.map(window => window.__firStudy), palms: windows.map(window => window.__coastStudy.placements),
      othersMatch: JSON.stringify(before) === JSON.stringify(normalized),
      remainingFirsMatch: JSON.stringify(after.assets.fir4_c) === JSON.stringify(before.assets.fir_study ? before.assets.fir4_c : before.assets.fir4_c.filter((_, index) => index !== 1)),
      targetTransformMatches: JSON.stringify(row) === JSON.stringify(windows[0].__firStudy.placement),
    };
  });
  if (checks.fir[1].replaced !== 1 || checks.palms.some(count => count !== 3) || !checks.othersMatch || !checks.remainingFirsMatch || !checks.targetTransformMatches) throw new Error(`配置が違います: ${JSON.stringify(checks)}`);
  console.log(`FIR_WORLD version=${version}; REPLACED=1; PALMS=3,3; OTHERS_MATCH=${checks.othersMatch}; REMAINING_FIRS_MATCH=${checks.remainingFirsMatch}; TARGET_MATCH=${checks.targetTransformMatches}`);
  const views = [];
  const capture = async name => {
    for (const kind of ['current', 'trial']) {
      const iframe = page.locator(`iframe[data-${kind}]`);
      await iframe.scrollIntoViewIfNeeded();
      const frame = await (await iframe.elementHandle()).contentFrame();
      await frame.evaluate(() => window.__renderOnce());
      await iframe.screenshot({ path: `${out}/${kind}-${name}.png`, timeout: 60000 });
    }
    const cameras = await page.evaluate(() => [...document.querySelectorAll('iframe')].map(frame => {
      const { camera } = frame.contentWindow.__world;
      return { position: camera.position.toArray(), rotation: camera.quaternion.toArray(), fov: camera.fov };
    }));
    if (JSON.stringify(cameras[0]) !== JSON.stringify(cameras[1])) throw new Error('カメラが違います');
    views.push(name); console.log(`CAPTURED ${name}; CAMERAS_MATCH=true`);
  };
  await capture('wide');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${out}/comparison.png`, fullPage: true, timeout: 60000 });
  await page.getByRole('button', { name: '木の近く', exact: true }).click();
  await page.waitForTimeout(200); await capture('near');
  const trial = page.locator('iframe[data-trial]');
  for (const name of ['side', 'back']) {
    await trial.scrollIntoViewIfNeeded();
    const box = await trial.boundingBox();
    const x = box.x + 60, y = box.y + box.height * .5;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 300, y, { steps: 20 }); await page.mouse.up();
    await page.waitForTimeout(150); await capture(name);
  }
  await page.getByRole('button', { name: '上から', exact: true }).click();
  await page.waitForTimeout(200); await capture('top');
  writeFileSync(`${out}/browser-log.json`, JSON.stringify({ checks, views, errors }, null, 2));
  console.log(`PAGE_ERRORS=${JSON.stringify(errors)}`);
  if (errors.length) throw new Error('描画エラーがあります');
} finally { await browser.close(); }
