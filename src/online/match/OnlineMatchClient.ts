import type { ShotInput } from '../../game/core/types';
import type { Channel } from '../channel/Channel';
import type { MatchInfo } from '../LobbyClient';
import type { DiveDir, MatchState, ServerMessage, WireDive, WirePlayer, WireSquad } from './protocol';

export interface MatchView {
  /** 'unsupported' = this copy of the game has no match server (e.g. claude.ai page) */
  status: 'connecting' | 'live' | 'unsupported' | 'lost';
  state: MatchState | null;
  myPeer: string;
  me: WirePlayer | null;
  opp: WirePlayer | null;
  role: 'kicker' | 'keeper' | null;
  myScore: number;
  oppScore: number;
  myShots: number;
  oppShots: number;
  /** my own dive this round (also the one picked before the shot, hidden from the kicker) */
  myDive: WireDive | null;
  /** shot sent, waiting for the server to start it */
  shotSent: boolean;
  error: string | null;
}

/**
 * Browser side of an online penalty match. Talks to the Render server over the
 * lobby's WebSocket; never decides anything itself (start, roles, score, result
 * all come from the server). Also keeps a server-clock offset so both phones play
 * the kick on the same server timestamp.
 */
export class OnlineMatchClient {
  private view: MatchView;
  private subs = new Set<() => void>();
  private unsubs: (() => void)[] = [];
  private offset = 0;
  private bestRtt = Infinity;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private joinTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private lastRound = -1;

  constructor(
    private channel: Channel,
    private info: MatchInfo,
    private squad: WireSquad | null = null,
  ) {
    this.view = {
      status: channel.match ? 'connecting' : 'unsupported',
      state: null,
      myPeer: info.me.peer,
      me: null,
      opp: null,
      role: null,
      myScore: 0,
      oppScore: 0,
      myShots: 0,
      oppShots: 0,
      myDive: null,
      shotSent: false,
      error: null,
    };
  }

