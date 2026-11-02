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
import { getPlayer, PLAYER_BY_ID, type PlayerDef } from './players/players';

/** market players in a squad (pre-UPDATE-6 squads keep them: grandfathered by the server) */
const squadMarketIds = (s: Squad | null) => (s ? [...s.penaltyOrder, s.goalkeeperId].filter((id) => PLAYER_BY_ID[id] && !PLAYER_BY_ID[id].starter) : []);
import { DEFAULT_SQUAD, loadSquad, saveSquad, validSquad, type Squad } from './players/squad';
import { AccountError, accountApi, storeSession } from './online/account';
import { fitSquad, localOwned, makeOwned, type Wallet } from './players/ownership';
import { MarketScreen } from './screens/MarketScreen';
import { OnlineModeScreen } from './screens/OnlineModeScreen';
import { DeveloperScreen } from './screens/DeveloperScreen';
import type { DuelMode } from './online/LobbyClient';

type Screen =
  | { name: 'login' }
  | { name: 'squad-setup' }
  | { name: 'squad' }
  | { name: 'select-kicker' }
  | { name: 'playtype' }
  | { name: 'modes' }
  | { name: 'game'; mode: GameMode; player: PlayerDef | null }
  | { name: 'lobby' }
  | { name: 'online-modes' }
  | { name: 'market' }
  | { name: 'developer' }
  | { name: 'match' };

