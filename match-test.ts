/**
 * Server-authoritative online penalty match — headless test with a fake clock.
 *   npm run test:match
 */
// @ts-expect-error plain .mjs server module
import { createMatchManager } from '../server/matches.mjs';
import * as THREE from 'three';
import { FIELD, MODES } from '../src/game/core/config';
import { calculateShotParameters } from '../src/game/physics/BallPhysics';
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
check('UPDATE 4: squad ids relayed to the opponent (ids only, junk dropped)', JSON.stringify(sqA) === JSON.stringify({ penaltyOrder: ['ronaldo', 'messi', 'son', 'mbappe', 'salah'], goalkeeperId: 'courtois' }), JSON.stringify(sqA));
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

const fails = results.filter(([, ok]) => !ok);
console.log(`\n${fails.length ? `${fails.length} FAILED` : `ALL ${results.length} MATCH CHECKS PASSED`}`);
process.exit(fails.length ? 1 : 0);
