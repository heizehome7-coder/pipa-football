import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { OnlineGameView } from '../game/OnlineGameView';
import type { Channel } from '../online/channel/Channel';
import type { LobbyClient, MatchInfo } from '../online/LobbyClient';
import { OnlineMatchClient, type MatchView } from '../online/match/OnlineMatchClient';
import type { DiveDir, MatchState, WireResult } from '../online/match/protocol';
import { MatchFoundScreen } from './MatchFoundScreen';
import { NameBanner } from '../components/NameBanner';
import { useSpecialPop } from '../components/SpecialPop';
import { keeperLookOf, kickerLookOf } from '../players/looks';
import { getPlayer } from '../players/players';
import { sanitizeSquad, type Squad } from '../players/squad';

const DIVE_TEXT: Record<DiveDir, string> = {
  left: '← 왼쪽 다이빙',
  right: '오른쪽 다이빙 →',
  upLeft: '↖ 왼쪽 위 다이빙',
  upRight: '오른쪽 위 다이빙 ↗',
  up: '↑ 중앙 점프',
  down: '↓ 낮게 막기',
  lowLeft: '← 왼쪽 낮게',
  lowRight: '오른쪽 낮게 →',
};

const OUTCOME_WORD: Record<WireResult['outcome'], string> = { GOAL: 'GOAL!', SAVE: 'SAVE!', MISS: 'MISS!' };

/** re-render at ~10 fps while something time-based is on screen */
function useTicker(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => set((n) => n + 1), 100);
    return () => window.clearInterval(id);
  }, [on]);
}

export function OnlineMatchScreen({
  lobby,
  channel,
  match,
  squad,
  onLeave,
}: {
  lobby: LobbyClient;
  channel: Channel;
  match: MatchInfo;
  squad: Squad;
  onLeave: () => void;
}) {
  const client = useMemo(() => new OnlineMatchClient(channel, match, squad), [channel, match.matchId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    client.start();
    (window as unknown as { __PIPA_MATCH?: OnlineMatchClient }).__PIPA_MATCH = client;
    return () => client.stop();
  }, [client]);
  const v = useSyncExternalStore(client.subscribe, client.getSnapshot);

  if (v.status === 'unsupported') {
    // this copy has no game server (claude.ai page): stage-1 match screen only
    return <MatchFoundScreen lobby={lobby} match={match} onLeave={onLeave} />;
  }
  const leave = () => {
    client.leave();
    onLeave();
  };
  const s = v.state;
  const lost = v.status === 'lost';
  const ended = lost || match.ended === 'opponent_left' || s?.phase === 'aborted';
  if (ended && s?.phase !== 'finished') return <Disconnected lost={lost} match={match} onLeave={leave} />;
  if (v.error) return <Disconnected lost={false} match={match} text={v.error} onLeave={leave} />;
  if (!s || s.phase === 'waiting') return <ReadyRoom v={v} match={match} lobby={lobby} client={client} onLeave={leave} />;
  if (s.phase === 'finished') return <FinalResult v={v} s={s} client={client} opponentLeft={ended} onLeave={leave} />;
  return <MatchPlay v={v} s={s} client={client} onLeave={leave} />;
}

