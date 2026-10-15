// NPC の見た目の記録テスト。期待値（test/fixtures/golden-npcs.json）は整理の前のコードで作ったもので、書き換えない
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { npcTraces } from './golden/npc-trace.mjs';

const FIX = new URL('./fixtures/golden-npcs.json', import.meta.url);
test('every NPC in every area keeps its recorded shape', async () => {
  const a = await npcTraces();
  if (process.env.GOLDEN_UPDATE) { fs.writeFileSync(FIX, JSON.stringify(a, null, 1)); return; }
  assert.ok(Object.keys(a).length > 0);
  assert.deepEqual(a, JSON.parse(fs.readFileSync(FIX, 'utf8')));
});
