import { chromium } from 'file:///C:/Users/shind/AppData/Local/Programs/node22/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ headless: true });
const prefix = process.argv[2] || 'soft-top-v4';
try {
  const page = await browser.newPage({ viewport: { width: 1680, height: 1020 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('http://127.0.0.1:8172/codex/palm-model-study/', { waitUntil: 'networkidle' });
  const candidateCanvas = page.frameLocator('iframe[data-candidate]').locator('canvas');
  await candidateCanvas.waitFor();
  await page.waitForTimeout(700);
  const canvasBox = await candidateCanvas.boundingBox();
  if (!canvasBox) throw new Error('試作 canvas が見つかりません');
  const startX = canvasBox.x + 70;
  const y = canvasBox.y + canvasBox.height * 0.52;
  const dragRight = async () => {
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(startX + 300, y, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  };
  await page.screenshot({ path: `codex/palm-model-study/shots/${prefix}-00-front-1680.png` });
  await dragRight();
  await page.screenshot({ path: `codex/palm-model-study/shots/${prefix}-01-side-1680.png` });
  await dragRight();
  await page.screenshot({ path: `codex/palm-model-study/shots/${prefix}-02-back-1680.png` });
  await dragRight();
  await page.screenshot({ path: `codex/palm-model-study/shots/${prefix}-03-opposite-side-1680.png` });
  for (const [label, name] of [['overhead', '真上'], ['side', '横']]) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `codex/palm-model-study/shots/${prefix}-${label}-1680.png` });
  }
  console.log(`TITLE=${await page.title()}`);
  console.log(`ROTATION_DRAGS=3; PIXELS_PER_DRAG=300; CANVAS=${Math.round(canvasBox.width)}x${Math.round(canvasBox.height)}`);
  console.log(`PAGE_ERRORS=${JSON.stringify(errors)}`);
} finally {
  await browser.close();
}
