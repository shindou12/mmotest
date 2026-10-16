import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlaywright, startServer, openGame } from './lib/harness.mjs';

test(
  'valley preview renders both qualities, walks with collision, and releases replaced environments',
  { timeout: 300000 },
  async () => {
    const { chromium } = await loadPlaywright(),
      srv = await startServer();
    const browser = await chromium.launch({
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      args: [
        '--no-sandbox',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    });
    const errors = [];
    try {
      const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
      });
      await page.goto(srv.url + '/valley.html');
      await page.waitForFunction(() => window.__valley);
      await page.evaluate(async () => {
        window.__valley.stop();
        await window.__valley.env.ready;
      });
      assert.equal(
        await page.evaluate(() => {
          let loaded = false;
          window.__valley.env.group.traverse((o) => {
            if (o.material?.map?.image?.src?.includes('birch-foliage.webp'))
              loaded = o.material.map.image.width > 1000;
          });
          return loaded;
        }),
        true,
        'the generated foliage asset loads successfully',
      );
      const sample = () =>
        page.evaluate(() => {
          const v = window.__valley;
          v.renderer.info.reset();
          v.renderer.render(v.scene, v.camera);
          return {
            triangles: v.renderer.info.render.triangles,
            geometries: v.renderer.info.memory.geometries,
            textures: v.renderer.info.memory.textures,
          };
        });
      const high = await sample();
      assert.ok(high.triangles > 100000, 'terrain and foliage render');
      await page.selectOption('#quality', 'low');
      await page.evaluate(() => window.__valley.env.ready);
      const low = await sample();
      assert.ok(low.triangles < high.triangles * 0.8, 'low quality actually reduces geometry');
      await page.selectOption('#quality', 'high');
      await page.evaluate(() => window.__valley.env.ready);
      const again = await sample();
      assert.ok(again.geometries <= high.geometries + 2, 'quality toggles release old geometry');
      assert.ok(again.textures <= high.textures + 2, 'quality toggles release old textures');
      await page.click('#walk');
      const before = await page.evaluate(() => ({ ...window.__valley.player }));
      await page.keyboard.down('w');
      await page.evaluate(() => {
        for (let i = 0; i < 20; i++) window.__valley.frame(performance.now() + i * 50, false);
      });
      await page.keyboard.up('w');
      const after = await page.evaluate(() => ({ ...window.__valley.player }));
      assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 2, 'W moves the player');
      const blocked = await page.evaluate(async () => {
        const v = window.__valley,
          { AREAS, obstaclesOf } = await import('/shared/areas.js');
        const o = obstaclesOf(AREAS.f1_field).find((o) => o.solid);
        v.player.x = o.x;
        v.player.z = o.z;
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
        v.frame(performance.now() + 5000, false);
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
        return Math.hypot(v.player.x - o.x, v.player.z - o.z) >= o.r + 0.59;
      });
      assert.ok(blocked, 'preview uses server collision for large trees and rocks');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => window.__valley.walking), false);
      for (let i = 0; i < 4; i++) {
        await page.locator(`[data-view="${i}"]`).click();
        assert.equal(await page.locator(`[data-view="${i}"]`).getAttribute('aria-current'), 'true');
      }
      await page.keyboard.press('h');
      assert.equal(await page.locator('body').evaluate((e) => e.classList.contains('clean')), true);
      await page.keyboard.press('h');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => document.querySelector('canvas').clientWidth === innerWidth);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        'mobile has no horizontal overflow',
      );
      await page.close();
      // Exercise the actual game path, not just the separate presentation.
      const game = await openGame(browser, srv.url, { viewport: { width: 160, height: 100 } });
      const result = await game.page.evaluate(async () => {
        const A = await import('/js/game/area.js'),
          R = await import('/js/game/render.js');
        A.enterArea('f1_field', 0, 0);
        const first = A.env;
        let released = false;
        first.group.children[0].geometry.addEventListener('dispose', () => {
          released = true;
        });
        A.enterArea('f1_town', 0, 0);
        const gone = !R.scene.children.includes(first.group);
        A.enterArea('f1_field', 0, 0);
        return {
          released,
          gone,
          portals: A.env.portals.length,
          chests: A.env.chests.length,
          sun: R.sun.color.getHex(),
          finite: Number.isFinite(A.env.heightAt(0, 0)),
        };
      });
      assert.equal(result.released, true);
      assert.equal(result.gone, true);
      assert.equal(result.portals, 4);
      assert.equal(result.chests, 2);
      assert.equal(result.finite, true);
      assert.equal(result.sun, 0xffe0a8);
      assert.deepEqual(
        game.errors.filter((e) => !e.includes('404')),
        [],
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      srv.close();
    }
  },
);
