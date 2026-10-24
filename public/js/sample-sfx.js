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

  // 合成のレシピ（build(ctx, out)）を一度だけ音にして、音声ファイルと同じように扱う
  //   ランダムの揺れ・連打のまとめ・低音カットなどが、そのまま効く
  render(id, build, seconds = 0.4) {
    if (this.buffers.has(id)) return Promise.resolve(this.buffers.get(id));
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, sr = this.engine.ctx?.sampleRate || 44100;
    const oc = new OAC(1, Math.ceil(seconds * sr), sr);
    build(oc, oc.destination);
    return oc.startRendering().then((buf) => { this.buffers.set(id, buf); return buf; });
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

// ---- 自作のヒット音（合成） ----
//   今の合成音（audio.js の 'hit': サイン波の落ち込み 220→70Hz + 2kHz のノイズ）の作りを残し、
//   ElevenLabs の候補を測った結果に寄せる: 音の山は 10ms 以内・余韻は「より低く重く」(0.22秒)より短く（連打で重なりにくい）、
//   低音の芯は 50Hz 前後まで落とすが、250Hz 以上の倍音とアタックで小さいスピーカーでも聞こえるようにする
function kit(ctx, out) {
  const len = ctx.sampleRate, nb = ctx.createBuffer(1, len, ctx.sampleRate), d = nb.getChannelData(0);
  let seed = 12345; // 毎回同じ音にする（揺れは鳴らすときに付ける）
  for (let i = 0; i < len; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = seed / 2147483648 - 1; }
  const env = (at, vol, a, dur) => {
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + a); g.gain.exponentialRampToValueAtTime(0.0001, at + a + dur);
    g.connect(out); return g;
  };
  return {
    tone(type, f0, f1, dur, vol, at = 0) {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
      o.connect(env(at, vol, 0.003, dur)); o.start(at); o.stop(at + dur + 0.02);
    },
    noise(type, f0, dur, vol, { at = 0, q = 1, f1 = f0, offset = 0 } = {}) {
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter();
      s.buffer = nb; f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(f1, at + dur);
      s.connect(f).connect(env(at, vol, 0.002, dur)); s.start(at, offset); s.stop(at + dur + 0.02);
    },
  };
}
export const SYNTH_HITS = {
  // 重め: 今の合成音を一回り低く太く。芯 150→48Hz、倍音 300→110Hz、ドンという詰まった低いノイズ
  heavy(ctx, out) {
    const k = kit(ctx, out);
    k.tone('sine', 150, 46, 0.26, 0.85);
    k.tone('triangle', 300, 100, 0.13, 0.24);
    k.noise('lowpass', 500, 0.09, 0.3, { offset: 0.1 });
    k.noise('bandpass', 2000, 0.05, 0.35, { offset: 0.3 });
  },
  // 肉厚: 重めに、斬った肉の湿った裂け（1.2kHz→500Hz に下がるノイズ）を足す
  flesh(ctx, out) {
    const k = kit(ctx, out);
    k.tone('sine', 170, 52, 0.21, 0.8);
    k.tone('triangle', 340, 115, 0.1, 0.22);
    k.noise('lowpass', 600, 0.08, 0.28, { offset: 0.1 });
    k.noise('bandpass', 1200, 0.11, 0.3, { q: 2, f1: 500, at: 0.004, offset: 0.5 });
    k.noise('bandpass', 2200, 0.04, 0.3, { offset: 0.3 });
  },
  // 締め: 短く硬い。連打向けに余韻を一番短くし、アタックを強める
  punch(ctx, out) {
    const k = kit(ctx, out);
    k.tone('sine', 180, 60, 0.1, 0.7);
    k.tone('triangle', 360, 140, 0.06, 0.25);
    k.noise('lowpass', 700, 0.05, 0.25, { offset: 0.1 });
    k.noise('bandpass', 2500, 0.04, 0.42, { offset: 0.3 });
  },
};

// 敵へのヒット音の候補（音声ファイルは public/assets/sfx/hit/）。gain は合成音とだいたい同じ大きさになる初期値
//   click: 今の合成音のアタック（2kHz あたりのノイズ）を重ねる量。低音だけの音の輪郭を出す
//   「より低く重く」は低音だけで聞き取りにくいので、80Hz 以下を削り、倍音とアタックを少し足しておく（250Hz 以上が約 +10dB、全体の大きさは約 +2dB）
export const HIT_SOUNDS = [
  { id: 'retake2', name: '撮り直し2', url: 'assets/sfx/hit/retake2.mp3', gain: 0.5, trim: 0, lowCut: 0, drive: 0, click: 0 },
  { id: 'heavyFleshV2', name: '2回目A', url: 'assets/sfx/hit/heavy-flesh-v2.mp3', gain: 0.5, trim: 0, lowCut: 0, drive: 0, click: 0 },
  { id: 'deeper', name: 'より低く重く', url: 'assets/sfx/hit/deeper.mp3', gain: 0.8, trim: 0, lowCut: 80, drive: 0.2, click: 0.5 },
  { id: 'tight', name: '締まった', url: 'assets/sfx/hit/tight.mp3', gain: 0.5, trim: 0, lowCut: 0, drive: 0, click: 0 },
  // 自作（synth のレシピを鳴らす前に音にする。ファイルなし）
  { id: 'synthHeavy', name: '自作・重め', synth: 'heavy', gain: 0.8, trim: 0, lowCut: 0, drive: 0, click: 0 },
  { id: 'synthFlesh', name: '自作・肉厚', synth: 'flesh', gain: 0.8, trim: 0, lowCut: 0, drive: 0, click: 0 },
  { id: 'synthPunch', name: '自作・締め', synth: 'punch', gain: 0.8, trim: 0, lowCut: 0, drive: 0, click: 0 },
];
