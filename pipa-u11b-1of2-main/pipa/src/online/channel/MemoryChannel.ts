import type { Channel, ChannelPeer, MatchRoom } from './Channel';

/** In-process presence hub for deterministic tests (several clients, one clock). */
export class MemoryHub {
  private members = new Map<string, { presence: Record<string, unknown>; updatedAt: number; ch: MemoryChannel }>();
  private seq = 0;
  private scheduled = false;
  constructor(public now: () => number = () => Date.now()) {}

  /** deliveries are async (like a network), coalesced per tick */
  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    setTimeout(() => {
      this.scheduled = false;
      this.broadcast();
    }, 0);
  }
  /** wait until all pending deliveries (and reactions to them) have settled */
  async settle(rounds = 6) {
    for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
  }

  attach(ch: MemoryChannel) {
    const peer = `m${++this.seq}`;
    this.members.set(peer, { presence: {}, updatedAt: this.now(), ch });
    this.schedule();
    return peer;
  }
  set(peer: string, p: Record<string, unknown>) {
    const m = this.members.get(peer);
    if (!m) return;
    if (JSON.stringify(m.presence) !== JSON.stringify(p)) {
      m.presence = JSON.parse(JSON.stringify(p));
      m.updatedAt = this.now();
    }
    this.schedule();
  }
  detach(peer: string) {
    this.members.delete(peer);
    this.schedule();
  }
  broadcast() {
    for (const [, m] of this.members) {
      const list: ChannelPeer[] = [...this.members.entries()].map(([peer, x]) => ({
        peer,
        by: null,
        self: x.ch === m.ch,
        presence: x.presence,
        updatedAt: x.updatedAt,
      }));
      if (!m.ch.frozen) m.ch.deliver(list);
    }
  }
}

export class MemoryChannel implements Channel {
  readonly kind = 'memory' as const;
  private peer: string | null = null;
  private subs = new Set<(p: ChannelPeer[]) => void>();
  private last: ChannelPeer[] = [];
  /** set true to simulate a frozen client (no more deliveries) */
  frozen = false;

  constructor(private hub: MemoryHub) {}

  async connect() {
    this.peer = this.hub.attach(this);
  }
  selfPeer() {
    return this.peer;
  }
  async userId() {
    return null;
  }
  setPresence(p: Record<string, unknown>) {
    if (this.peer && !this.frozen) this.hub.set(this.peer, p);
  }
  deliver(list: ChannelPeer[]) {
    this.last = list;
    this.subs.forEach((f) => f(list));
  }
  onPeers(fn: (p: ChannelPeer[]) => void) {
    this.subs.add(fn);
    fn(this.last);
    return () => {
      this.subs.delete(fn);
    };
  }
  onConnection(fn: (c: boolean) => void) {
    fn(!!this.peer);
    return () => {};
  }
  async joinRoom(): Promise<MatchRoom | null> {
    return { leave: () => {} };
  }
  close() {
    if (this.peer) this.hub.detach(this.peer);
    this.peer = null;
  }
}
