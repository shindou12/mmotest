import { chromium } from 'file:///C:/Users/shind/AppData/Local/Programs/node22/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1680, height: 1020 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('http://127.0.0.1:8172/codex/palm-model-study/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'codex/palm-model-study/shots/liked-frond-compare-1680.png' });
  console.log(`TITLE=${await page.title()}`);
  console.log(`FRAMES=${await page.locator('iframe').count()}`);
  console.log(`PAGE_ERRORS=${JSON.stringify(errors)}`);
} finally {
  await browser.close();
}
