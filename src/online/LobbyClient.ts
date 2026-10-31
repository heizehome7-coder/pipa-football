import type { Channel, ChannelPeer, MatchRoom } from './channel/Channel';

/**
 * ONLINE LOBBY protocol (stage 1: presence → challenge → accept/reject → match).
 *
 * Every client publishes ONE presence object (LobbyPresence). There is no
 * central authority: each client derives the lobby from everyone's presence
 * and reconciles its own state.
 *
 *   A challenges B   A.out = {challengeId, receiverPeer: B, status: 'pending'}
 *   B sees it        (B derives "incoming" from A.out) → floating panel
 *   B accepts        B.answers += {challengeId, status: 'accepted'}, B.match = id
 *   A sees answer    A.out.status = 'accepted', A.match = id
 *   → both share matchId = challengeId and join room `pipa-m-<id>` (future online play)
 *
 * Reject → answer 'rejected'. No answer in 30 s → sender marks 'expired'.
 * Target disconnects → sender marks 'cancelled'. Sender disconnects → receiver's
 * panel closes. Simultaneous A→B and B→A → the lexicographically smaller
 * challengeId wins and the other side accepts it (one shared match).
 */

export type PresenceStatus = 'online' | 'in_lobby' | 'pending' | 'in_match';
export type ChallengeStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';

export interface Challenge {
  challengeId: string;
  senderId: string;
  senderNickname: string;
  senderPeer: string;
  receiverId: string;
  receiverNickname: string;
  receiverPeer: string;
  status: ChallengeStatus;
  createdAt: number;
}

export interface Answer {
  challengeId: string;
  senderPeer: string;
  status: 'accepted' | 'rejected';
  reason?: 'user' | 'busy';
  at: number;
}

export interface LobbyPresence {
  app: 'pipa';
  v: 1;
  userId: string;
  nickname: string;
  status: PresenceStatus;
  lastSeen: number;
  out: Challenge | null;
  answers: Answer[];
  match: string | null;
  ready: boolean;
}

export interface PlayerView {
  peer: string;
  userId: string;
  nickname: string;
  status: PresenceStatus;
  /** label shown instead of the button, or null when challengeable */
  busyLabel: string | null;
  requestedByMe: boolean;
  canChallenge: boolean;
}

export interface MatchInfo {
  matchId: string;
  roomName: string;
  role: 'sender' | 'receiver';
  me: { peer: string; userId: string; nickname: string };
  opponent: { peer: string; userId: string; nickname: string };
  createdAt: number;
  opponentJoined: boolean;
  opponentReady: boolean;
  ready: boolean;
  ended: null | 'opponent_left';
}

export interface Notice {
  id: number;
  text: string;
  tone: 'info' | 'warn' | 'good';
}

export type Connection = 'connecting' | 'online' | 'reconnecting' | 'unavailable';

export interface LobbySnapshot {
  connection: Connection;
  backend: Channel['kind'];
  me: { peer: string | null; userId: string; nickname: string; status: PresenceStatus };
  inLobby: boolean;
  players: PlayerView[];
  outgoing: (Challenge & { secondsLeft: number }) | null;
  incoming: Challenge | null;
  match: MatchInfo | null;
  notices: Notice[];
  /** other people who have this page open right now, logged in to PIPA or not (diagnostics) */
  pageViewers: number;
}

export interface LobbyOptions {
  now?: () => number;
  expireMs?: number;
  staleMs?: number;
  heartbeatMs?: number;
  tickMs?: number;
  noticeMs?: number;
}

const clean = (s: string) =>
  s.replace(/[\u0000-\u001f\u007f-\u009f­​-‏‪-‮⁠-⁯﻿]/g, '').slice(0, 20) || 'PLAYER';

const isPresence = (p: Record<string, unknown>): p is LobbyPresence & Record<string, unknown> =>
  p.app === 'pipa' && p.v === 1 && typeof p.nickname === 'string';

