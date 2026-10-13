import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/shared/sim.js';
import { REVIVE } from '../public/shared/balance.js';

function party(count, area = 'f1_field') {
  const messages = new Map(), w = new World();
  for (let id = 1; id <= count; id++) {
    const inbox = []; messages.set(id, inbox);
    w.addPlayer(id, m => inbox.push(m)); w.handle(id, { t: 'hello', name: `P${id}`, lv: 1 });
    const p = w.players.get(id); p.area = area; p.x = id; p.z = 0;
  }
  return { w, messages, A: w.area(area) };
}
const got = (inbox, t) => inbox.filter(m => m.t === t);
const ring = (w, A, messages, id) => { w.snapshot(A); return got(messages.get(id === 1 ? 2 : 1), 'snap').at(-1).p.find(p => p[0] === id)[21]; };

test('a downed player crawls, allies are notified, and enough stun from allies revives them', () => {
  const { w, messages, A } = party(2);
  w.handle(1, { t: 'down', n: 1 });
  assert.equal(w.players.get(1).down, true);
  assert.equal(got(messages.get(2), 'pdown').length, 1);
  w.tickArea(A, 0.05);
  assert.equal(got(messages.get(1), 'bleed').length, 0, 'one ally still standing');
  // 大剣の溜め強攻撃（スタン値9）＋通常1回で、最初のゲージは起きる
  w.handle(2, { t: 'rev', id: 1, v: 9 });
  assert.equal(w.players.get(1).down, true);
  w.handle(2, { t: 'rev', id: 1, v: 1.8 });
  assert.equal(w.players.get(1).down, false);
  assert.equal(got(messages.get(1), 'revived').length, 1);
  // 大斧の溜め強攻撃（スタン値27）なら1発
  w.handle(1, { t: 'down', n: 1 });
  w.handle(2, { t: 'rev', id: 1, v: 27.2 });
  assert.equal(w.players.get(1).down, false);
});

test('recent downs scale the gauge x1 / x2.5 / x4, drawn as 1/3, 2/3 and a full circle', () => {
  const { w, messages, A } = party(2);
  for (const [n, mult, disp] of [[1, 1, 1 / 3], [2, 2.5, 2 / 3], [3, 4, 1], [9, 4, 1]]) {
    w.handle(1, { t: 'down', n });
    assert.equal(w.players.get(1).rev, REVIVE.base * mult);
    assert.equal(ring(w, A, messages, 1), Math.round(disp * 1000) / 1000);
    w.handle(2, { t: 'rev', id: 1, v: REVIVE.base * mult / 2 });
    assert.equal(ring(w, A, messages, 1), Math.round(disp / 2 * 1000) / 1000, 'half the gauge is half the drawn arc');
    w.handle(2, { t: 'rev', id: 1, v: 60 });
  }
  assert.equal(ring(w, A, messages, 2), -1);
});

test('the gauge refills after 2.5 seconds without a hit', () => {
  const { w, A } = party(2);
  w.handle(1, { t: 'down', n: 1 });
  const p = w.players.get(1);
  w.handle(2, { t: 'rev', id: 1, v: 9 });
  for (let t = 0; t < 2.4; t += 0.1) { w.time += 0.1; w.tickArea(A, 0.1); }
  assert.equal(p.rev, REVIVE.base - 9, 'still waiting');
  for (let t = 0; t < REVIVE.regen + 0.5; t += 0.1) { w.time += 0.1; w.tickArea(A, 0.1); }
  assert.equal(p.rev, REVIVE.base, 'back to full');
});

test('solo, or everyone down, bleeds out; far or downed allies cannot revive', () => {
  const solo = party(1);
  solo.w.handle(1, { t: 'down', n: 1 });
  assert.equal(got(solo.messages.get(1), 'bleed').length, 1);

  const { w, messages, A } = party(3);
  w.handle(1, { t: 'down', n: 1 });
  w.players.get(3).x = 100;
  w.handle(3, { t: 'rev', id: 1, v: 9 });
  assert.equal(w.players.get(1).rev, REVIVE.base, 'too far away');
  w.players.get(3).x = 20; // 弓の距離なら届く
  w.handle(3, { t: 'rev', id: 1, v: 0.5 });
  assert.equal(w.players.get(1).rev, REVIVE.base - 0.5);
  w.players.get(3).x = 100;
  w.handle(2, { t: 'down', n: 1 });
  w.handle(2, { t: 'rev', id: 1, v: 9 });
  assert.equal(w.players.get(1).rev, REVIVE.base - 0.5, 'a crawling player cannot revive');
  w.players.get(3).dead = true;
  w.tickArea(A, 0.05);
  assert.equal(got(messages.get(1), 'bleed').length, 1);
  assert.equal(got(messages.get(2), 'bleed').length, 1);
});
