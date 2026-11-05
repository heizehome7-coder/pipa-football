/**
 * Server-authoritative online penalty match — headless test with a fake clock.
 *   npm run test:match
 */
// @ts-expect-error plain .mjs server module
import { createMatchManager } from '../server/matches.mjs';
import * as THREE from 'three';
import { FIELD, MODES } from '../src/game/core/config';
import { calculateShotParameters } from '../src/game/physics/BallPhysics';
import { freeKickSpot } from '../src/game/FreeKickGame';
import * as judge from '../src/online/match/judge';
import type { MatchState } from '../src/online/match/protocol';

let T = 1_000_000;
let timers: { at: number; fn: () => void; id: number }[] = [];
let seq = 0;
const setTimer = (fn: () => void, ms: number) => {
  const id = ++seq;
  timers.push({ at: T + ms, fn, id });
  return id;
};
const clearTimer = (id: number) => {
  timers = timers.filter((t) => t.id !== id);
};
function advance(ms: number) {
  const end = T + ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at);
    const t = timers[0];
    if (!t || t.at > end) break;
    timers.shift();
    T = t.at;
    t.fn();
  }
  T = end;
}

type Msg = { t: string; state?: MatchState; code?: string };
const inbox: Record<string, Msg[]> = {};
const send = (peer: string, m: Msg) => (inbox[peer] ||= []).push(JSON.parse(JSON.stringify(m)));
const last = (peer: string, t?: string) => [...(inbox[peer] || [])].reverse().find((m) => (t ? m.t === t : !!m.state));
let rnd = 0.3;
const mgr = createMatchManager({ send, judge, now: () => T, setTimer, clearTimer, random: () => rnd });

