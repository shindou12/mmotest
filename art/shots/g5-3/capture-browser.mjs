import fs from 'node:fs';
import path from 'node:path';
import { loadPlaywright, openGame } from '../../../e2e/lib/harness.mjs';

const [baseUrl, outputDir] = process.argv.slice(2);
if (!baseUrl || !outputDir) throw new Error('usage: node capture-browser.mjs <base-url> <output-dir>');
fs.mkdirSync(outputDir, { recursive: true });

const areas = ['f1_hunt', 'f2_field', 'f3_hunt'];
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const { page, errors } = await openGame(browser, baseUrl, {
    kind: 'sword', viewport: { width: 1532, height: 869 }, render: true,
  });
  await page.evaluate(() => {
    // openGame は game.start を直接呼ぶため、ログイン画面からプレイ画面への切替も再現する。
    document.getElementById('login')?.classList.add('hidden');
    document.getElementById('hud')?.classList.remove('hidden');
    window.__game.api.setSetting('quality', 'high');
    // テスト用乱数は常に 0.5 なので、描画粒子だけ位置が散る固定乱数にする。
    let seed = 0x53a91;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  });
  for (const area of areas) {
    const state = await page.evaluate(async (id) => {
      const { AREAS, spawnPoint } = await import('/shared/areas.js');
      const c = window.__game.char();
      c.name = 'WxTest';
      c.waypoints = { ...(c.waypoints || {}), [id]: true };
      c.areas = { ...(c.areas || {}), [id]: { done: true, k: 15 } };
      window.__game.world.unlocked = 3;
      window.__game.net.world.unlocked = 3;
      if (window.__game.world.area !== id) window.__game.api.waypointWarp(id);
      for (let i = 0; i < 80 && window.__game.world.area !== id; i++) await window.__clock.step(50);
      const spawn = spawnPoint(AREAS[id]);
      window.__game.me.x = spawn.x;
      window.__game.me.z = spawn.z;
      window.__game.me.a = Math.PI;
      window.__game.me.transit = false;
      await window.__clock.step(2500);
      const { weatherParts } = await import('/js/game/render.js');
      const { camera } = await import('/js/game/render.js');
      const { heightAt } = await import('/js/game/area.js');
      const targetY = heightAt(window.__game.me.x, window.__game.me.z) + 1.2;
      const dx = camera.position.x - window.__game.me.x;
      const dy = camera.position.y - targetY;
      const dz = camera.position.z - window.__game.me.z;
      const cameraDistance = Math.hypot(dx, dy, dz);
      return {
        area: window.__game.world.area,
        weather: window.__game.world.def.weather,
        quality: window.__game.settings.quality,
        spawn: { x: window.__game.me.x, z: window.__game.me.z },
        camera: {
          fov: camera.fov,
          distance: cameraDistance,
          pitch: Math.atan2(dy, Math.hypot(dx, dz)),
        },
        particles: { kind: weatherParts.kind, points: weatherParts.points.visible, lines: weatherParts.lines.visible, drawCount: weatherParts.lines.geometry.drawRange.count },
      };
    }, area);
    if (state.area !== area) throw new Error(`could not enter ${area}: ${JSON.stringify(state)}`);
    const filename = path.join(outputDir, `${area}.png`);
    await page.screenshot({ path: filename });
    console.log(JSON.stringify({ ...state, screenshot: filename, errors }));
    if (errors.length) throw new Error(`browser errors: ${JSON.stringify(errors)}`);
  }
} finally {
  await browser.close();
}
