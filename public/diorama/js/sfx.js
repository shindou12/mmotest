// 効果音は WebAudio の発振器とフィルターだけで作る。
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (from, to, amount) => from + (to - from) * amount;
const MASTER_GAIN = 0.8;
const AUDIO_GAIN = 5.5;
const SURFACE_GAIN = 2.25;
const AMBIENCE_GAIN = 0.64;
const TOGGLE_FADE_SECONDS = 0.15;
const AMBIENCE = {
  meadow: { low: 112, high: 6800, band: 920, gain: 0.08, bandGain: 0.055, lowGain: 0.014, mod: 250, rate: 0.075, notes: ['bird-a', 'bird-b'], delay: 3900 },
  desert: { low: 74, high: 5000, band: 430, gain: 0.078, bandGain: 0.055, lowGain: 0.014, mod: 115, rate: 0.035, notes: ['sand-flow'], delay: 4800 },
  snow: { low: 56, high: 3700, band: 240, gain: 0.078, bandGain: 0.058, lowGain: 0.014, mod: 72, rate: 0.025, notes: ['distant-wind'], delay: 5200 },
  volcano: { low: 48, high: 3200, band: 210, gain: 0.072, bandGain: 0.052, lowGain: 0.014, mod: 58, rate: 0.045, notes: ['bubble'], delay: 3400 },
  sky: { low: 164, high: 7600, band: 1280, gain: 0.075, bandGain: 0.052, lowGain: 0.013, mod: 320, rate: 0.055, notes: ['crystal'], delay: 5100 },
};

const SURFACES = {
  grass: { freq: 88, high: 1550, wave: 'sine', thump: 0.078, scrape: 0.028, duration: 0.12, filter: 'bandpass', q: 0.55 },
  turf: { freq: 84, high: 1350, wave: 'sine', thump: 0.078, scrape: 0.026, duration: 0.12, filter: 'bandpass', q: 0.62 },
  dirt: { freq: 82, high: 760, wave: 'sine', thump: 0.082, scrape: 0.031, duration: 0.17, filter: 'bandpass', q: 0.48 },
  sand: { freq: 86, high: 920, wave: 'sine', thump: 0.076, scrape: 0.034, duration: 0.24, filter: 'bandpass', q: 0.45 },
  sandstone: { freq: 89, high: 690, wave: 'sine', thump: 0.078, scrape: 0.03, duration: 0.15, filter: 'bandpass', q: 0.55 },
  stone: { freq: 104, high: 2450, wave: 'triangle', thump: 0.088, scrape: 0.035, duration: 0.034, filter: 'bandpass', q: 1.4 },
  basalt: { freq: 96, high: 1820, wave: 'triangle', thump: 0.085, scrape: 0.032, duration: 0.045, filter: 'bandpass', q: 1.15 },
  rock: { freq: 98, high: 2050, wave: 'triangle', thump: 0.084, scrape: 0.033, duration: 0.042, filter: 'bandpass', q: 1.2 },
  snow: { freq: 72, high: 330, wave: 'sine', thump: 0.078, scrape: 0.03, duration: 0.16, filter: 'bandpass', q: 0.72 },
  ice: { freq: 78, high: 520, wave: 'sine', thump: 0.074, scrape: 0.028, duration: 0.12, filter: 'bandpass', q: 0.85 },
  wood: { freq: 92, high: 620, wave: 'sine', thump: 0.084, scrape: 0.03, duration: 0.085, filter: 'lowpass', q: 0.7 },
  bark: { freq: 90, high: 590, wave: 'sine', thump: 0.082, scrape: 0.03, duration: 0.09, filter: 'lowpass', q: 0.7 },
  planks: { freq: 94, high: 650, wave: 'sine', thump: 0.084, scrape: 0.03, duration: 0.08, filter: 'lowpass', q: 0.7 },
  water: { freq: 90, high: 760, wave: 'sine', thump: 0.076, scrape: 0.03, duration: 0.12, filter: 'bandpass', q: 0.55 },
};