// ── 2. 경기 준비 화면 ─────────────────────────────────────────────────────
function ReadyRoom({ v, match, lobby, client, onLeave }: { v: MatchView; match: MatchInfo; lobby: LobbyClient; client: OnlineMatchClient; onLeave: () => void }) {
  const joined = (v.state?.players.length ?? 0) === 2;
  const myReady = !!v.me?.ready;
  const oppReady = !!v.opp?.ready;
  const toggle = () => {
    client.ready(!myReady);
    lobby.setReady(!myReady); // keep lobby presence in step (others see "대결 중")
  };
  return (
    <div className="screen matchfound" data-testid="match-found" data-match-id={match.matchId} data-room-id={v.state?.roomId ?? ''}>
      <div className="mf-glow" aria-hidden />
      <span className="mini-logo mf-logo">PIPA</span>
      <p className="eyebrow mf-eyebrow">ONLINE MATCH</p>
      <h1 className="mf-title">MATCH FOUND</h1>
      <div className="mf-versus">
        <div className="mf-player me">
          <span className="mf-badge">YOU</span>
          <strong data-testid="mf-me">{match.me.nickname}</strong>
          <span className={`mf-ready ${myReady ? 'on' : ''}`}>{myReady ? '준비 완료' : '준비 전'}</span>
        </div>
        <span className="mf-vs">VS</span>
        <div className="mf-player opp">
          <span className="mf-badge">OPPONENT</span>
          <strong data-testid="mf-opp">{match.opponent.nickname}</strong>
          <span className={`mf-ready ${oppReady ? 'on' : ''}`}>{!joined ? '접속 확인 중' : oppReady ? '준비 완료' : '준비 전'}</span>
        </div>
      </div>
      <p className="mf-sub" data-testid="mf-sub">
        {match.role === 'sender' ? '상대방이 대결을 수락했습니다.' : '대결을 수락했습니다.'}
      </p>
      {myReady && !oppReady && <p className="mf-note" data-testid="mf-waiting">상대방을 기다리는 중...</p>}
      {!myReady && oppReady && <p className="mf-note">상대방은 준비 완료! 준비하기를 눌러주세요.</p>}
      <div className="mf-actions">
        <button className="btn-primary" onClick={toggle} data-testid="mf-ready" disabled={!joined}>
          {myReady ? '준비 완료 ✓' : '준비하기'}
        </button>
        <button className="btn-ghost mf-leave" onClick={onLeave}>
          온라인 로비로 돌아가기
        </button>
      </div>
      <p className="mf-id" data-testid="match-id">
        MATCH ID · {match.matchId}
      </p>
    </div>
  );
}

