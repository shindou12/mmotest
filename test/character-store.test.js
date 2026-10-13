import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterStore, CHARACTER_KEY } from '../public/js/character-store.js';

test('permadeath deletes the whole character and blocks delayed saves, while retaining world and normal saves', () => {
  const data = new Map([['eterna_char_v1', 'normal'], ['world', 'party-progress']]);
  const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
  const store = new CharacterStore(storage);
  const character = { lv: 24, inv: [{ name: 'sword' }], tree: { sword_a1: 1 }, quests: { q_slime: { done: true } } };
  store.save(character);assert.deepEqual(store.load(), character);
  assert.equal(store.discard(), true);assert.equal(data.has(CHARACTER_KEY), false);
  store.save(character);assert.equal(data.has(CHARACTER_KEY), false);assert.equal(store.load(), null);
  assert.equal(new CharacterStore(storage).load(), null);
  assert.equal(data.get('eterna_char_v1'), 'normal');assert.equal(data.get('world'), 'party-progress');
});

test('failed removal writes an empty character rather than retaining the previous save', () => {
  const data = new Map([[CHARACTER_KEY, '{"lv":24}']]);
  const storage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v), removeItem: () => { throw new Error('remove blocked'); } };
  assert.equal(new CharacterStore(storage).discard(), true);
  assert.equal(new CharacterStore(storage).load(), null);
});
