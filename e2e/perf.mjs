// 性能の計測（テストではなく比べる用）: 時計を固定したブラウザで、フィールドで戦いながら 600 フレーム進め、
// 1フレームあたりの実時間（ゲームの更新だけ / 描画込み）を測る。node e2e/perf.mjs
import { loadPlaywright, startServer, openGame } from './lib/harness.mjs';
const { chromium } = await loadPlaywright();
const srv = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const res = {};
try {
  for (const render of [false, true]) {
    const { page } = await openGame(browser, srv.url, { kind: 'spear', render, viewport: { width: 640, height: 360 } });
    res[render ? 'render' : 'update'] = await page.evaluate(async () => {
      const G = window.__game, C = window.__clock, D = G.dbg, me = G.me, A = G.api;
      G.net.send({ t: 'wp', to: 'f1_field' });
      for (let i = 0; i < 100 && G.world.area !== 'f1_field'; i++) await C.step(100);
      await C.step(1000); A.input.setTouch(true);
      const keep = () => { if (me.hp < 40) me.hp = 90; };
      const times = [];
      for (let k = 0; k < 5; k++) {
        const t0 = Date.prototype.getTime.call(new Date());
        for (let i = 0; i < 20; i++) { D.press(true); await C.step(50, keep); D.press(false); await C.step(50, keep); }
        times.push((Date.prototype.getTime.call(new Date()) - t0) / 120);
      }
      times.sort((a, b) => a - b);
      return { msPerFrameMedian: +times[2].toFixed(2), msPerFrameMin: +times[0].toFixed(2) };
    });
    await page.close();
  }
} finally { await browser.close(); srv.close(); }
console.log(JSON.stringify(res));