// ── 3–9. 경기 ────────────────────────────────────────────────────────────
function MatchPlay({ v, s, client, onLeave }: { v: MatchView; s: MatchState; client: OnlineMatchClient; onLeave: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<OnlineGameView | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [intro, setIntro] = useState<{ round: number; until: number } | null>(null);
  const special = useSpecialPop();
  useTicker(true);

  const kickerNick = s.players.find((p) => p.peer === s.kicker)?.nickname ?? '';
  const role = v.role;
  // UPDATE 4: each side uses its own squad — the kicker's next taker in order, the keeper's GK
  const { kickerPlayer, keeperPlayer } = roundPlayers(s);

  // the 3D view lives for the whole match
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let view: OnlineGameView | null = null;
    try {
      view = new OnlineGameView(host, {
        onShot: (input) => client.shoot(input),
        onDive: (dir, at) => {
          client.dive(dir, at);
        },
        onHint: setHint,
        onSpecial: (id) => special.show(id),
      });
    } catch (e) {
      console.error(e);
      setFatal('이 기기에서 3D(WebGL)를 시작할 수 없습니다.');
    }
    viewRef.current = view;
    return () => {
      view?.dispose();
      viewRef.current = null;
    };
  }, [client]);

  // new round (or new match): fresh pitch with this round's roles
  const roundKey = `${s.startAt}:${s.round}`;
  useEffect(() => {
    if (!role) return;
    viewRef.current?.setRound({
      role,
      kickerNick,
      canShoot: false,
      looks: { kickerLook: kickerLookOf(kickerPlayer), keeperLook: keeperLookOf(keeperPlayer), keeperStats: keeperPlayer?.gk, kickerPlayer },
    });
    if (s.round > 1) setIntro({ round: s.round, until: Date.now() + 1500 });
    else setIntro(null);
  }, [roundKey, role, kickerNick, kickerPlayer?.id, keeperPlayer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // kicker may draw only while the server says "aim" (and after kick-off)
  const kickOff = s.phase === 'aim' || s.phase === 'shot' || s.phase === 'result';
  useEffect(() => {
    viewRef.current?.setCanShoot(role === 'kicker' && s.phase === 'aim' && !v.shotSent);
  }, [role, s.phase, v.shotSent, roundKey]);

  // the server started the shot: same run-up time on both phones
  const shotKey = s.shot ? `${s.shot.round}:${s.shot.runStart}` : '';
  useEffect(() => {
    if (!s.shot || s.shot.round !== s.round) return;
    const dive = s.dive ?? (role === 'keeper' ? v.myDive : null);
    viewRef.current?.playShot(s.shot, client.toLocal(s.shot.runStart), dive && dive.round === s.round ? dive : null);
  }, [shotKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // dives: my own (instantly) or the opponent's (relayed by the server)
  const dive = role === 'keeper' ? v.myDive : s.dive;
  const diveKey = dive ? `${dive.round}:${dive.dir}:${dive.at}` : '';
  useEffect(() => {
    if (dive && dive.round === s.round) viewRef.current?.applyDive(dive);
  }, [diveKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(null), 2200);
    return () => window.clearTimeout(t);
  }, [hint]);

  const now = client.serverNow();
  const toStart = s.startAt - now;
  let count: string | null = null;
  if (s.phase === 'countdown' || (s.round === 1 && toStart > -900 && s.phase === 'aim')) {
    count = toStart > 2400 ? '3' : toStart > 1200 ? '2' : toStart > 0 ? '1' : 'KICK OFF';
  }
  const shotClock = s.phase === 'aim' && !count ? Math.max(0, Math.ceil((s.aimDeadline - now) / 1000)) : null;
  const showIntro = intro && intro.round === s.round && Date.now() < intro.until && s.phase === 'aim';
  const me = v.me;
  const opp = v.opp;
  const res = s.phase === 'result' ? s.result : null;
  const myResult = res ? (res.kicker === v.myPeer ? (res.outcome === 'GOAL' ? 'good' : 'bad') : res.outcome === 'GOAL' ? 'bad' : 'good') : null;

  return (
    <div className={`screen game online-game role-${role ?? 'none'}`} data-testid="online-game" data-phase={s.phase} data-round={s.round} data-role={role ?? ''}>
      <div className="game-host" ref={hostRef} />

      <div className="ohud" data-testid="online-hud">
        <button className="hud-back ohud-back" onClick={onLeave} aria-label="경기 나가기">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="ohud-board">
          <PlayerScore name={me?.nickname ?? ''} score={v.myScore} history={s.history} peer={v.myPeer} you testid="score-me" />
          <div className="ohud-mid">
            <span className="ohud-round" data-testid="round-label">
              ROUND {Math.min(s.round, s.totalRounds)}/{s.totalRounds}
            </span>
            <span className={`ohud-role ${role ?? ''}`} data-testid="role-label">
              {role === 'kicker' ? 'KICKER' : role === 'keeper' ? 'GOALKEEPER' : ''}
            </span>
          </div>
          <PlayerScore name={opp?.nickname ?? ''} score={v.oppScore} history={s.history} peer={opp?.peer ?? ''} testid="score-opp" />
        </div>
        <span className="hud-spacer" />
      </div>

      {count && (
        <div className={`countdown ${count === 'KICK OFF' ? 'go' : ''}`} key={count} data-testid="countdown">
          {count}
        </div>
      )}

      {showIntro && !count && (
        <div className="round-intro" data-testid="round-intro">
          <span>NEXT ROUND</span>
          <b>ROUND {s.round}</b>
          <em>{role === 'kicker' ? '이번엔 당신이 KICKER' : '이번엔 당신이 GOALKEEPER'}</em>
        </div>
      )}

      {(s.phase === 'aim' || s.phase === 'countdown') && (
        <NameBanner
          player={kickerPlayer}
          show={kickerPlayer ? `${roundKey}:${kickerPlayer.id}` : ''}
          label={s.kicker === v.myPeer ? 'YOUR KICKER' : 'KICKER'}
          sub={keeperPlayer ? `GK · ${keeperPlayer.name.toUpperCase()}` : null}
        />
      )}

      {res && (
        <div className={`result result-${res.outcome.toLowerCase()} online-result ${myResult}`} data-testid="result" data-outcome={res.outcome}>
          <div className="result-word">{OUTCOME_WORD[res.outcome]}</div>
          <div className="result-detail">{res.detail}</div>
          <div className="result-tap">{s.round >= s.totalRounds ? '최종 결과 집계 중…' : '다음 라운드 준비 중…'}</div>
        </div>
      )}

      {!count && !showIntro && !res && kickOff && (
        <Coach role={role} v={v} s={s} shotClock={shotClock} opponentNick={opp?.nickname ?? ''} />
      )}
      {hint && <div className="coach coach-hint">{hint}</div>}
      {special.el}
      {fatal && (
        <div className="fatal">
          <p>{fatal}</p>
          <button className="btn-primary" onClick={onLeave}>
            온라인 로비로
          </button>
        </div>
      )}
    </div>
  );
}

/** which real players appear this round (ids from the server state, same DB on both phones) */
function roundPlayers(s: MatchState) {
  const kicker = s.players.find((p) => p.peer === s.kicker);
  const keeper = s.players.find((p) => p.peer === s.keeper);
  // kicker's n-th kick in this match → n-th taker in his order (wraps after 5)
  const n = s.history.filter((h) => h.kicker === s.kicker && h.round < s.round).length;
  const ks = sanitizeSquad(kicker?.squad ? { ...kicker.squad, freeKickTakerId: kicker.squad.penaltyOrder?.[0] } : null);
  const gs = sanitizeSquad(keeper?.squad ? { ...keeper.squad, freeKickTakerId: keeper.squad.penaltyOrder?.[0] } : null);
  return { kickerPlayer: getPlayer(ks.penaltyOrder[n % ks.penaltyOrder.length]), keeperPlayer: getPlayer(gs.goalkeeperId) };
}

function PlayerScore({ name, score, history, peer, you, testid }: { name: string; score: number; history: WireResult[]; peer: string; you?: boolean; testid: string }) {
  const mine = history.filter((h) => h.kicker === peer);
  return (
    <div className={`ohud-player ${you ? 'you' : ''}`} data-testid={testid} data-score={score}>
      <span className="ohud-name">{name}</span>
      <b className="ohud-score">{score}</b>
      <span className="ohud-dots" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => {
          const h = mine[i];
          return <i key={i} className={h ? (h.outcome === 'GOAL' ? 'g' : 'x') : ''} />;
        })}
      </span>
    </div>
  );
}

