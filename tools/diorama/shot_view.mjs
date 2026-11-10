// three.js の箱庭を一枚撮り、光とぼけを二段変えた画素差も測る。
//   node tools/diorama/shot_view.mjs <URL> <out.png> [幅] [高さ] [--sfx] [--memory]
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { inflateSync } from 'node:zlib';

const execFileAsync = promisify(execFile);
let pw = null;
try { pw = await (await import('../../e2e/lib/harness.mjs')).loadPlaywright(); } catch { /* Chrome の単体撮影へ進む */ }
const cliArgs = process.argv.slice(2);
const probeSfx = cliArgs.includes('--sfx');
const probeMemory = cliArgs.includes('--memory');
const [url, out, width = 1280, height = 720] = cliArgs.filter((argument) => !argument.startsWith('--'));
if (!url || !out) throw new Error('使い方: node tools/diorama/shot_view.mjs <URL> <out.png> [幅] [高さ]');
mkdirSync(dirname(out), { recursive: true });
const shotUrl = new URL(url);
const zoomMode = shotUrl.searchParams.get('zoom') === 'near' ? 'near' : 'far';

function withFxQuery(bloom, blur, renderScale = 1, includeProbes = false) {
  const parsed = new URL(url);
  parsed.searchParams.set('pause', '1');
  if (Number.isFinite(bloom)) parsed.searchParams.set('bloom', String(bloom));
  else parsed.searchParams.delete('bloom');
  if (Number.isFinite(blur)) parsed.searchParams.set('blur', String(blur));
  else parsed.searchParams.delete('blur');
  parsed.searchParams.set('rscale', String(renderScale));
  if (includeProbes && probeSfx) parsed.searchParams.set('sfx', '1');
  else parsed.searchParams.delete('sfx');
  if (includeProbes && probeMemory) parsed.searchParams.set('memory', '1');
  else parsed.searchParams.delete('memory');
  return parsed.toString();
}

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

function pixelDelta(leftBuffer, rightBuffer, region = null) {
  const left = decodePng(leftBuffer);
  const right = decodePng(rightBuffer);
  if (left.width !== right.width || left.height !== right.height) throw new Error('画素差の画像サイズが一致しません');
  let sum = 0;
  let changed = 0;
  const x0 = region ? Math.max(0, Math.floor(region.x)) : 0;
  const y0 = region ? Math.max(0, Math.floor(region.y)) : 0;
  const x1 = region ? Math.min(left.width, Math.ceil(region.x + region.width)) : left.width;
  const y1 = region ? Math.min(left.height, Math.ceil(region.y + region.height)) : left.height;
  const pixels = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const pixel = y * left.width + x;
      let maximum = 0;
      for (let channel = 0; channel < 3; channel++) {
        const difference = Math.abs(left.pixels[pixel * left.channels + channel] - right.pixels[pixel * right.channels + channel]);
        sum += difference;
        maximum = Math.max(maximum, difference);
      }
      if (maximum >= 2) changed++;
    }
  }
  return { mean: pixels ? sum / (pixels * 3) : 0, percent: pixels ? changed / pixels * 100 : 0, pixels };
}

function pixelDeltaRegions(leftBuffer, rightBuffer, regions) {
  const deltas = regions.map((region) => pixelDelta(leftBuffer, rightBuffer, region));
  const pixels = deltas.reduce((total, delta) => total + delta.pixels, 0);
  return {
    mean: pixels ? deltas.reduce((total, delta) => total + delta.mean * delta.pixels, 0) / pixels : 0,
    percent: pixels ? deltas.reduce((total, delta) => total + delta.percent * delta.pixels, 0) / pixels : 0,
    pixels,
  };
}

function averagePatchBrightness(imageBuffer, points, radius = 3) {
  const image = decodePng(imageBuffer);
  let sum = 0;
  let count = 0;
  for (const point of points || []) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const x0 = Math.max(0, Math.floor(point.x - radius));
    const y0 = Math.max(0, Math.floor(point.y - radius));
    const x1 = Math.min(image.width, Math.ceil(point.x + radius + 1));
    const y1 = Math.min(image.height, Math.ceil(point.y + radius + 1));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const offset = (y * image.width + x) * image.channels;
      sum += image.pixels[offset] * 0.2126 + image.pixels[offset + 1] * 0.7152 + image.pixels[offset + 2] * 0.0722;
      count++;
    }
  }
  return count ? sum / count / 255 : null;
}

