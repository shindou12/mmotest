// 戦闘の記録テスト: 全武器の全クラス・マスター・スキル・パッシブを、時計と乱数を固定したブラウザで同じ手順で動かし、
// 送ったメッセージ（与ダメージ・会心・スタン値・技・位置・モーション）と、終わったときの状態を、記録した期待値と比べる。
// 期待値を作り直すときだけ GOLDEN_UPDATE=1（リファクタリング中は作り直さない）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { loadPlaywright, startServer, openGame } from './lib/harness.mjs';
import { combatScenarios, RUN_SCENARIO } from './lib/combat-scenarios.mjs';

const FIX = new URL('./fixtures/combat.json', import.meta.url);
const OUT = process.env.GOLDEN_DUMP; // 指定すると、詳しい記録をこのフォルダに書き出す（比べるとき用）
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 24);

test('combat behaviour of every weapon class, master, skill and passive matches the recorded golden', { timeout: 3600_000 }, async () => {
  const { chromium } = await loadPlaywright();
  const srv = await startServer();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const result = {};
  const all = combatScenarios();
  const only = process.env.GOLDEN_ONLY;
  try {
    for (const wk of [...new Set(all.map((s) => s.wk))]) {
      if (only && !only.split(',').includes(wk)) continue;
      const { page, errors } = await openGame(browser, srv.url, { kind: wk });
      page.on('framenavigated', (f) => { if (f === page.mainFrame()) errors.push('NAVIGATED ' + f.url()); });
      await page.evaluate(async () => {
        const G = window.__game; G.net.send({ t: 'wp', to: 'f1_field' });
        for (let i = 0; i < 100 && G.world.area !== 'f1_field'; i++) await window.__clock.step(100);
        await window.__clock.step(2000);
      });
      for (const spec of all.filter((s) => s.wk === wk)) {
        if (process.env.GOLDEN_VERBOSE) console.error('scenario', spec.name);
        const r = await page.evaluate(RUN_SCENARIO, spec);
        const hits = r.log.filter(([, m]) => m.t === 'hit').map(([, m]) => [m.dmg, m.crit ? 1 : 0, m.st, m.tech || '']);
        const types = {}; for (const [, m] of r.log) types[m.t] = (types[m.t] || 0) + 1;
        result[spec.name] = { hash: hash(r), log: hash(r.log), state: hash([r.S, r.me, r.buffs]), mobs: hash(r.mobs), hits, types };
        if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/${spec.name.replace(/[:+]/g, '_')}.json`, JSON.stringify(r, null, 1)); }
      }
      result[`${wk}:errors`] = errors;
      await page.close();
    }
  } finally { await browser.close(); srv.close(); }
  if (process.env.GOLDEN_UPDATE) { fs.writeFileSync(FIX, JSON.stringify(result, null, 1)); return; }
  const golden = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  for (const [name, g] of Object.entries(golden)) {
    if (only && !only.split(',').includes(name.split(':')[0])) continue;
    assert.deepEqual(result[name], g, name);
  }
});
