// 姿勢の記録テスト。期待値を作り直すときだけ GOLDEN_UPDATE=1（リファクタリング中は作り直さない）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { poseTraces } from './golden/pose-trace.mjs';

const FIX = new URL('./fixtures/golden-poses.json', import.meta.url);
test('every motion and every basic weapon pose (swing, charge, guard, dodge, hurt, down, walk, dragoon shield) matches the recorded skeleton', () => {
  const a = poseTraces();
  if (process.env.GOLDEN_UPDATE) { fs.writeFileSync(FIX, JSON.stringify(a, null, 1)); return; }
  const g = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  for (const k of Object.keys(g)) assert.equal(a[k], g[k], k);
  assert.deepEqual(Object.keys(a).sort(), Object.keys(g).sort());
});
