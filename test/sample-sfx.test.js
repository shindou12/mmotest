import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HIT_SOUNDS, SampleBank, jitter } from '../public/js/sample-sfx.js';
import fs from 'node:fs';

test('jitter は 1 ± range に収まり、range 0 なら揺れない', () => {
  assert.equal(jitter(0), 1);
  assert.equal(jitter(0.1, () => 0), 0.9);
  assert.equal(jitter(0.1, () => 1), 1.1);
  for (let i = 0; i < 1000; i++) { const v = jitter(0.05); assert.ok(v >= 0.95 && v <= 1.05); }
});

// AudioContext の代わり（鳴らした内容を記録する）
function fakeEngine() {
  const started = [];
  const node = () => ({ connect(n) { return n; }, gain: { value: 1 }, playbackRate: { value: 1 } });
  const ctx = {
    currentTime: 2,
    createGain: node,
    createBufferSource() { const s = node(); s.start = (when, offset) => started.push({ s, when, offset }); return s; },
  };
  return { engine: { ctx, sfxBus: node() }, started };
}

test('読み込み前は鳴らさず false を返す（呼び出し側は合成音に戻す）', () => {
  const { engine, started } = fakeEngine();
  const bank = new SampleBank(engine);
  assert.equal(bank.play('x'), false);
  assert.equal(started.length, 0);
});

test('読み込み済みなら、揺らしたピッチ・音量と頭出しで鳴らす', () => {
  const { engine, started } = fakeEngine();
  const bank = new SampleBank(engine);
  bank.buffers.set('x', { duration: 0.5 });
  assert.equal(bank.play('x', { gain: 0.5, pitch: 0, vol: 0, trim: 0.03 }), true);
  assert.equal(started.length, 1);
  assert.equal(started[0].when, 2);
  assert.equal(started[0].offset, 0.03);
  assert.equal(started[0].s.playbackRate.value, 1);
  // 頭出しがファイルより長くても、最後の手前で止める
  bank.play('x', { trim: 9, pitch: 0, vol: 0 });
  assert.ok(Math.abs(started[1].offset - 0.49) < 1e-9);
});

test('ヒット音の候補のファイルがすべてある', () => {
  for (const h of HIT_SOUNDS) assert.ok(fs.existsSync(new URL(`../public/${h.url}`, import.meta.url)), h.url);
});
