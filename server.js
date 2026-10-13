// 友達用ミニMMOサーバー: 静的ファイル配信 + WebSocket でワールドを同期
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { BALANCE } from './public/shared/balance.js';
import { World } from './public/shared/sim.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const SAVE = path.join(__dirname, 'world-save-coop-hard.json');
const ROOTS = [
  ['/vendor/three/', path.join(__dirname, 'node_modules/three/')],
  ['/', path.join(__dirname, 'public/')],
];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

let saved = {};
try { saved = JSON.parse(fs.readFileSync(SAVE, 'utf8')); } catch { /* 初回 */ }

const world = new World({
  unlocked: saved.unlocked || 1,
  box: saved.box || [],
  onSave: (data) => fs.writeFile(SAVE, JSON.stringify(data), () => {}),
});

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ mode: BALANCE.id })); return; }
  if (url === '/') url = '/index.html';
  for (const [prefix, dir] of ROOTS) {
    if (!url.startsWith(prefix)) continue;
    const file = path.join(dir, url.slice(prefix.length));
    if (!file.startsWith(dir)) break;
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
    return;
  }
  res.writeHead(404); res.end('not found');
});

const wss = new WebSocketServer({ server, path: '/ws' });
let nextId = 1;
wss.on('connection', (ws) => {
  const id = nextId++;
  world.addPlayer(id, (msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); });
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    world.handle(id, msg);
  });
  ws.on('close', () => world.removePlayer(id));
});

let last = performance.now();
setInterval(() => {
  const now = performance.now();
  world.tick(Math.min(0.1, (now - last) / 1000));
  last = now;
}, 50);

server.listen(PORT, () => {
  console.log(`浮遊城エテルナ 協力ハード（3〜5人推奨） 起動: http://localhost:${PORT}`);
  console.log(`同じLANの友達は http://<このPCのIP>:${PORT} でアクセス`);
});

