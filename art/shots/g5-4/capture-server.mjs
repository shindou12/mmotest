// G5-4 撮影専用: server.js と同じ World を使い、階層解放をメモリ内だけで 3 にする。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { World } from '../../../public/shared/sim.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PORT = Number(process.env.PORT) || 8080;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const ROOTS = [
  ['/vendor/three/', path.join(ROOT, 'node_modules/three')],
  ['/', path.join(ROOT, 'public')],
];
const world = new World({ unlocked: 3, onSave: () => {} });
const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ mode: 'g5-4-capture', unlocked: world.unlocked })); return; }
  if (url === '/') url = '/index.html';
  for (const [prefix, dir] of ROOTS) {
    if (!url.startsWith(prefix)) continue;
    const target = path.resolve(dir, url.slice(prefix.length));
    if (!target.startsWith(path.resolve(dir) + path.sep)) break;
    fs.readFile(target, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
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
  let msg; try { msg = JSON.parse(data); } catch { return; }
  const p = world.players.get(id);
  const before = msg.t === 'interact' ? { area: p?.area, x: p?.x, z: p?.z, door: p ? world.area(p.area)?.door : null } : null;
  world.handle(id, msg);
  if (before) console.log(`CAPTURE_INTERACT ${JSON.stringify({ id, what: msg.what, before, after: { area: p?.area, x: p?.x, z: p?.z, door: p ? world.area(p.area)?.door : null } })}`);
});
  ws.on('close', () => world.removePlayer(id));
});
let last = performance.now();
setInterval(() => { const now = performance.now(); world.tick(Math.min(0.1, (now - last) / 1000)); last = now; }, 50);
server.listen(PORT, '127.0.0.1', () => console.log(`G5-4 capture server ready port=${PORT} unlocked=${world.unlocked} save=disabled`));
