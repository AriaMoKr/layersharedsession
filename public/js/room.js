// Pure: the room a page joins, and the links that carry it. A room is named in the page's URL
// (?room=…), so an invitation is just a link, and a link to another page (or another site) that
// keeps ?room= takes the visitor into the same session there.

// Letters and digits that can't be mistaken for each other when read aloud or typed from a headset.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const ROOM_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** A valid room name: 1–40 of a–z, 0–9 and '-', not starting with '-'. @param {unknown} s @returns {s is string} */
export function isRoom(s) {
  return typeof s === 'string' && ROOM_RE.test(s);
}

/** The room named in `href`'s ?room= (lower-cased), or null when there is none or it isn't valid. @param {string} href @returns {string|null} */
export function roomFromUrl(href) {
  let raw;
  try {
    raw = new URL(href).searchParams.get('room');
  } catch {
    return null;
  }
  if (raw === null) return null;
  const room = raw.trim().toLowerCase();
  return isRoom(room) ? room : null;
}

/** A new room name like 'k3vd-q8hn'. `random` returns [0, 1). @param {() => number} [random] @returns {string} */
export function newRoom(random = Math.random) {
  let s = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) s += '-';
    s += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return s;
}

/** `href` with ?room= set to `room`, everything else kept. @param {string} href @param {string} room @returns {string} */
export function withRoom(href, room) {
  const url = new URL(href);
  url.searchParams.set('room', room);
  return url.href;
}

/**
 * A link from the page at `href` to `target` (relative or absolute) in the same room. The
 * target's own query is kept, and ?room= replaces any it has.
 * @param {string} href
 * @param {string} target
 * @param {string} room
 * @returns {string}
 */
export function linkInRoom(href, target, room) {
  return withRoom(new URL(target, href).href, room);
}
