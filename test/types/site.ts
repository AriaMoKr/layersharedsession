// A site in TypeScript using the layer as breadboard's together.ts does, by the package's own name,
// so the types are found through package.json's exports as a site finds them. test/types.test.js
// type-checks it (strict); it never runs.
import * as THREE from 'three';
import { cleanName, loadIdentity, saveName, type Identity } from 'layersharedsession/identity.js';
import { isRoom, newRoom, roomFromUrl } from 'layersharedsession/room.js';
import { emptyPose, hasPart, INTERP_DELAY_MS, latestPose, PART, PART_LENGTH, samplePose, setPart, type PoseBuffer } from 'layersharedsession/pose.js';
import { createShared, getValue, setLocal } from 'layersharedsession/shared.js';
import type { Peer, Relays, Session } from 'layersharedsession/session.js';
import { createAvatars, readPose, WAVE_MS, type Avatar, type Hand } from 'layersharedsession/avatars.js';
import { createTogether, RELAY_WAIT_MS, type Company, type Condition, type Notice } from 'layersharedsession/together.js';

const PAGE_ID = 'breadboard';

export async function join(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, hands: () => Hand[]): Promise<() => void> {
  const room: string = roomFromUrl(location.href) ?? newRoom();
  const id: Identity = loadIdentity(sessionStorage, localStorage);
  saveName(sessionStorage, localStorage, cleanName(' Ada  Lovelace '));
  const { joinSession } = await import('layersharedsession/session.js');
  const s: Session = joinSession({ appId: 'ariamokr-layersharedsession-test', room, page: PAGE_ID, identity: id, storage: sessionStorage, pageName: (p) => p });

  const avatars = createAvatars({ parent: scene, font: 'system-ui, sans-serif', ground: (x, z) => 0 * x * z });
  const notices: string[] = [];
  s.on('join', (p: Peer) => {
    const a: Avatar = avatars.show(p);
    notices.push(p.page === PAGE_ID ? `${p.name} is here` : `${p.name} is in the session, in ${a.page}`);
  });
  s.on('update', (p) => {
    const a = avatars.show(p);
    if (a.page !== p.page) a.page = p.page;
  });
  s.on('leave', (p) => avatars.drop(p.peerId));
  s.on('relays', (r: Relays) => notices.push(`${r.open} of ${r.total}`));
  s.on('shared', ({ key, value, from, initial }) => notices.push(`${key} ${String(value)} ${from?.name ?? 'you'} ${initial}`));
  s.on('log', (e) => e.kind === 'error' && notices.push(e.text));
  s.on('self', (self) => notices.push(self.memberId));
  const wave = s.channel<number>('wave');
  const stop = wave.on((n, p) => avatars.wave(p.peerId, performance.now() + n));
  void wave.send(1);
  void wave.send(1, 'some-peer');
  s.set('switch', true);
  const on: boolean = s.get('switch', false);
  const space: string | undefined = s.get<string>('vrlbry.space.x');
  s.setName('Grace');

  const keys = new Map<string, string>();
  const pose = emptyPose();
  const out = emptyPose();
  const frame = (now: number) => {
    s.setPose(readPose(camera, renderer.xr.isPresenting ? hands() : null, pose));
    s.tick();
    avatars.place(now, s.peers, (p, a) => p.page === PAGE_ID && keys.get(a.peerId) !== space);
    for (const p of s.peers.values()) {
      const buffer: PoseBuffer = p.buffer;
      const at = latestPose(buffer) && samplePose(buffer, now - INTERP_DELAY_MS, out);
      if (at && hasPart(at, PART.left)) setPart(out, PART.left, null);
      void ((p.rtt ?? 0) + PART_LENGTH + WAVE_MS + (s.firstPeerAt ?? 0));
    }
  };
  frame(performance.now());
  avatars.clear();
  const shared = createShared();
  setLocal(shared, 'k', 1, id.memberId);
  void [on, isRoom(room), getValue(shared, 'k'), avatars.list.length, avatars.group.name, notices];
  return () => {
    stop();
    void s.leave();
  };
}

/** The same site with the controller (together.js): the layer runs the session, the site words it. */
export function together(scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer, hands: () => Hand[]): () => Promise<void> {
  const t = createTogether({
    appId: 'ariamokr-layersharedsession-test',
    page: PAGE_ID,
    camera,
    renderer,
    hands,
    avatars: { parent: scene, ground: null },
    isHere: (p, a) => a?.page === p.page,
    pageName: (p) => p,
  });
  const words: string[] = [];
  const offChange = t.on('change', () => {
    const c: Company = t.company();
    const k: Condition = t.condition();
    words.push(`${c.here} here, ${c.nearby + c.away} elsewhere, ${c.connecting} connecting`, k.slow ? "Can't reach the relays" : `${k.relays} relays, ${k.failed} failed`);
  });
  t.on('notice', ({ kind, peer, from }: Notice) => words.push(`${peer.name ?? 'Someone'} ${kind} ${from ?? ''}`));
  t.on('session', (s: Session) => s.set(`${PAGE_ID}.space.${s.self.memberId}`, 'stacks'));
  t.start(roomFromUrl(location.href) ?? undefined);
  t.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const room: string | null = t.room;
  const name: string = t.setName(t.self.name);
  const memberId: string = t.self.memberId;
  void [t.wave(), t.inviteLink, t.active, t.paused, t.session?.peers.size, t.people().map((p) => p.rtt), t.avatars?.list.length, room, name, memberId, RELAY_WAIT_MS, words];
  t.update(performance.now());
  return async () => {
    offChange();
    await t.pause();
    t.resume();
    await t.stop();
  };
}
