/**
 * A realtime presence channel: every open client publishes one small state
 * object; everyone receives everyone's, live. Presence disappears when a client
 * disconnects (tab closed, network lost, heartbeat missed).
 *
 * Implementations:
 *  - ArtifactRoomChannel — the claude.ai artifact `room` capability (when PIPA
 *    runs as a published claude.ai page)
 *  - WebSocketChannel    — PIPA's own realtime server (`npm run server`)
 *  - MemoryChannel       — in-process hub for tests
 */
export interface ChannelPeer {
  /** unique per open client (tab); stable while connected */
  peer: string;
  /** platform-vouched user id where available */
  by: string | null;
  /** this very client */
  self: boolean;
  presence: Record<string, unknown>;
  /** receiver's clock (ms) when this peer's presence last changed */
  updatedAt: number;
}

export interface MatchRoom {
  leave(): void;
}

export interface Channel {
  readonly kind: 'artifact' | 'websocket' | 'memory' | 'none';
  /** resolves once connected; rejects when this backend cannot be used here */
  connect(): Promise<void>;
  /** this client's peer label (null until known) */
  selfPeer(): string | null;
  /** platform user id if the backend provides one */
  userId(): Promise<string | null>;
  /** replace this client's presence object */
  setPresence(p: Record<string, unknown>): void;
  onPeers(fn: (peers: ChannelPeer[]) => void): () => void;
  onConnection(fn: (connected: boolean) => void): () => void;
  /** a separate room for one match (future online play); null if unsupported */
  joinRoom(name: string): Promise<MatchRoom | null>;
  close(): void;
}

/** Used when no realtime backend exists for this copy of the game (e.g. opened as a local file). */
export class NoChannel implements Channel {
  readonly kind = 'none' as const;
  async connect() {
    throw new Error('no realtime backend');
  }
  selfPeer() {
    return null;
  }
  async userId() {
    return null;
  }
  setPresence() {}
  onPeers() {
    return () => {};
  }
  onConnection() {
    return () => {};
  }
  async joinRoom() {
    return null;
  }
  close() {}
}