  start() {
    const link = this.channel.match;
    if (!link) return;
    this.unsubs.push(
      link.onMessage((m) => this.onMessage(m as unknown as ServerMessage)),
      this.channel.onConnection((c) => {
        // a dropped socket gets a new identity on reconnect → this match is over for us
        if (!c && this.view.status === 'live' && this.view.state?.phase !== 'finished') this.patch({ status: 'lost' });
      }),
    );
    this.join();
    // the opponent may not have joined yet; joining again is harmless
    this.joinTimer = setInterval(() => {
      if (!this.view.state || this.view.state.players.length < 2) this.join();
      else if (this.joinTimer) {
        clearInterval(this.joinTimer);
        this.joinTimer = null;
      }
    }, 1500);
    // clock sync: a burst now, then every 1.5 s for the first 30 s, then every 8 s
    for (let i = 0; i < 6; i++) setTimeout(() => this.ping(), i * 120);
    let n = 0;
    this.pingTimer = setInterval(() => {
      this.ping();
      if (++n === 20 && this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => this.ping(), 8000);
      }
    }, 1500);
  }

  stop() {
    this.stopped = true;
    this.unsubs.forEach((u) => u());
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.joinTimer) clearInterval(this.joinTimer);
  }

  subscribe = (fn: () => void) => {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  };

  getSnapshot = () => this.view;

  /** current server time (ms) */
  serverNow() {
    return Date.now() + this.offset;
  }

  /** server timestamp → local Date.now() timestamp */
  toLocal(serverMs: number) {
    return serverMs - this.offset;
  }

  // ── intents ────────────────────────────────────────────────────────────
  private send(m: Record<string, unknown>) {
    this.channel.match?.send({ ...m, matchId: this.info.matchId });
  }

  private join() {
    this.send({
      t: 'match:join',
      opponentPeer: this.info.opponent.peer,
      nickname: this.info.me.nickname,
      userId: this.info.me.userId,
      // UPDATE 4: only the ids of my penalty order + keeper (+ UPDATE 6: free-kick taker)
      squad: this.squad ? { penaltyOrder: this.squad.penaltyOrder, goalkeeperId: this.squad.goalkeeperId, freeKickTakerId: this.squad.freeKickTakerId } : null,
      // UPDATE 6: PENALTY SHOOTOUT or FREE KICK DUEL (agreed in the lobby challenge)
      mode: this.info.mode ?? 'penalty',
    });
  }

  private ping() {
    this.channel.match?.send({ t: 'time:ping', c: Date.now() });
  }

  ready(ready = true) {
    this.send({ t: 'match:ready', ready });
  }

  shoot(input: ShotInput) {
    const s = this.view.state;
    if (!s || s.phase !== 'aim' || this.view.role !== 'kicker' || this.view.shotSent) return false;
    this.send({ t: 'shot:submit', round: s.round, shot: input });
    this.patch({ shotSent: true });
    return true;
  }

  /** `at` = seconds since this round's run-up started on the synced clock (ignored before the shot) */
  dive(dir: DiveDir, at: number) {
    const s = this.view.state;
    if (!s || this.view.role !== 'keeper' || this.view.myDive) return null;
    if (s.phase !== 'aim' && s.phase !== 'shot') return null;
    const d: WireDive = { round: s.round, dir, at: s.phase === 'aim' ? -1 : at };
    this.send({ t: 'keeper:dive', round: s.round, dir, at: d.at });
    this.patch({ myDive: d });
    return d;
  }

  rematch() {
    this.send({ t: 'match:rematch' });
  }

  leave() {
    this.send({ t: 'match:leave' });
    this.stop();
  }

  // ── server messages ────────────────────────────────────────────────────
  private onMessage(m: ServerMessage) {
    if (this.stopped) return;
    if (m.t === 'time:pong' && typeof m.c === 'number' && typeof m.s === 'number') {
      const rtt = Date.now() - m.c;
      // NTP-style: trust only the quickest round trips (a busy phone answers late and
      // would skew the estimate); the best RTT slowly ages so the clock can be re-learnt
      this.bestRtt = Math.min(this.bestRtt * 1.02 + 1, Infinity);
      if (rtt <= this.bestRtt) {
        this.bestRtt = rtt;
        this.offset = m.s - (m.c + rtt / 2);
      }
      return;
    }
    if (m.t === 'match:error') {
      if (m.code === 'not_allowed' || m.code === 'bad_request') this.patch({ error: '이 대결에 참가할 수 없습니다.' });
      return;
    }
    const s = m.state;
    if (!s || s.id !== this.info.matchId) return;
    const myPeer = this.channel.selfPeer() ?? this.info.me.peer;
    const me = s.players.find((p) => p.peer === myPeer) ?? null;
    const opp = s.players.find((p) => p.peer !== myPeer) ?? null;
    const role = s.kicker === myPeer ? 'kicker' : s.keeper === myPeer ? 'keeper' : null;
    const newRound = s.round !== this.lastRound || s.phase === 'countdown';
    this.lastRound = s.round;
    let myDive = newRound ? null : this.view.myDive;
    if (s.dive && role === 'keeper' && s.dive.round === s.round) myDive = s.dive;
    this.view = {
      ...this.view,
      status: m.t === 'match:opponentDisconnected' || s.phase === 'aborted' ? 'live' : this.view.status === 'lost' ? 'lost' : 'live',
      state: s,
      myPeer,
      me,
      opp,
      role,
      myScore: me ? s.score[me.peer] ?? 0 : 0,
      oppScore: opp ? s.score[opp.peer] ?? 0 : 0,
      myShots: me ? s.shots[me.peer] ?? 0 : 0,
      oppShots: opp ? s.shots[opp.peer] ?? 0 : 0,
      myDive,
      shotSent: newRound ? false : s.phase === 'aim' ? this.view.shotSent : false,
      error: null,
    };
    this.emit();
  }

  private patch(p: Partial<MatchView>) {
    this.view = { ...this.view, ...p };
    this.emit();
  }

  private emit() {
    this.subs.forEach((f) => f());
  }
}
