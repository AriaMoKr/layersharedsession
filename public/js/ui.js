// The panel over the scene: the room and its invitation link, your name, the door to the other page,
// the relays, the shared switch, everyone in the session with their round trip, and the log, whose
// times are seconds since this page began loading. Names come from other visitors, so they only
// ever go in as text, never as HTML.
import { pageTitle } from './pages.js';

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

const MAX_LOG = 300;

export function createUi(root, page) {
  const roomCode = el('code', { class: 'room' });
  const copyBtn = el('button', { type: 'button', text: 'Copy invite link' });
  const nameInput = el('input', { type: 'text', maxlength: '24', 'aria-label': 'Your name', autocomplete: 'off', spellcheck: 'false' });
  const selfDot = el('span', { class: 'dot' });
  const otherLink = el('a', { class: 'button door' });
  const relays = el('span', { class: 'relays', text: 'connecting…' });
  const switchBtn = el('button', { type: 'button', class: 'switch', 'aria-pressed': 'false', text: 'Switch: off' });
  const switchBy = el('span', { class: 'muted' });
  const waveBtn = el('button', { type: 'button', text: 'Wave' });
  const vrBtn = el('button', { type: 'button', class: 'vr', hidden: '' , text: 'Enter VR' });
  const peerCount = el('span', { class: 'muted', text: '0' });
  const peerList = el('ul', { class: 'peers' });
  const emptyPeers = el('li', { class: 'muted', text: 'Nobody else yet. Open the invite link in another window or on another device.' });
  const logBox = el('div', { class: 'log', role: 'log' });
  const toggle = el('button', { type: 'button', class: 'collapse', 'aria-expanded': 'true', 'aria-label': 'Hide the panel', text: '▾' });
  const body = el('div', { class: 'body' });

  body.append(
    el('div', { class: 'row' }, el('span', { class: 'label', text: 'Room' }), roomCode, copyBtn),
    el('div', { class: 'row' }, el('span', { class: 'label', text: 'You' }), selfDot, nameInput),
    el('div', { class: 'row' }, otherLink, vrBtn),
    el('div', { class: 'row' }, el('span', { class: 'label', text: 'Relays' }), relays),
    el('div', { class: 'row' }, switchBtn, waveBtn, switchBy),
    el('div', { class: 'section' }, el('span', { class: 'label', text: 'In the session ' }), peerCount),
    peerList,
    el('details', { open: '' }, el('summary', { text: 'Log' }), logBox),
  );
  root.append(
    el('div', { class: 'head' }, el('strong', { text: `Shared session test · ${page.title}` }), toggle),
    body,
  );
  root.style.setProperty('--accent', page.accent);
  peerList.append(emptyPeers);

  toggle.addEventListener('click', () => {
    const open = body.hidden;
    body.hidden = !open;
    toggle.textContent = open ? '▾' : '▸';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Hide the panel' : 'Show the panel');
  });
  if (matchMedia('(max-width: 600px)').matches) toggle.click();

  let invite = '';
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(invite);
      copyBtn.textContent = 'Copied';
    } catch {
      prompt('Copy this link:', invite);
    }
    setTimeout(() => (copyBtn.textContent = 'Copy invite link'), 1500);
  });

  return {
    setRoom(room, inviteHref) {
      roomCode.textContent = room;
      invite = inviteHref;
    },
    setSelf(self) {
      if (document.activeElement !== nameInput) nameInput.value = self.name;
      selfDot.style.background = self.color;
    },
    setOther(href, title) {
      otherLink.href = href;
      otherLink.textContent = `Go to ${title} →`;
    },
    setRelays({ open, total }) {
      relays.textContent = `${open} of ${total} connected`;
      relays.classList.toggle('bad', open === 0);
    },
    setSwitch(on, byName) {
      switchBtn.textContent = `Switch: ${on ? 'on' : 'off'}`;
      switchBtn.setAttribute('aria-pressed', String(on));
      switchBy.textContent = byName ? `set by ${byName}` : '';
    },
    showVR(show) {
      vrBtn.hidden = !show;
    },
    setVRLabel(text) {
      vrBtn.textContent = text;
    },

    /** Lists the session's visitors (Trystero's peers, see session.js), those on this page first. */
    setPeers(peers, myPage) {
      const list = [...peers].sort((a, b) => (b.page === myPage) - (a.page === myPage) || (a.name || '').localeCompare(b.name || ''));
      peerCount.textContent = String(list.length);
      peerList.replaceChildren();
      if (!list.length) {
        peerList.append(emptyPeers);
        return;
      }
      for (const p of list) {
        const where = p.page === null ? 'saying hello…' : p.page === myPage ? 'here' : `on ${pageTitle(p.page)}`;
        const stats = [];
        if (p.rtt !== null) stats.push(`${Math.round(p.rtt)} ms`);
        if (p.helloAt !== null) stats.push(`seen at ${(p.helloAt / 1000).toFixed(1)} s`);
        if (p.backAfter !== null) stats.push(`back after ${(p.backAfter / 1000).toFixed(1)} s`);
        const dot = el('span', { class: 'dot' });
        dot.style.background = p.color;
        peerList.append(
          el(
            'li',
            {},
            dot,
            el('span', { class: 'name', text: p.name || `peer ${p.peerId.slice(0, 6)}` }),
            el('span', { class: p.page === myPage ? 'where here' : 'where', text: where }),
            el('span', { class: 'stats muted', text: stats.join(' · ') }),
          ),
        );
      }
    },

    addLog({ t, kind, text }) {
      const line = el('div', { class: `line ${kind}` }, el('span', { class: 't', text: `${(t / 1000).toFixed(1)} s` }), el('span', { text }));
      const atBottom = logBox.scrollTop + logBox.clientHeight >= logBox.scrollHeight - 4;
      logBox.append(line);
      while (logBox.childElementCount > MAX_LOG) logBox.firstElementChild.remove();
      if (atBottom) logBox.scrollTop = logBox.scrollHeight;
    },

    onName(fn) {
      nameInput.addEventListener('change', () => fn(nameInput.value));
    },
    onSwitch(fn) {
      switchBtn.addEventListener('click', () => fn());
    },
    onWave(fn) {
      waveBtn.addEventListener('click', () => fn());
    },
    onVR(fn) {
      vrBtn.addEventListener('click', () => fn());
    },
    onDoor(fn) {
      otherLink.addEventListener('click', (e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        fn();
      });
    },
  };
}
