// 手続き生成オーディオ: BGM / 環境音 / 効果音 すべて WebAudio で合成
const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export class AudioEngine {
  constructor() { this.ctx = null; this.song = null; this.amb = null; this.step = 0; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.level('music'); this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.level('sfx'); this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain(); this.ambBus.gain.value = this.level('amb'); this.ambBus.connect(this.master);
    this.master.gain.value = this.level('master');

    // リバーブ（生成インパルス）
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 3, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.reverb.buffer = ir;
    this.revSend = ctx.createGain(); this.revSend.gain.value = 0.5;
    this.revSend.connect(this.reverb).connect(this.master);
    // ディレイ
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = 0.375;
    const fb = ctx.createGain(); fb.gain.value = 0.35;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2500;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    this.delaySend = ctx.createGain(); this.delaySend.gain.value = 0.3;
    this.delaySend.connect(this.delay); dl.connect(this.revSend); dl.connect(this.musicBus);

    // ノイズバッファ
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;
    const bb = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const bd = bb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bd.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    this.brown = bb;

    this.nextTime = ctx.currentTime + 0.1;
    setInterval(() => this.schedule(), 25);
    setInterval(() => this.ambientEvents(), 200);
  }

  // 音量設定（0〜1）。各バスの基準値に掛け合わせる
  level(k) {
    const base = { master: 0.8, music: 0.42, sfx: 0.7, amb: 0.5 }[k];
    const v = this.vol?.[k] ?? 1;
    return base * v * (k === 'master' && this.muted ? 0 : 1);
  }
  setVolumes(vol) {
    this.vol = { ...vol };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.level('master'), t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.level('music'), t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.level('sfx'), t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.level('amb'), t, 0.05);
  }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(this.level('master'), this.ctx.currentTime, 0.05); }

  // ===================== BGM =====================
  setMusic(cfg, boss = false) {
    if (!this.ctx) return;
    const key = JSON.stringify(cfg) + boss;
    if (this.songKey === key) return;
    this.songKey = key;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setTargetAtTime(0, t, 0.25);
    setTimeout(() => {
      this.song = this.makeSong(cfg, boss);
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.05;
      this.musicBus.gain.setTargetAtTime(this.level('music'), this.ctx.currentTime, 0.4);
    }, 900);
  }

  makeSong(cfg, boss) {
    const r = rng(cfg.root * 31 + cfg.bpm * 7 + (boss ? 999 : 0));
    const scale = MODES[boss ? (cfg.mode === 'major' || cfg.mode === 'lydian' ? 'minor' : cfg.mode) : cfg.mode];
    const prog = boss ? [0, 5, 3, 6] : cfg.prog;
    // メロディのモチーフ（2小節 × 2 バリエーション）
    const motif = [];
    let deg = 4;
    for (let i = 0; i < 32; i++) {
      const rest = r() < (boss ? 0.35 : 0.5);
      if (!rest) deg = Math.max(0, Math.min(11, deg + Math.floor(r() * 5) - 2));
      motif.push(rest ? null : { deg, len: r() < 0.3 ? 4 : 2 });
    }
    const arpPat = Array.from({ length: 16 }, () => Math.floor(r() * 4));
    return { cfg, boss, scale, prog, motif, arpPat, bpm: boss ? Math.max(132, cfg.bpm + 46) : cfg.bpm, root: cfg.root, feel: cfg.feel };
  }

  noteOf(song, degree, octave = 0) {
    const s = song.scale;
    const o = Math.floor(degree / 7);
    const d = ((degree % 7) + 7) % 7;
    return song.root + s[d] + (o + octave) * 12;
  }

  schedule() {
    if (!this.song || !this.ctx) return;
    const s = this.song;
    const spb = 60 / s.bpm / 4; // 16分
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.playStep(s, this.step, this.nextTime, spb);
      this.step++;
      this.nextTime += spb;
    }
  }

  playStep(s, step, t, spb) {
    const bar = Math.floor(step / 16) % s.prog.length;
    const b16 = step % 16;
    const chordDeg = s.prog[bar];
    const chord = [chordDeg, chordDeg + 2, chordDeg + 4];
    const boss = s.boss;

    // パッド
    if (b16 === 0) {
      for (const d of chord) this.pad(mtof(this.noteOf(s, d, 0)), t, spb * 16, boss ? 0.035 : 0.05, boss ? 1400 : 900);
    }
    // ベース
    if (boss) {
      if (b16 % 2 === 0) this.bass(mtof(this.noteOf(s, chordDeg, -2) + (b16 % 8 === 6 ? 12 : 0)), t, spb * 1.6, 0.22);
    } else if (b16 === 0 || b16 === 10) {
      this.bass(mtof(this.noteOf(s, chordDeg, -2)), t, spb * 6, 0.16);
    }
    // アルペジオ
    const arpOn = boss ? true : (b16 % 2 === 0);
    if (arpOn) {
      const idx = s.arpPat[b16];
      const deg = chord[idx % 3] + (idx === 3 ? 7 : 0);
      this.pluck(mtof(this.noteOf(s, deg, 1)), t, boss ? 0.045 : 0.05, s.feel === 'crystal' || s.feel === 'holy' ? 'sine' : 'triangle');
    }
    // メロディ（8分単位）
    if (b16 % 2 === 0) {
      const mi = (Math.floor(step / 2) % 32);
      const half = Math.floor(step / 64) % 2;
      const n = s.motif[(mi + half * 3) % 32];
      if (n && (Math.floor(step / 128) % 2 === 1 || boss)) {
        this.bell(mtof(this.noteOf(s, chordDeg + n.deg - 4 + 7, 1)), t, spb * n.len * 2, boss ? 0.06 : 0.07);
      }
    }
    // ドラム
    if (boss) {
      if (b16 % 4 === 0 || b16 === 14) this.kick(t, 0.5);
      if (b16 === 4 || b16 === 12) this.snare(t, 0.25);
      if (b16 % 2 === 0) this.hat(t, b16 % 4 === 2 ? 0.08 : 0.04);
      if (b16 === 0 && bar === 0) this.crash(t);
    } else if (s.feel === 'drive' || s.feel === 'heavy' || s.feel === 'exotic') {
      if (b16 === 0 || b16 === 8) this.kick(t, 0.25);
      if (b16 % 4 === 2) this.hat(t, 0.03);
      if (s.feel === 'exotic' && (b16 === 6 || b16 === 11)) this.tom(t, 0.12);
    } else if (b16 === 0 && bar % 2 === 0) {
      this.kick(t, 0.12);
    }
  }

  env(g, t, a, peak, dur, rel) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, dur) + rel);
  }

  pad(f, t, dur, vol, cut) {
    const ctx = this.ctx, g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = cut; lp.Q.value = 0.5;
    for (const det of [-8, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 1.6);
    }
    lp.connect(g); g.connect(this.musicBus); g.connect(this.revSend);
    this.env(g, t, 0.8, vol, dur - 0.6, 1.4);
  }

  bass(f, t, dur, vol) {
    const ctx = this.ctx, g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f / 2;
    o.connect(lp); o2.connect(g); lp.connect(g); g.connect(this.musicBus);
    o.start(t); o2.start(t); o.stop(t + dur + 0.3); o2.stop(t + dur + 0.3);
    this.env(g, t, 0.01, vol, dur * 0.5, dur * 0.5);
  }

  pluck(f, t, vol, type = 'triangle') {
    const ctx = this.ctx, g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(4000, t); lp.frequency.exponentialRampToValueAtTime(600, t + 0.3);
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    o.connect(lp).connect(g); g.connect(this.musicBus); g.connect(this.delaySend);
    o.start(t); o.stop(t + 0.5);
    this.env(g, t, 0.005, vol, 0.01, 0.35);
  }

  bell(f, t, dur, vol) {
    const ctx = this.ctx, g = ctx.createGain();
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.01;
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2).connect(g);
    g.connect(this.musicBus); g.connect(this.revSend); g.connect(this.delaySend);
    o.start(t); o2.start(t); o.stop(t + dur + 1); o2.stop(t + dur + 1);
    this.env(g, t, 0.01, vol, 0.02, Math.max(0.4, dur));
  }

  kick(t, vol) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    o.connect(g).connect(this.musicBus);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.start(t); o.stop(t + 0.32);
  }

  noiseHit(t, vol, type, freq, dur, bus = this.musicBus, q = 1, buf = this.noise) {
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = buf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    s.connect(f).connect(g).connect(bus);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
    return { s, f, g };
  }
  snare(t, vol) { this.noiseHit(t, vol, 'bandpass', 1800, 0.18); this.tom(t, vol * 0.5, 190); }
  hat(t, vol) { this.noiseHit(t, vol, 'highpass', 7000, 0.05); }
  crash(t) { const n = this.noiseHit(t, 0.12, 'highpass', 4000, 1.5); n.g.connect(this.revSend); }
  tom(t, vol, f = 120) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.15);
    o.connect(g).connect(this.musicBus);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.start(t); o.stop(t + 0.3);
  }

  // ===================== 環境音 =====================
  setAmbient(kind) {
    if (!this.ctx || this.ambKind === kind) return;
    this.ambKind = kind;
    this.fadeOut(this.amb);
    const { g, nodes, bed, drone } = this.layer();
    switch (kind) {
      case 'meadow': bed(this.noise, 'bandpass', 500, 0.05, 0.08, 250); break;
      case 'forest': bed(this.noise, 'bandpass', 380, 0.06, 0.06, 200); bed(this.brown, 'lowpass', 300, 0.1); break;
      case 'desert': bed(this.noise, 'bandpass', 900, 0.08, 0.12, 600); break;
      case 'cave': bed(this.brown, 'lowpass', 200, 0.12); drone(55, 0.02); break;
      case 'lava': bed(this.brown, 'lowpass', 120, 0.35, 0.05, 40); bed(this.noise, 'highpass', 3000, 0.008); break;
      case 'snow': bed(this.noise, 'bandpass', 1200, 0.07, 0.1, 800); bed(this.noise, 'highpass', 6000, 0.01); break;
      case 'underwater': bed(this.brown, 'lowpass', 250, 0.25, 0.07, 120); drone(73, 0.015); break;
      case 'storm': bed(this.noise, 'bandpass', 700, 0.12, 0.15, 500); bed(this.noise, 'lowpass', 2500, 0.04); break;
      case 'void': drone(41, 0.04); drone(61.7, 0.02); bed(this.brown, 'lowpass', 150, 0.08); break;
      case 'heaven': drone(196, 0.008); drone(293.7, 0.006); bed(this.noise, 'bandpass', 600, 0.03, 0.05, 200); break;
    }
    this.amb = { g, nodes };
  }

  // 天候の音（環境音に重ねる）: 雨・霧・砂嵐
  setWeather(kind) {
    if (!this.ctx || this.wxKind === kind) return;
    this.wxKind = kind;
    this.fadeOut(this.wx);
    this.wx = null;
    if (!kind) return;
    const { g, nodes, bed, drone } = this.layer();
    switch (kind) {
      case 'rain': bed(this.noise, 'highpass', 3200, 0.05); bed(this.noise, 'bandpass', 1300, 0.07, 0.09, 400); bed(this.brown, 'lowpass', 420, 0.1); break;
      case 'fog': bed(this.brown, 'lowpass', 180, 0.12, 0.04, 60); drone(82.4, 0.008); drone(123.5, 0.005); break;
      case 'sandstorm': bed(this.noise, 'bandpass', 800, 0.16, 0.2, 500); bed(this.noise, 'highpass', 4500, 0.03, 0.3, 1500); bed(this.brown, 'lowpass', 160, 0.14); break;
    }
    this.wx = { g, nodes };
  }

  fadeOut(layer) {
    if (!layer) return;
    layer.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    setTimeout(() => layer.nodes.forEach((n) => { try { n.stop(); } catch { /* */ } }), 3000);
  }

  // ループする音の層を作る（bed: 雑音を濾波、drone: うなり）
  layer() {
    const t = this.ctx.currentTime;
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.value = 0; g.connect(this.ambBus);
    g.gain.setTargetAtTime(1, t + 0.5, 1);
    const nodes = [];
    const bed = (buf, type, freq, vol, lfoRate, lfoAmt) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const vg = ctx.createGain(); vg.gain.value = vol;
      s.connect(f).connect(vg).connect(g);
      if (lfoRate) {
        const l = ctx.createOscillator(); l.frequency.value = lfoRate;
        const lg = ctx.createGain(); lg.gain.value = lfoAmt;
        l.connect(lg).connect(f.frequency); l.start(); nodes.push(l);
        const l2 = ctx.createOscillator(); l2.frequency.value = lfoRate * 0.71;
        const lg2 = ctx.createGain(); lg2.gain.value = vol * 0.6;
        l2.connect(lg2).connect(vg.gain); l2.start(); nodes.push(l2);
      }
      s.start(); nodes.push(s);
    };
    const drone = (f, vol) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 1.005;
      const vg = ctx.createGain(); vg.gain.value = vol;
      o.connect(vg); o2.connect(vg); vg.connect(g); vg.connect(this.revSend);
      o.start(); o2.start(); nodes.push(o, o2);
    };
    return { g, nodes, bed, drone };
  }

  ambientEvents() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05, k = this.ambKind, w = this.wxKind, R = Math.random;
    // 天候の音: 雨は時々遠雷と雨だれ、霧はかすかな風、砂嵐は強い突風
    if (w === 'rain' && R() < 0.006) this.thunder(t, 0.25);
    if (w === 'rain' && R() < 0.2) this.drip(t);
    if (w === 'fog' && R() < 0.02) this.whisper(t);
    if (w === 'sandstorm' && R() < 0.08) this.gust(t);
    if (!k) return;
    if ((k === 'meadow' && R() < 0.12) || (k === 'forest' && R() < 0.07) || (k === 'heaven' && R() < 0.03)) this.bird(t);
    if (k === 'forest' && R() < 0.04) this.owl(t);
    if ((k === 'cave' && R() < 0.12) || (k === 'underwater' && R() < 0.06)) this.drip(t);
    if ((k === 'cave' || k === 'heaven') && R() < 0.05) this.chime(t);
    if (k === 'lava' && R() < 0.15) this.crackle(t);
    if (k === 'lava' && R() < 0.02) this.rumble(t);
    if (k === 'storm' && R() < 0.012) this.thunder(t, 0.4);
    if (k === 'underwater' && R() < 0.1) this.bubble(t);
    if (k === 'void' && R() < 0.03) this.whisper(t);
    if ((k === 'meadow' || k === 'desert' || k === 'snow') && R() < 0.02) this.gust(t);
  }

  amp(t, vol, a, d) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    return g;
  }
  pan(x) { const p = this.ctx.createStereoPanner(); p.pan.value = x; return p; }

  bird(t) {
    const n = 2 + Math.floor(Math.random() * 4), base = 2500 + Math.random() * 2000, p = this.pan(Math.random() * 2 - 1);
    p.connect(this.ambBus); p.connect(this.revSend);
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.08 + Math.random() * 0.06);
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(base, tt); o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.5), tt + 0.06);
      const g = this.amp(tt, 0.025, 0.01, 0.07);
      o.connect(g).connect(p); o.start(tt); o.stop(tt + 0.1);
    }
  }
  owl(t) {
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.45, o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(420, tt); o.frequency.linearRampToValueAtTime(380, tt + 0.3);
      const g = this.amp(tt, 0.03, 0.08, 0.3); o.connect(g); g.connect(this.ambBus); g.connect(this.revSend);
      o.start(tt); o.stop(tt + 0.45);
    }
  }
  drip(t) {
    const o = this.ctx.createOscillator(), f = 900 + Math.random() * 900;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.05);
    const g = this.amp(t, 0.05, 0.003, 0.08), p = this.pan(Math.random() * 2 - 1);
    o.connect(g).connect(p); p.connect(this.ambBus); p.connect(this.revSend);
    o.start(t); o.stop(t + 0.12);
  }
  chime(t) {
    const base = [1568, 1760, 2093, 2349, 2637][Math.floor(Math.random() * 5)];
    const o = this.ctx.createOscillator(); o.frequency.value = base;
    const g = this.amp(t, 0.02, 0.005, 2.0); o.connect(g); g.connect(this.revSend); g.connect(this.ambBus);
    o.start(t); o.stop(t + 2.1);
  }
  crackle(t) { for (let i = 0; i < 3; i++) this.noiseHit(t + Math.random() * 0.15, 0.04, 'highpass', 2000 + Math.random() * 3000, 0.02, this.ambBus); }
  rumble(t) { const n = this.noiseHit(t, 0.0001, 'lowpass', 90, 2.5, this.ambBus, 1, this.brown); n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(0.0001, t); n.g.gain.exponentialRampToValueAtTime(0.5, t + 0.6); n.g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5); }
  thunder(t, vol) {
    const n = this.noiseHit(t, vol, 'lowpass', 600, 3, this.ambBus, 1, this.brown);
    n.f.frequency.exponentialRampToValueAtTime(80, t + 2.5); n.g.connect(this.revSend);
    this.noiseHit(t, vol * 0.5, 'highpass', 1500, 0.3, this.ambBus);
  }
  bubble(t) {
    const o = this.ctx.createOscillator(), f = 300 + Math.random() * 500;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 3, t + 0.1);
    const g = this.amp(t, 0.03, 0.01, 0.1); o.connect(g).connect(this.ambBus); o.start(t); o.stop(t + 0.15);
  }
  whisper(t) { const n = this.noiseHit(t, 0.0001, 'bandpass', 1200 + Math.random() * 1500, 1.5, this.ambBus, 8); n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(0.0001, t); n.g.gain.exponentialRampToValueAtTime(0.06, t + 0.7); n.g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5); n.g.connect(this.revSend); }
  gust(t) { const n = this.noiseHit(t, 0.0001, 'bandpass', 600, 3, this.ambBus, 2); n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(0.0001, t); n.g.gain.exponentialRampToValueAtTime(0.1, t + 1.2); n.g.gain.exponentialRampToValueAtTime(0.0001, t + 3); n.f.frequency.linearRampToValueAtTime(1100, t + 1.5); }

  // ===================== 効果音 =====================
  sfx(name, opt = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.005, B = this.sfxBus;
    const tone = (type, f0, f1, dur, vol, at = 0, dest = B) => {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t + at); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      const g = this.amp(t + at, vol, 0.005, dur); o.connect(g).connect(dest);
      o.start(t + at); o.stop(t + at + dur + 0.05); return g;
    };
    switch (name) {
      case 'swing': {
        const n = this.noiseHit(t, 0.0001, 'bandpass', 900, 0.22, B, 2);
        n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(0.0001, t);
        n.g.gain.exponentialRampToValueAtTime(opt.heavy ? 0.5 : 0.3, t + 0.05); n.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        n.f.frequency.exponentialRampToValueAtTime(opt.heavy ? 500 : 2500, t + 0.15);
        break;
      }
      case 'hit':
        tone('sine', 220, 70, 0.12, 0.5);
        this.noiseHit(t, 0.35, 'bandpass', opt.crit ? 3500 : 2000, 0.08, B);
        if (opt.crit) { const g = tone('triangle', 1800, 1200, 0.25, 0.12); g.connect(this.revSend); tone('square', 900, 400, 0.1, 0.08); }
        break;
      case 'skill': {
        const g = tone('sawtooth', 300, 1200, 0.3, 0.12); g.connect(this.revSend);
        tone('sine', 600, 2400, 0.25, 0.15, 0.02).connect(this.delaySend);
        this.noiseHit(t, 0.3, 'highpass', 2500, 0.3, B);
        break;
      }
      case 'dodge': this.noiseHit(t, 0.25, 'bandpass', 1400, 0.18, B, 1.5).f.frequency.exponentialRampToValueAtTime(400, t + 0.18); break;
      case 'perfect': {
        [1318, 1760, 2637].forEach((f, i) => tone('sine', f, 0, 0.5, 0.12, i * 0.04).connect(this.revSend));
        break;
      }
      case 'hurt': tone('sawtooth', 200, 90, 0.18, 0.25); this.noiseHit(t, 0.3, 'lowpass', 900, 0.15, B); break;
      case 'block': tone('triangle', 1200, 1100, 0.4, 0.2).connect(this.revSend); break;
      case 'telegraph': tone('square', 180, 140, 0.12, 0.05); break;
      case 'impact': {
        tone('sine', 120, 35, 0.4, 0.5);
        const n = this.noiseHit(t, 0.35, 'lowpass', 1200, 0.5, B); n.f.frequency.exponentialRampToValueAtTime(100, t + 0.5);
        break;
      }
      case 'thunder': this.noiseHit(t, 0.5, 'highpass', 1500, 0.25, B); tone('sawtooth', 90, 40, 0.5, 0.3); break;
      case 'wave': tone('sine', 900, 300, 0.35, 0.15).connect(this.delaySend); this.noiseHit(t, 0.15, 'bandpass', 3000, 0.3, B, 3); break;
      case 'flame': this.noiseHit(t, 0.2, 'lowpass', 1500, 0.3, B); break;
      case 'mobdie': tone('square', 500, 120, 0.22, 0.08); this.noiseHit(t, 0.2, 'bandpass', 1200, 0.25, B); break;
      case 'levelup': {
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone('triangle', mtof(72 + s), 0, 0.5, 0.1, i * 0.06).connect(this.revSend));
        [0, 4, 7].forEach((s) => tone('sine', mtof(60 + s), 0, 1.6, 0.06, 0.4).connect(this.revSend));
        break;
      }
      case 'drop': {
        // 地面に落ちた音（物の種類で変わる）＋ レア度の合図（上がるほど目立つ）
        const r = opt.rarity || 0;
        if (opt.slot) {
          if (opt.slot === 'weapon') { // 金属: 非整数倍の倍音でガシャン
            this.noiseHit(t, 0.22, 'bandpass', 2600, 0.06, B, 1.2);
            for (const [k, v] of [[1, 0.06], [2.76, 0.035], [5.4, 0.02], [8.9, 0.01]]) tone('sine', 520 * k, 0, 0.18 + 0.1 / k, v);
            tone('sine', 140, 70, 0.1, 0.12);
          } else if (opt.slot === 'armor') { // 革・布: 低いドサッ
            this.noiseHit(t, 0.3, 'lowpass', 700, 0.14, B, 0.8);
            tone('sine', 110, 55, 0.14, 0.18);
          } else if (opt.slot === 'title') { // 紙: パサッ
            this.noiseHit(t, 0.12, 'highpass', 3000, 0.09, B);
            this.noiseHit(t + 0.05, 0.08, 'bandpass', 1800, 0.06, B);
          } else { // 装飾品: 小さくチリン
            for (const [k, v] of [[1, 0.05], [2.76, 0.025]]) tone('sine', 1900 * k, 0, 0.22, v);
            this.noiseHit(t, 0.06, 'highpass', 5000, 0.04, B);
          }
          if (r === 1) tone('sine', mtof(84), 0, 0.25, 0.035, 0.04);
          else if (r === 2) [0, 7].forEach((s, i) => tone('sine', mtof(81 + s), 0, 0.45, 0.06, 0.04 + i * 0.07).connect(this.revSend));
          else if (r === 3) [0, 4, 7, 12].forEach((s, i) => tone('triangle', mtof(79 + s), 0, 0.6, 0.06, 0.04 + i * 0.06).connect(this.revSend));
          // レアなほど「キーン」と高く澄んだ音が長く響く（少しずらした2音のうなりできらめかせる）
          const kiin = (f, dur, vol, at = 0.05) => { tone('sine', f, 0, dur, vol, at).connect(this.revSend); tone('sine', f * 1.004, 0, dur, vol * 0.8, at); tone('sine', f * 2.01, 0, dur * 0.6, vol * 0.25, at); };
          if (r === 3) kiin(2793, 0.7, 0.025, 0.2);
          if (r === 4) kiin(3136, 1.3, 0.04, 0.15);
          if (r === 5) { kiin(4186, 2.4, 0.055, 0.1); kiin(3520, 1.8, 0.03, 0.16); }
          if (r <= 3) break;
        }
        if (r <= 1) tone('sine', 880, 1320, 0.12, 0.08);
        else if (r <= 3) { [0, 7, 12].forEach((s, i) => tone('sine', mtof(76 + s + r), 0, 0.4, 0.08, i * 0.05).connect(this.revSend)); }
        else {
          // 伝説・神器: 重厚な和音 + キラキラ
          const root = r === 5 ? 57 : 60;
          tone('sine', 55, 0, 2.5, 0.35);
          [0, 7, 12, 16, 19].forEach((s) => this.pad(mtof(root + s), t, 1.2, r === 5 ? 0.06 : 0.04, 2400));
          for (let i = 0; i < 14; i++) tone('sine', mtof(84 + [0, 4, 7, 11, 12, 16, 19][i % 7] + (i > 6 ? 12 : 0)), 0, 0.6, 0.05, 0.25 + i * 0.07).connect(this.revSend);
          if (r === 5) { const n = this.noiseHit(t, 0.4, 'highpass', 5000, 2.5, B); n.g.connect(this.revSend); }
        }
        break;
      }
      // 落とし物が飛び出す（ポコッ）
      case 'lootpop': tone('sine', 260 + Math.random() * 60, 620, 0.09, 0.12); this.noiseHit(t, 0.05, 'bandpass', 900, 0.05, B, 2); break;
      case 'pickup': tone('sine', 1320, 1760, 0.08, 0.08); tone('sine', 1760, 2200, 0.1, 0.06, 0.06); break;
      // 硬貨: 金属らしい非整数倍の倍音を短く重ねる（チャリン）
      case 'coin': {
        const f = 2400 + Math.random() * 900;
        for (const [k, v] of [[1, 0.05], [2.76, 0.025], [5.4, 0.012]]) tone('sine', f * k, 0, 0.09 + Math.random() * 0.05, v * (opt.vol ?? 1));
        break;
      }
      // 硬貨がばらまかれる（チャリチャリ…）
      case 'coins': {
        const n = Math.min(10, 3 + (opt.n || 4));
        for (let i = 0; i < n; i++) {
          const f = 2200 + Math.random() * 1400, at = i * 0.045 + Math.random() * 0.03;
          for (const [k, v] of [[1, 0.035], [2.76, 0.018]]) tone('sine', f * k, 0, 0.08, v, at);
        }
        break;
      }
      // 金貨袋: ずしっとした音＋たくさんの硬貨
      case 'bag': {
        this.noiseHit(t, 0.25, 'lowpass', 600, 0.15, B);
        tone('triangle', 180, 90, 0.15, 0.12);
        for (let i = 0; i < 9; i++) { const f = 2000 + Math.random() * 1600; tone('sine', f, 0, 0.1, 0.03, 0.05 + i * 0.035); tone('sine', f * 2.76, 0, 0.07, 0.015, 0.05 + i * 0.035); }
        [0, 4, 7, 12].forEach((s, i) => tone('sine', mtof(84 + s), 0, 0.3, 0.035, 0.25 + i * 0.06).connect(this.revSend));
        break;
      }
      case 'potion': [600, 800, 1000, 1300].forEach((f, i) => tone('sine', f, f * 1.2, 0.12, 0.07, i * 0.05)); break;
      case 'roar': {
        const g = tone('sawtooth', 160, 45, 1.4, 0.35); g.connect(this.revSend);
        tone('sawtooth', 163, 46, 1.4, 0.25).connect(this.revSend);
        const n = this.noiseHit(t, 0.4, 'lowpass', 1500, 1.5, B); n.f.frequency.exponentialRampToValueAtTime(200, t + 1.4);
        break;
      }
      case 'clear': {
        const seq = [[0, 4, 7], [5, 9, 12], [7, 11, 14], [12, 16, 19, 24]];
        seq.forEach((ch, i) => ch.forEach((s) => tone('square', mtof(64 + s), 0, i === 3 ? 1.8 : 0.3, 0.05, i * 0.22).connect(this.revSend)));
        break;
      }
      case 'death': [0, -3, -7, -12].forEach((s, i) => tone('triangle', mtof(64 + s), 0, 0.6, 0.1, i * 0.25).connect(this.revSend)); break;
      case 'warp': {
        const g = tone('sine', 200, 1600, 1.2, 0.15); g.connect(this.revSend);
        this.noiseHit(t, 0.2, 'bandpass', 2000, 1.2, B, 4).f.frequency.exponentialRampToValueAtTime(6000, t + 1.2);
        break;
      }
      case 'charge': tone('sine', 300 + (opt.lv || 0) * 200, 600 + (opt.lv || 0) * 300, 0.25, 0.06).connect(this.revSend); break;
      case 'charged': [0, 7, 12].forEach((s, i) => tone('triangle', mtof(79 + s), 0, 0.25, 0.08, i * 0.03).connect(this.revSend)); break;
      case 'heavy': {
        tone('sine', 140, 40, 0.45, 0.5);
        const n = this.noiseHit(t, 0.45, 'lowpass', 2500, 0.4, B); n.f.frequency.exponentialRampToValueAtTime(200, t + 0.4);
        break;
      }
      case 'buff': [0, 4, 7, 11].forEach((s, i) => tone('sine', mtof(72 + s), 0, 0.5, 0.07, i * 0.05).connect(this.revSend)); break;
      case 'phase': {
        tone('sawtooth', 60, 220, 1.6, 0.3).connect(this.revSend);
        tone('sawtooth', 61, 223, 1.6, 0.2).connect(this.revSend);
        this.noiseHit(t, 0.4, 'lowpass', 600, 1.8, B);
        break;
      }
      case 'ui': tone('sine', 1000, 0, 0.05, 0.05); break;
      case 'equip': this.noiseHit(t, 0.2, 'bandpass', 4000, 0.06, B, 3); tone('triangle', 700, 0, 0.1, 0.06, 0.03); break;
      case 'step': this.noiseHit(t, 0.03, 'lowpass', 500 + Math.random() * 300, 0.05, B); break;
      case 'enrage': tone('sawtooth', 80, 160, 1.0, 0.3).connect(this.revSend); this.noiseHit(t, 0.3, 'lowpass', 800, 1.0, B); break;
    }
  }
}
