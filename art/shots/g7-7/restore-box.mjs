import WebSocket from 'ws';

const socket = new WebSocket('ws://127.0.0.1:8080/ws');
let takeSent = false;
let beforeCount = 0;
const timeout = setTimeout(() => {
  console.error('BOX_RESTORE_TIMEOUT');
  socket.terminate();
  process.exitCode = 1;
}, 10000);

socket.on('open', () => {
  socket.send(JSON.stringify({ t: 'hello', name: 'G7-7 capture cleanup', color: '#448a9b', lv: 1 }));
});

socket.on('message', (raw) => {
  const message = JSON.parse(raw.toString());
  if (message.t === 'welcome') {
    socket.send(JSON.stringify({ t: 'st', x: -10, z: 9, a: 0, hp: 100, mhp: 100, lv: 1 }));
    socket.send(JSON.stringify({ t: 'box', op: 'open' }));
  } else if (message.t === 'box' && !takeSent) {
    const candidates = (message.items || []).filter((item) => item.id === 'g77-weapon' && item.name === '紅蓮の細剣');
    if (!candidates.length) {
      console.log('BOX_RESTORE_NO_DEMO_ITEM count=' + (message.items || []).length);
      socket.close();
      clearTimeout(timeout);
      return;
    }
    beforeCount = message.items.length;
    const target = candidates.reduce((best, item) => (Number(item.uid) > Number(best.uid) ? item : best));
    socket.send(JSON.stringify({ t: 'box', op: 'take', uid: target.uid }));
    takeSent = true;
  } else if (message.t === 'box' && takeSent && (message.items || []).length < beforeCount) {
    console.log('BOX_RESTORE_OK count=' + message.items.length);
    socket.send(JSON.stringify({ t: 'box', op: 'close' }));
    clearTimeout(timeout);
    socket.close();
  }
});

socket.on('error', (error) => {
  console.error('BOX_RESTORE_ERROR ' + error.message);
  clearTimeout(timeout);
  process.exitCode = 1;
});
