import type { Channel, ChannelPeer, MatchRoom } from './Channel';

interface WirePeer {
  peer: string;
  p: Record<string, unknown>;
}

/**
 * Presence over PIPA's own realtime server (server/realtime-server.mjs).
 * Reconnects automatically and re-sends its presence after a reconnect.
 */
export class WebSocketChannel implements Channel {
  readonly kind = 'websocket' as const;
  private ws: WebSocket | null = null;
  private me: string | null = null;
  private presence: Record<string, unknown> = {};
  private peers = new Map<string, ChannelPeer>();
  private peerSubs = new Set<(p: ChannelPeer[]) => void>();
  private connSubs = new Set<(c: boolean) => void>();
  private rooms = new Set<string>();
  private closed = false;
  private retry = 0;
  private isOpen = false;

  constructor(private url: string) {}

  connect() {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('timeout'));
        }
      }, 6000);
      this.open(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      }, () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('cannot reach realtime server'));
        }
      });
    });
  }

  private open(onWelcome?: () => void, onFail?: () => void) {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      onFail?.();
      return;
    }
    this.ws = ws;
    let welcomed = false;
    ws.onmessage = (ev) => {
      let msg: { t: string; peer?: string; room?: string; peers?: WirePeer[] };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.t === 'welcome' && msg.peer) {
        welcomed = true;
        this.me = msg.peer;
        this.retry = 0;
        this.setConn(true);
        this.send({ t: 'presence', p: this.presence });
        for (const r of this.rooms) this.send({ t: 'join', room: r });
        onWelcome?.();
      } else if (msg.t === 'peers' && !msg.room && msg.peers) {
        this.applyPeers(msg.peers);
      }
    };
    ws.onclose = () => {
      this.setConn(false);
      if (!welcomed) onFail?.();
      if (this.closed) return;
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => !this.closed && this.open(), delay);
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private applyPeers(list: WirePeer[]) {
    const now = Date.now();
    const next = new Map<string, ChannelPeer>();
    for (const w of list) {
      const prev = this.peers.get(w.peer);
      const same = prev && JSON.stringify(prev.presence) === JSON.stringify(w.p);
      next.set(w.peer, {
        peer: w.peer,
        by: null,
        self: w.peer === this.me,
        presence: same ? prev!.presence : w.p,
        updatedAt: same ? prev!.updatedAt : now,
      });
    }
    this.peers = next;
    const arr = [...next.values()];
    this.peerSubs.forEach((f) => f(arr));
  }

  private setConn(c: boolean) {
    if (c === this.isOpen) return;
    this.isOpen = c;
    this.connSubs.forEach((f) => f(c));
  }

  private send(m: unknown) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
  }

  selfPeer() {
    return this.me;
  }

  async userId() {
    return null;
  }

  setPresence(p: Record<string, unknown>) {
    this.presence = p;
    this.send({ t: 'presence', p });
  }

  onPeers(fn: (p: ChannelPeer[]) => void) {
    this.peerSubs.add(fn);
    if (this.peers.size) fn([...this.peers.values()]);
    return () => {
      this.peerSubs.delete(fn);
    };
  }

  onConnection(fn: (c: boolean) => void) {
    this.connSubs.add(fn);
    queueMicrotask(() => fn(this.isOpen));
    return () => {
      this.connSubs.delete(fn);
    };
  }

  async joinRoom(name: string): Promise<MatchRoom | null> {
    this.rooms.add(name);
    this.send({ t: 'join', room: name });
    return {
      leave: () => {
        this.rooms.delete(name);
        this.send({ t: 'leave', room: name });
      },
    };
  }

  close() {
    this.closed = true;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.setConn(false);
  }
}
