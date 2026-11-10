// three.js の箱庭を一枚撮り、光とぼけを二段変えた画素差も測る。
//   node tools/diorama/shot_view.mjs <URL> <out.png> [幅] [高さ]
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { inflateSync } from 'node:zlib';

const execFileAsync = promisify(execFile);
let pw = null;
try { pw = await (await import('../../e2e/lib/harness.mjs')).loadPlaywright(); } catch { /* Chrome の単体撮影へ進む */ }
const [url, out, width = 1280, height = 720] = process.argv.slice(2);
if (!url || !out) throw new Error('使い方: node tools/diorama/shot_view.mjs <URL> <out.png> [幅] [高さ]');
mkdirSync(dirname(out), { recursive: true });

function decodePng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const dataChunks = [];
  while (offset < buffer.length) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + size);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') dataChunks.push(data);
    offset += size + 12;
    if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) throw new Error(`未対応 PNG: bitDepth=${bitDepth} colorType=${colorType}`);
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const packed = inflateSync(Buffer.concat(dataChunks));
  const pixels = Buffer.alloc(height * stride);
  let input = 0;
  for (let y = 0; y < height; y++) {
    const filter = packed[input++];
    const row = y * stride;
    const above = row - stride;
    for (let x = 0; x < stride; x++) {
      const raw = packed[input++];
      const left = x >= channels ? pixels[row + x - channels] : 0;
      const up = y > 0 ? pixels[above + x] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[above + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upperLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft;
      } else if (filter !== 0) throw new Error(`未対応 PNG filter: ${filter}`);
      pixels[row + x] = (raw + predictor) & 255;
    }
  }
  return { width, height, channels, pixels };
}

function pixelDelta(leftBuffer, rightBuffer) {
  const left = decodePng(leftBuffer);
  const right = decodePng(rightBuffer);
  if (left.width !== right.width || left.height !== right.height) throw new Error('画素差の画像サイズが一致しません');
  let sum = 0;
  let changed = 0;
  const pixels = left.width * left.height;
  for (let pixel = 0; pixel < pixels; pixel++) {
    let maximum = 0;
    for (let channel = 0; channel < 3; channel++) {
      const difference = Math.abs(left.pixels[pixel * left.channels + channel] - right.pixels[pixel * right.channels + channel]);
      sum += difference;
      maximum = Math.max(maximum, difference);
    }
    if (maximum >= 2) changed++;
  }
  return { mean: sum / (pixels * 3), percent: changed / pixels * 100 };
}

const launchArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']].filter(Boolean);
const chromeExecutable = [process.env.CHROME_PATH, ...roots.map((root) => join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'))]
  .filter(Boolean).find((candidate) => existsSync(candidate));
const started = Date.now();

async function takeWithPlaywright() {
  let browser;
  if (chromeExecutable) browser = await pw.chromium.launch({ executablePath: chromeExecutable, headless: false });
  else browser = await pw.chromium.launch({ args: launchArgs });
  const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 500)); });
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000, polling: 1000 });
    await page.evaluate(() => { window.__pause = true; });
    await page.waitForTimeout(350);
    const baseFx = await page.evaluate(() => window.__fx);
    await page.evaluate(() => window.__renderOnce());
    const baseline = await page.screenshot({ path: out, timeout: 600000 });
    const info = await page.evaluate(() => window.__info);
    const bloomLow = Math.max(0, Number(baseFx.bloom) - 0.22);
    const bloomHigh = Math.min(1, Number(baseFx.bloom) + 0.22);
    const blurLow = 0.18;
    const blurHigh = 0.72;
    const variants = {};
    for (const [name, settings] of [
      ['bloomLow', { bloom: bloomLow, blur: baseFx.blur }],
      ['bloomHigh', { bloom: bloomHigh, blur: baseFx.blur }],
      ['blurLow', { bloom: baseFx.bloom, blur: blurLow }],
      ['blurHigh', { bloom: baseFx.bloom, blur: blurHigh }],
    ]) {
      await page.evaluate((fx) => window.__setFx(fx), settings);
      await page.evaluate(() => window.__renderOnce());
      variants[name] = pixelDelta(baseline, await page.screenshot({ type: 'png', timeout: 600000 }));
    }
    return { errors, info, variants, bloomLow, bloomHigh, blurLow, blurHigh };
  } finally {
    await browser.close();
  }
}

function withFxQuery(bloom, blur, renderScale = 1) {
  const parsed = new URL(url);
  parsed.searchParams.set('pause', '1');
  parsed.searchParams.set('bloom', String(bloom));
  parsed.searchParams.set('blur', String(blur));
  parsed.searchParams.set('rscale', String(renderScale));
  parsed.searchParams.set('shadowRes', '1024');
  return parsed.toString();
}