function lightingRatio(imageBuffer, samples) {
  const useLeaves = (samples?.leafShadow?.length || 0) > 0 && (samples?.leafSun?.length || 0) > 0;
  const shadowPoints = useLeaves ? samples.leafShadow : samples?.shadow;
  const sunPoints = useLeaves ? samples.leafSun : samples?.sun;
  const shadow = averagePatchBrightness(imageBuffer, shadowPoints);
  const sun = averagePatchBrightness(imageBuffer, sunPoints);
  return { shadow, sun, ratio: shadow !== null && sun > 0 ? shadow / sun : null, shadowCount: shadowPoints?.length || 0, sunCount: sunPoints?.length || 0, source: useLeaves ? 'leaves' : 'grass', stats: samples?.stats || null };
}

function grassMaximum(imageBuffer, points) {
  const image = decodePng(imageBuffer);
  let maximum = 0;
  let count = 0;
  for (const point of points || []) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const x0 = Math.max(0, Math.floor(point.x - 3));
    const y0 = Math.max(0, Math.floor(point.y - 3));
    const x1 = Math.min(image.width, Math.ceil(point.x + 4));
    const y1 = Math.min(image.height, Math.ceil(point.y + 4));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const offset = (y * image.width + x) * image.channels;
      const red = image.pixels[offset];
      const green = image.pixels[offset + 1];
      const blue = image.pixels[offset + 2];
      if (green < 50 || green < red * 1.04 || green < blue * 0.96) continue;
      maximum = Math.max(maximum, red, green, blue);
      count++;
    }
  }
  return { maximum: count ? maximum : null, pixels: count };
}

function regionAround(point, width, height, size = 42) {
  if (!point?.visible) return null;
  const half = size * 0.5;
  return { x: Math.max(0, point.x - half), y: Math.max(0, point.y - half), width: Math.min(size, width), height: Math.min(size, height) };
}

function blurRegionDeltas(lowImage, highImage, probes, width, height) {
  if (zoomMode === 'far') {
    const center = pixelDelta(lowImage, highImage, { x: width * 0.25, y: height * 0.34, width: width * 0.5, height: height * 0.32 });
    const edge = pixelDeltaRegions(lowImage, highImage, [
      { x: 0, y: 0, width, height: height * 0.12 },
      { x: 0, y: height * 0.88, width, height: height * 0.12 },
    ]);
    return { center, edge };
  }
  return {
    hero: pixelDelta(lowImage, highImage, regionAround(probes?.hero, width, height, 44) || { x: width * 0.4, y: height * 0.4, width: width * 0.2, height: height * 0.2 }),
    far: pixelDelta(lowImage, highImage, { x: width * 0.07, y: height * 0.04, width: width * 0.86, height: height * 0.42 }),
  };
}

function dumpDataset(html, name) {
  const match = html.match(new RegExp(`data-diorama-${name}="([^"]*)"`));
  if (!match) return null;
  const value = match[1].replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
  try { return JSON.parse(value); } catch { return null; }
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
    await page.goto(withFxQuery(null, null, 1, true));
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000, polling: 1000 });
    await page.evaluate(() => { window.__pause = true; });
    await page.waitForTimeout(350);
    const baseFx = await page.evaluate(() => window.__fx);
    await page.evaluate(() => window.__renderOnce());
    const baseline = await page.screenshot({ path: out, timeout: 600000 });
    const info = await page.evaluate(() => window.__info);
    const probes = await page.evaluate(() => window.__shotProbes?.() || null);
    const lightingSamples = await page.evaluate(() => window.__lightingSamples?.() || { shadow: [], sun: [] });
    const viewMetrics = await page.evaluate(() => window.__viewMetrics?.() || null);
    const sfx = await page.evaluate(() => document.documentElement.dataset.dioramaSfx ? JSON.parse(document.documentElement.dataset.dioramaSfx) : null);
    const memory = await page.evaluate(() => document.documentElement.dataset.dioramaMemory ? JSON.parse(document.documentElement.dataset.dioramaMemory) : null);
    const exposure = await page.evaluate(() => Number(document.documentElement.dataset.dioramaExposure));
    const lighting = lightingRatio(baseline, lightingSamples);
    const grass = grassMaximum(baseline, lightingSamples.sun);
    const bloomLow = Math.max(0, Number(baseFx.bloom) - 0.22);
    const bloomHigh = Math.min(1, Number(baseFx.bloom) + 0.22);
    const blurLow = 0.04;
    const blurHigh = 0.72;
    const variants = {};
    let blurLowImage = null;
    let blurHighImage = null;
    for (const [name, settings] of [
      ['bloomLow', { bloom: bloomLow, blur: baseFx.blur }],
      ['bloomHigh', { bloom: bloomHigh, blur: baseFx.blur }],
      ['blurLow', { bloom: baseFx.bloom, blur: blurLow }],
      ['blurHigh', { bloom: baseFx.bloom, blur: blurHigh }],
    ]) {
      await page.evaluate((fx) => window.__setFx(fx), settings);
      await page.evaluate(() => window.__renderOnce());
      const image = await page.screenshot({ type: 'png', timeout: 600000 });
      variants[name] = pixelDelta(baseline, image);
      if (name === 'blurLow') blurLowImage = image;
      if (name === 'blurHigh') blurHighImage = image;
    }
    const blurRegions = blurRegionDeltas(blurLowImage, blurHighImage, probes, Number(width), Number(height));
    return { errors, info, variants, bloomLow, bloomHigh, blurLow, blurHigh, blurRegions, lighting, grass, viewMetrics, exposure, sfx, memory };
  } finally {
    await browser.close();
  }
}

