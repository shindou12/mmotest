// 閲覧に使うファイルだけを拾い、Sites用の静的配布物にまとめる。
import { chromium } from 'file:///C:/Users/shind/AppData/Local/Programs/node22/node_modules/playwright/index.mjs';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const site = resolve(root, 'codex/sites/fir-forest-study');
const dist = resolve(site, 'dist');
const paths = new Set();
const errors = [];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1680, height: 1080 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(`${request.failure()?.errorText}: ${request.url()}`));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.protocol === 'blob:' || url.protocol === 'data:') return;
    if (url.origin !== 'http://127.0.0.1:8172') throw new Error(`外部依存: ${url.origin}`);
    if (response.status() >= 400) errors.push(`${response.status()}: ${url.pathname}`);
    let path = decodeURIComponent(url.pathname).slice(1);
    if (path.endsWith('/')) path += 'index.html';
    paths.add(path);
  });
  await page.goto('http://127.0.0.1:8172/codex/fir-study/?version=v5', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].every(f => f.contentWindow.__treeReady));
  await page.goto('http://127.0.0.1:8172/codex/fir-study/coast.html?version=v5', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].every(f => f.contentWindow.__ready && f.contentWindow.__firStudy), null, { timeout: 180000 });
  await page.waitForTimeout(400);
  await page.goto('http://127.0.0.1:8172/codex/cc0-tree-outline/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__compareReady);
  await page.goto('http://127.0.0.1:8172/codex/asset-outline-study/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__compareReady);
  await page.goto('http://127.0.0.1:8172/codex/outline-lab/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__compareReady);
  await page.goto('http://127.0.0.1:8172/codex/outline-forest/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].every(f => f.contentWindow.__forestReady && f.contentWindow.__ready), null, { timeout: 180000 });
  await page.goto('http://127.0.0.1:8172/codex/outline-blend/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].every(f => f.contentWindow.__forestReady && f.contentWindow.__ready), null, { timeout: 180000 });
} finally { await browser.close(); }
if (errors.length) throw new Error(JSON.stringify(errors));
for (const v of ['v1', 'v2', 'v3', 'v4']) paths.add(`codex/fir-study/assets/fir_soft_${v}.glb`);
for (const path of ['codex/fir-zero/index.html', 'codex/fir-zero/style.css', 'codex/fir-zero/viewer.js', 'codex/fir-zero/assets/fir-zero.glb', 'codex/fir-zero/assets/concept.png']) paths.add(path);
for (const path of ['codex/cc0-tree-compare/index.html', 'codex/cc0-tree-compare/style.css', 'codex/cc0-tree-compare/viewer.js', 'codex/cc0-tree-compare/assets/grab3d-pine.glb', 'codex/cc0-tree-compare/assets/pixor-pine.glb']) paths.add(path);
for (const path of ['node_modules/three/LICENSE', 'art/ref/trees/T01.webp', 'art/ref/trees/T04.webp', 'art/ref/trees/real/P02.jpg', 'art/ref/trees/real/P04.jpg', 'codex/fir-study/PLAN.md', 'codex/fir-study/PLAN-v5.md', 'codex/fir-study/PROMPTS.md', 'codex/fir-study/ITERATIONS.md']) paths.add(path);
const manifest = resolve(site, 'distribution.json');
// 公開先ではnode_modules配下が404になるため、ブラウザ用ファイルだけvendorへ置く。
const distributionPath = path => path.replace(/^node_modules\/three\//, 'vendor/three/');
const deployedPaths = new Set([...paths].map(distributionPath));
if (existsSync(manifest)) {
  for (const old of JSON.parse(readFileSync(manifest, 'utf8')).files) {
    const target = resolve(dist, old.path);
    if (!target.startsWith(dist + sep)) throw new Error('旧配布物のパスが不正です');
    if (!deployedPaths.has(old.path) && existsSync(target)) unlinkSync(target);
  }
}
const files = [];
for (const path of [...paths].sort()) {
  const from = resolve(root, path);
  const deployedPath = distributionPath(path);
  const to = resolve(dist, deployedPath);
  if (!from.startsWith(resolve(root) + sep) || !to.startsWith(dist + sep) || !existsSync(from)) throw new Error(`配布対象が不正: ${path}`);
  mkdirSync(dirname(to), { recursive: true });
  let bytes = path.endsWith('.html')
    ? Buffer.from(readFileSync(from, 'utf8').replaceAll('/node_modules/three/', '/vendor/three/'))
    : readFileSync(from);
  if (path === 'codex/fir-zero/index.html') bytes = Buffer.from(bytes.toString('utf8').replace('<head>', '<head><base href="/codex/fir-zero/">'));
  if (path === 'codex/cc0-tree-compare/index.html') bytes = Buffer.from(bytes.toString('utf8').replace('<head>', '<head><base href="/codex/cc0-tree-compare/">'));
  if (path === 'codex/cc0-tree-outline/index.html') bytes = Buffer.from(bytes.toString('utf8').replace('<head>', '<head><base href="/codex/cc0-tree-outline/">'));
  if (path === 'codex/asset-outline-study/index.html') bytes = Buffer.from(bytes.toString('utf8').replace('<head>', '<head><base href="/codex/asset-outline-study/">'));
  if (path === 'codex/outline-lab/index.html') bytes = Buffer.from(bytes.toString('utf8').replace('<head>', '<head><base href="/codex/outline-lab/">'));
  if (path === 'codex/outline-forest/index.html') bytes = Buffer.from(bytes.toString('utf8').replace('<head>', '<head><base href="/codex/outline-forest/">'));
  if (path === 'codex/outline-blend/index.html') bytes = Buffer.from(bytes.toString('utf8').replace('<head>', '<head><base href="/codex/outline-blend/">'));
  writeFileSync(to, bytes);
  files.push({ path: deployedPath, source: path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const html = readFileSync(resolve(root, 'codex/fir-study/index.html'), 'utf8')
  .replace('<head>', '<head><base href="/codex/fir-study/">');
writeFileSync(resolve(dist, 'index.html'), html);
writeFileSync(resolve(site, 'distribution.json'), JSON.stringify({ files, count: files.length, bytes: files.reduce((sum, f) => sum + f.bytes, 0) }, null, 2));
writeFileSync(resolve(site, 'README.md'), '# 柔らかいもみの木・Sites配布\n\n単体と砂浜の比較。元はcodex/fir-study。ブラウザが読み込むファイルだけを収集。API・外部CDN依存なし。Three.jsは公開先で配信できるvendor配下へ置き、ライセンスはdist/vendor/three/LICENSEに保存。RO画像はユーザー指定の比較用参考資料。\n');
console.log(`SITE_PREPARED files=${files.length}; bytes=${files.reduce((sum, f) => sum + f.bytes, 0)}; errors=0`);
