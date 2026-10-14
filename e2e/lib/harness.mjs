// 挙動を固定するテスト（e2e）の土台: ゲームサーバーを立て、時計と乱数を固定したブラウザでゲームを一コマずつ進める
//   - 時計: performance.now / Date.now / setTimeout / setInterval / requestAnimationFrame を仮の時計に置き換え、
//     step(ms) で 1/60 秒ずつ進める（実時間に左右されない）
//   - 乱数: ワールド（sim.js の World のメソッド内）は種を固定した乱数、画面側は常に 0.5
//     （エフェクトの粒など、画面側の乱数の使い方が変わっても戦闘の記録がずれないように）
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function loadPlaywright() {
  for (const p of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    if (!p) continue;
    try { return await import(p); } catch { /* 次を試す */ }
  }
  throw new Error('playwright が見つかりません（PLAYWRIGHT_MODULE で場所を指定できます）');
}

export async function startServer() {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(url + '/health'); if (r.ok) return { url, close: () => proc.kill() }; } catch { /* まだ */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error('server did not start');
}

// ページより先に入れる仮の時計と乱数
const CLOCK = `(() => {
  const realTimeout = window.setTimeout.bind(window);
  let T = 1000, seq = 0, nextFrame = 1000 + 1000 / 60;
  const timers = new Map(); let frames = [];
  performance.now = () => T;
  const dnow = Date.now; Date.now = () => 1700000000000 + T;
  window.setTimeout = (fn, ms = 0, ...args) => { const id = ++seq; timers.set(id, { at: T + Math.max(0, +ms || 0), fn, args, every: 0, seq: id }); return id; };
  window.setInterval = (fn, ms = 0, ...args) => { const id = ++seq; const every = Math.max(1, +ms || 0); timers.set(id, { at: T + every, fn, args, every, seq: id }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (fn) => { const id = ++seq; frames.push({ id, fn }); return id; };
  window.cancelAnimationFrame = (id) => { frames = frames.filter((f) => f.id !== id); };
  window.queueMicrotask = window.queueMicrotask.bind(window);
  // 乱数: World のメソッドの中だけ種を固定した乱数（mulberry32）
  let s = 0x9e3779b9 >>> 0, depth = 0;
  const seeded = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = () => (depth > 0 ? seeded() : 0.5);
  window.__simEnter = () => { depth++; }; window.__simLeave = () => { depth--; };
  const flush = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  const runFrame = async () => {
    const list = frames; frames = [];
    for (const f of list) { f.fn(T); }
    await flush();
  };
  window.__clock = {
    now: () => T,
    // 仮の時計を ms だけ進める（タイマーとフレームを時刻の順に実行する）
    async step(ms, each) {
      const end = T + ms;
      for (;;) {
        let next = null;
        for (const t of timers.values()) if (!next || t.at < next.at || (t.at === next.at && t.seq < next.seq)) next = t;
        const tf = nextFrame;
        if (next && next.at <= end && next.at < tf) {
          T = next.at;
          if (next.every) next.at += next.every; else timers.delete(next.seq);
          next.fn(...next.args); await flush();
          continue;
        }
        if (tf <= end) { T = tf; nextFrame += 1000 / 60; if (each) each(); await runFrame(); continue; }
        T = end; break;
      }
    },
    realTimeout,
  };
})();`;

// ページを開き、World の乱数を固定して、指定の武器で始める
export async function openGame(browser, url, { kind = 'sword', viewport = { width: 160, height: 100 }, render = false } = {}) {
  // browser でも context（セーブを仕込むとき）でも開ける
  const page = browser.newContext ? await browser.newPage({ viewport }) : await browser.newPage();
  if (!browser.newContext) await page.setViewportSize(viewport);
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGE ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CON ' + m.text()); });
  await page.addInitScript(CLOCK);
  if (!render) await page.addInitScript('window.__noRender = true;');
  await page.goto(url + '/?solo&low');
  await page.waitForFunction(() => window.__game?.api && window.__clock, null, { timeout: 60000 });
  await page.evaluate(async (kind) => {
    // World のメソッドの中だけ種を固定した乱数を使う
    const { World } = await import('/shared/sim.js');
    for (const k of Object.getOwnPropertyNames(World.prototype)) {
      const f = World.prototype[k];
      if (k === 'constructor' || typeof f !== 'function') continue;
      World.prototype[k] = function (...a) { window.__simEnter(); try { return f.apply(this, a); } finally { window.__simLeave(); } };
    }
    document.getElementById('help')?.classList.add('hidden');
    const p = window.__game.api.start({ name: 'テスト', color: '#448a9b', kind });
    for (let i = 0; i < 400 && !window.__game.S?.(); i++) { await window.__clock.step(50); await new Promise((r) => window.__clock.realTimeout(r, 5)); }
    await p;
    await window.__clock.step(1000);
  }, kind);
  return { page, errors };
}
