// Who this visitor is to the others. Trystero gives every page load a new peer id, so the session
// keeps an id of its own, the member id, in sessionStorage: it lasts as long as the tab, across
// page loads (a door to another page of the same site), so the others can tell it's the same
// person coming back. The name is kept for the tab (sessionStorage) and as the browser's default
// for new tabs (localStorage), so two test windows in one browser keep the names they were given.

const MEMBER_KEY = 'lss.member';
const NAME_KEY = 'lss.name';
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** A new member id: 12 letters and digits. `random` returns [0, 1). */
export function newMemberId(random = Math.random) {
  let s = '';
  for (let i = 0; i < 12; i++) s += ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length)];
  return s;
}

/** A 32-bit FNV-1a hash of a string. */
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The colour a member id is drawn in: a hue from its hash, at a saturation and lightness that
 * read on both the dark floor and the light labels. '#rrggbb'. */
export function colorFor(id) {
  const hue = hash(id) % 360;
  return hslToHex(hue, 0.65, 0.58);
}

export function hslToHex(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

/** A name's cleaned-up form: trimmed, inner whitespace collapsed, at most 24 characters. */
export function cleanName(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
}

/** The default name for a member: 'Guest' and the first four characters of the id. */
export function defaultName(memberId) {
  return `Guest ${memberId.slice(0, 4).toUpperCase()}`;
}

function read(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Private windows and blocked storage: the identity just lasts this page load.
  }
}

/**
 * This visitor's identity: { memberId, name, color }, read from (and saved to) the given storages
 * (sessionStorage and localStorage in a browser; anything with getItem/setItem, or null, in tests).
 */
export function loadIdentity(session, local, random = Math.random) {
  let memberId = read(session, MEMBER_KEY);
  if (!memberId || !/^[a-z0-9]{12}$/.test(memberId)) {
    memberId = newMemberId(random);
    write(session, MEMBER_KEY, memberId);
  }
  const name = cleanName(read(session, NAME_KEY)) || cleanName(read(local, NAME_KEY)) || defaultName(memberId);
  return { memberId, name, color: colorFor(memberId) };
}

/** Saves a new member id (after a clash with another tab, see session.js). */
export function saveMemberId(session, memberId) {
  write(session, MEMBER_KEY, memberId);
}

/** Saves the name for this tab and as the default for new tabs. */
export function saveName(session, local, name) {
  write(session, NAME_KEY, cleanName(name));
  write(local, NAME_KEY, cleanName(name));
}