const results: [string, boolean][] = [];
function check(name: string, ok: boolean, info = '') {
  results.push([name, ok]);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? `  — ${info}` : ''}`);
}

// a kicker's shot = the launch the shared physics solver computes from the drawn intent
const SPOT = new THREE.Vector3(0, FIELD.ballRadius, FIELD.penaltySpot);
const shotTo = (x: number, y: number, power = 0.7) =>
  calculateShotParameters(SPOT, { target: new THREE.Vector3(x, y, 0), spin: 0, profile: 'STRAIGHT', curveLevel: 0, apex: null, power }, MODES.penalty);

const A = 'peerA';
const B = 'peerB';
const X = 'intruder';
const id = 'cmatch123abc';
const h = (peer: string, m: Record<string, unknown>) => mgr.handle(peer, { matchId: id, ...m });

// 1. room id
h(A, { t: 'match:join', opponentPeer: B, nickname: 'A', userId: 'ua', squad: { penaltyOrder: ['ronaldo', 'messi', 'son', 'mbappe', 'salah'], goalkeeperId: 'courtois', junk: 'x'.repeat(5000) } });
h(X, { t: 'match:join', opponentPeer: A, nickname: 'X', userId: 'ux' });
check('a third person cannot enter the match', last(X, 'match:error')?.code === 'not_allowed' && !last(X));
h(B, { t: 'match:join', opponentPeer: A, nickname: 'B', userId: 'ub' });
const sa = last(A)!.state!;
const sb = last(B)!.state!;
check('both players get the same server matchId / roomId', sa.id === sb.id && sa.roomId === sb.roomId && sa.roomId === `pipa_match_${id.toLowerCase()}`, sa.roomId);
check('both players listed, phase waiting', sa.players.length === 2 && sa.phase === 'waiting');
const sqA = sb.players.find((p) => p.peer === A)!.squad;
check('UPDATE 4: squad ids relayed to the opponent (ids only, junk dropped)', JSON.stringify(sqA) === JSON.stringify({ penaltyOrder: ['ronaldo', 'messi', 'son', 'mbappe', 'salah'], goalkeeperId: 'courtois', freeKickTakerId: 'ronaldo' }), JSON.stringify(sqA));
check('UPDATE 4: a player without a squad still plays (null → default on the clients)', sb.players.find((p) => p.peer === B)!.squad === null);

// 2–3. ready → server starts
h(A, { t: 'match:ready', ready: true });
check('one ready player does not start the match', last(B)!.state!.phase === 'waiting' && last(B)!.state!.players.find((p) => p.peer === A)!.ready);
h(B, { t: 'match:ready', ready: true });
const ms = last(A, 'match:start');
const msB = last(B, 'match:start');
check('both ready → server sends match:start to both with the same startAt', !!ms && !!msB && ms.state!.startAt === msB.state!.startAt && ms.state!.startAt === T + judge.MATCH_RULES.countdownMs);
// 4. roles
check('server assigns KICKER and GOALKEEPER (different people, same for both)', ms!.state!.kicker !== ms!.state!.keeper && ms!.state!.kicker === msB!.state!.kicker && !!ms!.state!.kicker);
const firstKicker = ms!.state!.kicker!;
const firstKeeper = ms!.state!.keeper!;
h(firstKicker, { t: 'shot:submit', round: 1, shot: shotTo(2.6, 0.4) });
check('no shot accepted during the countdown', last(A)!.state!.phase === 'countdown');
advance(judge.MATCH_RULES.countdownMs);
check('countdown ends → round 1 aim', last(A)!.state!.phase === 'aim' && last(A)!.state!.round === 1);

// 5. shot payload
h(firstKeeper, { t: 'shot:submit', round: 1, shot: shotTo(0, 1) });
check('the goalkeeper cannot shoot', last(A)!.state!.phase === 'aim');
h(firstKicker, { t: 'shot:submit', round: 1, shot: { v: [0, 0, 90], spin: 3, power: 9 } });
check('malformed shot rejected', last(firstKicker, 'match:error')?.code === 'bad_shot' && last(A)!.state!.phase === 'aim');
// pre-shot dive is secret
h(firstKeeper, { t: 'keeper:dive', round: 1, dir: 'right', at: -1 });
check('a dive picked before the shot is hidden from the kicker', last(firstKicker)!.state!.dive === null && last(firstKeeper)!.state!.dive?.dir === 'right');
h(firstKeeper, { t: 'keeper:dive', round: 1, dir: 'left', at: -1 });
check('a committed dive cannot be changed', last(firstKeeper)!.state!.dive?.dir === 'right');
h(firstKicker, { t: 'shot:submit', round: 1, shot: shotTo(2.6, 0.4) });
const ss = last(A, 'shot:start')!.state!;
const ssB = last(B, 'shot:start')!.state!;
check('shot:start relayed to both with the same path / runStart / seed', JSON.stringify(ss.shot) === JSON.stringify(ssB.shot) && ss.shot!.runStart === T + judge.MATCH_RULES.shotLeadMs);
check('one shot = one small message (no per-frame ball data)', JSON.stringify(ss.shot).length < 2500, `${JSON.stringify(ss.shot).length} bytes`);
check('pre-picked dive revealed at the strike', ss.dive?.dir === 'right' && ss.dive.at === -1);
const n1 = (inbox[A] || []).length;
advance(4000);
const r1 = last(A, 'round:result')!.state!;
const r1b = last(B, 'round:result')!.state!;
check('8. server decides the round and sends the same result to both', !!r1.result && JSON.stringify(r1.result) === JSON.stringify(r1b.result), r1.result?.outcome);
check('low shot to the right side + keeper dived right (screen) → SAVE', r1.result!.outcome === 'SAVE', r1.result!.detail);
check('score from the server only', r1.score[firstKicker] === 0 && r1.shots[firstKicker] === 1);
check('no extra traffic during the flight (≤3 messages per player)', (inbox[A] || []).length - n1 <= 3, `${(inbox[A] || []).length - n1}`);

// 9. roles swap
advance(judge.MATCH_RULES.resultShowMs);
const nx = last(A, 'round:next')!.state!;
check('round 2: roles swapped', nx.round === 2 && nx.kicker === firstKeeper && nx.keeper === firstKicker && nx.phase === 'aim');

// round 2: live dive during the flight from the keeper; too late → GOAL
h(firstKeeper, { t: 'shot:submit', round: 2, shot: shotTo(-2.5, 0.5) });
const run2 = last(A, 'shot:start')!.state!.shot!.runStart;
T = run2 + 1800; // keeper's dive arrives as the ball is already crossing
h(firstKicker, { t: 'keeper:dive', round: 2, dir: 'left', at: 0 }); // claims he dove at the run-up start
const kd = last(firstKeeper, 'keeper:dive')?.state?.dive;
check('back-dated dive timestamps are not trusted (clamped to arrival − 0.5 s)', !!kd && Math.abs(kd.at - 1.3) < 1e-9, String(kd?.at));
advance(3000);
const r2 = last(A, 'round:result')!.state!;
check('round 2: corner shot, keeper too late → GOAL for the round-2 kicker', r2.result!.outcome === 'GOAL' && r2.score[firstKeeper] === 1, r2.result!.outcome);

// rounds 3..10 alternate; kicker of round r
let goals: Record<string, number> = { [A]: r2.score[A], [B]: r2.score[B] };
for (let r = 3; r <= 10; r++) {
  advance(judge.MATCH_RULES.resultShowMs);
  const st = last(A)!.state!;
  const kicker = st.kicker!;
  const expectKicker = r % 2 === 1 ? firstKicker : firstKeeper;
  if (kicker !== expectKicker) check(`round ${r} kicker alternates`, false);
  if (r === 5) {
    // 25 s without a shot → MISS (no endless waiting)
    advance(judge.MATCH_RULES.aimTimeoutMs + 10);
    const rr = last(A, 'round:result')!.state!;
    check('aim timeout → MISS', rr.result!.round === 5 && rr.result!.outcome === 'MISS' && rr.result!.detail.startsWith('시간 초과'));
    continue;
  }
  h(kicker, { t: 'shot:submit', round: r, shot: shotTo(r % 2 ? 2.4 : -2.4, 0.6, 0.8) });
  advance(4000);
  const rr = last(A, 'round:result')!.state!;
  if (rr.result!.outcome === 'GOAL') goals[kicker]++;
}
advance(judge.MATCH_RULES.resultShowMs);
const doneA = last(A, 'match:finished');
const doneB = last(B, 'match:finished');
check('10. after 10 rounds the server finishes the match for both', !!doneA && !!doneB && doneA.state!.phase === 'finished' && JSON.stringify(doneA.state!.final) === JSON.stringify(doneB.state!.final));
const fin = doneA!.state!;
check('each player shot exactly 5 times', fin.shots[A] === 5 && fin.shots[B] === 5, JSON.stringify(fin.shots));
check('final score matches the results', fin.score[A] === goals[A] && fin.score[B] === goals[B], JSON.stringify(fin.score));
const w = fin.score[A] === fin.score[B] ? null : fin.score[A] > fin.score[B] ? A : B;
check('winner / draw decided by the server', fin.final!.winner === w && fin.final!.draw === (w === null), JSON.stringify(fin.final));
check('history has 10 results', fin.history.length === 10);

// rematch
h(A, { t: 'match:rematch' });
check('one rematch request waits for the other', last(B)!.state!.phase === 'finished' && last(B)!.state!.players.find((p) => p.peer === A)!.rematch);
h(B, { t: 'match:rematch' });
const re = last(B, 'match:start')!.state!;
check('both → rematch starts a new countdown with 0:0', re.phase === 'countdown' && re.score[A] === 0 && re.score[B] === 0 && re.round === 1);

// disconnect mid-match
advance(judge.MATCH_RULES.countdownMs + 10);
mgr.disconnect(B);
const dis = last(A, 'match:opponentDisconnected');
check('opponent disconnects mid-match → the other is told at once', !!dis && dis.state!.phase === 'aborted' && dis.state!.ended === 'opponent_left');
h(A, { t: 'shot:submit', round: 1, shot: shotTo(0, 1) });
check('aborted match accepts nothing more', last(A)!.state!.phase === 'aborted');

// a joiner whose opponent never comes
mgr.handle('lonely', { t: 'match:join', matchId: 'cnobody0001', opponentPeer: 'ghost', nickname: 'L', userId: 'ul' });
advance(61_000);
check('opponent never joins → match given up (no endless wait)', last('lonely')!.t === 'match:opponentDisconnected' && !mgr.matches.has('cnobody0001'));

// presence messages are not touched by the match manager
check('lobby presence messages pass through untouched', mgr.handle(A, { t: 'presence', p: {} }) === false && mgr.handle(A, { t: 'join', room: 'x' }) === false);

// ── UPDATE 6: FREE KICK DUEL + MP reward (once per finished game) ─────────────
{
  const paid: { key: string; mode: string; peer: string }[] = [];
  const recs: { key: string; mode: string; peer: string; result: string }[] = [];
  const mgr2 = createMatchManager({
    send,
    judge,
    now: () => T,
    setTimer,
    clearTimer,
    random: () => 0.3,
    reward: (m: { id: string; game: number; mode: string }, peer: string) => {
      paid.push({ key: `${m.id}#${m.game}`, mode: m.mode, peer });
      return m.mode === 'penalty' ? judge.REWARDS.penaltyWin : judge.REWARDS.freeKickWin;
    },
    record: (m: { id: string; game: number; mode: string }, peer: string, result: string) => recs.push({ key: `${m.id}#${m.game}`, mode: m.mode, peer, result }),
    checkSquad: (peer: string, sq: { penaltyOrder: string[] }) => (peer === 'cheat' && sq.penaltyOrder.includes('pele') ? null : sq),
  });
  const C = 'peerC';
  const D = 'peerD';
  const fid = 'cfreekick0001';
  const h2 = (peer: string, m: Record<string, unknown>) => mgr2.handle(peer, { matchId: fid, ...m });
  const sq = (fk: string) => ({ penaltyOrder: ['ronaldo', 'messi', 'son', 'mbappe', 'salah'], goalkeeperId: 'neuer', freeKickTakerId: fk });
  h2(C, { t: 'match:join', opponentPeer: D, nickname: 'C', userId: 'uc', squad: sq('messi'), mode: 'freekick' });
  h2(D, { t: 'match:join', opponentPeer: C, nickname: 'D', userId: 'ud', squad: sq('ronaldo'), mode: 'penalty' });
  const st = last(D)!.state!;
  check('UPDATE 6: FREE KICK DUEL — the match keeps the challenger’s mode (server state mode = freekick)', st.mode === 'freekick', String(st.mode));
  check('UPDATE 6: free-kick taker relayed to the opponent', st.players.find((p) => p.peer === C)!.squad?.freeKickTakerId === 'messi');
  h2(C, { t: 'match:ready', ready: true });
  h2(D, { t: 'match:ready', ready: true });
  advance(judge.MATCH_RULES.countdownMs + 10);
  check('UPDATE 6: same spot for both players of a pair, spots vary between pairs',
    judge.freeKickSpotIndex(fid, 1) === judge.freeKickSpotIndex(fid, 2) && new Set([1, 3, 5, 7, 9].map((r) => judge.freeKickSpotIndex(fid, r))).size > 1);
  const outcomes: string[] = [];
  for (let r = 1; r <= 10; r++) {
    const s2 = last(C)!.state!;
    const kicker = s2.kicker!;
    const spot = freeKickSpot(judge.freeKickSpotIndex(fid, r));
    // odd rounds: straight and low into the wall · even rounds: a lofted curler at the far corner
    const target = r % 2 ? new THREE.Vector3(spot.ball.x * 0.25, 0.9, 0) : new THREE.Vector3(-Math.sign(spot.ball.x || 1) * 2.9, 2.0, 0);
    const shot = calculateShotParameters(spot.ball, { target, spin: 0, profile: r % 2 ? 'STRAIGHT' : 'CURLED', curveLevel: 0, apex: r % 2 ? null : 3.2, power: r % 2 ? 0.75 : 0.85 }, MODES.freekick);
    h2(kicker, { t: 'shot:submit', round: r, shot });
    advance(5000);
    const res = last(C, 'round:result')?.state?.result;
    outcomes.push(res ? `${res.round}:${res.outcome}` : `${r}:none`);
    advance(judge.MATCH_RULES.resultShowMs);
  }
  check('UPDATE 6: a shot into the wall is judged BLOCKED by the server', outcomes.some((o) => o.endsWith('BLOCKED')), outcomes.join(' '));
  check('UPDATE 6: every free kick gets a server result (10 rounds)', outcomes.length === 10 && !outcomes.some((o) => o.endsWith('none')), outcomes.join(' '));
  const fC = last(C, 'match:finished')?.state;
  const fD = last(D, 'match:finished')?.state;
  check('UPDATE 6: FREE KICK RESULT — both phones get the same final score', !!fC && !!fD && JSON.stringify(fC.final) === JSON.stringify(fD.final) && fC.history.length === 10);
  check('UPDATE 6: no MP for the FREE KICK DUEL in this update', (fC?.final?.reward ?? 0) === 0);
  const fkRecs = recs.filter((r) => r.key === `${fid}#1`);
  const fin2 = fC!.final!;
  check('UPDATE 6 patch: the finished duel is recorded once for each player (free kick, win/loss/draw)',
    fkRecs.length === 2 && fkRecs.every((r) => r.mode === 'freekick') &&
      fkRecs.every((r) => r.result === (fin2.draw ? 'draw' : fin2.winner === r.peer ? 'win' : 'loss')), JSON.stringify(fkRecs));
  const goals = fC!.history.filter((x) => x.outcome === 'GOAL');
  check('UPDATE 6 patch: every result names the kicker’s player (free kick → his FK taker: Messi / Ronaldo)',
    fC!.history.every((x) => x.playerId === (x.kicker === C ? 'messi' : 'ronaldo')) && goals.length > 0, JSON.stringify(fC!.history.map((x) => x.playerId)));

  // penalty: winner paid exactly once per finished game (rematch = a new game)
  const pid = 'cpenaltyreward1';
  const h3 = (peer: string, m: Record<string, unknown>) => mgr2.handle(peer, { matchId: pid, ...m });
  const E = 'peerE';
  const F = 'peerF';
  h3(E, { t: 'match:join', opponentPeer: F, nickname: 'E', userId: 'ue', squad: sq('messi') });
  h3(F, { t: 'match:join', opponentPeer: E, nickname: 'F', userId: 'uf', squad: sq('messi') });
  const playGame = () => {
    advance(judge.MATCH_RULES.countdownMs + 10);
    for (let r = 1; r <= 10; r++) {
      const s3 = last(E)!.state!;
      // E always scores into the corner, F always shoots at the keeper's body
      const shot = s3.kicker === E ? shotTo(r % 4 < 2 ? 3.2 : -3.2, 0.3, 0.9) : shotTo(0, 2.6, 0.9);
      h3(s3.kicker!, { t: 'shot:submit', round: r, shot });
      advance(5000 + judge.MATCH_RULES.resultShowMs);
    }
  };
  h3(E, { t: 'match:ready', ready: true });
  h3(F, { t: 'match:ready', ready: true });
  playGame();
  const pf = last(E, 'match:finished')!.state!;
  const penaltyPaid = paid.filter((p) => p.mode === 'penalty');
  check('UPDATE 6: penalty winner gets +10,000,000 MP (server-decided, shown in final)', pf.final!.winner !== null && pf.final!.reward === 10_000_000 && penaltyPaid.length === 1 && penaltyPaid[0].peer === pf.final!.winner, JSON.stringify(pf.final));
  // late / duplicate messages can't pay again
  h3(E, { t: 'match:ready', ready: true });
  h3(E, { t: 'shot:submit', round: 10, shot: shotTo(3, 0.3) });
  advance(10_000);
  check('UPDATE 6: replayed messages after the end pay nothing more', paid.filter((p) => p.mode === 'penalty').length === 1);
  h3(E, { t: 'match:rematch' });
  h3(F, { t: 'match:rematch' });
  playGame();
  const keys = paid.filter((p) => p.mode === 'penalty').map((p) => p.key);
  check('UPDATE 6: a rematch is a new game with its own reward key (no key paid twice)', keys.length === 2 && new Set(keys).size === 2, keys.join(','));
  const pRecs = recs.filter((r) => r.key.startsWith(pid));
  check('UPDATE 6 patch: penalty records — 2 games × 2 players, each game once', pRecs.length === 4 && new Set(pRecs.map((r) => r.key + r.peer)).size === 4 && pRecs.every((r) => r.mode === 'penalty'));
  const ph = last(E, 'match:finished')!.state!.history;
  const eShots = ph.filter((x) => x.kicker === E).map((x) => x.playerId);
  check('UPDATE 6 patch: penalty results name the taker in squad order (messi, ronaldo… by kick)', JSON.stringify(eShots) === JSON.stringify(['ronaldo', 'messi', 'son', 'mbappe', 'salah']), JSON.stringify(eShots));

  // squads with unowned players are refused by the server hook
  mgr2.handle('cheat', { t: 'match:join', matchId: 'ccheat000001', opponentPeer: 'honest', nickname: 'Z', userId: 'uz', squad: { penaltyOrder: ['pele', 'messi', 'son', 'mbappe', 'salah'], goalkeeperId: 'neuer' } });
  check('UPDATE 6: a squad with players the account does not own is not used online', last('cheat')!.state!.players[0].squad === null);
}

