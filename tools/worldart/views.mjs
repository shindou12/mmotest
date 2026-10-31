// 1 つの地図を、固定ビューの一覧で同じ条件で撮る（読み込みは 1 回）。サーバーが止まっていれば立てる。
//   node tools/worldart/views.mjs <地図> <出力フォルダ> [ビュー,...] [幅=1532] [高さ=869]
//   ビューの書き方: 地図の views の名前（B01 など）か、標準ビュー（oblique/side/top/walker/near/far）に @基準 を付ける（例 oblique@B01）
//   WA_PORT: 接続するサーバーのポート（既定 8091）
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
const pw = await (await import('../../e2e/lib/harness.mjs')).loadPlaywright();   // 場所は PLAYWRIGHT_MODULE か既定（harness.mjs）
const [map, outDir, list, w = 1532, h = 869, extra = ''] = process.argv.slice(2);   // extra: URL に足す引数（実験用、例 'lsat=1.1'）
const port = process.env.WA_PORT || '8091';
mkdirSync(outDir, { recursive: true });
const up = async () => { try { return (await fetch('http://localhost:' + port + '/health')).ok; } catch { return false; } };
if (!(await up())) {
  spawn('node', ['server.js'], { env: { ...process.env, PORT: port }, detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 250));
}
const views = (list || 'B01,B02,B03,B04,oblique@B01,side@B01,top@B01,walker@B01,near@B01,far@B01').split(',');
const b = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
const t0 = Date.now();
await p.goto('http://localhost:' + port + '/worldart/index.html?map=' + map + (extra ? '&' + extra : ''));
await p.waitForFunction(() => window.__ready, null, { timeout: 900000, polling: 1000 });
await p.evaluate(() => { window.__pause = true; });
for (const v of views) {
  const [name, base] = v.split('@');
  await p.evaluate(([n, bs]) => { window.__setView(n, bs); window.__renderOnce(); }, [name, base || null]);
  const file = `${outDir}/${v.replace('@', '_')}.png`;
  await p.screenshot({ path: file, timeout: 900000 });
  console.log(file, ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
console.log(errs.join(' | ') || 'no errors');
await b.close();
