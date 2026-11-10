// 効果音は WebAudio の発振器とフィルターだけで作る。
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const AMBIENCE = {
  meadow: { low: 420, high: 1500, gain: 0.026, mod: 130, rate: 0.08, note: 'bird', delay: 4200 },
  desert: { low: 180, high: 1050, gain: 0.018, mod: 70, rate: 0.035 },
  snow: { low: 125, high: 560, gain: 0.025, mod: 45, rate: 0.025 },
  volcano: { low: 55, high: 380, gain: 0.029, mod: 24, rate: 0.045, note: 'bubble', delay: 3100 },
  sky: { low: 390, high: 1900, gain: 0.018, mod: 170, rate: 0.055, note: 'crystal', delay: 5200 },
};

const SURFACES = {
  grass: { freq: 245, high: 780, wave: 'triangle', gain: 0.046 },
  turf: { freq: 215, high: 670, wave: 'triangle', gain: 0.044 },
  dirt: { freq: 165, high: 620, wave: 'sine', gain: 0.052 },
  sand: { freq: 290, high: 920, wave: 'triangle', gain: 0.042 },
  sandstone: { freq: 195, high: 720, wave: 'sine', gain: 0.045 },
  stone: { freq: 315, high: 1250, wave: 'triangle', gain: 0.048 },
  basalt: { freq: 205, high: 920, wave: 'triangle', gain: 0.044 },
  rock: { freq: 275, high: 1100, wave: 'triangle', gain: 0.044 },
  snow: { freq: 345, high: 980, wave: 'sine', gain: 0.04 },
  ice: { freq: 460, high: 1300, wave: 'sine', gain: 0.033 },
  wood: { freq: 230, high: 850, wave: 'triangle', gain: 0.042 },
  planks: { freq: 225, high: 860, wave: 'triangle', gain: 0.043 },
  water: { freq: 240, high: 520, wave: 'sine', gain: 0.029 },
};

function surfaceProfile(name) {
  const key = String(name || 'grass').toLowerCase();
  for (const [prefix, profile] of Object.entries(SURFACES)) if (key.includes(prefix)) return profile;
  return SURFACES.grass;
}

export class DioramaSfx {
  constructor() {
    this.enabled = true;
    this.context = null;
    this.master = null;
    this.convolver = null;
    this.noise = null;
    this.environment = null;
    this.ambienceKind = 'meadow';
    this.birdTimer = 0;
    this.random = Math.random;
  }

