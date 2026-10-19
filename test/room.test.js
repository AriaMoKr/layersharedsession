import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRoom, linkInRoom, newRoom, roomFromUrl, withRoom } from '../public/js/room.js';

test('roomFromUrl reads ?room=, lower-cased', () => {
  assert.equal(roomFromUrl('https://example.org/x/?room=K3VD-q8hn'), 'k3vd-q8hn');
  assert.equal(roomFromUrl('https://example.org/x/?a=1&room=abc'), 'abc');
});

test('roomFromUrl rejects missing and invalid rooms', () => {
  assert.equal(roomFromUrl('https://example.org/'), null);
  assert.equal(roomFromUrl('https://example.org/?room='), null);
  assert.equal(roomFromUrl('https://example.org/?room=-abc'), null);
  assert.equal(roomFromUrl('https://example.org/?room=a%20b'), null);
  assert.equal(roomFromUrl(`https://example.org/?room=${'a'.repeat(41)}`), null);
  assert.equal(roomFromUrl('not a url'), null);
});

test('newRoom makes valid, unambiguous names', () => {
  let i = 0;
  const seq = [0, 0.99, 0.5, 0.25, 0.1, 0.9, 0.3, 0.7];
  const room = newRoom(() => seq[i++ % seq.length]);
  assert.match(room, /^[a-z2-9]{4}-[a-z2-9]{4}$/);
  assert.ok(isRoom(room));
  for (let n = 0; n < 200; n++) {
    const r = newRoom();
    assert.ok(isRoom(r));
    assert.doesNotMatch(r, /[01ilo]/);
  }
});

test('withRoom sets the room and keeps the rest', () => {
  assert.equal(withRoom('https://example.org/p/b.html?x=1#h', 'abc'), 'https://example.org/p/b.html?x=1&room=abc#h');
  assert.equal(withRoom('https://example.org/?room=old', 'new'), 'https://example.org/?room=new');
});

test('linkInRoom resolves a relative page and carries the room', () => {
  assert.equal(linkInRoom('https://ariamokr.github.io/test/index.html?room=abc', 'b.html', 'abc'), 'https://ariamokr.github.io/test/b.html?room=abc');
  assert.equal(linkInRoom('https://ariamokr.github.io/hallway/?room=abc', 'https://ariamokr.github.io/vrlbry/?place=x', 'abc'), 'https://ariamokr.github.io/vrlbry/?place=x&room=abc');
});