function Coach({ role, v, s, shotClock, opponentNick }: { role: MatchView['role']; v: MatchView; s: MatchState; shotClock: number | null; opponentNick: string }) {
  if (role === 'kicker') {
    if (s.phase === 'aim' && !v.shotSent)
      return (
        <div className="coach" data-testid="coach">
          <b>공을 누른 채 슛 경로를 그려보세요 {shotClock !== null && <em className="shot-clock">{shotClock}</em>}</b>
          <span>빠르게 = 강하게 · 휘게 = 감아차기 · 상대 골키퍼는 사람이에요!</span>
        </div>
      );
    if (s.phase === 'aim') return <div className="coach" data-testid="coach"><b>슛 전송 중…</b></div>;
    return null;
  }
  if (role === 'keeper') {
    const d = v.myDive;
    if (d)
      return (
        <div className="coach keeper-coach chosen" data-testid="coach">
          <b>{DIVE_TEXT[d.dir]}!</b>
          {s.phase === 'aim' && <span>방향 고정 · 킥 순간에 몸을 던져요</span>}
        </div>
      );
    return (
      <div className="coach keeper-coach" data-testid="coach">
        <b>
          {s.phase === 'aim' ? `${opponentNick}님이 슛을 준비 중` : '지금! 막아내세요'}
          {shotClock !== null && <em className="shot-clock">{shotClock}</em>}
        </b>
        <span>스와이프로 다이빙 · ←→ 좌우 · ↖↗ 위 구석 · ↑ 점프 · ↓ 낮게</span>
        <span className="keeper-tip">미리 고르면 바꿀 수 없어요 (PC: 방향키)</span>
      </div>
    );
  }
  return null;
}

