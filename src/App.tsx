import { useEffect, useRef, useState } from 'react';
import { ChallengePanel, NoticeStack } from './components/OnlineOverlays';
import type { GameMode, PlayerProfile } from './game/core/types';
import { createChannel, localUserId } from './online/createChannel';
import { LobbyClient } from './online/LobbyClient';
import { useLobby } from './online/useLobby';
import { GameScreen } from './screens/GameScreen';
import { LoginScreen } from './screens/LoginScreen';
import { MatchFoundScreen } from './screens/MatchFoundScreen';
import { ModeSelectScreen } from './screens/ModeSelectScreen';
import { OnlineLobbyScreen } from './screens/OnlineLobbyScreen';
import { PlayTypeScreen } from './screens/PlayTypeScreen';

type Screen =
  | { name: 'login' }
  | { name: 'playtype' }
  | { name: 'modes' }
  | { name: 'game'; mode: GameMode }
  | { name: 'lobby' }
  | { name: 'match' };

export default function App() {
  const [user, setUser] = useState<PlayerProfile | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'login' });
  const [lobby, setLobby] = useState<LobbyClient | null>(null);
  const snap = useLobby(lobby);
  const lastMatch = useRef<string | null>(null);

  // presence goes live right after login (so challenges can reach you anywhere)
  const login = (p: PlayerProfile) => {
    setUser(p);
    const channel = createChannel();
    // inside claude.ai the platform itself removes people who leave; phones freeze
    // timers in the background, so never hide a still-connected player on a timer there
    const client = new LobbyClient(channel, { nickname: p.nickname, userId: localUserId() }, channel.kind === 'artifact' ? { staleMs: 30 * 60_000 } : {});
    void client.start();
    (window as unknown as { __PIPA_LOBBY?: LobbyClient }).__PIPA_LOBBY = client; // test/debug hook
    setLobby(client);
    setScreen({ name: 'playtype' });
  };
  const logout = () => {
    lobby?.stop();
    setLobby(null);
    setUser(null);
    setScreen({ name: 'login' });
  };
  useEffect(() => () => lobby?.stop(), [lobby]);
  // coming back from the background: re-announce presence immediately
  useEffect(() => {
    if (!lobby) return;
    const wake = () => {
      if (document.visibilityState === 'visible') lobby.tick();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [lobby]);

  // a match (accepted by either side) takes both players to MATCH FOUND
  const matchId = snap?.match?.matchId ?? null;
  useEffect(() => {
    if (matchId && matchId !== lastMatch.current) {
      lastMatch.current = matchId;
      setScreen({ name: 'match' });
    }
    if (!matchId) lastMatch.current = null;
  }, [matchId]);

  const leaveMatch = () => {
    lobby?.leaveMatch();
    setScreen({ name: 'lobby' });
  };

  let body;
  if (screen.name === 'login' || !user) {
    body = <LoginScreen onLogin={login} />;
  } else if (screen.name === 'playtype') {
    body = (
      <PlayTypeScreen
        user={user}
        onSolo={() => setScreen({ name: 'modes' })}
        onOnline={() => setScreen({ name: 'lobby' })}
        onLogout={logout}
      />
    );
  } else if (screen.name === 'modes') {
    body = (
      <ModeSelectScreen
        user={user}
        onSelect={(mode) => setScreen({ name: 'game', mode })}
        onLogout={() => setScreen({ name: 'playtype' })}
        topActionLabel="‹ 뒤로"
      />
    );
  } else if (screen.name === 'game') {
    body = <GameScreen key={screen.mode} mode={screen.mode} user={user} onExit={() => setScreen({ name: 'modes' })} />;
  } else if (screen.name === 'lobby' && lobby && snap) {
    body = <OnlineLobbyScreen lobby={lobby} snap={snap} onBack={() => setScreen({ name: 'playtype' })} />;
  } else if (screen.name === 'match' && lobby && snap?.match) {
    body = <MatchFoundScreen lobby={lobby} match={snap.match} onLeave={leaveMatch} />;
  } else {
    body = <PlayTypeScreen user={user} onSolo={() => setScreen({ name: 'modes' })} onOnline={() => setScreen({ name: 'lobby' })} onLogout={logout} />;
  }

  return (
    <>
      <div className="app-frame">{body}</div>
      {lobby && snap && user && screen.name !== 'match' && <ChallengePanel lobby={lobby} snap={snap} />}
      {lobby && snap && user && <NoticeStack lobby={lobby} snap={snap} />}
    </>
  );
}