function surfaceProfile(name) {
  const key = String(name || 'grass').toLowerCase();
  for (const [prefix, profile] of Object.entries(SURFACES)) if (key.includes(prefix)) return profile;
  return SURFACES.grass;
}

export function getSurfaceSoundSettings() {
  return Object.fromEntries(Object.entries(SURFACES).map(([material, settings]) => [material, { ...settings }]));
}

export function getSurfaceSoundProfile(name) {
  return { ...surfaceProfile(name) };
}

export class DioramaSfx {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.master = null;
    this.compressor = null;
    this.limiter = null;
    this.convolver = null;
    this.noise = null;
    this.environment = null;
    this.ambienceKind = 'meadow';
    this.birdTimer = 0;
    this.random = Math.random;
    this.flow = null;
    this.flowDistance = Infinity;
    this.flowKind = 'water';
    this.viewBlend = 1;
  }

  unlock() {
    if (!this.enabled) return;
    this._ensureContext();
    if (this.context?.state === 'suspended') this.context.resume().catch(() => {});
    if (!this.environment) this.changeAmbience(this.ambienceKind);
    this._updateFlowAudio();
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (!this.context) {
      if (this.enabled) this.unlock();
      return;
    }
    this._ramp(this.master.gain, this.enabled ? MASTER_GAIN : 0, TOGGLE_FADE_SECONDS);
    if (this.enabled) {
      this.context.resume().catch(() => {});
      if (!this.environment) this.changeAmbience(this.ambienceKind);
      else {
        this._ramp(this.environment.bus.gain, this.environment.targetGain, TOGGLE_FADE_SECONDS);
        this._scheduleNatureNote(this.environment.profile, this.environment.bus);
      }
      this._updateFlowAudio();
    } else {
      clearTimeout(this.birdTimer);
      this.birdTimer = 0;
      if (this.environment) this._ramp(this.environment.bus.gain, 0, TOGGLE_FADE_SECONDS);
      if (this.flow) this._ramp(this.flow.bus.gain, 0, TOGGLE_FADE_SECONDS);
    }
  }

  _ensureContext() {
    if (this.context) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.context = new AudioCtx({ latencyHint: 'interactive' });
    this.master = this.context.createGain();
    this.master.gain.value = this.enabled ? MASTER_GAIN : 0;
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -2;
    this.compressor.knee.value = 0;
    this.compressor.ratio.value = 20;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.08;
    this.limiter = this.context.createWaveShaper();
    const curve = new Float32Array(2049);
    for (let index = 0; index < curve.length; index++) {
      const input = index * 2 / (curve.length - 1) - 1;
      const magnitude = Math.abs(input);
      const output = magnitude <= 0.88 ? magnitude : 0.88 + 0.06 * Math.tanh((magnitude - 0.88) / 0.06);
      curve[index] = Math.sign(input) * output;
    }
    this.limiter.curve = curve;
    this.limiter.oversample = 'none';
    this.master.connect(this.compressor);
    this.compressor.connect(this.limiter);
    this.limiter.connect(this.context.destination);
    this.noise = this._makeNoise();
    this.convolver = this.context.createConvolver();
    this.convolver.buffer = this._makeImpulse();
    const wet = this.context.createGain();
    wet.gain.value = 0.13;
    this.convolver.connect(wet);
    wet.connect(this.master);
  }

  _ramp(param, value, seconds = 0.15) {
    if (!this.context || !param) return;
    const now = this.context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + seconds);
  }

  _makeNoise() {
    const length = Math.floor(this.context.sampleRate * 2);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index++) data[index] = (this.random() * 2 - 1) * 0.6;
    return buffer;
  }

  _makeImpulse() {
    const length = Math.floor(this.context.sampleRate * 0.8);
    const buffer = this.context.createBuffer(2, length, this.context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let index = 0; index < length; index++) {
        const fade = Math.pow(1 - index / length, 3.2);
        data[index] = (this.random() * 2 - 1) * fade * 0.24;
      }
    }
    return buffer;
  }

  _route(gain, wetAmount = 0.1) {
    gain.connect(this.master);
    if (wetAmount > 0 && this.convolver) {
      const send = this.context.createGain();
      send.gain.value = wetAmount;
      gain.connect(send);
      send.connect(this.convolver);
    }
  }

  setViewBlend(value) {
    const blend = clamp(Number(value) || 0, 0, 1);
    if (!this.context) {
      this.viewBlend = blend;
      return;
    }
    if (Math.abs(blend - this.viewBlend) < 0.035) return;
    this.viewBlend = blend;
    const now = this.context.currentTime;
    if (this.environment) this._applyEnvironmentView(this.environment, now);
    if (this.flow) this._applyFlowView(this.flow, now);
  }

  _applyEnvironmentView(environment, now = this.context?.currentTime || 0) {
    const { profile, filter, bandFilter } = environment;
    const distanceFactor = lerp(0.62, 1, this.viewBlend);
    filter.frequency.setTargetAtTime(profile.high * distanceFactor, now, 0.24);
    bandFilter.frequency.setTargetAtTime(profile.band * lerp(0.8, 1, this.viewBlend), now, 0.24);
  }

  _applyFlowView(flow, now = this.context?.currentTime || 0) {
    const max = flow.kind === 'lava' ? 620 : 1800;
    flow.filter.frequency.setTargetAtTime(max * lerp(0.55, 1, this.viewBlend), now, 0.2);
  }

  setFlowDistance(distance, kind = 'water') {
    this.flowDistance = Number.isFinite(Number(distance)) ? Math.max(0, Number(distance)) : Infinity;
    this.flowKind = kind === 'lava' ? 'lava' : 'water';
    if (!this.enabled || !this.context) return;
    this._updateFlowAudio();
  }

  _updateFlowAudio() {
    if (!this.enabled || !this.context) return;
    const strength = clamp((12 - this.flowDistance) / 12, 0, 1);
    if (strength <= 0 && !this.flow) return;
    if (!this.flow) {
      const bus = this.context.createGain();
      bus.gain.value = 0;
      this._route(bus, 0.08);
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.4;
      const source = this.context.createBufferSource();
      source.buffer = this.noise;
      source.loop = true;
      const volume = this.context.createGain();
      volume.gain.value = 0.48;
      source.connect(filter);
      filter.connect(volume);
      volume.connect(bus);
      source.start();
      this.flow = { bus, filter, source, volume, kind: this.flowKind };
    }
    this.flow.kind = this.flowKind;
    const now = this.context.currentTime;
    this._applyFlowView(this.flow, now);
    const targetGain = 0.48 * strength * strength;
    this._ramp(this.flow.bus.gain, targetGain, 0.18);
  }

  changeAmbience(kind) {
    this.ambienceKind = kind;
    if (!this.enabled || !this.context) return;
    const profile = AMBIENCE[kind] || AMBIENCE.meadow;
    const now = this.context.currentTime;
    const previous = this.environment;
    clearTimeout(this.birdTimer);
    this.birdTimer = 0;

    const bus = this.context.createGain();
    bus.gain.value = 0;
    this._route(bus, 0.035);

    // 下地の風と、ゆっくり動く帯域ノイズを別々に重ねる。
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.45;
    const baseGain = this.context.createGain();
    baseGain.gain.value = profile.gain * AMBIENCE_GAIN * AUDIO_GAIN;
    const noise = this.context.createBufferSource();
    noise.buffer = this.noise;
    noise.loop = true;
    noise.connect(filter);
    filter.connect(baseGain);
    baseGain.connect(bus);

    const bandFilter = this.context.createBiquadFilter();
    bandFilter.type = 'bandpass';
    bandFilter.Q.value = 0.72;
    const bandGain = this.context.createGain();
    bandGain.gain.value = profile.bandGain * AMBIENCE_GAIN * AUDIO_GAIN;
    const bandMod = this.context.createOscillator();
    const bandDepth = this.context.createGain();
    bandMod.frequency.value = profile.rate;
    bandDepth.gain.value = profile.mod;
    bandMod.connect(bandDepth);
    bandDepth.connect(bandFilter.frequency);
    noise.connect(bandFilter);
    bandFilter.connect(bandGain);
    bandGain.connect(bus);

    const lowFilter = this.context.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.value = Math.max(100, profile.low * 2.2);
    const lowTone = this.context.createOscillator();
    lowTone.type = 'sine';
    lowTone.frequency.value = profile.low;
    const toneGain = this.context.createGain();
    toneGain.gain.value = profile.lowGain * AMBIENCE_GAIN * AUDIO_GAIN;
    lowTone.connect(lowFilter);
    lowFilter.connect(toneGain);
    toneGain.connect(bus);

    noise.start();
    bandMod.start();
    lowTone.start();
    const targetGain = 0.82;
    this.environment = { bus, nodes: [noise, bandMod, lowTone], filter, bandFilter, profile, targetGain };
    this._applyEnvironmentView(this.environment, now);
    this._ramp(bus.gain, targetGain, previous ? 0.15 : 0.12);
    if (previous) {
      this._ramp(previous.bus.gain, 0, 0.15);
      window.setTimeout(() => {
        for (const node of previous.nodes) {
          try { node.stop(); } catch { /* すでに停止済み */ }
        }
        previous.bus.disconnect();
      }, 1000);
    }
    this._scheduleNatureNote(profile, bus);
  }

  _scheduleNatureNote(profile, bus) {
    if (!this.enabled || this.environment?.bus !== bus || !profile.notes?.length) return;
    const delay = profile.delay * (0.7 + this.random() * 0.9);
    this.birdTimer = window.setTimeout(() => {
      if (!this.enabled || this.environment?.bus !== bus) return;
      const note = profile.notes[Math.floor(this.random() * profile.notes.length)];
      this.playNatureNote(note);
      this._scheduleNatureNote(profile, bus);
    }, delay);
  }

  playNatureNote(kind) {
    if (!this.enabled || !this.context) return;
    if (kind === 'bird-a') {
      const base = 720 + this.random() * 120;
      this._tone(base, 0.12, 0.045, 'sine', 1.27, 0);
      this._tone(base * 1.32, 0.13, 0.039, 'sine', 0.82, 0.14);
      this._tone(base * 1.62, 0.16, 0.034, 'sine', 0.9, 0.3);
    } else if (kind === 'bird-b') {
      const base = 930 + this.random() * 180;
      this._tone(base, 0.09, 0.04, 'sine', 0.76, 0);
      this._tone(base * 0.78, 0.18, 0.038, 'sine', 1.22, 0.12);
    } else if (kind === 'sand-flow') {
      this._noiseTap(480 + this.random() * 150, 0.72, 0.18, { type: 'bandpass', q: 0.42 });
    } else if (kind === 'distant-wind') {
      this._tone(88 + this.random() * 18, 0.82, 0.062, 'sine', 0.78, 0);
      this._noiseTap(190, 0.7, 0.048, { type: 'lowpass', q: 0.5 });
    } else if (kind === 'bubble') {
      this._tone(70 + this.random() * 24, 0.2, 0.065, 'sine', 0.56, 0);
      this._noiseTap(360, 0.24, 0.052, { type: 'bandpass', q: 0.8 });
    } else if (kind === 'crystal') {
      const base = 760 + this.random() * 300;
      this._tone(base, 0.28, 0.06, 'sine', 1.06, 0);
      this._tone(base * 1.5, 0.42, 0.032, 'sine', 0.96, 0.04);
    }
  }

  _tone(frequency, duration, volume, type = 'sine', endRatio = 1, delay = 0) {
    if (!this.enabled || !this.context || !this.master) return;
    const start = this.context.currentTime + Math.max(0, delay);
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const lowpass = this.context.createBiquadFilter();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency * (0.97 + this.random() * 0.06), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(42, frequency * endRatio), start + duration);
    lowpass.type = 'lowpass';
    lowpass.frequency.value = Math.min(5000, frequency * 2.3);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume * AUDIO_GAIN, start + Math.min(0.018, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(lowpass);
    lowpass.connect(gain);
    this._route(gain, 0.08);
    osc.start(start);
    osc.stop(start + duration + 0.02);
    window.setTimeout(() => { osc.disconnect(); lowpass.disconnect(); gain.disconnect(); }, (duration + delay + 0.2) * 1000);
  }

  _noiseTap(frequency, duration, volume, { type = 'bandpass', q = 0.8 } = {}) {
    if (!this.enabled || !this.context || !this.noise) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    gain.gain.setValueAtTime(Math.max(0.0001, volume * AUDIO_GAIN), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    this._route(gain, 0.06);
    source.start(now, this.random() * 0.8, duration + 0.04);
    source.stop(now + duration + 0.05);
    window.setTimeout(() => { source.disconnect(); filter.disconnect(); gain.disconnect(); }, (duration + 0.2) * 1000);
  }

  footstep(material, water = false, phase = 0) {
    if (!this.enabled) return;
    this._ensureContext();
    if (!this.context) return;
    const profile = surfaceProfile(water ? 'water' : material);
    const sidePitch = Number(phase) % 2 ? 0.96 : 1.04;
    const pitch = sidePitch * (0.99 + this.random() * 0.02);
    this._tone(profile.freq * pitch, 0.085, profile.thump * SURFACE_GAIN, profile.wave, 0.58);
    if (water || String(material).toLowerCase().includes('water')) {
      this._noiseTap(730 + this.random() * 130, 0.1, profile.scrape * SURFACE_GAIN, { type: 'bandpass', q: 0.62 });
      this._tone(430, 0.16, 0.07, 'sine', 0.42, 0.015);
      return;
    }
    this._noiseTap(profile.high * pitch, profile.duration, profile.scrape * SURFACE_GAIN, { type: profile.filter, q: profile.q });
  }

  jump() {
    this._tone(205, 0.16, 0.16, 'sine', 1.62);
  }

  land(fallHeight = 0, material = 'grass') {
    const weight = clamp(1.2 + Math.max(0, fallHeight - 0.5) * 0.035, 1.2, 1.3);
    const profile = surfaceProfile(material);
    this._tone(profile.freq * 0.92, 0.095, profile.thump * weight * SURFACE_GAIN, 'triangle', 0.55);
    this._noiseTap(profile.high * 0.62, 0.07, profile.scrape * 0.62 * weight * SURFACE_GAIN, { type: profile.filter, q: profile.q });
  }

  waterEnter() {
    this._noiseTap(560, 0.15, 0.06, { type: 'bandpass', q: 0.6 });
    this._tone(320, 0.19, 0.068, 'sine', 0.44);
  }

  waterExit() {
    this._noiseTap(1050, 0.13, 0.052, { type: 'bandpass', q: 0.72 });
    this._tone(280, 0.17, 0.06, 'sine', 1.42);
  }

  fallReturn() {
    this._tone(260, 0.22, 0.075, 'sine', 0.52);
    this._tone(390, 0.18, 0.05, 'triangle', 0.74, 0.18);
  }

  lavaReturn() {
    this._tone(118, 0.2, 0.075, 'sine', 0.46);
    this._noiseTap(380, 0.13, 0.052, { type: 'bandpass', q: 0.65 });
  }

  stageSwitch() {
    this._tone(650, 0.16, 0.065, 'sine', 0.62);
    this._tone(390, 0.2, 0.065, 'sine', 1.72, 0.17);
  }
}