function chromeArgs(targetUrl, screenshotPath, dumpDom, profile) {
  const args = [
    '--headless=new', '--hide-scrollbars', '--force-device-scale-factor=1', '--enable-logging=stderr', '--log-level=0',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    `--window-size=${Number(width)},${Number(height)}`, '--virtual-time-budget=60000',
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
  let blurRegions = null;
  let lighting = null;
  let grass = null;
  let viewMetrics = null;
  let exposure = null;
  let sfx = null;
  let memory = null;
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
      return {
        image: readFileSync(screenshotPath),
        bloom: Number(result.stdout.match(/data-diorama-bloom="([\d.]+)"/)?.[1]),
        blur: Number(result.stdout.match(/data-diorama-blur="([\d.]+)"/)?.[1]),
        probes: dumpDataset(result.stdout, 'probes'),
        lightingSamples: dumpDataset(result.stdout, 'lighting-samples'),
        viewMetrics: dumpDataset(result.stdout, 'view-metrics'),
        exposure: Number(result.stdout.match(/data-diorama-exposure="([\d.]+)"/)?.[1]),
        sfx: dumpDataset(result.stdout, 'sfx'),
        memory: dumpDataset(result.stdout, 'memory'),
      };
    };
    const baselineCapture = await run(withFxQuery(null, null, 1, true), out);
    const baseline = baselineCapture.image;
    const baseFx = { bloom: Number.isFinite(baselineCapture.bloom) ? baselineCapture.bloom : 0.35, blur: Number.isFinite(baselineCapture.blur) ? baselineCapture.blur : 0.18 };
    const probes = baselineCapture.probes;
    lighting = lightingRatio(baseline, baselineCapture.lightingSamples);
    grass = grassMaximum(baseline, baselineCapture.lightingSamples?.sun);
    viewMetrics = baselineCapture.viewMetrics;
    exposure = baselineCapture.exposure;
    sfx = baselineCapture.sfx;
    memory = baselineCapture.memory;
    const bloomLow = Math.max(0, baseFx.bloom - 0.22);
    const bloomHigh = Math.min(1, baseFx.bloom + 0.22);
    const blurLow = 0.04;
    const blurHigh = 0.72;
    let blurLowImage = null;
    let blurHighImage = null;
    for (const [name, bloom, blur] of [
      ['bloomLow', bloomLow, baseFx.blur], ['bloomHigh', bloomHigh, baseFx.blur],
      ['blurLow', baseFx.bloom, blurLow], ['blurHigh', baseFx.bloom, blurHigh],
    ]) {
      const imagePath = join(tempRoot, `${name}.png`);
      const capture = await run(withFxQuery(bloom, blur, 1, false), imagePath);
      variants[name] = pixelDelta(baseline, capture.image);
      if (name === 'blurLow') blurLowImage = capture.image;
      if (name === 'blurHigh') blurHighImage = capture.image;
    }
    blurRegions = blurRegionDeltas(blurLowImage, blurHighImage, probes, Number(width), Number(height));
    return { errors, info, variants, bloomLow, bloomHigh, blurLow, blurHigh, blurRegions, lighting, grass, viewMetrics, exposure, sfx, memory };
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
console.log(`bloom ${result.bloomLow.toFixed(2)} Δmean=${result.variants.bloomLow.mean.toFixed(6)} changed=${result.variants.bloomLow.percent.toFixed(2)}% | ${result.bloomHigh.toFixed(2)} Δmean=${result.variants.bloomHigh.mean.toFixed(6)} changed=${result.variants.bloomHigh.percent.toFixed(2)}%`);
console.log(`blur ${result.blurLow.toFixed(2)} Δmean=${result.variants.blurLow.mean.toFixed(6)} changed=${result.variants.blurLow.percent.toFixed(2)}% | ${result.blurHigh.toFixed(2)} Δmean=${result.variants.blurHigh.mean.toFixed(6)} changed=${result.variants.blurHigh.percent.toFixed(2)}%`);
const lighting = result.lighting;
console.log(`${lighting?.source || 'grass'} shadow/sun mean=${lighting?.shadow === null || lighting?.shadow === undefined ? 'n/a' : lighting.shadow.toFixed(3)} / ${lighting?.sun === null || lighting?.sun === undefined ? 'n/a' : lighting.sun.toFixed(3)} ratio=${lighting?.ratio === null || lighting?.ratio === undefined ? 'n/a' : lighting.ratio.toFixed(3)} samples=${lighting?.shadowCount || 0}/${lighting?.sunCount || 0}`);
if (lighting?.stats) console.log(`light probes grass=${lighting.stats.candidates}/${lighting.stats.visible} foliage=${lighting.stats.leafCandidates || 0}/${lighting.stats.leafVisible || 0} shadow/sun=${lighting.stats.leafShadow || 0}/${lighting.stats.leafSun || 0}`);
if (result.viewMetrics) {
  console.log(`frame board=${(result.viewMetrics.heightRatio * 100).toFixed(2)}% h=${result.viewMetrics.top.toFixed(1)}..${result.viewMetrics.bottom.toFixed(1)}px HUD top=${result.viewMetrics.hudTop.toFixed(1)}px overlap=${result.viewMetrics.hudOverlap.toFixed(1)}px fits=${result.viewMetrics.fitsViewport ? 'yes' : 'no'}`);
}
console.log(`grass sunny max RGB=${result.grass?.maximum ?? 'n/a'} pixels=${result.grass?.pixels || 0} exposure=${Number.isFinite(result.exposure) ? result.exposure.toFixed(3) : 'n/a'} saturation=0.900`);
if (zoomMode === 'far') {
  console.log(`blur far center Δmean=${result.blurRegions.center.mean.toFixed(3)} changed=${result.blurRegions.center.percent.toFixed(2)}% | edges Δmean=${result.blurRegions.edge.mean.toFixed(3)} changed=${result.blurRegions.edge.percent.toFixed(2)}%`);
} else {
  console.log(`blur near hero Δmean=${result.blurRegions.hero.mean.toFixed(3)} changed=${result.blurRegions.hero.percent.toFixed(2)}% | far Δmean=${result.blurRegions.far.mean.toFixed(3)} changed=${result.blurRegions.far.percent.toFixed(2)}%`);
}
if (probeMemory) {
  const memory = result.memory;
  console.log(`memory geometries ${memory?.samples?.map((sample) => `${sample.stage}:${sample.geometries}`).join(' -> ') || 'n/a'} final delta=${memory?.delta ?? 'n/a'} same-stage=${memory?.sameStageDoesNotGrow ? 'pass' : 'fail'}`);
}
if (probeSfx) {
  for (const [name, sample] of Object.entries(result.sfx?.samples || {})) console.log(`sfx ${name.padEnd(16)} RMS=${sample.rms.toFixed(6)} max=${sample.max.toFixed(6)}`);
  console.log(`sfx footsteps ΔRMS grass/stone=${result.sfx?.footsteps?.grassStone?.toFixed(6) ?? 'n/a'} grass/water=${result.sfx?.footsteps?.grassWater?.toFixed(6) ?? 'n/a'} stone/water=${result.sfx?.footsteps?.stoneWater?.toFixed(6) ?? 'n/a'} limits=${result.sfx?.withinLimits ? 'pass' : 'fail'} distinct=${result.sfx?.footstepsDiffer ? 'pass' : 'fail'}`);
}
const invalidLighting = zoomMode === 'far' && (lighting?.ratio === null || lighting?.ratio === undefined || lighting.ratio < 0.45);
const invalidBlur = zoomMode === 'far'
  ? result.blurRegions.center.mean > 0.12 || result.blurRegions.edge.mean <= 0
  : result.blurRegions.far.mean <= 0;
const standardAspect = Number(width) / Number(height) >= 1.2;
const invalidFrame = zoomMode === 'far' && (!result.viewMetrics || !result.viewMetrics.fitsViewport || result.viewMetrics.overlapsHud || standardAspect && (result.viewMetrics.heightRatio < 0.88 || result.viewMetrics.heightRatio > 0.92));
const invalidGrass = zoomMode === 'far' && (result.grass?.maximum === null || result.grass?.maximum === undefined || result.grass.maximum > 235);
const invalidMemory = probeMemory && !result.memory?.sameStageDoesNotGrow;
const invalidSfx = probeSfx && (!result.sfx?.withinLimits || !result.sfx?.footstepsDiffer);
if (result.errors.length || result.variants.blurLow.mean <= 0 || result.variants.blurHigh.mean <= 0 || invalidLighting || invalidBlur || invalidFrame || invalidGrass || invalidMemory || invalidSfx) process.exitCode = 1;
