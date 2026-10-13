import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { once } from 'node:events';
import WebSocket from 'ws';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Timed out waiting for multiplayer state');await delay(25); }
}

test('five WebSocket players share a world, chat, field enemies and combat rewards', { timeout: 20000 }, async t => {
  const reservation = net.createServer();reservation.listen(0, '127.0.0.1');await once(reservation, 'listening');
  const port = reservation.address().port;await new Promise(resolve => reservation.close(resolve));
  const server = spawn(process.execPath, ['server.js'], { cwd: new URL('../', import.meta.url), env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';server.stdout.on('data', data => { output += data; });server.stderr.on('data', data => { output += data; });
  t.after(() => server.kill());
  await until(() => output.includes('起動:'));
  const base = `http://127.0.0.1:${port}`;
  assert.deepEqual(await (await fetch(base + '/health')).json(), { mode: 'coop-hard-v1' });
  for (const path of ['/', '/style.css', '/js/main.js', '/shared/balance.js', '/vendor/three/build/three.module.js']) {
    assert.equal((await fetch(base + path)).status, 200, path);
  }
  const clients = [];
  t.after(() => { for (const c of clients) c.ws.close(); });
  for (let i = 1; i <= 5; i++) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`), messages = [];
    ws.on('message', data => messages.push(JSON.parse(data)));
    clients.push({ ws, messages });await once(ws, 'open');
    ws.send(JSON.stringify({ t: 'hello', name: `Tester${i}`, color: '#448a9b', lv: 1 }));
  }
  await until(() => clients.every(c => c.messages.some(m => m.t === 'snap' && m.p.length === 5)));
  clients[0].ws.send(JSON.stringify({ t: 'chat', text: 'coop-test' }));
  await until(() => clients.every(c => c.messages.some(m => m.t === 'chat' && m.text === 'coop-test')));
  for (const c of clients) c.ws.send(JSON.stringify({ t: 'move', to: 'f1_field' }));
  await until(() => clients.every(c => c.messages.some(m => m.t === 'snap' && m.ar === 'f1_field' && m.p.length === 5 && m.m.length)));
  const fieldSnap = clients[0].messages.filter(m => m.t === 'snap' && m.ar === 'f1_field' && m.p.length === 5 && m.m.length).at(-1);
  const target = fieldSnap.m[0];
  for (const c of clients) c.ws.send(JSON.stringify({ t: 'st', x: target[2], z: target[3], hp: 100, mhp: 100, dead: false }));
  await delay(150);
  clients[0].ws.send(JSON.stringify({ t: 'hit', id: target[0], dmg: target[6] + 1 }));
  await until(() => clients.every(c => c.messages.some(m => m.t === 'xp')));
  assert.ok(clients.every(c => c.messages.some(m => m.t === 'die' && m.id === target[0])));
});
