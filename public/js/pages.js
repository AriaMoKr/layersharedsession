// Pure: the test's two pages. They share the session (same appId, same ?room=), so a visitor going
// through the door from one to the other leaves the room on one page load and joins it again on
// the next, as a visitor going through one of hallway's doors would.

export const APP_ID = 'ariamokr-layersharedsession-test';

export const PAGES = {
  'page-a': { id: 'page-a', title: 'Page A', file: 'index.html', floor: '#141d2e', grid: '#34507f', accent: '#6ea0ff', other: 'page-b' },
  'page-b': { id: 'page-b', title: 'Page B', file: 'b.html', floor: '#13261d', grid: '#2f6649', accent: '#5fd39a', other: 'page-a' },
};

/** The page with this id; Page A for an unknown one. */
export function pageInfo(id) {
  return PAGES[id] || PAGES['page-a'];
}

/** A page id's title, or the id itself for a page this test doesn't know. */
export function pageTitle(id) {
  return PAGES[id]?.title ?? id ?? '?';
}
