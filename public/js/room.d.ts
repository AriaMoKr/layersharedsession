/** A valid room name: 1–40 of a–z, 0–9 and '-', not starting with '-'. @param {unknown} s @returns {s is string} */
export function isRoom(s: unknown): s is string;
/** The room named in `href`'s ?room= (lower-cased), or null when there is none or it isn't valid. @param {string} href @returns {string|null} */
export function roomFromUrl(href: string): string | null;
/** A new room name like 'k3vd-q8hn'. `random` returns [0, 1). @param {() => number} [random] @returns {string} */
export function newRoom(random?: () => number): string;
/** `href` with ?room= set to `room`, everything else kept. @param {string} href @param {string} room @returns {string} */
export function withRoom(href: string, room: string): string;
/**
 * A link from the page at `href` to `target` (relative or absolute) in the same room. The
 * target's own query is kept, and ?room= replaces any it has.
 * @param {string} href
 * @param {string} target
 * @param {string} room
 * @returns {string}
 */
export function linkInRoom(href: string, target: string, room: string): string;
