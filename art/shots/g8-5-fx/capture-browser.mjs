// G8-5: ブラウザ版のエフェクトを、決まった刻み（1/60 秒 × N）で撮る。Godot 版（--fxdemo）と同じ並び・同じ刻み。
// 使い方: node capture-browser.mjs <base-url> <output-dir> <style,style> <kind> <marks,marks> [weapon]
//   kind: slash ring lightning beam burst flash all（部品）/ swing heavy ws q e（実際の攻撃・技。刻みは 1/60 秒の数）
import fs from 'node:fs';
import path from 'node:path';
import { loadPlaywright, openGame } from '../../../e2e/lib/harness.mjs';

const [baseUrl, outDir, stylesArg, kind, marksArg, weapon = 'sword'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const styles = stylesArg.split(','), marks = marksArg.split(',').map(Number);
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const { page, errors } = await openGame(browser, baseUrl, { kind: weapon, viewport: { width: 1532, height: 869 }, render: true });
  await page.evaluate(async () => {
    document.getElementById('login')?.classList.add('hidden'); document.getElementById('login').style.display = 'none';
    const a = await import('/js/game/area.js'); a.enterArea('f1_field', 0, 0);
    // 乱数は種固定（粒がそろってしまわないように）
    let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    // カメラ: Godot 版と同じ構図（画角 18°・距離 33m・見下ろし 45°）。元の粒の大きさ（gl_PointSize = size * 300 / 距離 px）は画角 50° 前提の
    // 世界に対する大きさ（0.32 * size m）なので、画角 18° に変えた分（× 878 / 300）を戻して世界に対する大きさを保つ
    const cm = window.__game.camera, look = cm.lookAt.bind(cm);
    cm.fov = 18; cm.updateProjectionMatrix();
    cm.lookAt = (v) => { cm.position.set(v.x, v.y + 33 * Math.SQRT1_2, v.z + 33 * Math.SQRT1_2); look(v); };
    const pm = window.__game.fx.parts.points.material;
    pm.vertexShader = pm.vertexShader.replace('300.0', '878.0'); pm.needsUpdate = true;
    window.__game.fx.classicVS = true;
    const g = window.__game; g.me.x = 0; g.me.z = 0; g.me.a = 0;
    document.querySelectorAll('#hud, #help').forEach((e) => e.classList.add('hidden'));
  });
  for (const style of styles) {
    await page.evaluate(async (style) => {
      const g = window.__game; g.settings.fx = style;
      const r = await import('/js/game/render.js'); r.applyFxStyle();
      g.fx.items.splice(0).forEach((it) => it.obj.parent?.remove(it.obj));
      g.fx.parts.n = 0; g.fx.sparks.list.length = 0;
      g.me.x = 0; g.me.z = 0; g.me.a = 0;
    }, style);
    await page.evaluate(() => window.__clock.step(500));
    const fire = ['swing', 'heavy', 'ws', 'q', 'e'].includes(kind);
    await page.evaluate(([kind]) => {
      const g = window.__game, f = g.fx, x = g.me.x, z = g.me.z;
      g.mouse && (g.mouse.x = x, g.mouse.z = z + 10);
      if (kind === 'swing') { g.dbg.swing(); return; }
      if (kind === 'heavy') { g.dbg.heavy(2); return; }
      if (kind === 'ws') { g.dbg.ws(); return; }
      if (kind === 'q') { g.dbg.tree(0); return; }
      if (kind === 'e') { g.dbg.tree(1); return; }
      const all = kind === 'all', has = (k) => all || kind === k;
      if (has('slash')) f.slash(x, z, 0, 3, 110, 0xffd84a, 1, false);
      if (has('ring')) f.ringWave(x, z + 5, 0x6ab0ff, 4, 0.45);
      if (has('lightning')) f.lightning(x + 5, z + 4, 0xbfd8ff);
      if (has('beam')) f.beam(x - 5, z + 4, 0xffd84a, 8, 0.8, 1.2);
      if (has('burst')) {
        f.parts.burst(x, 1.2, z + 4, 18, { color: 0xffd84a, speed: 9, size: 0.5, life: 0.4 });
        f.parts.burst(x - 3, 0.8, z + 4, 25, { color: 0xff6a20, speed: 4, size: 0.6, life: 0.7, gravity: 3 });
      }
      if (has('flash')) f.flash(x + 2, 1, z + 3, 0xfff0a0, 30, 0.5, 12);
    }, [kind]);
    let done = 0;
    for (const m of marks) {
      // 仮の時計を進める（1/60 秒 = 16.667ms ずつ）。フレームは時計が回す
      while (done < m) { await page.evaluate(() => window.__clock.step(1000 / 60)); done++; }
      await page.evaluate(() => window.__clock.step(0));
      const file = path.join(outDir, `${style}_${fire ? weapon + '-' : ''}${kind}_${m}.png`);
      await page.screenshot({ path: file });
      console.log('BROWSER_SHOT', file);
    }
  }
  if (errors.length) console.log('ERRORS', JSON.stringify(errors.slice(0, 5)));
} finally {
  await browser.close();
}
