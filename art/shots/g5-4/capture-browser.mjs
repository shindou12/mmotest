import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, openGame } from '../../../e2e/lib/harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BASE_URL = process.argv[2] || 'http://127.0.0.1:8080';
const OUTPUT = path.resolve(process.argv[3] || path.join(ROOT, 'art/shots/g5-4/browser'));
const ONLY_ID = process.env.G5_4_ONLY;
const SHOTS = JSON.parse(fs.readFileSync(new URL('./shots.json', import.meta.url), 'utf8'))
  .filter((shot) => !ONLY_ID || shot.id === ONLY_ID);
fs.mkdirSync(OUTPUT, { recursive: true });

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  console.log('OPEN_GAME_BEGIN');
  const { page, errors } = await openGame(browser, BASE_URL, { kind: 'sword', viewport: { width: 1532, height: 869 }, render: true });
  console.log('OPEN_GAME_READY');
  await page.evaluate(() => {
    document.getElementById('login')?.classList.add('hidden');
    document.getElementById('hud')?.classList.add('hidden');
    window.__game.api.setSetting('quality', 'high');
    window.__noRender = false;
    let seed = 0x54a91;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  });

  for (const shot of SHOTS) {
    console.log(`SCENE_BEGIN ${shot.id}`);
    const state = await page.evaluate(async (s) => {
      const { AREAS } = await import('/shared/areas.js');
      const { me, mobs, world } = await import('/js/game/state.js');
      const { camera, renderFrame, applyQuality } = await import('/js/game/render.js');
      const c = window.__game.char();
      c.name = 'EliteTest';
      c.waypoints = { ...(c.waypoints || {}), [s.area]: true };
      c.areas = { ...(c.areas || {}), [s.area]: { done: true, k: 15 } };
      world.unlocked = 3;
      window.__game.net.world.unlocked = 3;
      if (world.area !== s.area) window.__game.api.waypointWarp(s.area);
      for (let i = 0; i < 100 && world.area !== s.area; i++) await window.__clock.step(50);
      if (world.area !== s.area) throw new Error(`failed to enter ${s.area}`);

      me.x = s.at[0]; me.z = s.at[1]; me.a = Math.PI; me.transit = false;
      const sim = window.__game.net.world;
      const player = sim.players.get(1);
      player.name = c.name;
      sim.movePlayer(player, s.area, { x: s.at[0], z: s.at[1] });
      await Promise.resolve();
      return { area: world.area, name: c.name };
    }, shot);
    console.log(`SCENE_READY ${shot.id} ${JSON.stringify(state)}`);
    if (shot.openDoor) {
      await page.evaluate(() => window.__game.net.send({ t: 'interact', what: 'lever' }));
    }
    // ソロワールドの決められたシミュレーションを進め、出現と仕掛けを実際のルールで反映する。
    await page.evaluate(() => {
      const sim = window.__game.net.world;
      for (let i = 0; i < 50; i++) sim.tick(0.05);
    });
    const capture = await page.evaluate(async (s) => {
      const { AREAS } = await import('/shared/areas.js');
      const { me, mobs, world } = await import('/js/game/state.js');
      const { camera, renderFrame, applyQuality } = await import('/js/game/render.js');
      const { heightAt } = await import('/js/game/area.js');
      const sim = window.__game.net.world;
      const area = sim.area(s.area);
      const grid = AREAS[s.area].shape === 'grid';
      const focusY = heightAt(s.focus[0], s.focus[1]) + 1.2;
      const zoom = 1;
      const pitch = 0.62 + (0.92 - 0.62) * ((zoom - 0.55) / (1.6 - 0.55));
      const distance = 19.5 * (grid ? 0.9 : 1);
      const target = { x: s.focus[0], y: focusY, z: s.focus[1] };
      camera.fov = 50;
      camera.near = 0.1; camera.far = 900;
      camera.updateProjectionMatrix();
      applyQuality(); renderFrame();
      await window.__clock.step(17);
      camera.position.set(target.x, target.y + Math.sin(pitch) * distance, target.z + Math.cos(pitch) * distance);
      camera.lookAt(target.x, target.y, target.z);
      camera.updateMatrixWorld(true);
      renderFrame();
      return {
        area: world.area, player: { x: me.x, z: me.z }, target, camera: { position: camera.position.toArray(), fov: camera.fov, pitch, distance },
        door: world.door, plates: world.plates, sim: { time: sim.time, namedT: area.namedT, namedId: area.namedId, players: [...sim.players.values()].map((p) => ({ area: p.area, x: p.x, z: p.z })) },
        mobs: [...mobs.values()].map((m) => ({ id: m.id, name: m.name, kind: m.kind, elite: m.elite, scale: m.model.scale.x, x: m.x, z: m.z, hp: m.hp, mhp: m.mhp, label: !!m.label })),
      };
    }, shot);
    const filename = path.join(OUTPUT, `${shot.id}.png`);
    await page.screenshot({ path: filename });
    console.log(`SCREENSHOT_DONE ${shot.id}`);
    console.log(JSON.stringify({ id: shot.id, ...capture, screenshot: filename, errors }));
    if (errors.length) throw new Error(`browser errors: ${JSON.stringify(errors)}`);
  }
} finally {
  await browser.close();
}