// ── 10. 최종 결과 ─────────────────────────────────────────────────────────
function FinalResult({ v, s, client, opponentLeft, onLeave }: { v: MatchView; s: MatchState; client: OnlineMatchClient; opponentLeft: boolean; onLeave: () => void }) {
  const f = s.final!;
  const verdict = f.draw ? 'DRAW' : f.winner === v.myPeer ? 'VICTORY' : 'DEFEAT';
  const winner = s.players.find((p) => p.peer === f.winner);
  const iAsked = !!v.me?.rematch;
  const oppAsked = !!v.opp?.rematch;
  return (
    <div className={`screen matchfound final ${verdict.toLowerCase()}`} data-testid="match-result" data-verdict={verdict}>
      <div className="mf-glow" aria-hidden />
      <span className="mini-logo mf-logo">PIPA</span>
      <p className="eyebrow mf-eyebrow">MATCH RESULT</p>
      <h1 className="mf-title final-title" data-testid="verdict">
        {verdict}
      </h1>
      <div className="final-board">
        <div className={`final-row ${f.winner === v.myPeer ? 'win' : ''}`}>
          <span>{v.me?.nickname}</span>
          <b data-testid="final-me">{v.myScore}</b>
        </div>
        <div className={`final-row ${v.opp && f.winner === v.opp.peer ? 'win' : ''}`}>
          <span>{v.opp?.nickname}</span>
          <b data-testid="final-opp">{v.oppScore}</b>
        </div>
      </div>
      <p className="mf-sub" data-testid="winner">
        {f.draw ? '무승부 — 서든데스는 다음 업데이트에서!' : `WINNER · ${winner?.nickname ?? ''}`}
      </p>
      {opponentLeft && <p className="mf-note">상대방이 나갔습니다.</p>}
      {!opponentLeft && iAsked && !oppAsked && <p className="mf-note">상대방의 응답을 기다리는 중...</p>}
      {!opponentLeft && !iAsked && oppAsked && <p className="mf-note">상대방이 다시 대결을 원해요!</p>}
      <div className="mf-actions">
        {!opponentLeft && (
          <button className="btn-primary" onClick={() => client.rematch()} disabled={iAsked} data-testid="rematch">
            {iAsked ? '다시 대결 신청함' : '다시 대결'}
          </button>
        )}
        <button className="btn-ghost mf-leave" onClick={onLeave} data-testid="to-lobby">
          온라인 로비로
        </button>
      </div>
    </div>
  );
}

function Disconnected({ lost, match, text, onLeave }: { lost: boolean; match: MatchInfo; text?: string; onLeave: () => void }) {
  return (
    <div className="screen matchfound ended" data-testid="match-found" data-match-id={match.matchId}>
      <div className="mf-glow" aria-hidden />
      <p className="eyebrow mf-eyebrow">ONLINE MATCH</p>
      <h1 className="mf-title">MATCH ENDED</h1>
      <p className="mf-sub" data-testid="mf-sub">
        {text ?? (lost ? '서버와의 연결이 끊어졌습니다.' : '상대방의 연결이 종료되었습니다.')}
      </p>
      <div className="mf-actions">
        <button className="btn-primary" onClick={onLeave} data-testid="back-to-lobby">
          온라인 로비로 돌아가기
        </button>
      </div>
    </div>
  );
}
