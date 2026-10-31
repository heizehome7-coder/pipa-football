import { ArtifactRoomChannel, hasArtifactRuntime } from './channel/ArtifactRoomChannel';
import { NoChannel, type Channel } from './channel/Channel';
import { WebSocketChannel } from './channel/WebSocketChannel';

/**
 * Picks the realtime backend for this copy of the game:
 *  - inside claude.ai (published page) → the artifact's live room
 *  - served over http(s)               → PIPA realtime server at /ws (or VITE_PIPA_WS_URL)
 *  - opened as a local file            → none (online shows as unavailable)
 */
export function createChannel(): Channel {
  if (hasArtifactRuntime()) return new ArtifactRoomChannel();
  if (typeof location === 'undefined' || location.protocol === 'file:') return new NoChannel();
  const env = (import.meta.env.VITE_PIPA_WS_URL as string | undefined) || '';
  const url = env || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  return new WebSocketChannel(url);
}

/** a stable anonymous id for this browser (the claude.ai backend supplies its own) */
export function localUserId() {
  try {
    let id = localStorage.getItem('pipa.uid');
    if (!id) {
      id = `u_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      localStorage.setItem('pipa.uid', id);
    }
    return id;
  } catch {
    return `u_${Math.random().toString(36).slice(2, 10)}`;
  }
}
