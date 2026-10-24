// AudioEngine の曲・環境音・天候音を OfflineAudioContext で WAV に書き出す。
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadPlaywright, startServer } from '../../../e2e/lib/harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUTPUT_DIR = path.join(ROOT, 'godot/worldart/assets');
const MUSIC_DIR = path.join(OUTPUT_DIR, 'music');
const AMBIENT_DIR = path.join(OUTPUT_DIR, 'ambient');
const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BIT_DEPTH = 16;
const SILENCE_DBFS = -60;
const SILENCE_FLOOR = 10 ** (SILENCE_DBFS / 20);
const CROSSFADE_MS = 50;
const CROSSFADE_SECONDS = CROSSFADE_MS / 1000;
const AMBIENT_LOOP_SECONDS = 12;
const AMBIENT_WARMUP_SECONDS = 4;
const EVENT_MAX_SECONDS = 7;
const EVENT_METHODS = ['bird', 'owl', 'drip', 'chime', 'crackle', 'rumble', 'thunder', 'bubble', 'whisper', 'gust'];
const AMBIENT_KINDS = ['meadow', 'forest', 'desert', 'cave', 'lava', 'snow', 'underwater', 'storm', 'void', 'heaven'];
const WEATHER_KINDS = ['rain', 'fog', 'sandstorm'];

