/**
 * Online matches (PENALTY SHOOTOUT, UPDATE 6: FREE KICK DUEL) — the authoritative
 * part of the PIPA realtime server.
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
const PLAYER_ID_RE = /^[a-z]{2,20}$/;

/** UPDATE 4: a player's squad as ids only (clients share the same player database) */
function cleanSquad(s) {
  if (!s || typeof s !== 'object') return null;
  const order = Array.isArray(s.penaltyOrder) ? s.penaltyOrder.filter((x) => typeof x === 'string' && PLAYER_ID_RE.test(x)).slice(0, 5) : [];
  const gk = typeof s.goalkeeperId === 'string' && PLAYER_ID_RE.test(s.goalkeeperId) ? s.goalkeeperId : '';
  // UPDATE 6: the FREE KICK DUEL taker
  const fk = typeof s.freeKickTakerId === 'string' && PLAYER_ID_RE.test(s.freeKickTakerId) ? s.freeKickTakerId : order[0] ?? '';
  return { penaltyOrder: order, goalkeeperId: gk, freeKickTakerId: fk };
}
const MODES = ['penalty', 'freekick'];

/**
 * @param {{ send:(peer:string,msg:object)=>void, judge:any, now?:()=>number,
 *           setTimer?:(fn:()=>void,ms:number)=>any, clearTimer?:(h:any)=>void, random?:()=>number,
 *           checkSquad?:(peer:string, squad:any)=>any,
 *           reward?:(m:{id:string, game:number, mode:string}, winnerPeer:string)=>number }} o
 * checkSquad (UPDATE 6): returns the squad the peer may really use (owned players only)
 * reward (UPDATE 6): pays the winner of a finished match; returns the MP paid (0 = none).
 *   Called exactly once per finished game (match id + game number).
 * record (UPDATE 6 patch): online record for each player of a finished game
 *   (result 'win' | 'loss' | 'draw') — exactly once per game (resultRecorded).
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
      mode: m.mode,
      roomId: m.roomId,
      phase: m.phase,
      players: m.players.map(({ peer, nickname, userId, ready, rematch, connected, squad }) => ({ peer, nickname, userId, ready, rematch, connected, squad })),
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
      keeperX: m.keeperX ?? 0,
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
    m.keeperX = 0;
    m.round = 1;
    m.game = (m.game || 0) + 1; // rematches are new games of the same match (reward key)
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
    // UPDATE 8: every round starts with the keeper in the middle of his line
    m.keeperX = 0;
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
      const sim = judge.simulateRound(m.shot.seed, m.shot.input, m.dive, keeperOf(m).squad?.goalkeeperId ?? null, roundOpts(m));
      log(`[${m.id}] round ${round}: ${sim.outcome} (${sim.detail})${m.dive ? ` dive ${m.dive.dir}@${m.dive.at.toFixed(2)}` : ' no dive'}`);
      finishRound(m, sim.outcome, sim.detail);
    }, Math.max(0, at - now()));
    m.timers.push(m.judgeTimer);
  }

  /** which of the kicker's players takes this kick (penalty order / free-kick taker) */
  function takerOf(m, k) {
    const sq = k.squad;
    if (!sq || !sq.penaltyOrder?.length) return null;
    if (m.mode === 'freekick') return sq.freeKickTakerId || sq.penaltyOrder[0];
    return sq.penaltyOrder[k.shots % sq.penaltyOrder.length];
  }

  function finishRound(m, outcome, detail) {
    const k = kickerOf(m);
    // UPDATE 6 patch: the scorer's player id (both phones show the same goal card)
    const playerId = takerOf(m, k);
    k.shots++;
    if (outcome === 'GOAL') k.score++;
    m.result = { round: m.round, kicker: k.peer, outcome, detail, playerId };
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

  function roundOpts(m) {
    const kp = keeperOf(m);
    // UPDATE 10: the keeper's evolution level comes from the server's own copy of his squad
    const keeperEvo = kp?.squad?.goalkeeperId ? kp.squad.evo?.[kp.squad.goalkeeperId] ?? 0 : 0;
    return { mode: m.mode, spot: m.mode === 'freekick' ? judge.freeKickSpotIndex(m.id, m.round) : 0, keeperX: m.shot?.keeperX ?? judge.clampKeeperX(m.keeperX ?? 0), keeperEvo };
  }

  function finishMatch(m) {
    const [a, b] = m.players;
    // R.suddenDeath (later): keep adding pairs of rounds while level
    m.final = a.score === b.score ? { winner: null, draw: true, reward: 0 } : { winner: (a.score > b.score ? a : b).peer, draw: false, reward: 0 };
    // UPDATE 6: the server pays the winner of a properly finished game — once per game
    const key = `${m.id}#${m.game}`;
    // UPDATE 6 patch: online records (win / loss / draw) for both players — once per game
    if (o.record && !m.recorded.has(key)) {
      m.recorded.add(key);
      for (const p of m.players) {
        const result = m.final.draw ? 'draw' : m.final.winner === p.peer ? 'win' : 'loss';
        try {
          // UPDATE 10: goals / kicks for the weekly missions
          o.record({ id: m.id, game: m.game, mode: m.mode }, p.peer, result, { goals: p.score, shots: p.shots });
        } catch (e) {
          log(`[${m.id}] record failed: ${e.message}`);
        }
      }
    }
    if (m.final.winner && o.reward && !m.rewarded.has(key)) {
      m.rewarded.add(key);
      try {
        m.final.reward = o.reward({ id: m.id, game: m.game, mode: m.mode }, m.final.winner) || 0;
      } catch (e) {
        log(`[${m.id}] reward failed: ${e.message}`);
      }
    }
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
    let squad = cleanSquad(msg.squad);
    if (squad && o.checkSquad) squad = o.checkSquad(peer, squad);
    const mode = MODES.includes(msg.mode) ? msg.mode : 'penalty';
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
        mode,
        game: 0,
        rewarded: new Set(),
        recorded: new Set(),
        players: [{ peer, nickname, userId, squad, ready: false, rematch: false, connected: true, score: 0, shots: 0 }],
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
    m.players.push({ peer, nickname, userId, squad, ready: false, rematch: false, connected: true, score: 0, shots: 0 });
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
    if (!t.startsWith('match:') && !t.startsWith('shot:') && !t.startsWith('keeper:') && t !== 'emote') return false;
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
      // UPDATE 9: checked against the player who really takes this kick (his abilities + special)
      const kk = kickerOf(m);
      const takerId = judge.roundTaker(kk.squad ?? null, m.mode, kk.shots);
      const takerEvo = kk.squad?.evo?.[takerId] ?? 0; // UPDATE 10: evolution (server data)
      if (!judge.validShotFor(msg.shot, takerId, m.mode, takerEvo)) {
        log(`[${m.id}] shot rejected for ${takerId} (outside his shot profile)`);
        return send(peer, { t: 'match:error', code: 'bad_shot' }), true;
      }
      const seed = judge.roundSeed(m.id, m.round);
      let sim;
      try {
        sim = judge.simulateRound(seed, msg.shot, null, keeperOf(m).squad?.goalkeeperId ?? null, roundOpts(m));
      } catch {
        send(peer, { t: 'match:error', code: 'bad_shot' });
        return true;
      }
      const input = { v: msg.shot.v.slice(0, 3), spin: msg.shot.spin, power: msg.shot.power };
      if (msg.shot.knuckle > 0) {
        input.knuckle = msg.shot.knuckle;
        input.kseed = msg.shot.kseed >>> 0;
      }
      // UPDATE 8: the keeper's line position is fixed the moment the shot is struck
      const x0 = judge.clampKeeperX(m.keeperX ?? 0);
      m.shot = { round: m.round, input, runStart: now() + R.shotLeadMs, seed, keeperX: x0, x0 };
      m.flightMs = Math.round(sim.decidedAt * 1000);
      m.phase = 'shot';
      // UPDATE 9.5: the keeper may still shuffle (limited range) during the run-up; his spot is
      // locked a moment before foot–ball contact and both phones are told the final spot
      const lockAt = m.shot.runStart + Math.round(sim.contact * 1000) - judge.KEEPER_LINE.lockLeadMs;
      m.shot.lockAt = lockAt;
      const round = m.round;
      const lockTimer = setTimer(() => {
        m.timers = m.timers.filter((x) => x !== lockTimer);
        if (matches.get(m.id) !== m || m.phase !== 'shot' || m.round !== round || !m.shot || m.shot.locked) return;
        m.shot.locked = true;
        for (const p of m.players) if (p.connected) send(p.peer, { t: 'keeper:lock', matchId: m.id, round, x: m.shot.keeperX });
      }, Math.max(0, lockAt - now()));
      m.timers.push(lockTimer);
      emit(m, 'shot:start');
      scheduleJudge(m);
      return true;
    }

    // UPDATE 8: keeper joystick — along the goal line only, clamped here, ~12 Hz, aim phase only
    if (t === 'keeper:move') {
      if (msg.round !== m.round || keeperOf(m).peer !== peer) return true;
      const t0 = now();
      // UPDATE 9.5: during the run-up (until the lock) — a smaller range, walking speed only
      if (m.phase === 'shot' && m.shot && !m.shot.locked && t0 < (m.shot.lockAt ?? 0)) {
        if (m.lastMoveAt && t0 - m.lastMoveAt < 40) return true;
        const dt = Math.min(0.5, (t0 - (m.lastMoveAt || t0 - 80)) / 1000);
        m.lastMoveAt = t0;
        const want = judge.clampRunUpX(msg.x, m.shot.x0 ?? m.shot.keeperX);
        const step = judge.KEEPER_LINE.maxSpeed * 1.4 * dt + 0.06; // no teleporting
        const cur = m.shot.keeperX;
        m.shot.keeperX = Math.max(cur - step, Math.min(cur + step, want));
        const k = kickerOf(m);
        if (k.connected) send(k.peer, { t: 'keeper:move', matchId: m.id, round: m.round, x: m.shot.keeperX });
        return true;
      }
      if (m.phase !== 'aim') return true;
      if (m.lastMoveAt && t0 - m.lastMoveAt < 40) return true; // flood guard (25/s max)
      m.lastMoveAt = t0;
      m.keeperX = judge.clampKeeperX(msg.x);
      const k = kickerOf(m);
      if (k.connected) send(k.peer, { t: 'keeper:move', matchId: m.id, round: m.round, x: m.keeperX });
      return true;
    }

    // UPDATE 10: emotes — one of the 9, at most one every 3 s per player, shown on both phones
    if (t === 'emote') {
      if (!judge.EMOTES?.includes(msg.e) || !me) return true;
      const t0 = now();
      if (me.lastEmoteAt && t0 - me.lastEmoteAt < 3000) return true;
      me.lastEmoteAt = t0;
      for (const p of m.players) if (p.connected) send(p.peer, { t: 'emote', matchId: m.id, from: peer, e: msg.e, at: t0 });
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
