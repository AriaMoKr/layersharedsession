// Pure: shared values, such as a switch everyone in the room can flip. Each key holds the last
// value written to it. "Last" is decided by a Lamport clock (a counter every write raises past the
// highest it has seen), not by the time of day, because visitors' clocks disagree; two writes with
// the same count are ordered by the writers' member ids. So every visitor that has received the
// same writes holds the same values, whatever order the writes arrived in.

const MAX_KEY = 64;

/** An empty set of shared values. */
export function createShared() {
  return { clock: 0, entries: new Map() };
}

/** Whether entry `a` beats entry `b` (b may be undefined). */
export function wins(a, b) {
  if (!b) return true;
  if (a.clock !== b.clock) return a.clock > b.clock;
  return a.by > b.by;
}

function isKey(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY;
}

function isEntry(e) {
  return (
    e !== null &&
    typeof e === 'object' &&
    Number.isSafeInteger(e.clock) &&
    e.clock > 0 &&
    typeof e.by === 'string' &&
    e.by.length > 0 &&
    e.by.length <= MAX_KEY &&
    'value' in e
  );
}

/** Writes `value` to `key` as member `by`, and returns the entry to send to the others. */
export function setLocal(state, key, value, by) {
  if (!isKey(key)) throw new Error(`shared: bad key ${JSON.stringify(key)}`);
  state.clock += 1;
  const entry = { value, clock: state.clock, by };
  state.entries.set(key, entry);
  return entry;
}

/** Takes an entry received for `key`. Returns true when it replaced the value held. */
export function merge(state, key, entry) {
  if (!isKey(key) || !isEntry(entry)) return false;
  state.clock = Math.max(state.clock, entry.clock);
  if (!wins(entry, state.entries.get(key))) return false;
  state.entries.set(key, { value: entry.value, clock: entry.clock, by: entry.by });
  return true;
}

/** Every entry, as a plain object to send (to a visitor who just arrived). */
export function snapshot(state) {
  const out = {};
  for (const [key, entry] of state.entries) out[key] = entry;
  return out;
}

/** Takes a snapshot (or a single { key: entry } update). Returns the keys whose values changed. */
export function mergeSnapshot(state, snap) {
  const changed = [];
  if (snap === null || typeof snap !== 'object' || Array.isArray(snap)) return changed;
  for (const key of Object.keys(snap)) {
    if (merge(state, key, snap[key])) changed.push(key);
  }
  return changed;
}

/** The value of `key`, or `fallback` when nobody has written it. */
export function getValue(state, key, fallback = undefined) {
  const entry = state.entries.get(key);
  return entry ? entry.value : fallback;
}
