import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/shared/sim.js';
import { REVIVE, REVIVE_FULL } from '../public/shared/balance.js';

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

test('a downed player crawls, allies are notified, and enough stun from allies revives them', () => {
  const { w, messages, A } = party(2);
  w.handle(1, { t: 'down', g: REVIVE.base });
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
  w.handle(1, { t: 'down', g: REVIVE.base });
  w.handle(2, { t: 'rev', id: 1, v: 27.2 });
  assert.equal(w.players.get(1).down, false);
});

test('the gauge grows with recent downs, capped at one full circle, and is sent in the snapshot', () => {
  const { w, messages, A } = party(2);
  w.handle(1, { t: 'down', g: 999 });
  assert.equal(w.players.get(1).rev, REVIVE_FULL);
  w.snapshot(A);
  const snap = got(messages.get(2), 'snap').at(-1);
  assert.equal(snap.p.find(p => p[0] === 1)[21], 1);
  assert.equal(snap.p.find(p => p[0] === 2)[21], -1);
});

test('solo, or everyone down, bleeds out; far or downed allies cannot revive', () => {
  const solo = party(1);
  solo.w.handle(1, { t: 'down', g: REVIVE.base });
  assert.equal(got(solo.messages.get(1), 'bleed').length, 1);

  const { w, messages, A } = party(3);
  w.handle(1, { t: 'down', g: REVIVE.base });
  w.players.get(3).x = 100;
  w.handle(3, { t: 'rev', id: 1, v: 9 });
  assert.equal(w.players.get(1).rev, REVIVE.base, 'too far away');
  w.players.get(3).x = 20; // 弓の距離なら届く
  w.handle(3, { t: 'rev', id: 1, v: 0.5 });
  assert.equal(w.players.get(1).rev, REVIVE.base - 0.5);
  w.players.get(3).x = 100;
  w.handle(2, { t: 'down', g: REVIVE.base });
  w.handle(2, { t: 'rev', id: 1, v: 9 });
  assert.equal(w.players.get(1).rev, REVIVE.base - 0.5, 'a crawling player cannot revive');
  w.players.get(3).dead = true;
  w.tickArea(A, 0.05);
  assert.equal(got(messages.get(1), 'bleed').length, 1);
  assert.equal(got(messages.get(2), 'bleed').length, 1);
});
