import type { Channel, ChannelPeer, MatchRoom } from './Channel';

/* Minimal typing of the claude.ai artifact runtime (`room` + `user` capabilities). */
interface RoomPeer {
  peer: string;
  by: string | null;
  isMe: boolean;
  sameTab: boolean;
  presence: Readonly<Record<string, unknown>>;
  updatedAt: number;
}
interface Room {
  presence(patch: Record<string, unknown>): Promise<void>;
  peers(): readonly RoomPeer[];
  onPeers(fn: (c: { peers: readonly RoomPeer[] }) => void, onError?: (e: { code: string }) => void): () => void;
  onConnection(fn: (c: boolean) => void, onError?: (e: { code: string }) => void): () => void;
  join(name: string): Promise<{ leave(): Promise<void> }>;
}
interface UserCap {
  id?: () => Promise<string>;
}
interface ClaudeRuntime {
  use(name: string): Promise<unknown>;
}

export function hasArtifactRuntime() {
  const c = (globalThis as unknown as { claude?: ClaudeRuntime }).claude;
  return !!c && typeof c.use === 'function';
}

/**
 * Presence over the artifact's live room. Anyone the platform admits to the
 * room may set presence (no editor rights needed), it is cleared when they
 * leave, and newcomers receive everyone's current object — exactly the
 * semantics the lobby protocol needs.
 */
export class ArtifactRoomChannel implements Channel {
  readonly kind = 'artifact' as const;
  private room: Room | null = null;
  private user: UserCap | null = null;
  private sentKeys = new Set<string>();

  async connect() {
    const c = (globalThis as unknown as { claude?: ClaudeRuntime }).claude;
    if (!c?.use) throw new Error('no artifact runtime');
    const room = (await c.use('room')) as Room | null;
    if (!room) throw new Error('room capability unavailable for this viewer');
    this.room = room;
    try {
      this.user = (await c.use('user')) as UserCap | null;
    } catch {
      this.user = null;
    }
  }

  selfPeer() {
    const me = this.room?.peers().find((p) => p.isMe && p.sameTab);
    return me?.peer ?? null;
  }

  async userId() {
    try {
      return (await this.user?.id?.()) ?? null;
    } catch {
      return null;
    }
  }

  setPresence(p: Record<string, unknown>) {
    if (!this.room) return;
    const patch: Record<string, unknown> = { ...p };
    // fields we sent before but no longer have → remove
    for (const k of this.sentKeys) if (!(k in p)) patch[k] = null;
    this.sentKeys = new Set(Object.keys(p));
    this.room.presence(patch).catch(() => {});
  }

  onPeers(fn: (peers: ChannelPeer[]) => void) {
    if (!this.room) return () => {};
    return this.room.onPeers(
      (c) =>
        fn(
          c.peers.map((p) => ({
            peer: p.peer,
            by: p.by,
            self: p.isMe && p.sameTab,
            presence: p.presence as Record<string, unknown>,
            updatedAt: p.updatedAt,
          })),
        ),
      () => fn([]),
    );
  }

  onConnection(fn: (c: boolean) => void) {
    if (!this.room) return () => {};
    return this.room.onConnection(fn, () => fn(false));
  }

  async joinRoom(name: string): Promise<MatchRoom | null> {
    if (!this.room) return null;
    try {
      const r = await this.room.join(name);
      return { leave: () => void r.leave().catch(() => {}) };
    } catch {
      return null;
    }
  }

  close() {
    if (!this.room) return;
    const clear: Record<string, unknown> = {};
    for (const k of this.sentKeys) clear[k] = null;
    this.room.presence(clear).catch(() => {});
    this.sentKeys.clear();
  }
}
