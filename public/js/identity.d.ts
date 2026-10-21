/** A new member id: 12 letters and digits. `random` returns [0, 1). @param {() => number} [random] @returns {string} */
export function newMemberId(random?: () => number): string;
/** A 32-bit FNV-1a hash of a string. @param {string} s @returns {number} */
export function hash(s: string): number;
/** The colour a member id is drawn in: a hue from its hash, at a saturation and lightness that
 * read on both the dark floor and the light labels. '#rrggbb'.
 * @param {string} id
 * @returns {string}
 */
export function colorFor(id: string): string;
/** An HSL colour as '#rrggbb'. @param {number} h degrees @param {number} s 0–1 @param {number} l 0–1 @returns {string} */
export function hslToHex(h: number, s: number, l: number): string;
/** A name's cleaned-up form: trimmed, inner whitespace collapsed, at most 24 characters. @param {unknown} s @returns {string} */
export function cleanName(s: unknown): string;
/** The default name for a member: 'Guest' and the first four characters of the id. @param {string} memberId @returns {string} */
export function defaultName(memberId: string): string;
/**
 * This visitor's identity: { memberId, name, color }, read from (and saved to) the given storages
 * (sessionStorage and localStorage in a browser; anything with getItem/setItem, or null, in tests).
 * @param {StorageLike|null} session
 * @param {StorageLike|null} local
 * @param {() => number} [random]
 * @returns {Identity}
 */
export function loadIdentity(session: StorageLike | null, local: StorageLike | null, random?: () => number): Identity;
/** Saves a new member id (after a clash with another tab, see session.js). @param {StorageLike|null} session @param {string} memberId */
export function saveMemberId(session: StorageLike | null, memberId: string): void;
/**
 * Saves the name for this tab and as the default for new tabs.
 * @param {StorageLike|null} session
 * @param {StorageLike|null} local
 * @param {string} name
 */
export function saveName(session: StorageLike | null, local: StorageLike | null, name: string): void;
/**
 * Who this visitor is: a member id (12 of a–z and 0–9), a name, and the colour drawn for them.
 */
export type Identity = {
    memberId: string;
    name: string;
    color: string;
};
/**
 * Where the identity is kept: sessionStorage and localStorage in a browser, anything with getItem
 * and setItem in tests.
 */
export type StorageLike = {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
};
