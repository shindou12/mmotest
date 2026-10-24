// public/js/audio.js の AudioEngine を OfflineAudioContext で鳴らし、Godot 用 WAV を書き出す。
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, startServer } from '../../../e2e/lib/harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SOURCE_PATH = path.join(ROOT, 'public/js/audio.js');
const OUTPUT_DIR = path.join(ROOT, 'godot/worldart/assets/sfx');
const SAMPLE_RATE = 44100;
const CHANNELS = 2;
const BIT_DEPTH = 16;
const MAX_SECONDS = 4;
const SILENCE_DBFS = -60;
const SILENCE_FLOOR = 10 ** (SILENCE_DBFS / 20);
const TAIL_SECONDS = 0.2;

function getSfxNames(source) {
  const sfxStart = source.indexOf('sfx(name, opt = {})');
  if (sfxStart < 0) throw new Error('audio.js に sfx(name, opt = {}) が見つかりません');
  const names = [...source.slice(sfxStart).matchAll(/case\s+'([^']+)'\s*:/g)].map((m) => m[1]);
  const unique = [...new Set(names)];
  if (unique.length === 0) throw new Error('audio.js の sfx() から名前を取得できません');
  return unique;
}

function makeVariants() {
  const variants = [
    { name: 'swing_heavy', source: 'swing', options: { heavy: true } },
    { name: 'hit_crit', source: 'hit', options: { crit: true } },
    { name: 'charge_lv1', source: 'charge', options: { lv: 1 } },
    { name: 'shard_drop', source: 'shard', options: { drop: true } },
    { name: 'coin_soft', source: 'coin', options: { vol: 0.45 } },
    { name: 'coins_small', source: 'coins', options: { n: 1 } },
    { name: 'coins_large', source: 'coins', options: { n: 7 } },
    { name: 'drop_r3_bag', source: 'drop', options: { rarity: 3 } },
  ];

  // アイテムの種類とレア度で変わる着地音を、ゲーム内で使う全分岐ごとに出す。
  for (let rarity = 0; rarity <= 7; rarity++) {
    for (const slot of ['weapon', 'armor', 'acc', 'title']) {
      variants.push({
        name: `drop_r${rarity}_${slot}`,
        source: 'drop',
        options: { rarity, slot },
      });
    }
  }

  // 超越の星は追加音数を変えるため、実際の最大数まで別々に出す。
  for (let stars = 1; stars <= 4; stars++) {
    variants.push({
      name: `drop_r7_weapon_stars${stars}`,
      source: 'drop',
      options: { rarity: 7, slot: 'weapon', stars },
    });
  }
  return variants;
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

async function main() {
  const source = await fs.readFile(SOURCE_PATH, 'utf8');
  const names = getSfxNames(source);
  const knownNames = new Set(names);
  const variants = makeVariants();
  for (const variant of variants) {
    if (!knownNames.has(variant.source)) {
      throw new Error(`opt 別音の元名が audio.js にありません: ${variant.source}`);
    }
  }

  const specs = [
    ...names.map((name) => ({ name, source: name, options: {} })),
    ...variants,
  ];
  const outputNames = new Set();
  for (const spec of specs) {
    if (!/^[A-Za-z0-9_-]+$/.test(spec.name) || outputNames.has(spec.name)) {
      throw new Error(`書き出し名が不正または重複しています: ${spec.name}`);
    }
    outputNames.add(spec.name);
  }

  const playwright = await loadPlaywright();
  const server = await startServer();
  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(server.url + '/', { waitUntil: 'domcontentloaded' });
    const sounds = [];

    for (const spec of specs) {
      const rendered = await page.evaluate(async ({ sourceName, options, sampleRate, maxSeconds, silenceFloor, tailSeconds }) => {
        const { AudioEngine } = await import('/js/audio.js');
        const frameLimit = Math.round(sampleRate * maxSeconds);
        const oldAudioContext = window.AudioContext;
        const oldWebkitAudioContext = window.webkitAudioContext;
        const oldSetInterval = window.setInterval;
        window.AudioContext = class extends OfflineAudioContext {
          constructor() { super(2, frameLimit, sampleRate); }
        };
        window.setInterval = () => 0;
        try {
          for (let attempt = 0; attempt < 16; attempt++) {
            const engine = new AudioEngine();
            engine.init();
            engine.sfx(sourceName, options);
            const buffer = await engine.ctx.startRendering();
            const left = buffer.getChannelData(0);
            const right = buffer.getChannelData(1);
            let peak = 0;
            let lastActive = -1;
            for (let i = 0; i < buffer.length; i++) {
              const a = Math.abs(left[i]);
              const b = Math.abs(right[i]);
              if (a > peak) peak = a;
              if (b > peak) peak = b;
              if (a >= silenceFloor || b >= silenceFloor) lastActive = i;
            }
            if (lastActive < 0 || peak < silenceFloor) continue;

            const frames = Math.min(buffer.length, lastActive + 1 + Math.round(sampleRate * tailSeconds));
            const pcm = new Int16Array(frames * 2);
            for (let i = 0; i < frames; i++) {
              const l = Math.max(-1, Math.min(1, left[i]));
              const r = Math.max(-1, Math.min(1, right[i]));
              pcm[i * 2] = l < 0 ? Math.round(l * 0x8000) : Math.round(l * 0x7fff);
              pcm[i * 2 + 1] = r < 0 ? Math.round(r * 0x8000) : Math.round(r * 0x7fff);
            }
            const bytes = new Uint8Array(pcm.buffer);
            let binary = '';
            for (let at = 0; at < bytes.length; at += 0x8000) {
              binary += String.fromCharCode(...bytes.subarray(at, Math.min(bytes.length, at + 0x8000)));
            }
            return { frames, peak, pcmBase64: btoa(binary) };
          }
          return { frames: 0, peak: 0, pcmBase64: '' };
        } finally {
          window.AudioContext = oldAudioContext;
          window.webkitAudioContext = oldWebkitAudioContext;
          window.setInterval = oldSetInterval;
        }
      }, {
        sourceName: spec.source,
        options: spec.options,
        sampleRate: SAMPLE_RATE,
        maxSeconds: MAX_SECONDS,
        silenceFloor: SILENCE_FLOOR,
        tailSeconds: TAIL_SECONDS,
      });

      const length = rendered.frames / SAMPLE_RATE;
      const peakDbfs = rendered.peak > 0 ? 20 * Math.log10(rendered.peak) : -Infinity;
      if (rendered.frames === 0 || !Number.isFinite(peakDbfs) || peakDbfs < SILENCE_DBFS) {
        throw new Error(`${spec.name}: 無音または長さ 0 (length=${length}, peak=${peakDbfs} dBFS)`);
      }

      const filename = `${spec.name}.wav`;
      await fs.writeFile(path.join(OUTPUT_DIR, filename), makeWave(rendered.pcmBase64, rendered.frames));
      sounds.push({
        name: spec.name,
        file: filename,
        length_seconds: Number(length.toFixed(4)),
        peak_dbfs: Number(peakDbfs.toFixed(2)),
        source: spec.source,
        options: spec.options,
      });
    }

    const silent = sounds.filter((sound) => sound.peak_dbfs < SILENCE_DBFS).length;
    const zeroLength = sounds.filter((sound) => sound.length_seconds <= 0).length;
    if (silent || zeroLength) throw new Error(`検査失敗: 無音 ${silent} 音、長さ 0 ${zeroLength} 音`);

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(path.join(OUTPUT_DIR, 'index.json'), JSON.stringify({
      sample_rate: SAMPLE_RATE,
      channels: CHANNELS,
      bit_depth: BIT_DEPTH,
      sounds,
    }, null, 2) + '\n');

    console.log(`書き出した ${sounds.length} 音`);
    console.log(`無音（ピーク ${SILENCE_DBFS}dBFS 未満）: ${silent} 音`);
    console.log(`長さ 0: ${zeroLength} 音`);
    for (const sound of sounds) {
      console.log(`${sound.name}\t${sound.length_seconds.toFixed(3)}s\t${sound.peak_dbfs.toFixed(2)}dBFS`);
    }
  } finally {
    await browser?.close();
    server.close();
  }
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await main();
