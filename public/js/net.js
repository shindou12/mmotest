// 通信: サーバーへの WebSocket、つながらなければブラウザ内でワールドを動かすソロモード
export class Net {
  constructor(onMsg) { this.onMsg = onMsg; this.mode = 'none'; }

  connect(url, timeoutMs = 2500) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
      try {
        const ws = new WebSocket(url);
        ws.onopen = () => { this.ws = ws; this.mode = 'online'; finish(true); };
        ws.onmessage = (e) => { try { this.onMsg(JSON.parse(e.data)); } catch (err) { console.error(err); } };
        ws.onerror = () => finish(false);
        ws.onclose = () => { if (this.mode === 'online') this.onMsg({ t: 'disconnected' }); finish(false); };
        setTimeout(() => finish(false), timeoutMs);
      } catch { finish(false); }
    });
  }

  async startSolo() {
    const { World } = await import('../shared/sim.js');
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('aincrad_solo_world') || '{}'); } catch { /* */ }
    this.world = new World({ unlocked: saved.unlocked || 1, box: saved.box || [], onSave: (d) => { try { localStorage.setItem('aincrad_solo_world', JSON.stringify(d)); } catch { /* */ } } });
    this.world.addPlayer(1, (m) => queueMicrotask(() => this.onMsg(m)));
    let last = performance.now();
    setInterval(() => { const now = performance.now(); this.world.tick(Math.min(0.1, (now - last) / 1000)); last = now; }, 50);
    this.mode = 'solo';
  }

  send(msg) {
    if (this.mode === 'online' && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
    else if (this.mode === 'solo') this.world.handle(1, JSON.parse(JSON.stringify(msg)));
  }
}
