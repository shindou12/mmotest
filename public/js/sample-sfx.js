// 音声ファイルの効果音（ElevenLabs などで作ったもの）を鳴らす共通処理。
//   鳴らすたびにピッチと音量を少しだけランダムに揺らす（連打しても同じ音に聞こえないように）
//   ピッチは再生速度ごと変える（ゲームでよくあるやり方。0.05 なら ±5%）
//   trim は音の頭を飛ばす秒数（音の山が遅いファイルを命中の瞬間に合わせる）
//   連打・同時ヒット: 同じ音が重なりすぎないように、まとめる・小さくする・古いものを止める（voice の指定）
//   音色: lowCut（Hz）で鳴らない超低音を削り、drive（0〜1）で倍音を足して小さいスピーカーでも聞こえるようにする

// 揺らし倍率: 1 ± range の一様乱数
export function jitter(range, rnd = Math.random) {
  return 1 + (rnd() * 2 - 1) * range;
}

// 連打・同時ヒットの決まり（初期値）
//   merge: この秒数より近い2発目は鳴らさない（1回の攻撃で複数の敵に当たったとき、1つの音にまとめる）
//   window / repeatGain: この秒数以内に続けて鳴ったら、音量を repeatGain 倍にする（続くほど重ねて小さく）
//   max: 同時に鳴る数の上限。超えたら一番古い音を短くフェードして止める
export const VOICE_DEFAULTS = { merge: 0.03, window: 0.15, repeatGain: 0.6, max: 3 };

// 倍音を足す歪みのカーブ（tanh。drive 0 なら作らない）
const curves = new Map();
function driveCurve(drive) {
  const k = Math.round(drive * 20) / 20;
  if (!curves.has(k)) {
    const n = 1024, c = new Float32Array(n), a = 1 + k * 9, norm = Math.tanh(a);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(a * x) / norm; }
    curves.set(k, c);
  }
  return curves.get(k);
}

export class SampleBank {
  constructor(engine) {
    this.engine = engine; // AudioEngine（ctx と sfxBus を使う）
    this.buffers = new Map();
    this.loading = new Map();
    this.voices = new Map(); // id → 鳴っている音 [{ g, s, at, end }]
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

  // 鳴らす。まだ読み込めていなければ false（呼び出し側は合成音に戻す）。まとめて鳴らさなかったときは 'merged'
  play(id, { gain = 1, pitch = 0.05, vol = 0.05, trim = 0, lowCut = 0, drive = 0, voice, when, bus } = {}) {
    const ctx = this.engine.ctx, buf = this.buffers.get(id);
    if (!ctx || !buf) return false;
    const t = when ?? ctx.currentTime, v = { ...VOICE_DEFAULTS, ...voice };
    const list = (this.voices.get(id) || []).filter((x) => x.end > t);
    this.voices.set(id, list);
    const last = list[list.length - 1];
    if (last && t - last.at < v.merge) return 'merged';
    let level = gain * jitter(vol);
    if (last && t - last.at < v.window) level *= v.repeatGain ** list.filter((x) => t - x.at < v.window).length;
    while (list.length >= v.max) {
      const old = list.shift();
      old.g.gain.cancelScheduledValues(t); old.g.gain.setValueAtTime(old.g.gain.value, t);
      old.g.gain.linearRampToValueAtTime(0, t + 0.02); old.s.stop(t + 0.03);
    }

    const s = ctx.createBufferSource(), g = ctx.createGain(), rate = jitter(pitch);
    s.buffer = buf;
    s.playbackRate.value = rate;
    g.gain.value = level;
    let head = s;
    if (lowCut > 0) {
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = lowCut; f.Q.value = 0.7;
      head = head.connect(f);
    }
    if (drive > 0) {
      const w = ctx.createWaveShaper(); w.curve = driveCurve(drive); w.oversample = '2x';
      head = head.connect(w);
    }
    head.connect(g).connect(bus || this.engine.sfxBus);
    const offset = Math.min(trim, buf.duration - 0.01);
    s.start(t, offset);
    list.push({ g, s, at: t, end: t + (buf.duration - offset) / rate });
    return true;
  }
}

// 敵へのヒット音の候補（public/assets/sfx/hit/）。gain は合成音とだいたい同じ大きさになる初期値
//   click: 今の合成音のアタック（2kHz あたりのノイズ）を重ねる量。低音だけの音の輪郭を出す
//   「より低く重く」は低音だけで聞き取りにくいので、80Hz 以下を削り、倍音とアタックを少し足しておく（250Hz 以上が約 +10dB、全体の大きさは約 +2dB）
export const HIT_SOUNDS = [
  { id: 'retake2', name: '撮り直し2', url: 'assets/sfx/hit/retake2.mp3', gain: 0.5, trim: 0, lowCut: 0, drive: 0, click: 0 },
  { id: 'heavyFleshV2', name: '2回目A', url: 'assets/sfx/hit/heavy-flesh-v2.mp3', gain: 0.5, trim: 0, lowCut: 0, drive: 0, click: 0 },
  { id: 'deeper', name: 'より低く重く', url: 'assets/sfx/hit/deeper.mp3', gain: 0.8, trim: 0, lowCut: 80, drive: 0.2, click: 0.5 },
  { id: 'tight', name: '締まった', url: 'assets/sfx/hit/tight.mp3', gain: 0.5, trim: 0, lowCut: 0, drive: 0, click: 0 },
];