  unlock() {
    if (!this.enabled) return;
    this._ensureContext();
    if (this.context?.state === 'suspended') this.context.resume().catch(() => {});
    if (!this.environment) this.changeAmbience(this.ambienceKind);
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (!this.context) {
      if (this.enabled) this.unlock();
      return;
    }
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.enabled ? 0.38 : 0, now, 0.04);
    if (this.enabled) {
      this.context.resume().catch(() => {});
      this.changeAmbience(this.ambienceKind);
    } else {
      clearTimeout(this.birdTimer);
      this.birdTimer = 0;
      this.environment?.bus.gain.setTargetAtTime(0, now, 0.04);
    }
  }

  _ensureContext() {
    if (this.context) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.context = new AudioCtx({ latencyHint: 'interactive' });
    this.master = this.context.createGain();
    this.master.gain.value = this.enabled ? 0.38 : 0;
    this.master.connect(this.context.destination);
    this.noise = this._makeNoise();
    this.convolver = this.context.createConvolver();
    this.convolver.buffer = this._makeImpulse();
    const wet = this.context.createGain();
    wet.gain.value = 0.13;
    this.convolver.connect(wet);
    wet.connect(this.master);
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

  _route(gain, wetAmount = 0.12) {
    gain.connect(this.master);
    if (wetAmount > 0 && this.convolver) {
      const send = this.context.createGain();
      send.gain.value = wetAmount;
      gain.connect(send);
      send.connect(this.convolver);
    }
  }

  changeAmbience(kind) {
    this.ambienceKind = kind;
    if (!this.enabled || !this.context) return;
    if (!this.context || !this.enabled) return;
    const profile = AMBIENCE[kind] || AMBIENCE.meadow;
    const now = this.context.currentTime;
    const previous = this.environment;
    clearTimeout(this.birdTimer);
    this.birdTimer = 0;

    const bus = this.context.createGain();
    bus.gain.value = 0;
    this._route(bus, 0.06);

    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = profile.high;
    filter.Q.value = 0.55;
    const filterMod = this.context.createOscillator();
    const filterDepth = this.context.createGain();
    filterMod.frequency.value = profile.rate;
    filterDepth.gain.value = profile.mod;
    filterMod.connect(filterDepth);
    filterDepth.connect(filter.frequency);
    filterMod.start();

    const noise = this.context.createBufferSource();
    noise.buffer = this.noise;
    noise.loop = true;
    const noiseGain = this.context.createGain();
    noiseGain.gain.value = profile.gain;
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(bus);
    noise.start();

    const lowFilter = this.context.createBiquadFilter();
    lowFilter.type = 'lowpass';
    lowFilter.frequency.value = profile.low;
    const lowTone = this.context.createOscillator();
    lowTone.type = 'sine';
    lowTone.frequency.value = Math.max(34, profile.low * 0.55);
    const toneGain = this.context.createGain();
    toneGain.gain.value = profile.gain * 0.2;
    lowTone.connect(lowFilter);
    lowFilter.connect(toneGain);
    toneGain.connect(bus);
    lowTone.start();

    bus.gain.setTargetAtTime(profile.gain > 0.025 ? 0.75 : 0.58, now, previous ? 0.28 : 0.12);
    this.environment = { bus, nodes: [noise, filterMod, lowTone] };
    if (previous) {
      previous.bus.gain.cancelScheduledValues(now);
      previous.bus.gain.setTargetAtTime(0, now, 0.22);
      window.setTimeout(() => {
        for (const node of previous.nodes) {
          try { node.stop(); } catch { /* すでに停止済み */ }
        }
        previous.bus.disconnect();
      }, 1000);
    }
    if (profile.note) this._scheduleNatureNote(profile, bus);
  }

  _scheduleNatureNote(profile, bus) {
    if (!this.enabled || this.environment?.bus !== bus) return;
    const delay = profile.delay * (0.7 + this.random() * 0.9);
    this.birdTimer = window.setTimeout(() => {
      if (!this.enabled || this.environment?.bus !== bus) return;
      if (profile.note === 'bird') this._tone(740 + this.random() * 220, 0.11, 0.014, 'sine', 0.72);
      else if (profile.note === 'crystal') this._tone(540 + this.random() * 440, 0.24, 0.012, 'sine', 1.08);
      else this._tone(90 + this.random() * 45, 0.19, 0.016, 'sine', 0.72);
      this._scheduleNatureNote(profile, bus);
    }, delay);
  }

  _tone(frequency, duration, volume, type = 'sine', endRatio = 1) {
    if (!this.enabled || !this.context || !this.master) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const lowpass = this.context.createBiquadFilter();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency * (0.97 + this.random() * 0.06), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(42, frequency * endRatio), now + duration);
    lowpass.type = 'lowpass';
    lowpass.frequency.value = Math.min(1500, frequency * 2.3);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + Math.min(0.018, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(lowpass);
    lowpass.connect(gain);
    this._route(gain, 0.18);
    osc.start(now);
    osc.stop(now + duration + 0.02);
    window.setTimeout(() => { osc.disconnect(); lowpass.disconnect(); gain.disconnect(); }, (duration + 0.2) * 1000);
  }

  _noiseTap(frequency, duration, volume) {
    if (!this.enabled || !this.context || !this.noise) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(Math.max(0.0001, volume), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    this._route(gain, 0.15);
    source.start(now, this.random() * 0.8, duration + 0.04);
    source.stop(now + duration + 0.05);
    window.setTimeout(() => { source.disconnect(); filter.disconnect(); gain.disconnect(); }, (duration + 0.2) * 1000);
  }

  footstep(material, water = false) {
    if (!this.enabled) return;
    this._ensureContext();
    if (!this.context) return;
    if (water || String(material).toLowerCase().includes('water')) {
      this._noiseTap(510 + this.random() * 180, 0.1, 0.025 + this.random() * 0.008);
      return;
    }
    const profile = surfaceProfile(material);
    const pitch = 0.9 + this.random() * 0.2;
    this._tone(profile.freq * pitch, 0.07, profile.gain * (0.88 + this.random() * 0.25), profile.wave, 0.48);
    this._noiseTap(profile.high * pitch, 0.045, profile.gain * 0.31);
  }

  jump() {
    this._tone(205, 0.13, 0.024, 'sine', 1.55);
  }

  land(fallHeight = 0, material = 'grass') {
    const weight = clamp(0.55 + fallHeight * 0.18, 0.55, 1.4);
    const profile = surfaceProfile(material);
    this._tone(profile.freq * 0.64, 0.09, profile.gain * 0.62 * weight, 'triangle', 0.54);
    this._noiseTap(profile.high * 0.7, 0.055, profile.gain * 0.22 * weight);
  }

  waterEnter() {
    this._noiseTap(430, 0.17, 0.042);
    this._tone(180, 0.12, 0.018, 'sine', 0.68);
  }

  lavaReturn() {
    this._tone(124, 0.18, 0.032, 'sine', 0.48);
    this._noiseTap(360, 0.12, 0.025);
  }

  stageSwitch() {
    this._tone(520, 0.13, 0.017, 'sine', 1.24);
    window.setTimeout(() => this._tone(690, 0.19, 0.014, 'sine', 0.82), 70);
  }
}
