// ワールドの画面を撮る（描画ループを止めて1回だけ描いてから撮る）。
//   node tools/worldart/shot.mjs <URL> <out.png> [幅=1280] [高さ=720]
//   先に PORT=8091 node server.js を立てておく
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const pw = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const [url, out, w = 1280, h = 720] = process.argv.slice(2);
mkdirSync(dirname(out), { recursive: true });
const b = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 500)); });
const t0 = Date.now();
await p.goto(url);
await p.waitForFunction(() => window.__ready, null, { timeout: 600000, polling: 1000 });
await p.evaluate(() => { window.__pause = true; });
await p.waitForTimeout(500);
await p.evaluate(() => window.__renderOnce());
await p.screenshot({ path: out, timeout: 600000 });
const info = await p.evaluate(() => window.__info);
console.log(`${out} ${((Date.now() - t0) / 1000).toFixed(1)}s calls=${info?.calls} tris=${info?.triangles} ${errs.join(' | ') || 'no errors'}`);
await b.close();
