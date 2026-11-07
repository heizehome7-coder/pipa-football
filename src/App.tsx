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
const squadMarketIds = (s: Squad | null) => (s ? [...s.penaltyOrder, s.goalkeeperId, ...(s.subs ?? [])].filter((id) => PLAYER_BY_ID[id] && !PLAYER_BY_ID[id].starter) : []);
import { DEFAULT_SQUAD, loadSquad, saveSquad, validSquad, type Squad } from './players/squad';
import { accountApi, storeSession } from './online/account';
import { fitSquad, formatMP, localOwned, makeOwned, walletFrom, type Wallet } from './players/ownership';
import type { AccountReply, SaleNotice } from './online/account';
import { RankingScreen } from './screens/RankingScreen';
import { MatchScreen, MatchWarning } from './match/MatchScreen';
import { MatchSquadSetup } from './match/MatchSquadSetup';
import type { MatchSquad } from './match/formation';
import { LevelRewardsScreen } from './screens/LevelRewardsScreen';
import { DailyRewardModal } from './components/ProgressHeader';
import { MarketScreen } from './screens/MarketScreen';
import { OnlineModeScreen } from './screens/OnlineModeScreen';
import { DeveloperScreen } from './screens/DeveloperScreen';
import { PacksScreen } from './screens/PacksScreen';
import { EventCenterScreen } from './screens/EventCenterScreen';
import { EvolutionScreen, MaterialShopScreen } from './screens/EvolutionScreen';
import { MissionsScreen } from './screens/MissionsScreen';
import { StatsScreen } from './screens/StatsScreen';
import { EvoContext } from './components/PlayerArt';
import { LockScreen } from './screens/LockScreen';
import { setLockedHandler, type AccessState } from './online/account';
import type { DuelMode } from './online/LobbyClient';

/** UPDATE 7: XP / LEVEL UP for a finished online match (pushed by the server) */
export interface ProgressEvent {
  key: string;
  result: 'win' | 'loss' | 'draw';
  gained: number;
  before: { level: number; xp: number };
  after: { level: number; xp: number; xpNext: number };
  newRewards: { level: number; fv: number }[];
}

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
  | { name: 'packs' }
  | { name: 'events' }
  | { name: 'evolution' }
  | { name: 'evo-shop' }
  | { name: 'missions' }
  | { name: 'stats' }
  | { name: 'developer' }
  | { name: 'ranking' }
  | { name: 'levels' }
  | { name: 'match' }
  // UPDATE 11: the 5-a-side MATCH (single player)
  | { name: 'match5'; squad: MatchSquad }
  | { name: 'match-setup' };

