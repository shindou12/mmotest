// ElevenLabs の Sound Effects API で効果音を作り、public/assets/sfx/ に書き出す
//   ELEVENLABS_API_KEY=... node tools/sfx/generate.mjs            まだ無いものだけ作る
//   node tools/sfx/generate.mjs hurt_heavy --force                指定したものを作り直す
// 作ったファイルは public/assets/sfx/manifest.json に載り、ゲームが起動時に読む（載っていなければ合成音のまま）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'public', 'assets', 'sfx');
const MANIFEST = path.join(OUT, 'manifest.json');
const sounds = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'sfx', 'sounds.json'), 'utf8'));

const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('ELEVENLABS_API_KEY を設定してください'); process.exit(1); }
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
const ids = Object.keys(sounds).filter((id) => !id.startsWith('_') && (!only.length || only.includes(id)));
if (!ids.length) { console.error('該当する効果音がありません: ' + only.join(', ')); process.exit(1); }

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
fs.mkdirSync(OUT, { recursive: true });

for (const id of ids) {
  const s = sounds[id];
  const files = [];
  for (let i = 1; i <= (s.variations || 1); i++) {
    const name = `${id}_${i}.mp3`, file = path.join(OUT, name);
    files.push('sfx/' + name);
    if (fs.existsSync(file) && !force) { console.log(`skip  ${name}`); continue; }
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: s.prompt, duration_seconds: s.duration_seconds, prompt_influence: s.prompt_influence }),
    });
    if (!res.ok) { console.error(`fail  ${name}: ${res.status} ${await res.text()}`); process.exit(1); }
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`write ${name}`);
  }
  manifest[id] = files;
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n'); // 途中で止まっても作れた分は載せる
}
