// 音声ファイルの効果音（ElevenLabs などで作ったもの）を鳴らす共通処理。
//   鳴らすたびにピッチと音量を少しだけランダムに揺らす（連打しても同じ音に聞こえないように）
//   ピッチは再生速度ごと変える（ゲームでよくあるやり方。0.05 なら ±5%）
//   trim は音の頭を飛ばす秒数（音の山が遅いファイルを命中の瞬間に合わせる）

// 揺らし倍率: 1 ± range の一様乱数
export function jitter(range, rnd = Math.random) {
  return 1 + (rnd() * 2 - 1) * range;
}

export class SampleBank {
  constructor(engine) {
    this.engine = engine; // AudioEngine（ctx と sfxBus を使う）
    this.buffers = new Map();
    this.loading = new Map();
  }

  // 読み込み（同じ id は1回だけ）。AudioEngine.init() の後で呼ぶ
  load(id, url) {
    if (this.buffers.has(id)) return Promise.resolve(this.buffers.get(id));
    if (this.loading.has(id)) return this.loading.get(id);
    const ctx = this.engine.ctx;
    const p = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.arrayBuffer(); })
      .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
      .then((buf) => { this.buffers.set(id, buf); this.loading.delete(id); return buf; })
      .catch((e) => { this.loading.delete(id); console.warn('[sample-sfx]', e); return null; });
    this.loading.set(id, p);
    return p;
  }

  has(id) { return this.buffers.has(id); }

  // 鳴らす。まだ読み込めていなければ false（呼び出し側は合成音に戻す）
  play(id, { gain = 1, pitch = 0.05, vol = 0.05, trim = 0, when, bus } = {}) {
    const ctx = this.engine.ctx, buf = this.buffers.get(id);
    if (!ctx || !buf) return false;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf;
    s.playbackRate.value = jitter(pitch);
    g.gain.value = gain * jitter(vol);
    s.connect(g).connect(bus || this.engine.sfxBus);
    s.start(when ?? ctx.currentTime, Math.min(trim, buf.duration - 0.01));
    return true;
  }
}

// 敵へのヒット音の候補（public/assets/sfx/hit/）。gain は合成音とだいたい同じ大きさになる初期値
export const HIT_SOUNDS = [
  { id: 'retake2', name: '撮り直し2', url: 'assets/sfx/hit/retake2.mp3', gain: 0.5, trim: 0 },
  { id: 'heavyFleshV2', name: '2回目A', url: 'assets/sfx/hit/heavy-flesh-v2.mp3', gain: 0.5, trim: 0 },
  { id: 'deeper', name: 'より低く重く', url: 'assets/sfx/hit/deeper.mp3', gain: 0.5, trim: 0 },
  { id: 'tight', name: '締まった', url: 'assets/sfx/hit/tight.mp3', gain: 0.5, trim: 0 },
];