function stableSeed(name) {
  let hash = 2166136261;
  for (const ch of name) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function areaSlug(floor) {
  return `area_${String(floor.n).padStart(2, '0')}`;
}

function makeWave(pcmBase64, frames) {
  const pcm = Buffer.from(pcmBase64, 'base64');
  const expectedBytes = frames * CHANNELS * (BIT_DEPTH / 8);
  if (pcm.length !== expectedBytes) throw new Error(`PCM サイズが一致しません: ${pcm.length} != ${expectedBytes}`);

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BIT_DEPTH / 8), 28);
  header.writeUInt16LE(CHANNELS * (BIT_DEPTH / 8), 32);
  header.writeUInt16LE(BIT_DEPTH, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function makeSpecs(floors) {
  const music = floors.flatMap((floor) => {
    const area = areaSlug(floor);
    return [false, true].map((boss) => {
      const bpm = boss ? Math.max(132, floor.music.bpm + 46) : floor.music.bpm;
      const bars = boss ? 8 : 16;
      const cycleSeconds = bars * 4 * 60 / bpm;
      return {
        name: `${area}${boss ? '_boss' : ''}`,
        type: 'music',
        file: `${area}${boss ? '_boss' : ''}.wav`,
        floor: floor.n,
        area_name: floor.name,
        boss,
        music: floor.music,
        bpm,
        loop_bars: bars,
        cycle_seconds: cycleSeconds,
        loop_seconds: cycleSeconds,
        render_seconds: 0.05 + cycleSeconds * 2 + CROSSFADE_SECONDS + 0.25,
        extract_start_seconds: 0.05 + cycleSeconds,
        extract_seconds: cycleSeconds + CROSSFADE_SECONDS,
        output_dir: MUSIC_DIR,
      };
    });
  });

  const beds = AMBIENT_KINDS.map((kind) => ({
    name: `bed_${kind}`,
    type: 'ambient',
    kind,
    file: `bed_${kind}.wav`,
    render_seconds: AMBIENT_WARMUP_SECONDS + AMBIENT_LOOP_SECONDS + CROSSFADE_SECONDS + 0.1,
    extract_start_seconds: AMBIENT_WARMUP_SECONDS,
    extract_seconds: AMBIENT_LOOP_SECONDS + CROSSFADE_SECONDS,
    loop_seconds: AMBIENT_LOOP_SECONDS,
    output_dir: AMBIENT_DIR,
  }));

  const eventEnvironment = {
    bird: 'meadow', owl: 'forest', drip: 'cave', chime: 'cave', crackle: 'lava',
    rumble: 'lava', thunder: 'storm', bubble: 'underwater', whisper: 'void', gust: 'desert',
  };
  const events = EVENT_METHODS.map((event) => ({
    name: `event_${event}`,
    type: 'event',
    event,
    kind: eventEnvironment[event],
    file: `event_${event}.wav`,
    render_seconds: EVENT_MAX_SECONDS,
    output_dir: AMBIENT_DIR,
  }));

  const weather = WEATHER_KINDS.map((kind) => ({
    name: `weather_${kind}`,
    type: 'weather',
    kind,
    file: `weather_${kind}.wav`,
    render_seconds: AMBIENT_WARMUP_SECONDS + AMBIENT_LOOP_SECONDS + CROSSFADE_SECONDS + 0.1,
    extract_start_seconds: AMBIENT_WARMUP_SECONDS,
    extract_seconds: AMBIENT_LOOP_SECONDS + CROSSFADE_SECONDS,
    loop_seconds: AMBIENT_LOOP_SECONDS,
    output_dir: AMBIENT_DIR,
  }));
  return { music, beds, events, weather, all: [...music, ...beds, ...events, ...weather] };
}

async function renderInBrowser(page, spec) {
  const renderFrames = Math.ceil(spec.render_seconds * SAMPLE_RATE);
  return page.evaluate(async ({ spec, sampleRate, channels, bitDepth, silenceFloor, crossfadeMs, renderFrames }) => {
    const oldAudioContext = window.AudioContext;
    const oldWebkitAudioContext = window.webkitAudioContext;
    const oldSetInterval = window.setInterval;
    const oldSetTimeout = window.setTimeout;
    const oldRandom = Math.random;
    let randomState = spec.seed >>> 0;
    Math.random = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 4294967296;
    };
    window.AudioContext = class extends OfflineAudioContext {
      constructor() { super(channels, renderFrames, sampleRate); }
    };
    window.setInterval = () => 0;
    window.setTimeout = (callback) => { callback(); return 0; };

    try {
      const { AudioEngine } = await import('/js/audio.js');
      const engine = new AudioEngine();
      engine.init();
      let virtualTime = 0;
      Object.defineProperty(engine.ctx, 'currentTime', { configurable: true, get: () => virtualTime });

      if (spec.type === 'music') {
        engine.setMusic(spec.music, spec.boss);
        const schedulerEnd = spec.render_seconds - 0.05;
        for (virtualTime = 0; virtualTime < schedulerEnd; virtualTime += 0.025) engine.schedule();
      } else if (spec.type === 'ambient') {
        engine.setAmbient(spec.kind);
      } else if (spec.type === 'weather') {
        engine.setWeather(spec.kind);
      } else if (spec.type === 'event') {
        let triggered = false;
        for (const method of [
          'bird', 'owl', 'drip', 'chime', 'crackle', 'rumble', 'thunder', 'bubble', 'whisper', 'gust',
        ]) {
          const original = engine[method].bind(engine);
          engine[method] = (...args) => {
            if (method !== spec.event || triggered) return;
            triggered = true;
            original(...args);
          };
        }
        engine.ambKind = spec.kind;
        let eventAttempts = 0;
        while (!triggered && eventAttempts < 10000) {
          engine.ambientEvents();
          eventAttempts++;
        }
        if (!triggered) throw new Error(`${spec.name}: ambientEvents から音を呼び出せません`);
        spec.event_attempts = eventAttempts;
      }

      const buffer = await engine.ctx.startRendering();
      const rawLeft = buffer.getChannelData(0);
      const rawRight = buffer.getChannelData(1);
      const offset = Math.round((spec.extract_start_seconds || 0) * sampleRate);
      const rawFrames = spec.extract_seconds ? Math.round(spec.extract_seconds * sampleRate) : buffer.length - offset;
      if (offset < 0 || rawFrames <= 0 || offset + rawFrames > buffer.length) {
        throw new Error(`${spec.name}: 切り出し範囲がレンダー長を超えています`);
      }

      let left;
      let right;
      let seamFrames = 0;
      if (spec.extract_seconds) {
        const width = Math.max(2, Math.round(sampleRate * crossfadeMs / 1000));
        let seamAt = width;
        let seamScore = Infinity;
        for (let i = width; i <= Math.min(width * 2, rawFrames - width); i++) {
          const l0 = rawLeft[offset + i - 1], l1 = rawLeft[offset + i];
          const r0 = rawRight[offset + i - 1], r1 = rawRight[offset + i];
          const score = Math.max(Math.abs(l1 - l0), Math.abs(r1 - r0));
          if (score < seamScore) { seamScore = score; seamAt = i; }
        }
        const outFrames = rawFrames - seamAt;
        left = new Float32Array(outFrames);
        right = new Float32Array(outFrames);
        const middleFrames = rawFrames - width - seamAt;
        for (let i = 0; i < middleFrames; i++) {
          left[i] = rawLeft[offset + seamAt + i];
          right[i] = rawRight[offset + seamAt + i];
        }
        for (let i = 0; i < width; i++) {
          const p = i / (width - 1);
          const fromTail = Math.cos(p * Math.PI / 2);
          const fromHead = Math.sin(p * Math.PI / 2);
          const outAt = middleFrames + i;
          left[outAt] = rawLeft[offset + rawFrames - width + i] * fromTail + rawLeft[offset + seamAt - width + i] * fromHead;
          right[outAt] = rawRight[offset + rawFrames - width + i] * fromTail + rawRight[offset + seamAt - width + i] * fromHead;
        }
        const targetFrames = Math.round(spec.loop_seconds * sampleRate);
        if (left.length !== targetFrames) {
          const resize = (source) => {
            const out = new Float32Array(targetFrames);
            for (let i = 0; i < targetFrames; i++) {
              const at = i * (source.length - 1) / (targetFrames - 1);
              const lo = Math.floor(at), hi = Math.min(source.length - 1, lo + 1), mix = at - lo;
              out[i] = source[lo] * (1 - mix) + source[hi] * mix;
            }
            return out;
          };
          left = resize(left);
          right = resize(right);
        }
        seamFrames = width;
      } else {
        left = rawLeft.slice(offset);
        right = rawRight.slice(offset);
      }

      let peak = 0;
      let lastActive = -1;
      for (let i = 0; i < left.length; i++) {
        const l = Math.abs(left[i]), r = Math.abs(right[i]);
        peak = Math.max(peak, l, r);
        if (l >= silenceFloor || r >= silenceFloor) lastActive = i;
      }
      if (lastActive < 0 || peak < silenceFloor) {
        throw new Error(`${spec.name}: 無音です (frames=${left.length}, peak=${peak})`);
      }
      if (!spec.extract_seconds) {
        const keptFrames = Math.min(left.length, lastActive + 1 + Math.round(sampleRate * 0.2));
        left = left.slice(0, keptFrames);
        right = right.slice(0, keptFrames);
      }

      const frames = left.length;
      let seamDelta = 0;
      if (spec.extract_seconds) {
        seamDelta = Math.max(Math.abs(left[0] - left[frames - 1]), Math.abs(right[0] - right[frames - 1]));
      }
      const pcm = new Int16Array(frames * channels);
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < channels; c++) {
          const v = Math.max(-1, Math.min(1, c === 0 ? left[i] : right[i]));
          pcm[i * channels + c] = v < 0 ? Math.round(v * 0x8000) : Math.round(v * 0x7fff);
        }
      }
      const bytes = new Uint8Array(pcm.buffer);
      let binary = '';
      for (let at = 0; at < bytes.length; at += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(at, Math.min(bytes.length, at + 0x8000)));
      }
      return {
        frames,
        peak,
        seam_delta: seamDelta,
        seam_crossfade_frames: seamFrames,
        pcmBase64: btoa(binary),
        event_attempts: spec.event_attempts || null,
      };
    } finally {
      window.AudioContext = oldAudioContext;
      window.webkitAudioContext = oldWebkitAudioContext;
      window.setInterval = oldSetInterval;
      window.setTimeout = oldSetTimeout;
      Math.random = oldRandom;
    }
  }, {
    spec: { ...spec, seed: stableSeed(spec.name) },
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    bitDepth: BIT_DEPTH,
    silenceFloor: SILENCE_FLOOR,
    crossfadeMs: CROSSFADE_MS,
    renderFrames,
  });
}

