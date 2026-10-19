import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, colorFor, defaultName, hslToHex, loadIdentity, newMemberId, saveMemberId, saveName } from '../public/js/identity.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('newMemberId is 12 lower-case letters and digits', () => {
  for (let i = 0; i < 50; i++) assert.match(newMemberId(), /^[a-z0-9]{12}$/);
});

test('colorFor is stable per id and a #rrggbb colour', () => {
  assert.equal(colorFor('abc'), colorFor('abc'));
  assert.notEqual(colorFor('abcdefghijkl'), colorFor('abcdefghijkm'));
  assert.match(colorFor('abcdefghijkl'), /^#[0-9a-f]{6}$/);
  assert.equal(hslToHex(0, 1, 0.5), '#ff0000');
  assert.equal(hslToHex(120, 1, 0.5), '#00ff00');
});

test('cleanName trims, collapses whitespace and caps the length', () => {
  assert.equal(cleanName('  Aria \n  K  '), 'Aria K');
  assert.equal(cleanName('x'.repeat(40)).length, 24);
  assert.equal(cleanName(null), '');
});

test('loadIdentity keeps the member id for the tab and the name for the browser', () => {
  const session = memoryStorage();
  const local = memoryStorage();
  const a = loadIdentity(session, local);
  assert.match(a.memberId, /^[a-z0-9]{12}$/);
  assert.equal(a.name, defaultName(a.memberId));
  assert.equal(a.color, colorFor(a.memberId));
  // The next page load in the same tab is the same member.
  assert.equal(loadIdentity(session, local).memberId, a.memberId);
  // Another tab (its own sessionStorage) is another member, with the last name saved as default.
  saveName(session, local, '  Aria ');
  const otherTab = memoryStorage();
  const b = loadIdentity(otherTab, local);
  assert.notEqual(b.memberId, a.memberId);
  assert.equal(b.name, 'Aria');
  // Renaming the other tab doesn't rename this one.
  saveName(otherTab, local, 'Window 2');
  assert.equal(loadIdentity(session, local).name, 'Aria');
  assert.equal(loadIdentity(otherTab, local).name, 'Window 2');
  saveMemberId(session, 'zzzzzzzzzzzz');
  assert.equal(loadIdentity(session, local).memberId, 'zzzzzzzzzzzz');
});

test('loadIdentity works without storage, and replaces a malformed id', () => {
  const a = loadIdentity(null, null);
  assert.match(a.memberId, /^[a-z0-9]{12}$/);
  const session = memoryStorage();
  session.setItem('lss.member', '<bad>');
  assert.match(loadIdentity(session, null).memberId, /^[a-z0-9]{12}$/);
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.match(loadIdentity(throwing, throwing).memberId, /^[a-z0-9]{12}$/);
});
