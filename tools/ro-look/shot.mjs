// ページを開いて 1280×720 で撮る（RO風の見た目を確かめるループ用）
//   使い方: node tools/ro-look/shot.mjs <URL> <出力.png>
//   例: node tools/ro-look/shot.mjs "http://localhost:8091/ref-forest.html" out/ours.png
//   先に `PORT=8091 npm start` でサーバーを立てておく。ページは描き終えたら window.__ready = true にすること
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = await import('/opt/node22/lib/node_modules/playwright/index.mjs'); }
const [url, out] = process.argv.slice(2);
if (!url || !out) { console.error('使い方: node tools/ro-look/shot.mjs <URL> <出力.png>'); process.exit(1); }
mkdirSync(dirname(out), { recursive: true });
// WebGL をソフトウェアで描く（GPU のない環境でも撮れる。遅いので待ち時間を長めに）
const b = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 2000)); });
await p.goto(url);
await p.waitForFunction(() => window.__ready, null, { timeout: 120000 }).catch(() => errs.push('timeout: window.__ready が立たない'));
await p.waitForTimeout(3000); // 影・ポストエフェクトが落ち着くまで
await p.screenshot({ path: out, timeout: 90000 });
console.log(errs.join('\n') || 'no errors');
await b.close();
