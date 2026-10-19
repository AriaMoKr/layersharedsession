import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShared, getValue, merge, mergeSnapshot, setLocal, snapshot, wins } from '../public/js/shared.js';

test('a local write raises the clock and is the value', () => {
  const s = createShared();
  const e1 = setLocal(s, 'switch', true, 'aaaa');
  const e2 = setLocal(s, 'switch', false, 'aaaa');
  assert.equal(e1.clock, 1);
  assert.equal(e2.clock, 2);
  assert.equal(getValue(s, 'switch'), false);
  assert.equal(getValue(s, 'other', 'none'), 'none');
});

test('the higher clock wins, then the higher member id', () => {
  assert.ok(wins({ clock: 2, by: 'a' }, { clock: 1, by: 'z' }));
  assert.ok(!wins({ clock: 1, by: 'z' }, { clock: 2, by: 'a' }));
  assert.ok(wins({ clock: 3, by: 'b' }, { clock: 3, by: 'a' }));
  assert.ok(!wins({ clock: 3, by: 'a' }, { clock: 3, by: 'a' }));
  assert.ok(wins({ clock: 1, by: 'a' }, undefined));
});

test('two visitors end up with the same value whatever order the writes arrive in', () => {
  const a = createShared();
  const b = createShared();
  const fromA = setLocal(a, 'switch', true, 'memberaaaaaa');
  const fromB = setLocal(b, 'switch', false, 'memberbbbbbb'); // same clock (1): b's id is higher
  assert.ok(merge(a, 'switch', fromB));
  assert.ok(!merge(b, 'switch', fromA));
  assert.equal(getValue(a, 'switch'), false);
  assert.equal(getValue(b, 'switch'), false);
  // A write made after seeing the other's beats it, even from the lower id.
  const later = setLocal(a, 'switch', true, 'memberaaaaaa');
  assert.equal(later.clock, 2);
  assert.ok(merge(b, 'switch', later));
  assert.equal(getValue(b, 'switch'), true);
});

test('a newcomer takes the snapshot, and stale or repeated entries change nothing', () => {
  const old = createShared();
  setLocal(old, 'switch', true, 'memberaaaaaa');
  setLocal(old, 'color', 'red', 'memberaaaaaa');
  const newcomer = createShared();
  assert.deepEqual(mergeSnapshot(newcomer, snapshot(old)).sort(), ['color', 'switch']);
  assert.equal(getValue(newcomer, 'color'), 'red');
  assert.deepEqual(mergeSnapshot(newcomer, snapshot(old)), []);
  // The newcomer's clock moved past what it saw, so its next write wins.
  assert.equal(setLocal(newcomer, 'switch', false, 'membernnnnnn').clock, 3);
});

test('malformed entries and snapshots are ignored', () => {
  const s = createShared();
  assert.ok(!merge(s, 'k', null));
  assert.ok(!merge(s, 'k', { value: 1, clock: 0, by: 'a' }));
  assert.ok(!merge(s, 'k', { value: 1, clock: 1.5, by: 'a' }));
  assert.ok(!merge(s, 'k', { value: 1, clock: 1, by: '' }));
  assert.ok(!merge(s, 'k', { clock: 1, by: 'a' }));
  assert.ok(!merge(s, '', { value: 1, clock: 1, by: 'a' }));
  assert.deepEqual(mergeSnapshot(s, null), []);
  assert.deepEqual(mergeSnapshot(s, [1, 2]), []);
  assert.deepEqual(mergeSnapshot(s, 'x'), []);
  assert.throws(() => setLocal(s, '', 1, 'a'));
});
