/**
 * Online penalty match — wire protocol shared by the browser and the Render server.
 *
 * The server (server/realtime-server.mjs + server/matches.mjs) is the authority for
 * match id/room, players, ready flags, start time, roles, rounds, score and results.
 * Clients only send intents; the ball is never streamed. One shot = one small message
 * (the drawn 3D path + power), replayed deterministically on both phones.
 *
 * client → server                                 server → client (every event carries `state`)
 *   match:join   {matchId, opponentPeer, nickname,   match:state                  (any change / join)
 *                 userId}                            match:start                  (both ready → countdown)
 *   match:ready  {matchId, ready}                    shot:start                   (kicker's shot + run-up time)
 *   shot:submit  {matchId, round, shot}              keeper:dive                  (keeper's dive, for both views)
 *   keeper:dive  {matchId, round, dir, at}           round:result                 (authoritative GOAL/SAVE/MISS)
 *   match:rematch{matchId}                           round:next                   (roles swapped)
 *   match:leave  {matchId}                           match:finished               (final score / winner)
 *   time:ping    {c}                                 match:opponentDisconnected
 *                                                    match:error  {code}
 *                                                    time:pong    {c, s}
 */
import type { ShotInput, ShotOutcome } from '../../game/core/types';

export const MATCH_RULES = {
  /** shots per player in regulation (10 rounds alternate) */
  shotsEach: 5,
  /** later: true → keep alternating pairs while level */
  suddenDeath: false,
  countdownMs: 3600,
  /** run-up starts this long after the server accepts the shot (network lead) */
  shotLeadMs: 650,
  resultShowMs: 2600,
  aimTimeoutMs: 25_000,
} as const;

export type DiveDir = 'left' | 'right' | 'upLeft' | 'upRight' | 'up' | 'down' | 'lowLeft' | 'lowRight';
export const DIVE_DIRS: DiveDir[] = ['left', 'right', 'upLeft', 'upRight', 'up', 'down', 'lowLeft', 'lowRight'];

export type MatchPhase = 'waiting' | 'countdown' | 'aim' | 'shot' | 'result' | 'finished' | 'aborted';
export type RoundOutcome = Extract<ShotOutcome, 'GOAL' | 'SAVE' | 'MISS'>;

export interface WirePlayer {
  peer: string;
  nickname: string;
  userId: string;
  ready: boolean;
  rematch: boolean;
  connected: boolean;
}

export interface WireShot {
  round: number;
  input: ShotInput;
  /** server ms when the kicker's run-up starts on every screen */
  runStart: number;
  seed: number;
}

export interface WireDive {
  round: number;
  dir: DiveDir;
  /** seconds since the run-up started (-1 = chosen before the shot: goes at contact) */
  at: number;
}

export interface WireResult {
  round: number;
  kicker: string;
  outcome: RoundOutcome;
  detail: string;
}

export interface MatchState {
  id: string;
  roomId: string;
  phase: MatchPhase;
  players: WirePlayer[];
  round: number;
  totalRounds: number;
  kicker: string | null;
  keeper: string | null;
  score: Record<string, number>;
  shots: Record<string, number>;
  history: WireResult[];
  /** server ms: countdown end = round 1 kick-off */
  startAt: number;
  aimDeadline: number;
  shot: WireShot | null;
  /** hidden while aiming (the kicker must not see a pre-chosen dive) */
  dive: WireDive | null;
  result: WireResult | null;
  final: { winner: string | null; draw: boolean } | null;
  ended: null | 'opponent_left';
  serverNow: number;
}

export type ServerEvent =
  | 'match:state'
  | 'match:start'
  | 'shot:start'
  | 'keeper:dive'
  | 'round:result'
  | 'round:next'
  | 'match:finished'
  | 'match:opponentDisconnected';

export interface ServerMessage {
  t: ServerEvent | 'match:error' | 'time:pong';
  state?: MatchState;
  code?: string;
  c?: number;
  s?: number;
}

/** deterministic per-round seed (same on server and both clients) */
export function roundSeed(matchId: string, round: number) {
  let h = 2166136261 >>> 0;
  const s = `${matchId}#${round}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