export default function App() {
  const [user, setUser] = useState<PlayerProfile | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'login' });
  const [matchWarn, setMatchWarn] = useState(false);
  // UPDATE 11 patch: the weekday limit (the server's answer; any 423 reply also sets it)
  const [lock, setLock] = useState<AccessState | null>(null);
  const [lobby, setLobby] = useState<LobbyClient | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [squad, setSquad] = useState<Squad | null>(null);
  // UPDATE 6: MP + owned players (server accounts); device-only copies have mp = null
  const [wallet, setWallet] = useState<Wallet>({ mp: null, owned: makeOwned([]) });
  const [duel, setDuel] = useState<DuelMode>('penalty');
  // UPDATE 7
  const [rankTick, setRankTick] = useState(0);
  const [progressEvent, setProgressEvent] = useState<ProgressEvent | null>(null);
  const [toasts, setToasts] = useState<{ id: string; text: string; sub?: string }[]>([]);
  const [dailyOpen, setDailyOpen] = useState(false);
  const dailyShown = useRef('');
  const shownNotices = useRef(new Set<string>());
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
  /** UPDATE 7: a sale of mine completed → "RONALDINHO 판매 완료!  +700,000,000 MP" */
  const showSale = (n: SaleNotice, token?: string) => {
    if (shownNotices.current.has(n.id)) return;
    shownNotices.current.add(n.id);
    const pl = getPlayer(n.playerId);
    const id = n.id;
    setToasts((t) => [...t, { id, text: `${pl?.nameKo ?? n.playerId} 판매 완료!`, sub: `+${formatMP(n.revenue)}` }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
    if (token) accountApi.ackNotices(token, [n.id]).catch(() => {});
  };
  /** any account reply (MP, owned, listed, level/XP/FV, daily) → state */
  const applyReply = (r: AccountReply, u: PlayerProfile | null = user) => {
    const w = walletFrom(r);
    // UPDATE 11 patch: a reply without the MATCH squad keeps the one we have
    setWallet((prev) => (r.matchSquad === undefined ? { ...w, matchSquad: prev.matchSquad ?? null } : w));
    setSquad((s) => fitSquad(s, w.owned));
    for (const n of r.notices ?? []) showSale(n, u?.token);
  };
  /** UPDATE 6: re-read MP + owned players from the server */
  const refreshWallet = (u: PlayerProfile | null = user) => {
    if (!u?.token) return;
    accountApi
      .me(u.token)
      .then((r) => applyReply(r, u))
      .catch(() => {});
  };
  // UPDATE 10: WEEKLY MISSION "PLAY FOR 5 MINUTES" — real match time only (single game / online match)
  const checkAccess = () => {
    accountApi
      .access()
      .then((a) => setLock(a.locked ? a : null))
      .catch(() => {});
  };
  useEffect(() => {
    setLockedHandler((a) => setLock(a.locked ? a : null));
    return () => void setLockedHandler(null);
  }, []);
  useEffect(() => {
    if (!user?.token) return void setLock(null);
    checkAccess();
    const t = setInterval(checkAccess, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.token]);
  useEffect(() => {
    if (!user?.token || (screen.name !== 'game' && screen.name !== 'match')) return;
    const tok = user.token;
    let last = Date.now();
    const t = window.setInterval(() => {
      const now = Date.now();
      const sec = Math.round((now - last) / 1000);
      last = now;
      if (document.visibilityState !== 'visible' || sec <= 0) return;
      accountApi.missionPlay(tok, Math.min(sec, 60)).catch(() => {});
    }, 20_000);
    return () => window.clearInterval(t);
  }, [screen.name, user?.token]);

  // UPDATE 7: DAILY LOGIN — once per server day, on the home screen
  useEffect(() => {
    const d = wallet.progress?.daily;
    if (screen.name === 'playtype' && d?.canClaim && dailyShown.current !== d.today) {
      dailyShown.current = d.today;
      setDailyOpen(true);
    }
  }, [screen.name, wallet.progress?.daily?.canClaim, wallet.progress?.daily?.today]);
  useEffect(() => {
    if (['playtype', 'market', 'squad', 'online-modes', 'levels', 'ranking', 'packs', 'events', 'evolution', 'evo-shop', 'missions'].includes(screen.name)) refreshWallet();
  }, [screen.name]); // eslint-disable-line react-hooks/exhaustive-deps
  // the server pushes the new balance right after paying a win
  useEffect(() => {
    if (!channel?.match) return;
    return channel.match.onMessage((m) => {
      // wallet:update — a win reward or a developer grant, pushed by the server
      if ((m.t === 'wallet:update' || m.t === 'account:mp') && typeof m.mp === 'number') setWallet((w) => ({ ...w, mp: m.mp as number }));
      // UPDATE 7: XP / LEVEL UP after a finished online match
      if (m.t === 'progress:update') {
        setProgressEvent(m as unknown as ProgressEvent);
        refreshWallet();
      }
      if (m.t === 'market:sold' && m.notice) showSale(m.notice as SaleNotice, user?.token);
      if (m.t === 'ranking:changed') setRankTick((n) => n + 1);
      // UPDATE 8: the developer gave packs → refresh the account (PACKS count)
      if (m.t === 'packs:update') refreshWallet();
    });
  }, [channel, user]); // eslint-disable-line react-hooks/exhaustive-deps
  const logout = () => {
    if (user?.token) accountApi.logout(user.token).catch(() => {});
    storeSession(null);
    lobby?.stop();
    setLobby(null);
    setChannel(null);
    setSquad(null);
    setWallet({ mp: null, owned: makeOwned([]) });
    setProgressEvent(null);
    setDailyOpen(false);
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
      onPacks={() => setScreen({ name: 'packs' })}
      onEvents={() => setScreen({ name: 'events' })}
      onEvolution={() => setScreen({ name: 'evolution' })}
      onShop={() => setScreen({ name: 'evo-shop' })}
      onMissions={() => setScreen({ name: 'missions' })}
      onStats={() => setScreen({ name: 'stats' })}
      onDeveloper={() => setScreen({ name: 'developer' })}
      onRanking={() => setScreen({ name: 'ranking' })}
      onLevels={() => setScreen({ name: 'levels' })}
      progress={wallet.progress}
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
    body = <MarketScreen wallet={wallet} token={user?.token ?? null} squad={squad} onReply={(r) => applyReply(r)} onBack={() => setScreen({ name: 'playtype' })} />;
  } else if (screen.name === 'packs') {
    body = <PacksScreen wallet={wallet} token={user?.token ?? null} onReply={(r) => applyReply(r)} onBack={() => setScreen({ name: 'playtype' })} />;
  } else if (screen.name === 'events') {
    body = <EventCenterScreen wallet={wallet} token={user?.token ?? null} onReply={(r) => applyReply(r)} onBack={() => setScreen({ name: 'playtype' })} />;
  } else if (screen.name === 'evolution') {
    body = <EvolutionScreen wallet={wallet} token={user?.token ?? null} onReply={(r) => applyReply(r)} onBack={() => setScreen({ name: 'playtype' })} onShop={() => setScreen({ name: 'evo-shop' })} />;
  } else if (screen.name === 'evo-shop') {
    body = <MaterialShopScreen wallet={wallet} token={user?.token ?? null} onReply={(r) => applyReply(r)} onBack={() => setScreen({ name: 'playtype' })} onEvolve={() => setScreen({ name: 'evolution' })} />;
  } else if (screen.name === 'missions') {
    body = <MissionsScreen token={user?.token ?? null} onReply={(r) => applyReply(r)} onBack={() => setScreen({ name: 'playtype' })} />;
  } else if (screen.name === 'stats') {
    body = <StatsScreen me={user?.nickname ?? ''} onBack={() => setScreen({ name: 'playtype' })} />;
  } else if (screen.name === 'ranking') {
    body = <RankingScreen token={user?.token ?? null} me={user?.nickname ?? ''} tick={rankTick} onBack={() => setScreen({ name: 'playtype' })} />;
  } else if (screen.name === 'levels') {
    body = <LevelRewardsScreen token={user?.token ?? null} progress={wallet.progress ?? null} onReply={(r) => applyReply(r)} onBack={() => setScreen({ name: 'playtype' })} />;
  } else if (screen.name === 'developer') {
    // other people's cards: never my own evolution levels
    body = (
      <EvoContext.Provider value={null}>
        <DeveloperScreen onBack={() => (checkAccess(), setScreen({ name: 'playtype' }))} />
      </EvoContext.Provider>
    );
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
  } else if (screen.name === 'match-setup') {
    body = (
      <MatchSquadSetup
        wallet={wallet}
        token={user?.token ?? null}
        onWallet={(r) => applyReply(r)}
        onBack={() => setScreen({ name: 'modes' })}
        onStart={(ms) => setScreen({ name: 'match5', squad: ms })}
      />
    );
  } else if (screen.name === 'match5') {
    body = <MatchScreen matchSquad={screen.squad} evo={wallet.evo ?? {}} nickname={user.nickname} onHome={() => setScreen({ name: 'playtype' })} />;
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
        onMatch={() => setMatchWarn(true)}
      />
    );
    if (matchWarn)
      body = (
        <>
          {body}
          <MatchWarning
            onClose={() => {
              setMatchWarn(false);
              setScreen({ name: 'playtype' }); // X → HOME
            }}
            onContinue={() => {
              setMatchWarn(false);
              setScreen({ name: 'match-setup' });
            }}
          />
        </>
      );
  } else if (screen.name === 'select-kicker') {
    body = <SelectKickerScreen squad={mySquad} onPick={(p) => setScreen({ name: 'game', mode: 'penalty', player: p })} onBack={() => setScreen({ name: 'modes' })} />;
  } else if (screen.name === 'game') {
    body = <GameScreen key={`${screen.mode}:${screen.player?.id ?? ''}`} mode={screen.mode} user={user} player={screen.player} evo={(screen.player && wallet.evo?.[screen.player.id]) || 0} onExit={() => setScreen({ name: 'modes' })} />;
  } else if (screen.name === 'lobby' && lobby && snap) {
    body = <OnlineLobbyScreen lobby={lobby} snap={snap} mode={duel} onBack={() => setScreen({ name: 'online-modes' })} />;
  } else if (screen.name === 'match' && lobby && channel && snap?.match) {
    body = <OnlineMatchScreen lobby={lobby} channel={channel} match={snap.match} squad={mySquad} progress={progressEvent} onLeave={leaveMatch} />;
  } else {
    body = home;
  }

  // a game already being played finishes; everything else waits behind the limit screen
  if (lock && user && !['developer', 'game', 'match', 'match5', 'login'].includes(screen.name))
    body = <LockScreen access={lock} onRetry={checkAccess} onLogout={logout} onDeveloper={() => setScreen({ name: 'developer' })} />;

  return (
    <>
      <div className="app-frame">
        <EvoContext.Provider value={wallet.evo ?? null}>{body}</EvoContext.Provider>
      </div>
      {lobby && snap && user && screen.name !== 'match' && <ChallengePanel lobby={lobby} snap={snap} />}
      {lobby && snap && user && <NoticeStack lobby={lobby} snap={snap} />}
      {dailyOpen && user?.token && wallet.progress && screen.name === 'playtype' && (
        <DailyRewardModal token={user.token} progress={wallet.progress} onReply={(r) => applyReply(r)} onClose={() => setDailyOpen(false)} />
      )}
      {toasts.length > 0 && (
        <div className="sale-toasts" data-testid="sale-toasts">
          {toasts.map((t) => (
            <div key={t.id} className="sale-toast" data-testid="sale-toast">
              <b>{t.text}</b>
              {t.sub && <span>{t.sub}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