async function writeSound(page, spec) {
  const rendered = await renderInBrowser(page, spec);
  const length = rendered.frames / SAMPLE_RATE;
  const peakDbfs = rendered.peak > 0 ? 20 * Math.log10(rendered.peak) : -Infinity;
  const seamDbfs = rendered.seam_delta > 0 ? 20 * Math.log10(rendered.seam_delta) : -Infinity;
  if (!rendered.frames || !Number.isFinite(peakDbfs) || peakDbfs < SILENCE_DBFS || length <= 0) {
    throw new Error(`${spec.name}: 無音または長さ0 (length=${length}, peak=${peakDbfs} dBFS)`);
  }

  const destination = path.join(spec.output_dir, spec.file);
  await fs.writeFile(destination, makeWave(rendered.pcmBase64, rendered.frames));
  const stat = await fs.stat(destination);
  return {
    name: spec.name,
    file: spec.file,
    length_seconds: Number(length.toFixed(4)),
    peak_dbfs: Number(peakDbfs.toFixed(2)),
    size_bytes: stat.size,
    random_seed: stableSeed(spec.name),
    ...(spec.extract_seconds ? {
      loop: true,
      loop_bars: spec.loop_bars,
      bpm: spec.bpm,
      crossfade_ms: CROSSFADE_MS,
      seam_boundary_delta_dbfs: Number(seamDbfs.toFixed(2)),
    } : {}),
    ...(rendered.event_attempts ? { ambient_event_attempts: rendered.event_attempts } : {}),
  };
}

