// モデルの形の記録テスト。期待値を作り直すときだけ GOLDEN_UPDATE=1（リファクタリング中は作り直さない）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { modelTraces } from './golden/model-trace.mjs';

const FIX = new URL('./fixtures/golden-models.json', import.meta.url);
test('every weapon, player outfit, monster, boss and loot model keeps its recorded shape', () => {
  const a = modelTraces();
  if (process.env.GOLDEN_UPDATE) { fs.writeFileSync(FIX, JSON.stringify(a)); return; }
  const g = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  for (const k of Object.keys(g)) assert.deepEqual(a[k], g[k], k);
  assert.deepEqual(Object.keys(a).sort(), Object.keys(g).sort());
});