function chromeArgs(targetUrl, screenshotPath, dumpDom, profile) {
  const args = [
    '--headless=new', '--hide-scrollbars', '--force-device-scale-factor=1', '--enable-logging=stderr', '--log-level=0',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--window-size=${Number(width)},${Number(height)}`, '--virtual-time-budget=9000',
    `--user-data-dir=${profile}`, `--screenshot=${screenshotPath}`,
  ];
  if (dumpDom) args.push('--dump-dom');
  args.push(targetUrl);
  return args;
}

async function takeWithChrome() {
  if (!chromeExecutable) throw new Error('Playwright と Chrome が見つかりません');
  const tempRoot = mkdtempSync(join(tmpdir(), 'diorama-shot-'));
  const profile = join(tempRoot, 'profile');
  const errors = [];
  const variants = {};
  let info = { calls: 0, triangles: 0 };
  const baseFx = { bloom: 0.35, blur: 0.4 };
  const bloomLow = Math.max(0, baseFx.bloom - 0.22);
  const bloomHigh = Math.min(1, baseFx.bloom + 0.22);
  const blurLow = 0.18;
  const blurHigh = 0.72;
  try {
    const run = async (targetUrl, screenshotPath) => {
      const result = await execFileAsync(chromeExecutable, chromeArgs(targetUrl, screenshotPath, true, profile), {
        timeout: 600000, maxBuffer: 32 * 1024 * 1024, windowsHide: true,
      });
      if (statSync(screenshotPath).size < 1000) throw new Error('撮影画像が小さすぎます');
      if (/CONSOLE ERROR|Uncaught \(in promise\)|WebGL: INVALID/i.test(result.stderr)) errors.push(result.stderr.slice(-800));
      if (!result.stdout.includes('data-diorama-ready="true"') || !result.stdout.includes('data-diorama-errors="0"')) {
        throw new Error('ページの準備または JavaScript エラーの確認に失敗しました');
      }
      const calls = result.stdout.match(/data-diorama-calls="(\d+)"/);
      const triangles = result.stdout.match(/data-diorama-triangles="(\d+)"/);
      if (calls) info.calls = Number(calls[1]);
      if (triangles) info.triangles = Number(triangles[1]);
      return readFileSync(screenshotPath);
    };
    const baseline = await run(withFxQuery(baseFx.bloom, baseFx.blur, 0.75), out);
    for (const [name, bloom, blur] of [
      ['bloomLow', bloomLow, baseFx.blur], ['bloomHigh', bloomHigh, baseFx.blur],
      ['blurLow', baseFx.bloom, blurLow], ['blurHigh', baseFx.bloom, blurHigh],
    ]) {
      const imagePath = join(tempRoot, `${name}.png`);
      const image = await run(withFxQuery(bloom, blur, 0.75), imagePath);
      variants[name] = pixelDelta(baseline, image);
    }
    return { errors, info, variants, bloomLow, bloomHigh, blurLow, blurHigh };
  } finally {
    const tempBase = resolve(tmpdir()) + sep;
    const tempTarget = resolve(tempRoot);
    if (tempTarget.startsWith(tempBase)) rmSync(tempTarget, { recursive: true, force: true });
  }
}

const result = pw ? await takeWithPlaywright() : await takeWithChrome();
const seconds = ((Date.now() - started) / 1000).toFixed(1);
const errorText = result.errors.length ? result.errors.join(' | ') : 'no errors';
console.log(`${out} ${seconds}s calls=${result.info?.calls} tris=${result.info?.triangles} ${errorText}`);
console.log(`bloom ${result.bloomLow.toFixed(2)} Δmean=${result.variants.bloomLow.mean.toFixed(3)} changed=${result.variants.bloomLow.percent.toFixed(2)}% | ${result.bloomHigh.toFixed(2)} Δmean=${result.variants.bloomHigh.mean.toFixed(3)} changed=${result.variants.bloomHigh.percent.toFixed(2)}%`);
console.log(`blur ${result.blurLow.toFixed(2)} Δmean=${result.variants.blurLow.mean.toFixed(3)} changed=${result.variants.blurLow.percent.toFixed(2)}% | ${result.blurHigh.toFixed(2)} Δmean=${result.variants.blurHigh.mean.toFixed(3)} changed=${result.variants.blurHigh.percent.toFixed(2)}%`);
if (result.errors.length || Object.values(result.variants).some((delta) => delta.mean <= 0 || delta.percent <= 0)) process.exitCode = 1;
