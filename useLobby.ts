import { useSyncExternalStore } from 'react';
import type { LobbyClient, LobbySnapshot } from './LobbyClient';

const noop = () => () => {};
const none = () => null;

/** Live snapshot of the lobby client (null when not logged in). */
export function useLobby(lobby: LobbyClient | null): LobbySnapshot | null {
  return useSyncExternalStore(lobby ? lobby.subscribe : noop, lobby ? lobby.getSnapshot : none);
}
