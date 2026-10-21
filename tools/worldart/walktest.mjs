// 歩いたときの確認: 注目点を順に動かして撮る（カメラの追従・影の範囲・破綻を見る）
//   node tools/worldart/walktest.mjs <URL> <出力の接頭辞> x1,z1 x2,z2 ...
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
const pw = await (await import('../../e2e/lib/harness.mjs')).loadPlaywright();   // 場所は PLAYWRIGHT_MODULE か既定（harness.mjs）
const [url, prefix, ...pts] = process.argv.slice(2);
mkdirSync(dirname(prefix), { recursive: true });
const b = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(url + '&marker=1');
await p.waitForFunction(() => window.__ready, null, { timeout: 600000, polling: 1000 });
await p.evaluate(() => { window.__pause = true; });
for (const [i, s] of pts.entries()) {
  const [x, z] = s.split(',').map(Number);
  const t = await p.evaluate(([x, z]) => { const t = window.__moveTo(x, z); window.__renderOnce(); return t; }, [x, z]);
  await p.screenshot({ path: `${prefix}_${i}.png`, timeout: 600000 });
  console.log(`${prefix}_${i}.png target=${t.map((v) => v.toFixed(1))}`);
}
console.log(errs.join(' | ') || 'no errors');
await b.close();
