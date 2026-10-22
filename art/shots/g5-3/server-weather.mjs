// 撮影用: 本番の server.js と同じ World を使い、対象エリアへ移動した状態で Godot を接続する。
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { World } from '../../../public/shared/sim.js';

const PORT = Number(process.env.PORT) || 8090;
const AREA = process.env.WX_AREA || 'f1_hunt';
const ALLOWED = new Set(['f1_hunt', 'f2_field', 'f3_hunt', 'f1_lake']);
if (!ALLOWED.has(AREA)) throw new Error(`unsupported weather area: ${AREA}`);

const world = new World({ unlocked: 3 });
const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); res.end('ok'); return; }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ server, path: '/ws' });
let nextId = 1;
wss.on('connection', (socket) => {
  const id = nextId++;
  world.addPlayer(id, (message) => { if (socket.readyState === 1) socket.send(JSON.stringify(message)); });
  socket.on('message', (data) => {
    let message;
    try { message = JSON.parse(data); } catch { return; }
    world.handle(id, message);
    if (message.t === 'hello') console.log(`player ${id} joined; client --start=${AREA}`);
  });
  socket.on('close', () => world.removePlayer(id));
});
server.listen(PORT, '127.0.0.1', () => console.log(`weather capture server :${PORT}/ws -> ${AREA} (unlocked ${world.unlocked})`));
setInterval(() => world.tick(0.05), 50);
