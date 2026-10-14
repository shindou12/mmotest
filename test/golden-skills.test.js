// スキルと武器ツリーの記録テスト。期待値を作り直すときだけ GOLDEN_UPDATE=1（リファクタリング中は作り直さない）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { skillTraces } from './golden/skill-trace.mjs';

const FIX = new URL('./fixtures/golden-skills.json', import.meta.url);
test('every skill (heavy, weapon, tree, technique, weapon-tree lv1-3 and branches) and every weapon-tree effect matches the recorded trace', () => {
  const a = skillTraces();
  if (process.env.GOLDEN_UPDATE) { fs.writeFileSync(FIX, JSON.stringify(a, null, 1)); return; }
  const g = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  for (const k of Object.keys(g)) assert.equal(a[k], g[k], k);
  assert.deepEqual(Object.keys(a).sort(), Object.keys(g).sort());
});
