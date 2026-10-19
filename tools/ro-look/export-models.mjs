// 場面のコードで組んだ形（window.__models）を GLB に書き出す（Blender で仕上げる元）
//   使い方: node tools/ro-look/export-models.mjs <URL> <出力.glb>
//   例: node tools/ro-look/export-models.mjs "http://localhost:8091/ro-cottage.html?blender=0&post=0" out/ro-cottage/models-raw.glb
//   形と頂点の色だけを書く（材質は場面のコードが付けるので書かない）。名前は場面の名前のまま（Blender で仕上げた形を同じ名前で戻す）
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = await import('/opt/node22/lib/node_modules/playwright/index.mjs'); }
const [url, out] = process.argv.slice(2);
if (!url || !out) { console.error('使い方: node tools/ro-look/export-models.mjs <URL> <出力.glb>'); process.exit(1); }
mkdirSync(dirname(out), { recursive: true });
const b = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
p.on('pageerror', (e) => console.error(String(e)));
await p.goto(url);
await p.waitForFunction(() => window.__ready, null, { timeout: 180000 });
const b64 = await p.evaluate(async () => {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const sc = new THREE.Scene(), mat = new THREE.MeshStandardMaterial({ vertexColors: true });
  for (const [name, m] of Object.entries(window.__models)) {
    m.updateWorldMatrix(true, false);
    const g = m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    const o = new THREE.Mesh(g, mat); o.name = name;
    m.matrixWorld.decompose(o.position, o.quaternion, o.scale);
    sc.add(o);
  }
  const buf = await new GLTFExporter().parseAsync(sc, { binary: true });
  let s = ''; const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
});
writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('書き出し:', out, Math.round(Buffer.from(b64, 'base64').length / 1024), 'KB');
await b.close();