export default function App() {
  const [user, setUser] = useState<PlayerProfile | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'login' });
  const [lobby, setLobby] = useState<LobbyClient | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [squad, setSquad] = useState<Squad | null>(null);
  // UPDATE 6: MP + owned players (server accounts); device-only copies have mp = null
  const [wallet, setWallet] = useState<Wallet>({ mp: null, owned: makeOwned([]) });
  const [duel, setDuel] = useState<DuelMode>('penalty');
  const snap = useLobby(lobby);
  const lastMatch = useRef<string | null>(null);

  // presence goes live right after login (so challenges can reach you anywhere)
  const login = (p: PlayerProfile) => {
    setUser(p);
    const channel = createChannel(p.token);
    // inside claude.ai the platform itself removes people who leave; phones freeze
    // timers in the background, so never hide a still-connected player on a timer there
    const client = new LobbyClient(channel, { nickname: p.nickname, userId: localUserId() }, channel.kind === 'artifact' ? { staleMs: 30 * 60_000 } : {});
    void client.start();
    (window as unknown as { __PIPA_LOBBY?: LobbyClient }).__PIPA_LOBBY = client; // test/debug hook
    setLobby(client);
    setChannel(channel);
    // UPDATE 4: first time on this device → BUILD YOUR SQUAD (never forced again)
    // the account's squad (server) wins; a squad only on this device is uploaded once
    const local = loadSquad(p.nickname);
    const remote = validSquad(p.savedSquad) ? p.savedSquad : null;
    // UPDATE 6: what this account owns (server) — or, without a server, this device's squad
    const owned = p.token ? makeOwned(p.owned ?? []) : localOwned(p.nickname, local);
    setWallet({ mp: p.token ? p.mp ?? 0 : null, owned });
    const saved = fitSquad(remote ?? local, p.token && !remote ? makeOwned([...(p.owned ?? []), ...squadMarketIds(local)]) : owned);
    if (remote) saveSquad(p.nickname, fitSquad(remote, owned) ?? remote);
    else if (saved && p.token)
      accountApi
        .saveSquad(p.token, saved)
        .then(() => refreshWallet(p))
        .catch(() => {});
    setSquad(remote ? fitSquad(remote, owned) : saved);
    setScreen(saved ? { name: 'playtype' } : { name: 'squad-setup' });
  };
  /** UPDATE 6: re-read MP + owned players from the server */
  const refreshWallet = (u: PlayerProfile | null = user) => {
    if (!u?.token) return;
    accountApi
      .me(u.token)
      .then((r) => {
        const owned = makeOwned(r.owned ?? []);
        setWallet({ mp: r.mp ?? 0, owned });
        setSquad((s) => fitSquad(s, owned));
      })
      .catch(() => {});
  };
  useEffect(() => {
    if (['playtype', 'market', 'squad', 'online-modes'].includes(screen.name)) refreshWallet();
  }, [screen.name]); // eslint-disable-line react-hooks/exhaustive-deps
  // the server pushes the new balance right after paying a win
  useEffect(() => {
    if (!channel?.match) return;
    return channel.match.onMessage((m) => {
      // wallet:update — a win reward or a developer grant, pushed by the server
      if ((m.t === 'wallet:update' || m.t === 'account:mp') && typeof m.mp === 'number') setWallet((w) => ({ ...w, mp: m.mp as number }));
    });
  }, [channel]);
  const buy = async (pl: PlayerDef): Promise<string | null> => {
    if (!user?.token) return 'TRANSFER MARKET은 Render 서버 버전에서 이용할 수 있어요';
    try {
      const r = await accountApi.buy(user.token, pl.id);
      setWallet({ mp: r.mp ?? 0, owned: makeOwned(r.owned ?? []) });
      return null;
    } catch (e) {
      const rep = e instanceof AccountError ? e.reply : undefined;
      if (rep && typeof rep.mp === 'number') setWallet({ mp: rep.mp, owned: makeOwned(rep.owned ?? []) });
      return e instanceof Error ? e.message : '잠시 후 다시 시도해주세요';
    }
  };

  const logout = () => {
    if (user?.token) accountApi.logout(user.token).catch(() => {});
    storeSession(null);
    lobby?.stop();
    setLobby(null);
    setChannel(null);
    setSquad(null);
    setWallet({ mp: null, owned: makeOwned([]) });
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
    if (snap?.match) setDuel(snap.match.mode);
    lobby?.leaveMatch();
    setScreen({ name: 'lobby' });
    refreshWallet();
  };

  const storeSquad = (s: Squad) => {
    if (user) saveSquad(user.nickname, s);
    if (user?.token) accountApi.saveSquad(user.token, s).catch(() => {});
    setSquad(s);
    setScreen({ name: 'playtype' });
  };
  const mySquad = squad ?? DEFAULT_SQUAD;
  const home = (
    <PlayTypeScreen
      user={user ?? { nickname: '' }}
      squad={squad}
      onSolo={() => setScreen({ name: 'modes' })}
      onOnline={() => setScreen({ name: 'online-modes' })}
      onSquad={() => setScreen({ name: 'squad' })}
      onMarket={() => setScreen({ name: 'market' })}
      onDeveloper={() => setScreen({ name: 'developer' })}
      mp={wallet.mp}
      onLogout={logout}
    />
  );

  let body;
  if (screen.name === 'login' || !user) {
    body = <LoginScreen onLogin={login} />;
  } else if (screen.name === 'squad-setup') {
    body = <SquadScreen initial={null} firstTime onSave={storeSquad} owned={wallet.owned} mp={wallet.mp} />;
  } else if (screen.name === 'squad') {
    body = <SquadScreen initial={squad} firstTime={false} onSave={storeSquad} onBack={() => setScreen({ name: 'playtype' })} owned={wallet.owned} mp={wallet.mp} />;
  } else if (screen.name === 'market') {
    body = <MarketScreen wallet={wallet} onBuy={buy} onBack={() => setScreen({ name: 'playtype' })} />;
  } else if (screen.name === 'developer') {
    body = <DeveloperScreen onBack={() => setScreen({ name: 'playtype' })} />;
  } else if (screen.name === 'online-modes') {
    body = (
      <OnlineModeScreen
        onPick={(m) => {
          setDuel(m);
          setScreen({ name: 'lobby' });
        }}
        onBack={() => setScreen({ name: 'playtype' })}
      />
    );
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
    body = <OnlineLobbyScreen lobby={lobby} snap={snap} mode={duel} onBack={() => setScreen({ name: 'online-modes' })} />;
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
