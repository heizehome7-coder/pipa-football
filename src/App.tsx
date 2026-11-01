import { useEffect, useRef, useState } from 'react';
import { ChallengePanel, NoticeStack } from './components/OnlineOverlays';
import type { GameMode, PlayerProfile } from './game/core/types';
import type { Channel } from './online/channel/Channel';
import { createChannel, localUserId } from './online/createChannel';
import { LobbyClient } from './online/LobbyClient';
import { useLobby } from './online/useLobby';
import { GameScreen } from './screens/GameScreen';
import { LoginScreen } from './screens/LoginScreen';
import { ModeSelectScreen } from './screens/ModeSelectScreen';
import { OnlineLobbyScreen } from './screens/OnlineLobbyScreen';
import { OnlineMatchScreen } from './screens/OnlineMatchScreen';
import { PlayTypeScreen } from './screens/PlayTypeScreen';
import { SelectKickerScreen } from './screens/SelectKickerScreen';
import { SquadScreen } from './screens/SquadScreen';
import { getPlayer, type PlayerDef } from './players/players';
import { DEFAULT_SQUAD, loadSquad, saveSquad, type Squad } from './players/squad';

type Screen =
  | { name: 'login' }
  | { name: 'squad-setup' }
  | { name: 'squad' }
  | { name: 'select-kicker' }
  | { name: 'playtype' }
  | { name: 'modes' }
  | { name: 'game'; mode: GameMode; player: PlayerDef | null }
  | { name: 'lobby' }
  | { name: 'match' };

export default function App() {
  const [user, setUser] = useState<PlayerProfile | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'login' });
  const [lobby, setLobby] = useState<LobbyClient | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [squad, setSquad] = useState<Squad | null>(null);
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
    setChannel(channel);
    // UPDATE 4: first time on this device → BUILD YOUR SQUAD (never forced again)
    const saved = loadSquad(p.nickname);
    setSquad(saved);
    setScreen(saved ? { name: 'playtype' } : { name: 'squad-setup' });
  };
  const logout = () => {
    lobby?.stop();
    setLobby(null);
    setChannel(null);
    setSquad(null);
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

  const storeSquad = (s: Squad) => {
    if (user) saveSquad(user.nickname, s);
    setSquad(s);
    setScreen({ name: 'playtype' });
  };
  const mySquad = squad ?? DEFAULT_SQUAD;
  const home = (
    <PlayTypeScreen
      user={user ?? { nickname: '' }}
      squad={squad}
      onSolo={() => setScreen({ name: 'modes' })}
      onOnline={() => setScreen({ name: 'lobby' })}
      onSquad={() => setScreen({ name: 'squad' })}
      onLogout={logout}
    />
  );

  let body;
  if (screen.name === 'login' || !user) {
    body = <LoginScreen onLogin={login} />;
  } else if (screen.name === 'squad-setup') {
    body = <SquadScreen initial={null} firstTime onSave={storeSquad} />;
  } else if (screen.name === 'squad') {
    body = <SquadScreen initial={squad} firstTime={false} onSave={storeSquad} onBack={() => setScreen({ name: 'playtype' })} />;
  } else if (screen.name === 'playtype') {
    body = home;
  } else if (screen.name === 'modes') {
    body = (
      <ModeSelectScreen
        user={user}
        onSelect={(mode) =>
          mode === 'penalty'
            ? setScreen({ name: 'select-kicker' })
            : setScreen({ name: 'game', mode, player: getPlayer(mySquad.freeKickTakerId) })
        }
        onLogout={() => setScreen({ name: 'playtype' })}
        topActionLabel="‹ 뒤로"
      />
    );
  } else if (screen.name === 'select-kicker') {
    body = <SelectKickerScreen squad={mySquad} onPick={(p) => setScreen({ name: 'game', mode: 'penalty', player: p })} onBack={() => setScreen({ name: 'modes' })} />;
  } else if (screen.name === 'game') {
    body = <GameScreen key={`${screen.mode}:${screen.player?.id ?? ''}`} mode={screen.mode} user={user} player={screen.player} onExit={() => setScreen({ name: 'modes' })} />;
  } else if (screen.name === 'lobby' && lobby && snap) {
    body = <OnlineLobbyScreen lobby={lobby} snap={snap} onBack={() => setScreen({ name: 'playtype' })} />;
  } else if (screen.name === 'match' && lobby && channel && snap?.match) {
    body = <OnlineMatchScreen lobby={lobby} channel={channel} match={snap.match} squad={mySquad} onLeave={leaveMatch} />;
  } else {
    body = home;
  }

  return (
    <>
      <div className="app-frame">{body}</div>
      {lobby && snap && user && screen.name !== 'match' && <ChallengePanel lobby={lobby} snap={snap} />}
      {lobby && snap && user && <NoticeStack lobby={lobby} snap={snap} />}
    </>
  );
}