export class LobbyClient {
  private my: LobbyPresence;
  private peers: ChannelPeer[] = [];
  private live = new Map<string, ChannelPeer & { presence: LobbyPresence }>();
  private conn: Connection = 'connecting';
  private inLobby = false;
  private match: MatchInfo | null = null;
  private matchRoom: MatchRoom | null = null;
  private seenOpponentInMatch = false;
  private incomingShown: { ch: Challenge; seenAt: number } | null = null;
  private notices: Notice[] = [];
  private noticeSeq = 0;
  private subs = new Set<() => void>();
  private snap!: LobbySnapshot;
  private unsubs: (() => void)[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSent = '';
  private lastBeat = 0;
  private stopped = false;
  private now: () => number;
  private o: Required<Omit<LobbyOptions, 'now'>>;

  constructor(
    private channel: Channel,
    profile: { nickname: string; userId: string },
    opts: LobbyOptions = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.o = {
      expireMs: opts.expireMs ?? 30_000,
      staleMs: opts.staleMs ?? 35_000,
      heartbeatMs: opts.heartbeatMs ?? 10_000,
      tickMs: opts.tickMs ?? 500,
      noticeMs: opts.noticeMs ?? 3500,
    };
    this.my = {
      app: 'pipa',
      v: 1,
      userId: profile.userId,
      nickname: clean(profile.nickname),
      status: 'online',
      lastSeen: this.now(),
      out: null,
      answers: [],
      match: null,
      ready: false,
    };
    this.rebuild();
  }

  // ── lifecycle ──────────────────────────────────────────────────────────
  async start() {
    this.conn = 'connecting';
    this.rebuild();
    try {
      await this.channel.connect();
    } catch {
      if (this.stopped) return;
      this.conn = 'unavailable';
      this.rebuild();
      return;
    }
    if (this.stopped) {
      this.channel.close();
      return;
    }
    const uid = await this.channel.userId();
    if (uid) this.my.userId = uid;
    this.conn = 'online';
    this.unsubs.push(
      this.channel.onPeers((p) => {
        this.peers = p;
        this.reconcile();
      }),
      this.channel.onConnection((c) => {
        if (this.conn === 'unavailable') return;
        this.conn = c ? 'online' : 'reconnecting';
        if (c) this.lastSent = '';
        this.reconcile();
      }),
    );
    this.timer = setInterval(() => this.reconcile(), this.o.tickMs);
    this.reconcile();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.unsubs.forEach((u) => u());
    this.matchRoom?.leave();
    this.channel.close();
  }

  subscribe = (fn: () => void) => {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  };

  getSnapshot = () => this.snap;

  /** manual tick (tests with a fake clock) */
  tick() {
    this.reconcile();
  }

  // ── user actions ───────────────────────────────────────────────────────
  enterLobby() {
    this.inLobby = true;
    this.reconcile();
  }

  leaveLobby() {
    this.inLobby = false;
    this.reconcile();
  }

  /** returns false when not allowed (busy, already pending, unknown player) */
  challenge(peer: string): boolean {
    const me = this.channel.selfPeer();
    const target = this.live.get(peer);
    if (!me || !target || peer === me || this.match) return false;
    if (this.my.out && this.my.out.status === 'pending') return false;
    // race: they already challenged us → use their request instead of creating a new one
    const theirs = target.presence.out;
    if (theirs && theirs.status === 'pending' && theirs.receiverPeer === me) {
      this.acceptChallenge(theirs);
      return true;
    }
    if (target.presence.status === 'in_match' || target.presence.status === 'pending') return false;
    const id = `c${this.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    this.my.out = {
      challengeId: id,
      senderId: this.my.userId,
      senderNickname: this.my.nickname,
      senderPeer: me,
      receiverId: target.presence.userId,
      receiverNickname: target.presence.nickname,
      receiverPeer: peer,
      status: 'pending',
      createdAt: this.now(),
    };
    this.reconcile();
    return true;
  }

  cancelChallenge() {
    if (this.my.out?.status === 'pending') {
      this.my.out = null;
      this.reconcile();
    }
  }

  accept() {
    const inc = this.incomingShown?.ch;
    if (inc) this.acceptChallenge(inc);
  }

  reject() {
    const inc = this.incomingShown?.ch;
    if (!inc) return;
    this.answer(inc, 'rejected', 'user');
    this.incomingShown = null;
    this.reconcile();
  }

  setReady(ready = true) {
    if (!this.match || this.match.ended) return;
    this.my.ready = ready;
    this.reconcile();
  }

  leaveMatch() {
    this.matchRoom?.leave();
    this.matchRoom = null;
    this.match = null;
    this.seenOpponentInMatch = false;
    this.my.match = null;
    this.my.ready = false;
    this.my.out = null;
    this.my.answers = [];
    this.reconcile();
  }

  dismissNotice(id: number) {
    this.notices = this.notices.filter((n) => n.id !== id);
    this.rebuild();
  }

  // ── protocol internals ─────────────────────────────────────────────────
  private notify(text: string, tone: Notice['tone'] = 'info') {
    const n = { id: ++this.noticeSeq, text, tone };
    this.notices = [...this.notices.slice(-2), n];
    setTimeout(() => this.dismissNotice(n.id), this.o.noticeMs);
  }

  private answer(ch: Challenge, status: Answer['status'], reason: Answer['reason']) {
    this.my.answers = [
      ...this.my.answers.filter((a) => a.challengeId !== ch.challengeId).slice(-3),
      { challengeId: ch.challengeId, senderPeer: ch.senderPeer, status, reason, at: this.now() },
    ];
  }

  private acceptChallenge(ch: Challenge) {
    if (this.match) return;
    // our own pending request (if any) is superseded by this match
    if (this.my.out && this.my.out.status === 'pending') this.my.out = null;
    this.answer(ch, 'accepted', 'user');
    this.incomingShown = null;
    this.enterMatch(ch, 'receiver');
    this.reconcile();
  }

  private enterMatch(ch: Challenge, role: MatchInfo['role']) {
    const me = { peer: this.channel.selfPeer() ?? '', userId: this.my.userId, nickname: this.my.nickname };
    const opp =
      role === 'sender'
        ? { peer: ch.receiverPeer, userId: ch.receiverId, nickname: ch.receiverNickname }
        : { peer: ch.senderPeer, userId: ch.senderId, nickname: ch.senderNickname };
    const roomName = `pipa-m-${ch.challengeId.toLowerCase().replace(/[^a-z0-9]/g, '')}`.slice(0, 48);
    this.match = {
      matchId: ch.challengeId,
      roomName,
      role,
      me,
      opponent: opp,
      createdAt: this.now(),
      opponentJoined: false,
      opponentReady: false,
      ready: false,
      ended: null,
    };
    this.seenOpponentInMatch = false;
    this.notices = []; // earlier lobby notices are no longer relevant
    this.my.match = ch.challengeId;
    this.my.ready = false;
    this.channel.joinRoom(roomName).then((r) => {
      if (this.match?.roomName === roomName) this.matchRoom = r;
      else r?.leave();
    });
  }

  private reconcile() {
    if (this.stopped) return;
    const now = this.now();
    const me = this.channel.selfPeer();

    // live, fresh PIPA peers (stale = heartbeat missing)
    this.live.clear();
    for (const p of this.peers) {
      if (p.self || p.peer === me) continue;
      if (!isPresence(p.presence)) continue;
      if (now - p.updatedAt > this.o.staleMs) continue;
      this.live.set(p.peer, p as ChannelPeer & { presence: LobbyPresence });
    }

    // 1) my outgoing request
    const out = this.my.out;
    if (out && out.status === 'pending' && me) {
      const target = this.live.get(out.receiverPeer);
      const ans = target?.presence.answers?.find((a) => a.challengeId === out.challengeId);
      const theirs = target?.presence.out;
      if (!target) {
        this.my.out = null;
        this.notify('상대방의 연결이 종료되었습니다.', 'warn');
      } else if (ans?.status === 'accepted') {
        this.my.out = { ...out, status: 'accepted' };
        this.enterMatch(this.my.out, 'sender');
      } else if (ans?.status === 'rejected') {
        this.my.out = null;
        this.notify(
          ans.reason === 'busy' ? `${out.receiverNickname}님은 지금 다른 대결을 처리 중입니다.` : `${out.receiverNickname}님이 대결 신청을 거절했습니다.`,
          'warn',
        );
      } else if (theirs && theirs.status === 'pending' && theirs.receiverPeer === me) {
        // simultaneous requests: the smaller id wins, the other side accepts it
        if (theirs.challengeId < out.challengeId) {
          this.my.out = null;
          this.acceptChallenge(theirs);
          return;
        }
      } else if (target.presence.status === 'in_match' && target.presence.match !== out.challengeId) {
        this.my.out = null;
        this.notify(`${out.receiverNickname}님은 지금 다른 대결 중입니다.`, 'warn');
      } else if (now - out.createdAt > this.o.expireMs) {
        this.my.out = { ...out, status: 'expired' };
        this.notify('대결 신청 시간이 만료되었습니다.', 'warn');
      }
    } else if (out && out.status === 'expired') {
      // keep "expired" visible to the receiver briefly, then clear
      if (now - out.createdAt > this.o.expireMs + 2000) this.my.out = null;
    }

    // 2) incoming requests addressed to me
    const incoming: Challenge[] = [];
    if (me) {
      for (const p of this.live.values()) {
        const c = p.presence.out;
        if (!c || c.receiverPeer !== me || c.status !== 'pending') continue;
        if (this.my.answers.some((a) => a.challengeId === c.challengeId)) continue;
        incoming.push(c);
      }
    }
    incoming.sort((a, b) => (a.challengeId < b.challengeId ? -1 : 1));
    const shown = this.incomingShown;
    if (shown) {
      const still = incoming.find((c) => c.challengeId === shown.ch.challengeId);
      if (!still) {
        const sender = this.live.get(shown.ch.senderPeer);
        const st = sender?.presence.out?.challengeId === shown.ch.challengeId ? sender.presence.out.status : null;
        this.incomingShown = null;
        if (!sender) this.notify('상대방의 연결이 종료되었습니다.', 'warn');
        else if (st === 'expired') this.notify('대결 신청이 만료되었습니다.', 'info');
        else this.notify(`${shown.ch.senderNickname}님이 신청을 취소했습니다.`, 'info');
      } else if (now - shown.seenAt > this.o.expireMs + 5000) {
        this.incomingShown = null; // safety net if the sender's clock/state is stuck
      }
    }
    const myPending = this.my.out && this.my.out.status === 'pending';
    for (const c of incoming) {
      if (this.incomingShown?.ch.challengeId === c.challengeId) continue;
      const raceWithMyTarget = myPending && this.my.out!.receiverPeer === c.senderPeer;
      if (raceWithMyTarget) continue; // handled in step 1
      if (this.match || myPending || this.incomingShown) {
        this.answer(c, 'rejected', 'busy'); // one request at a time
        continue;
      }
      this.incomingShown = { ch: c, seenAt: now };
    }

    // 3) forget answers the sender no longer needs
    this.my.answers = this.my.answers.filter((a) => {
      if (this.match && a.challengeId === this.match.matchId) return true;
      const s = this.live.get(a.senderPeer);
      return !!s && s.presence.out?.challengeId === a.challengeId;
    });

    // 4) the match
    if (this.match) {
      const opp = this.live.get(this.match.opponent.peer);
      const inSameMatch = !!opp && opp.presence.match === this.match.matchId;
      if (inSameMatch) this.seenOpponentInMatch = true;
      this.match = {
        ...this.match,
        opponentJoined: inSameMatch,
        opponentReady: inSameMatch && !!opp!.presence.ready,
        ready: this.my.ready,
      };
      if (!this.match.ended && (!opp || (this.seenOpponentInMatch && !inSameMatch))) {
        this.match = { ...this.match, ended: 'opponent_left' };
        this.my.ready = false;
        this.notify('상대방의 연결이 종료되었습니다.', 'warn');
      }
    }

    // 5) my status
    this.my.status = this.match
      ? 'in_match'
      : (this.my.out && this.my.out.status === 'pending') || this.incomingShown
        ? 'pending'
        : this.inLobby
          ? 'in_lobby'
          : 'online';

    this.publish(now);
    this.rebuild();
  }

  private publish(now: number) {
    const body = { ...this.my, lastSeen: 0 };
    const key = JSON.stringify(body);
    if (key === this.lastSent && now - this.lastBeat < this.o.heartbeatMs) return;
    this.lastSent = key;
    this.lastBeat = now;
    this.my.lastSeen = now;
    this.channel.setPresence({ ...this.my } as unknown as Record<string, unknown>);
  }

  private rebuild() {
    const me = this.channel.selfPeer();
    const out = this.my.out;
    const players: PlayerView[] = [...this.live.values()]
      .map((p) => {
        const st = p.presence.status;
        const requestedByMe = !!out && out.status === 'pending' && out.receiverPeer === p.peer;
        const challengesMe = p.presence.out?.status === 'pending' && p.presence.out.receiverPeer === me;
        const busyLabel = requestedByMe
          ? null
          : st === 'in_match'
            ? '대결 중'
            : st === 'pending' && !challengesMe
              ? '응답 대기 중'
              : null;
        const iAmBusy = !!this.match || (!!out && out.status === 'pending');
        return {
          peer: p.peer,
          userId: p.presence.userId,
          nickname: p.presence.nickname,
          status: st,
          busyLabel,
          requestedByMe,
          canChallenge: !busyLabel && !requestedByMe && !iAmBusy && this.conn === 'online',
        };
      })
      .sort((a, b) => a.nickname.localeCompare(b.nickname));
    this.snap = {
      connection: this.conn,
      backend: this.channel.kind,
      me: { peer: me, userId: this.my.userId, nickname: this.my.nickname, status: this.my.status },
      inLobby: this.inLobby,
      players,
      outgoing:
        out && out.status === 'pending'
          ? { ...out, secondsLeft: Math.max(0, Math.ceil((this.o.expireMs - (this.now() - out.createdAt)) / 1000)) }
          : null,
      incoming: this.incomingShown?.ch ?? null,
      match: this.match,
      notices: this.notices,
      pageViewers: this.peers.filter((p) => !p.self && p.peer !== me).length,
    };
    this.subs.forEach((f) => f());
  }
}
