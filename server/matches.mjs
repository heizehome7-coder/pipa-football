/**
 * Online penalty matches — the authoritative part of the PIPA realtime server.
 *
 * The lobby (presence, challenge, accept/reject) is unchanged and lives in
 * realtime-server.mjs. Once two players are matched, both send `match:join` with
 * the shared challenge id; from then on the server owns the match:
 *   room id, players, ready flags, start time, roles, round, score, shot count,
 *   results and the final winner.
 * A shot is ONE message (drawn path + power). The server replays it with the same
 * deterministic simulation the phones run (server/judge.gen.mjs) to decide
 * GOAL / SAVE / MISS, and sends the same result to both players at once.
 */

const ID_RE = /^[A-Za-z0-9]{4,40}$/;

/**
 * @param {{ send:(peer:string,msg:object)=>void, judge:any, now?:()=>number,
 *           setTimer?:(fn:()=>void,ms:number)=>any, clearTimer?:(h:any)=>void, random?:()=>number }} o
 */
export function createMatchManager(o) {
  const { send, judge } = o;
  const now = o.now ?? (() => Date.now());
  const setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = o.clearTimer ?? ((h) => clearTimeout(h));
  const random = o.random ?? Math.random;
  const log = o.log ?? (() => {});
  // o.rules: test-only overrides (slow CI browsers); production uses the shared defaults
  const R = { ...judge.MATCH_RULES, ...(o.rules || {}) };
  const totalRounds = R.shotsEach * 2;

  /** @type {Map<string, any>} */
  const matches = new Map();
  /** peer → matchId */
  const byPeer = new Map();

  // ── helpers ───────────────────────────────────────────────────────────
  const other = (m, peer) => m.players.find((p) => p.peer !== peer);
  const kickerOf = (m) => m.players[(m.firstKicker + m.round - 1) % 2];
  const keeperOf = (m) => m.players[(m.firstKicker + m.round) % 2];

  function wire(m) {
    const k = m.players.length === 2 && m.round > 0 ? kickerOf(m) : null;
    const g = m.players.length === 2 && m.round > 0 ? keeperOf(m) : null;
    return {
      id: m.id,
      roomId: m.roomId,
      phase: m.phase,
      players: m.players.map(({ peer, nickname, userId, ready, rematch, connected }) => ({ peer, nickname, userId, ready, rematch, connected })),
      round: m.round,
      totalRounds,
      kicker: k ? k.peer : null,
      keeper: g ? g.peer : null,
      score: Object.fromEntries(m.players.map((p) => [p.peer, p.score])),
      shots: Object.fromEntries(m.players.map((p) => [p.peer, p.shots])),
      history: m.history,
      startAt: m.startAt,
      aimDeadline: m.aimDeadline,
      shot: m.shot,
      // a dive picked while the kicker is still aiming stays secret until the shot is struck
      dive: m.phase === 'aim' ? null : m.dive,
      result: m.result,
      final: m.final,
      ended: m.ended,
      serverNow: now(),
    };
  }

  function emit(m, t, extra = {}) {
    const state = wire(m);
    for (const p of m.players) if (p.connected) send(p.peer, { t, state, ...extra });
  }

  function clearTimers(m) {
    for (const h of m.timers) clearTimer(h);
    m.timers = [];
  }
  function later(m, ms, fn) {
    const h = setTimer(() => {
      m.timers = m.timers.filter((x) => x !== h);
      if (matches.get(m.id) === m) fn();
    }, Math.max(0, ms));
    m.timers.push(h);
  }

  function destroy(m) {
    clearTimers(m);
    matches.delete(m.id);
    for (const p of m.players) if (byPeer.get(p.peer) === m.id) byPeer.delete(p.peer);
  }

  // ── flow ──────────────────────────────────────────────────────────────
  function startMatch(m) {
    for (const p of m.players) {
      p.score = 0;
      p.shots = 0;
      p.rematch = false;
    }
    m.history = [];
    m.final = null;
    m.result = null;
    m.shot = null;
    m.dive = null;
    m.round = 1;
    m.firstKicker = random() < 0.5 ? 0 : 1; // the server decides who kicks first
    m.phase = 'countdown';
    m.startAt = now() + R.countdownMs;
    emit(m, 'match:start');
    later(m, R.countdownMs, () => beginRound(m, 'match:state'));
  }

  function beginRound(m, event) {
    m.phase = 'aim';
    m.shot = null;
    m.dive = null;
    m.result = null;
    m.aimDeadline = now() + R.aimTimeoutMs;
    emit(m, event);
    const round = m.round;
    later(m, R.aimTimeoutMs, () => {
      if (m.phase === 'aim' && m.round === round) {
        log(`[${m.id}] round ${round}: no shot in time`);
        finishRound(m, 'MISS', '시간 초과 — 슛을 하지 않았어요');
      }
    });
  }

  function scheduleJudge(m) {
    if (m.judgeTimer) {
      clearTimer(m.judgeTimer);
      m.timers = m.timers.filter((x) => x !== m.judgeTimer);
    }
    // the dive is the only input left; once it is in we can judge right as the ball arrives
    const wait = m.dive ? 150 : 500;
    const at = m.shot.runStart + m.flightMs + wait;
    const round = m.round;
    m.judgeTimer = setTimer(() => {
      m.timers = m.timers.filter((x) => x !== m.judgeTimer);
      m.judgeTimer = null;
      if (matches.get(m.id) !== m || m.phase !== 'shot' || m.round !== round) return;
      const sim = judge.simulateRound(m.shot.seed, m.shot.input, m.dive);
      log(`[${m.id}] round ${round}: ${sim.outcome} (${sim.detail})${m.dive ? ` dive ${m.dive.dir}@${m.dive.at.toFixed(2)}` : ' no dive'}`);
      finishRound(m, sim.outcome, sim.detail);
    }, Math.max(0, at - now()));
    m.timers.push(m.judgeTimer);
  }

  function finishRound(m, outcome, detail) {
    const k = kickerOf(m);
    k.shots++;
    if (outcome === 'GOAL') k.score++;
    m.result = { round: m.round, kicker: k.peer, outcome, detail };
    m.history.push(m.result);
    m.phase = 'result';
    emit(m, 'round:result');
    later(m, R.resultShowMs, () => {
      if (m.round >= totalRounds) finishMatch(m);
      else {
        m.round++; // roles swap: kicker/keeper alternate every round
        beginRound(m, 'round:next');
      }
    });
  }

  function finishMatch(m) {
    const [a, b] = m.players;
    // R.suddenDeath (later): keep adding pairs of rounds while level
    m.final = a.score === b.score ? { winner: null, draw: true } : { winner: (a.score > b.score ? a : b).peer, draw: false };
    m.phase = 'finished';
    m.shot = null;
    m.dive = null;
    emit(m, 'match:finished');
  }

  function abandon(m, leaverPeer) {
    const p = m.players.find((x) => x.peer === leaverPeer);
    if (p) p.connected = false;
    byPeer.delete(leaverPeer);
    clearTimers(m);
    const rest = m.players.filter((x) => x.connected);
    if (!rest.length) {
      destroy(m);
      return;
    }
    if (m.phase !== 'aborted') {
      m.phase = 'aborted';
      m.ended = 'opponent_left';
      emit(m, 'match:opponentDisconnected');
    }
    // keep the record a little for late messages, then forget it
    later(m, 60_000, () => destroy(m));
  }

  // ── message handlers ──────────────────────────────────────────────────
  function join(peer, msg) {
    const id = msg.matchId;
    if (typeof id !== 'string' || !ID_RE.test(id) || typeof msg.opponentPeer !== 'string') return send(peer, { t: 'match:error', code: 'bad_request' });
    const nickname = String(msg.nickname || 'PLAYER').slice(0, 20);
    const userId = String(msg.userId || '').slice(0, 64);
    let m = matches.get(id);
    if (!m) {
      const prev = byPeer.get(peer);
      if (prev && prev !== id) {
        const pm = matches.get(prev);
        if (pm) abandon(pm, peer);
      }
      m = {
        id,
        roomId: `pipa_match_${id.toLowerCase()}`,
        players: [{ peer, nickname, userId, ready: false, rematch: false, connected: true, score: 0, shots: 0 }],
        expect: msg.opponentPeer,
        phase: 'waiting',
        round: 0,
        firstKicker: 0,
        history: [],
        startAt: 0,
        aimDeadline: 0,
        shot: null,
        dive: null,
        result: null,
        final: null,
        ended: null,
        flightMs: 0,
        judgeTimer: null,
        timers: [],
        createdAt: now(),
      };
      matches.set(id, m);
      byPeer.set(peer, id);
      // the opponent never shows up → give up
      later(m, 60_000, () => {
        if (m.players.length < 2) {
          send(peer, { t: 'match:opponentDisconnected', state: { ...wire(m), phase: 'aborted', ended: 'opponent_left' } });
          destroy(m);
        }
      });
      emit(m, 'match:state');
      return;
    }
    if (m.players.some((p) => p.peer === peer)) return send(peer, { t: 'match:state', state: wire(m) });
    const first = m.players[0];
    // only the two people who agreed to this match can be in it
    if (m.players.length !== 1 || m.phase !== 'waiting' || peer !== m.expect || msg.opponentPeer !== first.peer) {
      return send(peer, { t: 'match:error', code: 'not_allowed' });
    }
    m.players.push({ peer, nickname, userId, ready: false, rematch: false, connected: true, score: 0, shots: 0 });
    byPeer.set(peer, id);
    emit(m, 'match:state');
  }

  function mine(peer, msg) {
    const id = byPeer.get(peer);
    if (!id || id !== msg.matchId) return null;
    const m = matches.get(id);
    return m && m.players.length === 2 ? m : null;
  }

  function handle(peer, msg) {
    if (!msg || typeof msg.t !== 'string') return false;
    const t = msg.t;
    if (t === 'time:ping') {
      send(peer, { t: 'time:pong', c: msg.c, s: now() });
      return true;
    }
    if (t === 'match:join') {
      join(peer, msg);
      return true;
    }
    if (!t.startsWith('match:') && !t.startsWith('shot:') && !t.startsWith('keeper:')) return false;
    if (t === 'match:leave') {
      const id = byPeer.get(peer);
      const m = id && matches.get(id);
      if (m && id === msg.matchId) abandon(m, peer);
      return true;
    }
    const m = mine(peer, msg);
    if (!m) {
      send(peer, { t: 'match:error', code: 'no_match' });
      return true;
    }
    const me = m.players.find((p) => p.peer === peer);

    if (t === 'match:ready') {
      if (m.phase !== 'waiting') return true;
      me.ready = !!msg.ready;
      // the server starts the match — never one client on its own
      if (m.players.every((p) => p.ready)) startMatch(m);
      else emit(m, 'match:state');
      return true;
    }

    if (t === 'match:rematch') {
      if (m.phase !== 'finished') return true;
      me.rematch = true;
      if (m.players.every((p) => p.rematch && p.connected)) startMatch(m);
      else emit(m, 'match:state');
      return true;
    }

    if (t === 'shot:submit') {
      if (m.phase !== 'aim' || msg.round !== m.round || kickerOf(m).peer !== peer) {
        log(`[${m.id}] shot ignored (phase ${m.phase}, round ${msg.round}/${m.round})`);
        return true;
      }
      if (!judge.validShot(msg.shot)) return send(peer, { t: 'match:error', code: 'bad_shot' }), true;
      const seed = judge.roundSeed(m.id, m.round);
      let sim;
      try {
        sim = judge.simulateRound(seed, msg.shot, null);
      } catch {
        send(peer, { t: 'match:error', code: 'bad_shot' });
        return true;
      }
      const input = { points: msg.shot.points, power: msg.shot.power };
      m.shot = { round: m.round, input, runStart: now() + R.shotLeadMs, seed };
      m.flightMs = Math.round(sim.decidedAt * 1000);
      m.phase = 'shot';
      emit(m, 'shot:start');
      scheduleJudge(m);
      return true;
    }

    if (t === 'keeper:dive') {
      if (msg.round !== m.round || keeperOf(m).peer !== peer || m.dive) return true;
      if (!judge.isDiveDir(msg.dir)) return true;
      if (m.phase === 'aim') {
        // chosen before the strike: committed now, executed at foot-ball contact
        m.dive = { round: m.round, dir: msg.dir, at: -1 };
        send(peer, { t: 'match:state', state: { ...wire(m), dive: m.dive } });
        return true;
      }
      if (m.phase !== 'shot') return true;
      const sinceRun = (now() - m.shot.runStart) / 1000;
      let at = typeof msg.at === 'number' && Number.isFinite(msg.at) ? msg.at : sinceRun;
      // arrived long after the ball was decided → ignored
      if (sinceRun > m.flightMs / 1000 + 0.6) return true;
      // no back-dating beyond normal network delay (0.5 s), no future timestamps
      at = Math.min(Math.max(at, sinceRun - 0.5), sinceRun + 0.05);
      m.dive = { round: m.round, dir: msg.dir, at: Math.max(-1, at) };
      emit(m, 'keeper:dive');
      scheduleJudge(m);
      return true;
    }
    return true;
  }

  function disconnect(peer) {
    const id = byPeer.get(peer);
    const m = id && matches.get(id);
    if (m) abandon(m, peer);
  }

  return { handle, disconnect, matches, byPeer, totalRounds };
}