async function main() {
  const { FLOORS } = await import(pathToFileURL(path.join(ROOT, 'public/shared/data.js')));
  const specs = makeSpecs(FLOORS);
  await Promise.all([fs.mkdir(MUSIC_DIR, { recursive: true }), fs.mkdir(AMBIENT_DIR, { recursive: true })]);
  const playwright = await loadPlaywright();
  const server = await startServer();
  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(server.url + '/', { waitUntil: 'domcontentloaded' });
    const results = [];
    for (const spec of specs.all) {
      const sound = await writeSound(page, spec);
      results.push({ ...sound, type: spec.type, floor: spec.floor, area_name: spec.area_name, kind: spec.kind, event: spec.event, boss: spec.boss });
      console.log(`${sound.file}\t${sound.length_seconds.toFixed(3)}s\t${sound.peak_dbfs.toFixed(2)}dBFS\t${sound.size_bytes} bytes${sound.loop ? `\tseam ${sound.seam_boundary_delta_dbfs.toFixed(2)}dBFS` : ''}`);
    }

    const songs = results.filter((sound) => sound.type === 'music');
    const beds = results.filter((sound) => sound.type === 'ambient');
    const events = results.filter((sound) => sound.type === 'event');
    const weather = results.filter((sound) => sound.type === 'weather');
    const loopSeams = [...songs, ...beds, ...weather].map((sound) => sound.seam_boundary_delta_dbfs);
    const maxSeam = Math.max(...loopSeams);
    const common = {
      format: 'WAV PCM', sample_rate: SAMPLE_RATE, channels: CHANNELS, bit_depth: BIT_DEPTH,
      randomness: { deterministic: true, algorithm: 'LCG32', per_file_seed: true },
      loop_check: { crossfade_ms: CROSSFADE_MS, measured: 'loop 末尾と先頭のサンプル差', max_seam_boundary_delta_dbfs: maxSeam },
    };
    await fs.writeFile(path.join(MUSIC_DIR, 'index.json'), JSON.stringify({
      ...common,
      songs: FLOORS.map((floor) => ({
        floor: floor.n,
        area: floor.name,
        normal: `${areaSlug(floor)}.wav`,
        boss: `${areaSlug(floor)}_boss.wav`,
      })),
      files: songs,
    }, null, 2) + '\n');
    await fs.writeFile(path.join(AMBIENT_DIR, 'index.json'), JSON.stringify({
      ...common,
      beds: beds.map((sound) => ({ kind: sound.kind, file: sound.file, length_seconds: sound.length_seconds, peak_dbfs: sound.peak_dbfs, size_bytes: sound.size_bytes, seam_boundary_delta_dbfs: sound.seam_boundary_delta_dbfs })),
      events: events.map((sound) => ({ event: sound.event, environment: sound.kind, file: sound.file, length_seconds: sound.length_seconds, peak_dbfs: sound.peak_dbfs, size_bytes: sound.size_bytes, random_seed: sound.random_seed, ambient_event_attempts: sound.ambient_event_attempts })),
      weather: weather.map((sound) => ({ kind: sound.kind, file: sound.file, length_seconds: sound.length_seconds, peak_dbfs: sound.peak_dbfs, size_bytes: sound.size_bytes, seam_boundary_delta_dbfs: sound.seam_boundary_delta_dbfs })),
      counts: { beds: beds.length, events: events.length, weather: weather.length },
    }, null, 2) + '\n');

    const silent = results.filter((sound) => sound.peak_dbfs < SILENCE_DBFS).length;
    const zeroLength = results.filter((sound) => sound.length_seconds <= 0).length;
    if (silent || zeroLength) throw new Error(`書き出し検査失敗: 無音 ${silent} 件、長さ0 ${zeroLength} 件`);
    const totalBytes = results.reduce((sum, sound) => sum + sound.size_bytes, 0);
    console.log(`完了: 曲 ${songs.length} (通常 ${songs.filter((s) => !s.boss).length} / ボス ${songs.filter((s) => s.boss).length})、環境ベッド ${beds.length}、散発音 ${events.length}、天候 ${weather.length}`);
    console.log(`無音 ${silent} 件、長さ0 ${zeroLength} 件、最大ループ境界差 ${maxSeam.toFixed(2)} dBFS`);
    console.log(`WAV 合計 ${(totalBytes / (1024 * 1024)).toFixed(2)} MiB (${totalBytes} bytes)`);
    console.log(`一覧: ${path.relative(ROOT, path.join(MUSIC_DIR, 'index.json'))}, ${path.relative(ROOT, path.join(AMBIENT_DIR, 'index.json'))}`);
  } finally {
    await browser?.close();
    server.close();
  }
}

await main();