// ── UPDATE 8: keeper joystick — along the goal line only, server-clamped, frozen at the strike ──
{
  const P = 'peerJ1';
  const Q = 'peerJ2';
  const jid = 'cjoystick0001';
  const hj = (peer: string, m: Record<string, unknown>) => mgr.handle(peer, { matchId: jid, ...m });
  hj(P, { t: 'match:join', opponentPeer: Q, nickname: 'J1', userId: 'uj1' });
  hj(Q, { t: 'match:join', opponentPeer: P, nickname: 'J2', userId: 'uj2' });
  hj(P, { t: 'match:ready', ready: true });
  hj(Q, { t: 'match:ready', ready: true });
  advance(judge.MATCH_RULES.countdownMs);
  const st = last(P)!.state!;
  const kick = st.kicker!;
  const keep = st.keeper!;
  const moves = (peer: string) => (inbox[peer] || []).filter((m) => m.t === 'keeper:move') as unknown as { x: number; round: number }[];
  hj(kick, { t: 'keeper:move', round: 1, x: 2 });
  check('UPDATE 8: only the keeper can move the keeper', moves(kick).length === 0 && (last(kick)!.state!.keeperX ?? 0) === 0);
  hj(keep, { t: 'keeper:move', round: 1, x: 1.2 });
  check('UPDATE 8: keeper:move is relayed to the kicker (x only)', moves(kick).at(-1)?.x === 1.2, JSON.stringify(moves(kick).at(-1)));
  advance(50);
  hj(keep, { t: 'keeper:move', round: 1, x: 99 });
  check('UPDATE 8: the server clamps him inside the posts (±2.92 m)', moves(kick).at(-1)?.x === judge.KEEPER_LINE.maxX);
  advance(50);
  hj(keep, { t: 'keeper:move', round: 1, x: -1.5, y: 3, z: 5 });
  hj(keep, { t: 'keeper:move', round: 1, x: 0.5 }); // < 40 ms later: flood guard drops it
  check('UPDATE 8: forward / back values are ignored; floods are dropped', moves(kick).at(-1)?.x === -1.5 && !('z' in (moves(kick).at(-1) as object)), JSON.stringify(moves(kick).at(-1)));
  advance(50);
  hj(keep, { t: 'keeper:move', round: 1, x: 1.8 });
  hj(kick, { t: 'shot:submit', round: 1, shot: shotTo(3.2, 1.0) });
  const ss = last(P, 'shot:start')!.state!;
  check('UPDATE 8: the strike freezes the keeper’s spot (shot.keeperX, same for both)', ss.shot?.keeperX === 1.8 && JSON.stringify(last(Q, 'shot:start')!.state!.shot) === JSON.stringify(ss.shot));
  // UPDATE 9.5: during the run-up he may still shuffle — walking speed, ±1.4 m (widened to his
  // spot at the strike), then the spot is locked just before contact and both phones are told
  const n0 = moves(kick).length;
  advance(100);
  hj(keep, { t: 'keeper:move', round: 1, x: -2.9 });
  const m1 = moves(kick).at(-1)?.x ?? 99;
  check('UPDATE 9.5: run-up move accepted, at walking speed (no teleport)', moves(kick).length === n0 + 1 && m1 < 1.8 && m1 > 1.0, String(m1));
  for (let i = 0; i < 20; i++) {
    advance(100);
    hj(keep, { t: 'keeper:move', round: 1, x: -2.9 });
  }
  const locks = (peer: string) => (inbox[peer] || []).filter((m) => m.t === 'keeper:lock') as unknown as { x: number; round: number }[];
  const finalX = locks(kick).at(-1)?.x;
  check('UPDATE 9.5: run-up range limited (never to the far post: ≥ −1.4 m)', moves(kick).slice(n0).every((m) => m.x >= -judge.KEEPER_LINE.runUpMaxX - 1e-9) && (finalX ?? -9) >= -judge.KEEPER_LINE.runUpMaxX - 1e-9, String(finalX));
  check('UPDATE 9.5: the spot is locked before contact, the same x sent to BOTH phones', typeof finalX === 'number' && locks(keep).at(-1)?.x === finalX && locks(kick).length === 1);
  const n1 = moves(kick).length;
  hj(keep, { t: 'keeper:move', round: 1, x: 0 });
  check('UPDATE 9.5: no moving after the lock', moves(kick).length === n1);
  hj(keep, { t: 'keeper:dive', round: 1, dir: 'right', at: judge.PENALTY_CONTACT_TIME });
  advance(4000);
  const r = last(P, 'round:result')!.state!.result!;
  const seed = judge.roundSeed(jid, 1);
  const here = judge.simulateRound(seed, ss.shot!.input, { dir: 'right', at: judge.PENALTY_CONTACT_TIME }, null, { mode: 'penalty', keeperX: finalX });
  const mid = judge.simulateRound(seed, ss.shot!.input, { dir: 'right', at: judge.PENALTY_CONTACT_TIME }, null, { mode: 'penalty', keeperX: 0 });
  check('UPDATE 8/9.5: the judge dives from his locked spot (≠ from the middle)', r.outcome === here.outcome && (here.outcome !== mid.outcome || here.detail !== mid.detail || here.decidedAt !== mid.decidedAt), `${here.outcome} vs mid ${mid.outcome}`);
  advance(judge.MATCH_RULES.resultShowMs + 50);
  check('UPDATE 8: the next round starts with the keeper in the middle again', (last(P)!.state!.keeperX ?? 0) === 0 && last(P)!.state!.round === 2);
  // the keeper never leaves his line: depth fixed, x clamped, for any position
  const g = new (await import('../src/online/match/penaltyRound')).OnlineKickGame('K', 1, false, {}, 'penalty', 0, 50);
  g.start();
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  check('UPDATE 8: OnlineKickGame keeps the keeper on his line (z fixed, |x| ≤ maxX)', Math.abs(g.keeper.body.root.position.z - 0.45) < 1e-9 && Math.abs(g.keeper.body.root.position.x) <= judge.KEEPER_LINE.maxX + 1e-9, JSON.stringify(g.keeper.body.root.position));
}

const fails = results.filter(([, ok]) => !ok);
console.log(`\n${fails.length ? `${fails.length} FAILED` : `ALL ${results.length} MATCH CHECKS PASSED`}`);
process.exit(fails.length ? 1 : 0);
