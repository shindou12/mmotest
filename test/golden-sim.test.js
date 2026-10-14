// サーバー（World）の挙動の記録テスト。期待値を作り直すときだけ GOLDEN_UPDATE=1（リファクタリング中は作り直さない）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { simTrace } from './golden/sim-trace.mjs';

const FIX = new URL('./fixtures/golden-sim.json', import.meta.url);
test('server world: fixed random and clock, scripted 3-player session matches the recorded message trace', async () => {
  const a = await simTrace();
  if (process.env.GOLDEN_UPDATE) { fs.writeFileSync(FIX, JSON.stringify(a, null, 1)); return; }
  assert.deepEqual(a, JSON.parse(fs.readFileSync(FIX, 'utf8')));
});
