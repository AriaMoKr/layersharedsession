/** An empty set of shared values. @returns {Shared} */
export function createShared(): Shared;
/** Whether entry `a` beats entry `b` (b may be undefined). @param {Entry} a @param {Entry} [b] @returns {boolean} */
export function wins(a: Entry, b?: Entry): boolean;
/**
 * Writes `value` to `key` as member `by`, and returns the entry to send to the others.
 * @param {Shared} state
 * @param {string} key  1–64 characters
 * @param {unknown} value
 * @param {string} by
 * @returns {Entry}
 */
export function setLocal(state: Shared, key: string, value: unknown, by: string): Entry;
/** Takes an entry received for `key`. Returns true when it replaced the value held. @param {Shared} state @param {string} key @param {unknown} entry @returns {boolean} */
export function merge(state: Shared, key: string, entry: unknown): boolean;
/** Every entry, as a plain object to send (to a visitor who just arrived). @param {Shared} state @returns {Record<string, Entry>} */
export function snapshot(state: Shared): Record<string, Entry>;
/** Takes a snapshot (or a single { key: entry } update). Returns the keys whose values changed. @param {Shared} state @param {unknown} snap @returns {string[]} */
export function mergeSnapshot(state: Shared, snap: unknown): string[];
/** The value of `key`, or `fallback` when nobody has written it. @param {Shared} state @param {string} key @param {unknown} [fallback] @returns {unknown} */
export function getValue(state: Shared, key: string, fallback?: unknown): unknown;
/**
 * a value, its Lamport time and writer
 */
export type Entry = {
    value: unknown;
    clock: number;
    by: string;
};
export type Shared = {
    clock: number;
    entries: Map<string, Entry>;
};
