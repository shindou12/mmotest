// ゲーム本体の今の見た目を撮る（第 3 世代で作り直す前の比較用、L25）。ソロで始め、エリアへ飛び、人物を地図のビューの注目点に置いて撮る。
//   node tools/worldart/gameshot.mjs <エリア> <地図> <出力フォルダ> [ビュー,...] [幅=1532] [高さ=869]
//   例: node tools/worldart/gameshot.mjs f1_field f1_field art/shots/f1_field/game F01,F02,F03
// カメラはゲームのまま（ゲームの視点・ズーム）。位置だけ地図の views の target に合わせる。
import fs from 'node:fs';
import { loadPlaywright, startServer, openGame } from '../../e2e/lib/harness.mjs';

const [area, map, outDir, list, w = 1532, h = 869] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(new URL(`../../public/worldart/maps/${map}.json`, import.meta.url)));
const views = (list || Object.keys(spec.views).join(',')).split(',');
fs.mkdirSync(outDir, { recursive: true });
const { chromium } = await loadPlaywright();
const srv = await startServer();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const { page, errors } = await openGame(browser, srv.url, { kind: 'sword', render: true, viewport: { width: Number(w), height: Number(h) } });
  await page.evaluate(async (area) => {
    const G = window.__game, C = window.__clock;
    G.net.send({ t: 'wp', to: area });
    for (let i = 0; i < 100 && G.world.area !== area; i++) await C.step(100);
    await C.step(500);
    for (const el of document.querySelectorAll('body > *:not(canvas)')) el.style.visibility = 'hidden';   // ログインの板・HUD を隠す（背景だけを撮る）
  }, area);
  for (const v of views) {
    const t = spec.views[v].target;
    await page.evaluate(async ([x, z]) => {
      const G = window.__game, C = window.__clock;
      for (const m of G.mobs.values()) { m.x = 999; m.z = 999; }      // 敵は画面の外へ（背景だけを比べる）
      G.me.x = x; G.me.z = z; G.cam.focus.set(x, 1.2, z);
      await C.step(400);
    }, [t[0], t[2]]);
    const file = `${outDir}/${v}.png`;
    await page.screenshot({ path: file, timeout: 900000 });
    console.log(file);
  }
  console.log(errors.join(' | ') || 'no errors');
} finally { await browser.close(); srv.close(); }
