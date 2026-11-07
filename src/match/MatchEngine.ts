import * as THREE from 'three';
import { clamp, gauss, mulberry32 } from '../game/core/math';
import { Goalkeeper } from '../game/entities/Goalkeeper';
import { calculateShotParameters, curveLimits } from '../game/physics/BallPhysics';
import { GoalFrame } from '../game/world/Goal';
import { isChipOnly, shotModifiers } from '../players/abilities';
import { keeperLookOf } from '../players/looks';
import { statOvr, type PlayerDef, type SkillMoveId } from '../players/players';
import { keeperScaleOf } from '../online/match/penaltyRound';
import { CLOCK, MATCH_MODE, MOVE, PITCH, type ShootMode, type ShotType } from './config';
import { FORMATION_433H, slotFit, type SlotId } from './formation';
import { MatchBall, passSpeed } from './MatchBall';
import { evoKeeperBoost } from '../progress/evolution';
import { MatchPlayer, type TeamId } from './MatchPlayer';

/**
 * UPDATE 11 — THE MATCH. UPDATE 11 patch: 11 vs 11 (4-3-3 HOLDING), the user team always kicks
 * off first and the clock only starts with that first pass (MATCH START), the SHOOT button
 * changes with the situation (슈팅 · 걷어내기 in the own half · 태클 when they have the ball ·
 * 헤딩 when the ball is at his head), crosses (PASS swipe →), sliding tackles, headers and a
 * signature skill move per player (질주/개인기 double tap).
 * Renderer-agnostic rules: clock (3 real minutes = 90'), halves + 5 s halftime, kick-offs,
 * possession, dribbling, passes, through balls, five shot types, keepers (PIPA's
 * Goalkeeper: real dives, saves decided by the hands / body colliders), goals, the ball
 * going out, substitutions (max 3) and a simple AI for both teams.
 * The view (MatchView) only draws `root` and reads the state.
 */

export type MatchPhase = 'kickoff' | 'play' | 'goal' | 'restart' | 'halftime' | 'fulltime';
export type Action = { kind: 'pass' } | { kind: 'through' } | { kind: 'cross' } | { kind: 'shot'; type: ShotType } | { kind: 'skill' } | { kind: 'switch' };

export interface MatchInput {
  /** world-space movement wish (x along the pitch, z across), length 0 … 1 */
  move: { x: number; z: number };
  sprint: boolean;
  actions: Action[];
}

export interface TeamSetup {
  name: string;
  /** the 10 field starters in FORMATION_433H order (LB, LCB, RCB, RB, CDM, LCM, RCM, LW, ST, RW) */
  field: { def: PlayerDef; evo: number }[];
  keeper: { def: PlayerDef; evo: number };
  bench: { def: PlayerDef; evo: number }[];
}

export interface GoalEvent {
  team: TeamId;
  scorer: PlayerDef;
  evo: number;
  minute: number;
  ownGoal: boolean;
}

export interface MatchEvents {
  onGoal?(e: GoalEvent): void;
  onPhase?(p: MatchPhase): void;
  onShot?(team: TeamId, type: ShotType, by: PlayerDef): void;
  onSave?(team: TeamId, keeper: PlayerDef): void;
  onOut?(kind: 'throw' | 'goalkick'): void;
  onSub?(team: TeamId, out: PlayerDef, inn: PlayerDef): void;
  onSkill?(by: PlayerDef, move: SkillMoveId): void;
  /** UPDATE 11 patch */
  onStart?(): void;
  onTackle?(by: PlayerDef, won: boolean): void;
  onCross?(by: PlayerDef): void;
  onClear?(by: PlayerDef): void;
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const tmp3 = new THREE.Vector3();

/** one end of the pitch: the goal frame + its keeper live in the goal's own frame
 *  (goal line z = 0, the pitch towards +z) — exactly PIPA's penalty frame */
export class GoalEnd {
  readonly group = new THREE.Group();
  readonly frame: GoalFrame;
  /** world x of the goal line and the direction into the pitch (+1 / −1) */
  constructor(readonly gx: number, visuals: boolean) {
    this.frame = new GoalFrame(visuals);
    this.group.add(this.frame.group);
    this.group.position.set(gx, 0, 0);
    this.group.rotation.y = gx > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.group.updateMatrixWorld(true);
  }
  get inward() {
    return this.gx > 0 ? -1 : 1;
  }
  toLocal(p: THREE.Vector3, out: THREE.Vector3) {
    const s = this.inward;
    return out.set(-s * p.z, p.y, (p.x - this.gx) * s);
  }
  dirToLocal(v: THREE.Vector3, out: THREE.Vector3) {
    const s = this.inward;
    return out.set(-s * v.z, v.y, v.x * s);
  }
  dirToWorld(v: THREE.Vector3 | [number, number, number], out: THREE.Vector3) {
    const [x, y, z] = Array.isArray(v) ? v : [v.x, v.y, v.z];
    const s = this.inward;
    return out.set(z * s, y, -s * x);
  }
}

export class MatchKeeper {
  gk: Goalkeeper;
  def: PlayerDef;
  evo: number;
  end: GoalEnd;
  holding = false;
  holdT = 0;
  tracking = false;
  idleT = 0;
  cooldown = 0;
  /** his read of the shot coming in */
  plan: { x: number; y: number; t: number; react: number; since: number; done: boolean } | null = null;
  readonly team: TeamId;
  constructor(def: PlayerDef, evo: number, team: TeamId, end: GoalEnd) {
    this.def = def;
    this.evo = evo;
    this.team = team;
    this.end = end;
    this.gk = MatchKeeper.make(def, evo);
    this.gk.home.z = 0.7;
    end.group.add(this.gk.body.root);
    this.gk.reset();
  }
  static make(def: PlayerDef, evo: number) {
    return new Goalkeeper(keeperLookOf(def), def.gk, def.special, keeperScaleOf(def), evo);
  }
  moveTo(end: GoalEnd) {
    this.end.group.remove(this.gk.body.root);
    this.end = end;
    end.group.add(this.gk.body.root);
    this.gk.reset();
    this.holding = false;
    this.tracking = false;
    this.plan = null;
  }
  replace(def: PlayerDef, evo: number) {
    this.end.group.remove(this.gk.body.root);
    this.def = def;
    this.evo = evo;
    this.gk = MatchKeeper.make(def, evo);
    this.gk.home.z = 0.7;
    this.end.group.add(this.gk.body.root);
    this.gk.reset();
    this.holding = false;
    this.tracking = false;
  }
  /** feet position in world */
  feet(out: THREE.Vector3) {
    return this.end.dirToWorld([this.gk.lineX, 0, this.gk.home.z], out).add(tmp3.set(this.end.gx, 0, 0));
  }
}

interface Team {
  id: TeamId;
  name: string;
  players: MatchPlayer[];
  keeper: MatchKeeper;
  bench: { def: PlayerDef; evo: number }[];
  subsUsed: number;
  /** +1 attacks the +x goal, −1 the −x goal */
  dir: 1 | -1;
}

type Owner = MatchPlayer | MatchKeeper | null;

export class MatchEngine {
  readonly root = new THREE.Group();
  readonly ball = new MatchBall();
  readonly ends: [GoalEnd, GoalEnd];
  readonly home: Team;
  readonly away: Team;
  phase: MatchPhase = 'kickoff';
  phaseT = 0;
  /** game clock (game seconds 0 … 5400) */
  gameSec = 0;
  half: 1 | 2 = 1;
  score = { home: 0, away: 0 };
  owner: Owner = null;
  lastTouch: TeamId = 'home';
  controlled: MatchPlayer;
  /** the player a pass / through ball is meant for */
  receiver: MatchPlayer | null = null;
  runTo = new THREE.Vector3();
  kickoffTeam: TeamId = 'home';
  firstKickoff: TeamId = 'home';
  paused = false;
  goals: GoalEvent[] = [];
  shots = { home: 0, away: 0 };
  saves = { home: 0, away: 0 };
  lastShot: { team: TeamId; type: ShotType; by: PlayerDef; at: number } | null = null;
  lastGoal: GoalEvent | null = null;
  /** a pending restart */
  private restart: { team: TeamId; kind: 'throw' | 'goalkick'; x: number; z: number } | null = null;
  private rng: () => number;
  private aiT = 0;
  private switchT = 0;
  private tackleT = 0;
  private pressHelp = 0;
  private lastShooter: { p: MatchPlayer; team: TeamId } | null = null;
  private aiSubDone = false;
  /** test hook: the user team is played by the AI too */
  autopilot = false;
  events: MatchEvents = {};

  constructor(home: TeamSetup, away: TeamSetup, opts: { seed?: number; visuals?: boolean } = {}) {
    this.rng = mulberry32(opts.seed ?? (Date.now() & 0x7fffffff));
    const visuals = opts.visuals !== false;
    this.ends = [new GoalEnd(-PITCH.HALF_L, visuals), new GoalEnd(PITCH.HALF_L, visuals)];
    for (const e of this.ends) this.root.add(e.group);
    const mk = (id: TeamId, s: TeamSetup, dir: 1 | -1): Team => {
      const ownEnd = dir === 1 ? this.ends[0] : this.ends[1];
      const t: Team = {
        id,
        name: s.name,
        players: s.field.slice(0, 10).map((f, i) => new MatchPlayer(f.def, id, i + 1, f.evo)),
        keeper: new MatchKeeper(s.keeper.def, s.keeper.evo, id, ownEnd),
        bench: s.bench.slice(),
        subsUsed: 0,
        dir,
      };
      for (const p of t.players) this.root.add(p.body.root);
      return t;
    };
    this.home = mk('home', home, 1);
    this.away = mk('away', away, -1);
    this.controlled = this.stOf(this.home);
    // UPDATE 11 patch: the first kick-off is always the user's team
    this.setupKickoff('home');
  }

  // ── helpers ──────────────────────────────────────────────────────────
  team(id: TeamId) {
    return id === 'home' ? this.home : this.away;
  }
  other(id: TeamId) {
    return id === 'home' ? this.away : this.home;
  }
  /** the goal a team attacks */
  attackEnd(t: Team) {
    return t.dir === 1 ? this.ends[1] : this.ends[0];
  }
  ownEnd(t: Team) {
    return t.dir === 1 ? this.ends[0] : this.ends[1];
  }
  get minute() {
    return Math.floor(this.gameSec / 60);
  }
  /** "67:30" */
  get clockText() {
    const s = Math.floor(this.gameSec);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  ownerTeam(): TeamId | null {
    return this.owner ? this.owner.team : null;
  }
  allPlayers() {
    return [...this.home.players, ...this.away.players];
  }
  private setPhase(p: MatchPhase) {
    this.phase = p;
    this.phaseT = 0;
    this.events.onPhase?.(p);
  }

  /** the striker (formation ST) — takes the kick-off */
  stOf(t: Team) {
    return t.players.find((p) => p.formation.id === 'ST') ?? t.players[t.players.length - 1];
  }
  /** kick-off: everyone in his own half in formation, the ST on the spot with the ball, a CM
   *  beside him; the clock waits for the first pass */
  setupKickoff(team: TeamId) {
    this.kickoffTeam = team;
    this.ball.place(0, 0);
    this.owner = null;
    this.receiver = null;
    for (const t of [this.home, this.away]) {
      for (const p of t.players) {
        const f = p.formation;
        const ownX = -t.dir * PITCH.HALF_L;
        let x = ownX + t.dir * Math.min(0.94, f.x * 0.78) * PITCH.HALF_L;
        let z = f.z * PITCH.HALF_W * 0.7;
        if (t.id !== team) x = -t.dir * Math.max(PITCH.CIRCLE_R + 0.8, Math.abs(x)); // outside the circle
        p.pos.set(x, 0, z);
        p.vel.set(0, 0, 0);
        p.want.set(0, 0, 0);
        p.yaw = t.dir === 1 ? -Math.PI / 2 : Math.PI / 2;
        p.calm();
        p.cooldown = 0;
        p.slideT = -1;
        p.jumpT = -1;
        p.skillAnim = null;
      }
      t.keeper.gk.home.set(0, 0, 0.7);
      t.keeper.gk.reset();
      t.keeper.holding = false;
      t.keeper.tracking = false;
      t.keeper.plan = null;
    }
    const kt = this.team(team);
    const st = this.stOf(kt);
    st.pos.set(-kt.dir * 0.45, 0, 0);
    const cm = kt.players.find((p) => p.formation.id === 'LCM') ?? kt.players[0];
    cm.pos.set(-kt.dir * 3.5, 0, -2.5);
    this.ball.place(0, 0);
    this.owner = st;
    this.lastTouch = team;
    st.touchT = 99;
    if (team === 'home' && !this.autopilot) this.controlled = st;
    this.setPhase('kickoff');
  }

  // ── main step ────────────────────────────────────────────────────────
  step(dt: number, input: MatchInput) {
    if (this.paused || this.phase === 'fulltime') {
      this.animate(dt * (this.paused ? 0 : 1));
      return;
    }
    dt = Math.min(dt, 0.05);
    this.phaseT += dt;
    // the clock (never during halftime / full time / a substitution / before the kick-off pass)
    if (this.phase !== 'halftime' && this.phase !== 'kickoff') {
      this.gameSec = Math.min(CLOCK.gameMinutes * 60, this.gameSec + dt * CLOCK.rate);
      if (this.half === 1 && this.gameSec >= 45 * 60 && this.phase !== 'goal') {
        this.gameSec = 45 * 60;
        this.startHalftime();
        return;
      }
      if (this.half === 2 && this.gameSec >= CLOCK.gameMinutes * 60 && this.phase !== 'goal') {
        this.endMatch();
        return;
      }
    }
    for (const p of this.allPlayers()) {
      p.cooldown = Math.max(0, p.cooldown - dt);
      p.skillT = Math.max(0, p.skillT - dt);
      p.frozen = Math.max(0, p.frozen - dt);
    }
    this.tackleT = Math.max(0, this.tackleT - dt);
    this.pressHelp = Math.max(0, this.pressHelp - dt);

    switch (this.phase) {
      case 'kickoff': {
        // nobody moves until the kick-off pass; the ball stays on the centre spot
        this.holdPositions(dt, 0);
        const t = this.team(this.kickoffTeam);
        const k = this.stOf(t);
        this.owner = k;
        this.ball.place(0, 0);
        const userKicks = t.id === 'home' && !this.autopilot;
        if (userKicks) {
          this.controlled = k;
          for (const a of input.actions) if (a.kind === 'pass' || a.kind === 'through' || a.kind === 'cross') this.kickoffPass(k, a.kind === 'through', input);
        } else if (this.phaseT > 1.0) this.kickoffPass(k, false, input);
        break;
      }
      case 'halftime':
        this.holdPositions(dt, 0.35);
        if (this.phaseT >= CLOCK.halfTimeRealSeconds) this.startSecondHalf();
        break;
      case 'goal':
        this.celebrate(dt);
        if (this.phaseT >= CLOCK.goalPause) {
          if (this.half === 1 && this.gameSec >= 45 * 60) this.startHalftime();
          else if (this.half === 2 && this.gameSec >= CLOCK.gameMinutes * 60) this.endMatch();
          else this.setupKickoff(this.lastGoal?.team === 'home' ? 'away' : 'home');
        }
        break;
      case 'restart':
        this.holdPositions(dt, 0.9);
        if (this.phaseT > 0.9 && this.restart) this.doRestart();
        break;
      case 'play':
        this.play(dt, input);
        break;
    }
    this.updateKeepers(dt);
    this.ballStep(dt);
    this.animate(dt);
    this.maybeAiSub();
  }

  /** the kick-off pass starts play (and, the very first time, the clock: MATCH START) */
  private firstPassDone = false;
  private kickoffPass(k: MatchPlayer, through: boolean, input: MatchInput) {
    const t = this.team(k.team);
    const d = new THREE.Vector3(input.move.x, 0, input.move.z);
    const dir = d.lengthSq() > 0.05 ? d.normalize() : new THREE.Vector3(-t.dir * 0.6, 0, -0.8).normalize();
    // the first pass goes backwards / sideways to a team-mate
    const mate = this.pickReceiver(k, dir, through) ?? t.players.find((p) => p !== k)!;
    this.phase = 'play';
    this.phaseT = 0;
    this.owner = k;
    k.touchT = 0.3;
    this.pass(k, dir, through, mate);
    this.events.onPhase?.('play');
    if (!this.firstPassDone) {
      this.firstPassDone = true;
      this.events.onStart?.();
    }
  }
  get started() {
    return this.firstPassDone;
  }

  private play(dt: number, input: MatchInput) {
    // user actions
    if (!this.autopilot) for (const a of input.actions) this.userAction(a, input);
    this.autoSwitch(dt);
    // movement
    this.aiT -= dt;
    const decide = this.aiT <= 0;
    if (decide) this.aiT = 0.16;
    for (const t of [this.home, this.away]) {
      for (const p of t.players) {
        p.tackleCd = Math.max(0, p.tackleCd - dt);
        p.boostT = Math.max(0, p.boostT - dt);
        if (p.sliding) {
          // a sliding tackle: the body slides on, then gets up (no steering)
          const k = p.slideT;
          const fwd = p.dir(tmp3);
          const v = k < 0.12 ? 7.4 : k < 0.7 ? Math.max(0, 7.4 * (1 - (k - 0.12) / 0.58)) : 0;
          p.vel.set(fwd.x * v, 0, fwd.z * v);
          p.pos.x += p.vel.x * dt;
          p.pos.z += p.vel.z * dt;
          this.slideContact(p);
          continue;
        }
        const idle = input.move.x === 0 && input.move.z === 0;
        // a pass on its way to MY player: he meets it by himself unless I steer him
        if (p === this.controlled && !this.autopilot && !(idle && this.receiver === p)) {
          const sp = this.maxSpeed(p, input.sprint);
          p.want.set(input.move.x * sp, 0, input.move.z * sp);
          p.sprinting = input.sprint;
          if (this.owner === p && idle) p.want.set(0, 0, 0);
        } else this.ai(p, t, dt, decide);
        p.move(dt, this.maxSpeed(p, p.sprinting) * (p.frozen > 0 ? 0.45 : 1));
        // stay on the pitch (a little run-off)
        p.pos.x = clamp(p.pos.x, -PITCH.HALF_L - 1, PITCH.HALF_L + 1);
        p.pos.z = clamp(p.pos.z, -PITCH.HALF_W - 1, PITCH.HALF_W + 1);
      }
    }
    this.separate();
    this.possession(dt);
    this.aiHeaders();
  }

  /** run / sprint speed with his PACE, a little slower with the ball, a short burst after a skill */
  maxSpeed(p: MatchPlayer, sprint: boolean) {
    return (sprint ? MOVE.sprint : MOVE.run) * p.pace * (1 + p.evo * 0.002) * (this.owner === p ? MOVE.dribbleMul : 1) * (p.boostT > 0 ? 1.22 : 1);
  }

  /** players don't stand inside each other */
  private separate() {
    const ps = this.allPlayers();
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i].pos;
        const b = ps[j].pos;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.7 && d > 1e-4) {
          const push = (0.7 - d) / 2;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          b.x += (dx / d) * push;
          b.z += (dz / d) * push;
        }
      }
  }

  // ── possession + dribbling ───────────────────────────────────────────
  private giveBall(p: MatchPlayer) {
    const prev = this.owner;
    this.owner = p;
    this.lastTouch = p.team;
    this.receiver = null;
    p.touchT = 0.05;
    if (p.team === 'home' && !this.autopilot) this.controlled = p;
    else if (prev && prev.team === 'home' && p.team === 'away') this.controlled = this.nearestTo(this.home, this.ball.pos) ?? this.controlled;
  }

  private possession(dt: number) {
    const b = this.ball;
    const low = b.pos.y < 0.85;
    const o = this.owner;
    if (o instanceof MatchPlayer) {
      const foot = o.footPoint(tmp, 0.42 + o.speed * 0.035);
      const d = Math.hypot(b.pos.x - o.pos.x, b.pos.z - o.pos.z);
      if (d > MOVE.control + 0.4) {
        this.owner = null;
      } else {
        // a challenge: an opponent at the ball
        for (const q of this.other(o.team).players) {
          if (q.cooldown > 0 || q.sliding) continue;
          const dq = Math.hypot(b.pos.x - q.pos.x, b.pos.z - q.pos.z);
          const reach = MOVE.pickup;
          if (dq < reach && low) {
            const tight = Math.hypot(b.pos.x - foot.x, b.pos.z - foot.z) < 0.32;
            // a standing challenge: his TACKLE / STRENGTH against the dribbler's (out of position: weaker)
            const dq2 = q.def.def;
            const tk = dq2 ? (dq2.tackle + dq2.strength) / 2 : 60;
            const od = o.def.def ? o.def.def.strength : 60;
            const p = tight ? 2.4 * dt * (0.55 + tk / 110 - od / 400) * (q.offPos ? 0.7 : 1) * (1 + (q.evo - o.evo) * 0.03) : 1;
            if (this.rng() < p) {
              o.cooldown = MOVE.regainCooldown;
              this.giveBall(q);
              this.ball.vel.multiplyScalar(0.3);
              return;
            }
          }
        }
        this.dribble(o, dt, foot);
      }
      return;
    }
    if (o instanceof MatchKeeper) return;
    // loose ball: the nearest player at it takes it
    if (!low || b.speed > 17) return;
    let best: MatchPlayer | null = null;
    let bd = 1e9;
    for (const p of this.allPlayers()) {
      if (p.cooldown > 0 || p.sliding) continue;
      const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
      // the intended receiver controls a little wider (he is waiting for it)
      const reach = MOVE.pickup + 0.2 + (b.speed > 9 ? 0.15 : 0) + (p === this.receiver ? 0.3 : 0);
      if (d < reach && d < bd) (best = p), (bd = d);
    }
    if (best) {
      this.giveBall(best);
      // first touch kills most of the pace
      b.vel.multiplyScalar(0.25);
      b.vel.y = Math.min(0, b.vel.y);
      b.spin = 0;
      b.knuckle = 0;
    }
  }

  /** short touches: the ball runs a little ahead, follows a turn a moment late */
  private dribble(o: MatchPlayer, dt: number, foot: THREE.Vector3) {
    const b = this.ball;
    o.touchT -= dt;
    const moving = Math.hypot(o.want.x, o.want.z) > 0.6;
    if (moving) {
      const dir = o.dir(tmp2);
      // where the ball is relative to the spot in front of his boot
      const rx = b.pos.x - foot.x;
      const rz = b.pos.z - foot.z;
      const ahead = rx * dir.x + rz * dir.z;
      const side = Math.abs(rx * dir.z - rz * dir.x);
      // a touch when the ball has dropped back to his feet (or drifted sideways) — the ball
      // then runs a little ahead again and he catches up: short touches, never glued
      if ((o.touchT <= 0 && ahead < 0.22) || ahead < -0.12 || side > 0.4) {
        const sp = o.speed;
        const push = sp * 1.16 + 0.55;
        b.vel.set(dir.x * push - rx * 2.2 + dir.x * Math.max(0, -ahead) * 2, 0, dir.z * push - rz * 2.2 + dir.z * Math.max(0, -ahead) * 2);
        if (b.pos.y > PITCH.ballR + 0.05) b.vel.y = -1;
        o.touchT = o.sprinting ? MOVE.touchEverySprint : MOVE.touchEvery;
      }
    } else {
      // standing: soft control, the ball settles in front of him
      b.vel.x += ((foot.x - b.pos.x) * 5 - b.vel.x) * clamp(dt * 8, 0, 1);
      b.vel.z += ((foot.z - b.pos.z) * 5 - b.vel.z) * clamp(dt * 8, 0, 1);
    }
  }

  private nearestTo(t: Team, p: THREE.Vector3, except: MatchPlayer | null = null) {
    let best: MatchPlayer | null = null;
    let bd = 1e9;
    for (const q of t.players) {
      if (q === except) continue;
      const d = Math.hypot(q.pos.x - p.x, q.pos.z - p.z);
      if (d < bd) (bd = d), (best = q);
    }
    return best;
  }

  private autoSwitch(dt: number) {
    if (this.autopilot) return;
    this.switchT -= dt;
    if (this.owner && this.owner.team === 'home') return;
    if (this.receiver && this.receiver.team === 'home') return;
    if (this.switchT > 0) return;
    this.switchT = 0.5;
    const n = this.nearestTo(this.home, this.ball.pos);
    if (!n || n === this.controlled) return;
    const dc = this.controlled.pos.distanceTo(this.ball.pos);
    const dn = n.pos.distanceTo(this.ball.pos);
    if (dc - dn > 7) this.controlled = n;
  }

  // ── user actions ─────────────────────────────────────────────────────
  /** what the SHOOT button does now: 헤딩 (ball at the head) · 태클 (they have it) · 걷어내기 (own half) · 슈팅 */
  shootMode(c: MatchPlayer = this.controlled): ShootMode {
    if (this.headerAvailable(c)) return 'header';
    const o = this.owner;
    if (o && o.team !== c.team) return 'tackle';
    const t = this.team(c.team);
    const inOwnHalf = this.ball.pos.x * t.dir < 0;
    if (o === c || !o) return inOwnHalf ? 'clear' : 'shoot';
    return inOwnHalf ? 'clear' : 'shoot';
  }
  /** HEADER AVAILABLE: a ball in the air really at his head (never pulled in from afar) */
  headerAvailable(p: MatchPlayer) {
    const b = this.ball;
    if (this.owner || p.sliding || p.cooldown > 0) return false;
    const reachTop = 2.05 * p.def.look.height + 0.55; // head + a jump
    const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
    return b.pos.y > 1.25 && b.pos.y < reachTop && d < 0.95;
  }

  private userAction(a: Action, input: MatchInput) {
    const c = this.controlled;
    if (c.sliding) return;
    const mine = this.owner === c;
    const moveDir = tmp.set(input.move.x, 0, input.move.z);
    const hasDir = moveDir.lengthSq() > 0.05;
    switch (a.kind) {
      case 'pass':
        if (mine) this.pass(c, hasDir ? moveDir.normalize() : c.dir(tmp2), false);
        else this.switchPlayer();
        break;
      case 'through':
        if (mine) this.pass(c, hasDir ? moveDir.normalize() : c.dir(tmp2), true);
        else this.pressHelp = 2.5;
        break;
      case 'cross':
        if (mine) this.cross(c, hasDir ? moveDir.clone().normalize() : null);
        else this.switchPlayer();
        break;
      case 'shot': {
        const mode = this.shootMode(c);
        if (mode === 'header') this.header(c, hasDir ? moveDir.clone().normalize() : null);
        else if (mode === 'tackle') this.slideTackle(c);
        else if (mode === 'clear') {
          if (!mine && !this.owner && Math.hypot(this.ball.pos.x - c.pos.x, this.ball.pos.z - c.pos.z) < 1.4 && this.ball.pos.y < 1.2) this.giveBall(c);
          if (this.owner === c) this.clearance(c, hasDir ? moveDir.clone().normalize() : null);
        } else if (mine) this.shoot(c, a.type === 'header' ? 'normal' : a.type, input.move);
        else if (!this.owner && Math.hypot(this.ball.pos.x - c.pos.x, this.ball.pos.z - c.pos.z) < 1.4 && this.ball.pos.y < 1.2) {
          this.giveBall(c);
          this.shoot(c, a.type === 'header' ? 'normal' : a.type, input.move);
        }
        break;
      }
      case 'skill':
        if (mine) this.skill(c, hasDir ? moveDir.normalize() : null);
        break;
      case 'switch':
        this.switchPlayer();
        break;
    }
  }

  switchPlayer() {
    const n = this.nearestTo(this.home, this.ball.pos, this.controlled);
    if (n) this.controlled = n;
  }

  /**
   * SLIDING TACKLE: run in → drop → leg out → slide → (contact?) → get up. Success needs the
   * ball really within the extended leg; then his TACKLE decides (DEFENSIVE WALL better, out
   * of position worse). A short recovery stops tackle spam.
   */
  slideTackle(c: MatchPlayer) {
    if (c.sliding || c.tackleCd > 0) return false;
    const b = this.ball;
    const d = tmp2.set(b.pos.x - c.pos.x, 0, b.pos.z - c.pos.z);
    if (d.lengthSq() > 0.01) c.yaw = Math.atan2(-d.x, -d.z);
    c.slide();
    c.tackleCd = 1.7;
    return true;
  }
  private slideContact(p: MatchPlayer) {
    if (p.slideHit || p.slideT < 0.14 || p.slideT > 0.62) return;
    const b = this.ball;
    if (b.pos.y > 0.6) return;
    const foot = p.footPoint(tmp3, 0.95);
    const d = Math.hypot(b.pos.x - foot.x, b.pos.z - foot.z);
    if (d > 0.75) return;
    p.slideHit = true;
    const o = this.owner instanceof MatchPlayer ? this.owner : null;
    const tk = p.def.def?.tackle ?? 50;
    let chance = 0.18 + tk / 125 + (p.def.special === 'DEFENSIVE_WALL' ? 0.12 : 0) - (p.offPos ? 0.15 : 0) - (o?.def.def ? (o.def.def.strength - 70) / 400 : 0) + p.evo * 0.004;
    if (o && o.team === p.team) chance = 0; // never tackle a team-mate
    const won = this.rng() < clamp(chance, 0.08, 0.93);
    if (won) {
      const fwd = p.dir(tmp2);
      const side = (this.rng() - 0.5) * 2.4;
      b.vel.set(fwd.x * (3.5 + this.rng() * 3) - fwd.z * side, 0, fwd.z * (3.5 + this.rng() * 3) + fwd.x * side);
      b.spin = 0;
      if (o) o.cooldown = 0.9;
      this.owner = null;
      this.receiver = null;
      this.lastTouch = p.team;
    }
    this.events.onTackle?.(p.def, won);
  }

  /**
   * the signature SKILL MOVE (common animations, one per player): BODY FEINT · STEPOVER ·
   * ELASTICO · BURST · SIDE STEP · QUICK TURN · KNOCK ON · RAINBOW · DRAG BACK
   */
  skill(p: MatchPlayer, dir: THREE.Vector3 | null) {
    if (p.skillT > 0 || this.owner !== p) return;
    p.skillT = MOVE.skillCooldown;
    const b = this.ball;
    const fwd = p.dir(new THREE.Vector3());
    const t = this.team(p.team);
    const want = dir ?? fwd;
    const rot = (v: THREE.Vector3, a: number) => new THREE.Vector3(v.x * Math.cos(a) - v.z * Math.sin(a), 0, v.x * Math.sin(a) + v.z * Math.cos(a));
    const side = this.rng() < 0.5 ? 1 : -1;
    const go = (v: THREE.Vector3, ball: number, body: number) => {
      b.vel.set(v.x * ball, 0, v.z * ball);
      p.vel.set(v.x * body, 0, v.z * body);
      p.yaw = Math.atan2(-v.x, -v.z);
    };
    const type = p.def.skillMove;
    switch (type) {
      case 'BODY_FEINT':
        go(rot(want, side * 0.95), 5.6, 4.6);
        break;
      case 'STEPOVER':
        go(rot(want, side * 0.45), 6.4, 6.2);
        p.boostT = 0.5;
        break;
      case 'ELASTICO':
        go(rot(want, side * 0.8), 6.0, 5.2);
        break;
      case 'BURST':
        go(want, 8.4, 7.4);
        p.boostT = 0.9;
        break;
      case 'SIDE_STEP': {
        const v = rot(fwd, side * Math.PI / 2);
        go(v, 5.4, 6.0);
        break;
      }
      case 'QUICK_TURN': {
        const v = dir && fwd.dot(dir) < 0.3 ? dir : rot(fwd, side * 2.5);
        go(v, 4.6, 3.6);
        break;
      }
      case 'KNOCK_ON':
        go(want, 10.5, 7.0);
        p.boostT = 1.1;
        break;
      case 'RAINBOW':
        go(want, 5.0, 5.4);
        b.vel.y = 5.4;
        p.boostT = 0.6;
        break;
      case 'DRAG_BACK': {
        const v = new THREE.Vector3(-fwd.x, 0, -fwd.z);
        const tgt = dir && fwd.dot(dir) < 0 ? dir : rot(v, side * 0.4);
        go(tgt, 3.6, 2.8);
        break;
      }
    }
    void t;
    p.touchT = 0.32;
    p.skill(type);
    for (const q of this.other(p.team).players) if (q.pos.distanceTo(p.pos) < 3.4) q.frozen = 0.6;
    this.events.onSkill?.(p.def, type);
  }

  /** CROSS (PASS swipe →): a high ball into the box, real gravity + drag, never a teleport */
  cross(p: MatchPlayer, dir: THREE.Vector3 | null) {
    if (this.owner !== p) return false;
    const t = this.team(p.team);
    const gx = this.attackEnd(t).gx;
    // the best runner in / near the box (far post first)
    const cands = t.players.filter((q) => q !== p && Math.abs(gx - q.pos.x) < 30);
    let r = cands.sort((a, c) => {
      const sa = Math.abs(gx - a.pos.x) + Math.abs(a.pos.z) * 0.4 - (Math.sign(a.pos.z) !== Math.sign(p.pos.z) ? 3 : 0);
      const sc = Math.abs(gx - c.pos.x) + Math.abs(c.pos.z) * 0.4 - (Math.sign(c.pos.z) !== Math.sign(p.pos.z) ? 3 : 0);
      return sa - sc;
    })[0];
    if (!r) r = this.pickReceiver(p, tmp.set(t.dir, 0, 0), true) ?? (undefined as unknown as MatchPlayer);
    if (!r) return false;
    // aim: in front of goal (6–11 m out), towards his side; the stick shifts it
    let tz = clamp(r.pos.z * 0.5, -8, 8);
    if (dir) tz = clamp(tz + dir.z * 4, -10, 10);
    const tx = gx - t.dir * (7 + this.rng() * 4);
    const target = new THREE.Vector3(tx, 1.85, tz);
    const v = this.lob(this.ball.pos, target, 1.05 + Math.hypot(tx - this.ball.pos.x, tz - this.ball.pos.z) / 30);
    this.ball.kick(v);
    p.strike();
    p.cooldown = 0.45;
    this.owner = null;
    this.lastTouch = p.team;
    this.receiver = r;
    this.runTo.set(target.x, 0, target.z);
    this.lastShooter = null;
    if (p.team === 'home' && !this.autopilot) this.controlled = r;
    this.events.onCross?.(p.def);
    return true;
  }

  /** launch velocity so the ball (with drag) reaches `target` after ≈ T seconds */
  lob(from: THREE.Vector3, target: THREE.Vector3, T: number) {
    const g = 9.81;
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    let k = 1.08;
    let v = new THREE.Vector3();
    for (let it = 0; it < 4; it++) {
      v = new THREE.Vector3((dx / T) * k, (target.y - from.y + 0.5 * g * T * T) / T * (1 + (k - 1) * 0.5), (dz / T) * k);
      // simulate and correct the horizontal reach
      const sim = new MatchBall();
      sim.pos.copy(from);
      sim.vel.copy(v);
      let reach = 0;
      for (let i = 0; i < Math.round(T * 120); i++) sim.step(1 / 120);
      reach = Math.hypot(sim.pos.x - from.x, sim.pos.z - from.z);
      const want = Math.hypot(dx, dz);
      if (reach < 1e-3) break;
      k *= want / reach;
    }
    return v;
  }

  /** CLEARANCE (own half): a long, high ball towards the other half — nobody is promised it */
  clearance(p: MatchPlayer, dir: THREE.Vector3 | null) {
    if (this.owner !== p) return false;
    const t = this.team(p.team);
    const lat = dir ? clamp(dir.z, -0.7, 0.7) : clamp(-p.pos.z / 30, -0.4, 0.4) + (this.rng() - 0.5) * 0.4;
    const pw = p.def.stats ? p.def.stats.power : 70;
    const sp = 19 + (pw - 70) * 0.12 + this.rng() * 2.5;
    const h = new THREE.Vector3(t.dir, 0, lat).normalize();
    this.ball.kick([h.x * sp, 9 + this.rng() * 2.5, h.z * sp]);
    p.strike();
    p.cooldown = 0.5;
    this.owner = null;
    this.receiver = null;
    this.lastTouch = p.team;
    this.lastShooter = null;
    this.events.onClear?.(p.def);
    return true;
  }

  /** HEADER: jump, neck through, the ball off the head in the stick's direction (or at goal) */
  header(p: MatchPlayer, dir: THREE.Vector3 | null) {
    if (!this.headerAvailable(p)) return false;
    const t = this.team(p.team);
    const end = this.attackEnd(t);
    const b = this.ball;
    const toGoal = new THREE.Vector3(end.gx - b.pos.x, 0, clamp(-b.pos.z, -PITCH.goalHW + 0.6, PITCH.goalHW - 0.6) - b.pos.z * 0 + (this.rng() - 0.5) * 2 - 0).normalize();
    const d = dir ?? toGoal;
    const nearGoal = Math.abs(end.gx - b.pos.x) < 20;
    const str = p.def.def ? p.def.def.strength : 70;
    const acc = p.def.stats ? p.def.stats.accuracy : 70;
    const sp = 9.5 + (str - 60) * 0.08 + (nearGoal && !dir ? 3 : 0);
    const err = (1 - clamp((acc - 50) / 50, 0, 1)) * 0.25 + 0.05;
    const ang = gauss(this.rng) * err;
    const hx = d.x * Math.cos(ang) - d.z * Math.sin(ang);
    const hz = d.x * Math.sin(ang) + d.z * Math.cos(ang);
    const vy = nearGoal ? -1.2 - this.rng() * 1.6 : 1.8;
    b.kick([hx * sp, vy, hz * sp]);
    p.jump();
    p.cooldown = 0.5;
    this.owner = null;
    this.receiver = null;
    this.lastTouch = p.team;
    if (nearGoal) {
      this.lastShooter = { p, team: p.team };
      this.shots[p.team]++;
      this.lastShot = { team: p.team, type: 'header', by: p.def, at: this.gameSec };
      this.events.onShot?.(p.team, 'header', p.def);
    }
    return true;
  }

  /** team-mates / the AI head a ball that really arrives at their head */
  private aiHeaders() {
    if (this.owner) return;
    const b = this.ball;
    if (b.pos.y < 1.25) return;
    for (const p of this.allPlayers()) {
      if (p === this.controlled && !this.autopilot) continue;
      if (!this.headerAvailable(p)) continue;
      const t = this.team(p.team);
      const nearGoal = Math.abs(this.attackEnd(t).gx - b.pos.x) < 20;
      if (nearGoal || this.rng() < 0.7) this.header(p, nearGoal ? null : new THREE.Vector3(t.dir, 0, (this.rng() - 0.5) * 0.8).normalize());
      return;
    }
  }

  // ── passing ──────────────────────────────────────────────────────────
  /** the best team-mate in the wanted direction (alignment first, then distance, lane) */
  pickReceiver(p: MatchPlayer, dir: THREE.Vector3, through: boolean) {
    const t = this.team(p.team);
    let best: MatchPlayer | null = null;
    let bs = -1e9;
    for (const q of t.players) {
      if (q === p) continue;
      const dx = q.pos.x - p.pos.x;
      const dz = q.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) continue;
      const align = (dx * dir.x + dz * dir.z) / d;
      const fwd = ((dx * t.dir) / d) * (through ? 0.6 : 0.25);
      let lane = 0;
      for (const o of this.other(p.team).players) {
        const ox = o.pos.x - p.pos.x;
        const oz = o.pos.z - p.pos.z;
        const proj = (ox * dx + oz * dz) / d;
        if (proj > 0 && proj < d) {
          const perp = Math.abs(ox * dz - oz * dx) / d;
          if (perp < 1.4) lane += 0.6;
        }
      }
      const score = align * 2.2 + fwd - d / 30 - lane;
      if (score > bs) (bs = score), (best = q);
    }
    return best;
  }

  pass(p: MatchPlayer, dir: THREE.Vector3, through: boolean, to: MatchPlayer | null = null) {
    if (this.owner !== p) return false;
    const r = to ?? this.pickReceiver(p, dir, through);
    if (!r) return false;
    const t = this.team(p.team);
    const b = this.ball;
    // aim where he will be (a ground pass rolls: speed from the distance, then lead)
    const target = tmp3.copy(r.pos);
    if (through) {
      target.x += t.dir * (5.5 + this.rng() * 2.5) + r.vel.x * 0.4;
      target.z += r.vel.z * 0.4 + (Math.abs(r.pos.z) > 10 ? -Math.sign(r.pos.z) * 2 : 0);
    } else {
      let d = Math.hypot(target.x - b.pos.x, target.z - b.pos.z);
      for (let i = 0; i < 2; i++) {
        const v = passSpeed(d);
        const tt = d / Math.max(4, v * 0.8);
        target.set(r.pos.x + r.vel.x * tt * 0.7, 0, r.pos.z + r.vel.z * tt * 0.7);
        d = Math.hypot(target.x - b.pos.x, target.z - b.pos.z);
      }
    }
    target.x = clamp(target.x, -PITCH.HALF_L + 1.5, PITCH.HALF_L - 1.5);
    target.z = clamp(target.z, -PITCH.HALF_W + 1, PITCH.HALF_W - 1);
    const d = Math.hypot(target.x - b.pos.x, target.z - b.pos.z);
    const sp = passSpeed(d) * (through ? 1.08 : 1);
    const ux = (target.x - b.pos.x) / Math.max(0.1, d);
    const uz = (target.z - b.pos.z) / Math.max(0.1, d);
    // a long pass leaves the grass a little
    const lift = d > 20 ? 2.2 : 0;
    b.kick([ux * sp, lift, uz * sp]);
    p.strike();
    p.cooldown = 0.35;
    this.owner = null;
    this.lastTouch = p.team;
    this.receiver = r;
    this.runTo.set(target.x, 0, target.z);
    if (p.team === 'home' && !this.autopilot) this.controlled = r;
    return true;
  }

  // ── shooting ─────────────────────────────────────────────────────────
  /**
   * The five shots. Aim: a corner chosen from the joystick (across the goal) or the far
   * post; the player's abilities (shotModifiers: POWER, ACCURACY, CURVE, KNUCKLE, LOW SHOT,
   * COMPOSURE, SPECIAL, evolution) shape speed, spin and the aim error. The launch is
   * solved by PIPA's shot physics in the goal's own frame (same as a free kick).
   */
  shoot(p: MatchPlayer, type0: ShotType, move: { x: number; z: number } = { x: 0, z: 0 }, sloppy = 1) {
    if (this.owner !== p) return false;
    const t = this.team(p.team);
    const end = this.attackEnd(t);
    const keeper = this.other(p.team).keeper;
    const type: Exclude<ShotType, 'header'> = isChipOnly(p.def) ? 'chip' : type0 === 'header' ? 'normal' : type0;
    const b = this.ball;
    const lb = end.toLocal(b.pos, new THREE.Vector3());
    if (lb.z < 0.6) lb.z = 0.6;
    lb.y = PITCH.ballR;
    const dist = Math.hypot(lb.x, lb.z);
    const W = PITCH.goalHW;
    const instepSign = p.def.foot === 'L' ? -1 : p.def.foot === 'R' ? 1 : lb.x >= 0 ? -1 : 1;
    // side: joystick across the goal, else the far post (curl / outside: their natural side)
    const lm = end.dirToLocal(tmp.set(move.x, 0, move.z), tmp2);
    let side: number = Math.abs(lm.x) > 0.35 ? Math.sign(lm.x) : lb.x > 0.5 ? -1 : lb.x < -0.5 ? 1 : keeper.gk.lineX > 0 ? -1 : 1;
    if (Math.abs(lm.x) <= 0.35) {
      if (type === 'curl') side = instepSign;
      if (type === 'outside') side = -instepSign;
    }
    const spec = {
      normal: { power: 0.72, margin: 0.75, y: 0.75, level: 0 },
      power: { power: 1.0, margin: 1.0, y: 1.15, level: 0 },
      curl: { power: 0.64, margin: 0.55, y: 1.25, level: 3 },
      outside: { power: 0.8, margin: 0.6, y: 1.05, level: 3 },
      chip: { power: 0.3, margin: 1.2, y: 1.75, level: 0 },
    }[type];
    const spinSign = type === 'curl' ? instepSign : type === 'outside' ? -instepSign : 0;
    const mods = shotModifiers(p.def, {
      mode: 'match',
      power: spec.power,
      level: spec.level,
      spinSign,
      lofted: type === 'chip',
      low: spec.y < 0.75,
      evo: p.evo,
    });
    // the AI does not always pick the very corner (sloppy > 1)
    const margin = spec.margin + (sloppy > 1 ? this.rng() * 1.1 : 0);
    const tx0 = type === 'chip' ? clamp(keeper.gk.lineX * 0.4 + side * 1.0, -W + 0.9, W - 0.9) : side * (W - margin);
    // aim error grows with distance (and is the player's own)
    const f = clamp(dist / 12, 0.8, 2.6);
    const ex = gauss(this.rng) * mods.err * f * sloppy;
    const ey = gauss(this.rng) * mods.err * f * 0.6 * sloppy;
    const target = new THREE.Vector3(tx0 + ex, clamp(spec.y + ey, 0.15, 3.2), 0);
    const lim = curveLimits(MATCH_MODE);
    const spin = spec.level ? spinSign * 0.9 * lim.spinMax * mods.spinMul : 0;
    const apex = type === 'chip' ? clamp(target.y + 1.5 + dist * 0.07, 3.0, MATCH_MODE.maxApex) : null;
    const launch = calculateShotParameters(lb, {
      target,
      spin,
      profile: spec.level ? (type === 'curl' ? 'CURLED' : 'OUTSIDE_FOOT') : 'STRAIGHT',
      curveLevel: spec.level,
      apex,
      power: spec.power,
      speedMul: mods.speedMul,
      knuckle: type === 'normal' || type === 'power' ? mods.knuckle : 0,
      kseed: Math.floor(this.rng() * 1e9),
    }, MATCH_MODE);
    const v = end.dirToWorld(launch.v, new THREE.Vector3());
    b.place(b.pos.x, b.pos.z);
    b.kick(v, launch.spin, launch.knuckle ?? 0, launch.kseed ?? 0);
    p.strike();
    p.cooldown = 0.45;
    this.owner = null;
    this.receiver = null;
    this.lastTouch = p.team;
    this.lastShooter = { p, team: p.team };
    this.shots[p.team]++;
    this.lastShot = { team: p.team, type, by: p.def, at: this.gameSec };
    this.events.onShot?.(p.team, type, p.def);
    return true;
  }

  // ── keepers ──────────────────────────────────────────────────────────
  private updateKeepers(dt: number) {
    const b = this.ball;
    for (const t of [this.home, this.away]) {
      const k = t.keeper;
      const end = k.end;
      const gk = k.gk;
      k.cooldown = Math.max(0, k.cooldown - dt);
      const lp = end.toLocal(b.pos, tmp);
      const lv = end.dirToLocal(b.vel, tmp2);
      if (k.holding) {
        k.holdT += dt;
        gk.update(dt);
        end.group.updateMatrixWorld(true);
        const hands = gk.handsCenter(new THREE.Vector3());
        b.place(hands.x, hands.z, Math.max(PITCH.ballR, hands.y));
        if (k.holdT > 1.1 && this.phase === 'play') this.distribute(t);
        continue;
      }
      // a shot coming in → he reads its line (with an error that shrinks with his
      // REFLEX / DIVING / POSITIONING and evolution), waits his reaction time, then dives
      // with PIPA's real dive (same body limits as a penalty keeper)
      if (!k.plan && this.phase === 'play' && lv.z < -7 && lp.z < 34 && lp.z > -0.5 && !this.owner) {
        const cross = this.predictCrossing(end, gk.home.z);
        if (cross && Math.abs(cross.x) < PITCH.goalHW + 1.8 && cross.y < PITCH.goalH + 1.2) {
          const g = k.def.gk;
          const skill = g ? clamp(((g.reflex + g.diving + g.positioning) / 3 - 74) / 25, 0, 1) : 0.4;
          const ev = evoKeeperBoost(k.evo);
          const sigma = (0.62 - 0.38 * skill) * ev.reactMul * (1 + (b.knuckle > 0 ? 0.6 : 0)) * clamp(cross.t / 0.6, 0.6, 1.3);
          k.plan = {
            x: cross.x + gauss(this.rng) * sigma,
            y: clamp(cross.y + gauss(this.rng) * sigma * 0.6, 0.15, 2.6),
            t: cross.t,
            react: (0.18 - 0.1 * skill) * ev.reactMul,
            since: 0,
            done: false,
          };
          gk.home.x = gk.lineX;
          gk.reset();
          gk.prepare(MATCH_MODE.keeper, this.rng);
          k.tracking = true;
          k.idleT = 0;
        }
      }
      if (k.plan) {
        const pl = k.plan;
        pl.since += dt;
        if (!pl.done && pl.since >= pl.react && (pl.t - pl.since < 0.62 || pl.since > pl.t * 0.55)) {
          pl.done = true;
          if (Math.abs(pl.x - gk.lineX) > 0.35 || pl.y > 1.75) gk.diveTo(pl.x, pl.y);
          else gk.diveTo(pl.x, pl.y);
        }
        if (lv.z > 1 || lp.z > 36 || b.speed < 1.2 || lp.z < -0.4) k.idleT += dt;
        else k.idleT = 0;
        if (k.idleT > 1.4 || pl.since > 4) {
          gk.home.set(0, 0, 0.7);
          gk.reset();
          k.tracking = false;
          k.plan = null;
        }
      } else if (this.phase === 'play' || this.phase === 'kickoff' || this.phase === 'restart') {
        // positioning: on the line between the ball and the goal centre, and a step or two
        // off the line when the ball comes close (narrows the angle)
        const near = clamp((22 - lp.z) / 14, 0, 1);
        gk.home.x = 0;
        gk.home.z = 0.7 + 1.5 * near * clamp(1 - Math.abs(lp.x) / 14, 0, 1);
        const ang = lp.z > 0.5 ? (lp.x / Math.hypot(lp.x, lp.z)) * gk.home.z * 1.6 : 0;
        gk.shuffleTo(clamp(lp.x * (lp.z < 14 ? 0.26 : 0.14) + ang, -2.2, 2.2), 2.8);
      }
      gk.update(dt);
      end.group.updateMatrixWorld(true);
      gk.updateColliders();
      if (this.phase !== 'play') continue;
      // the ball meets his hands / body → catch or parry (only what really touches him)
      for (let i = 0; i < gk.colliders.length; i++) {
        const c = gk.colliders[i];
        const dx = b.pos.x - c.pos.x;
        const dy = b.pos.y - c.pos.y;
        const dz = b.pos.z - c.pos.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > c.r + PITCH.ballR || k.cooldown > 0) continue;
        const shotOn = lv.z < -3;
        if (gk.ballInBothHands(b.pos) && b.speed < MATCH_MODE.keeper.catchSpeed) {
          this.keeperHold(k, shotOn);
        } else {
          // parry: the ball comes off the glove / body
          const n = tmp3.set(dx, dy, dz).divideScalar(Math.max(1e-4, d));
          const vn = b.vel.dot(n);
          if (vn < 0) b.vel.addScaledVector(n, -1.45 * vn);
          b.vel.multiplyScalar(0.55);
          b.spin = 0;
          b.knuckle = 0;
          b.pos.copy(c.pos).addScaledVector(n, c.r + PITCH.ballR + 0.01);
          k.cooldown = 0.25;
          this.lastTouch = k.team;
          if (shotOn) {
            this.saves[k.team]++;
            this.events.onSave?.(k.team, k.def);
          }
        }
        break;
      }
      // a slow loose ball near him: he gathers it
      if (!this.owner && !k.holding && b.speed < 5.5 && b.pos.y < 0.9 && lp.z > -0.2 && lp.z < 5.5 && Math.abs(lp.x) < 5.5 && k.cooldown <= 0) {
        const feet = k.feet(new THREE.Vector3());
        const dk = Math.hypot(b.pos.x - feet.x, b.pos.z - feet.z);
        const attacker = this.nearestTo(this.other(k.team), b.pos);
        const da = attacker ? Math.hypot(attacker.pos.x - b.pos.x, attacker.pos.z - b.pos.z) : 99;
        if (dk < 2.2 && da > 0.9) this.keeperHold(k, false);
      }
    }
  }

  /** where (local x, y) and when the ball crosses the keeper's plane — the real physics */
  predictCrossing(end: GoalEnd, planeZ: number) {
    const sim = new MatchBall();
    const b = this.ball;
    sim.pos.copy(b.pos);
    sim.vel.copy(b.vel);
    sim.spin = b.spin;
    sim.knuckle = b.knuckle;
    sim.kseed = b.kseed;
    sim.flightT = b.flightT;
    const l = new THREE.Vector3();
    let prevZ = end.toLocal(sim.pos, l).z;
    for (let i = 1; i <= 360; i++) {
      sim.step(1 / 120);
      end.toLocal(sim.pos, l);
      if (l.z <= planeZ && prevZ > planeZ) return { x: l.x, y: l.y, t: i / 120 };
      prevZ = l.z;
      if (sim.speed < 1) return null;
    }
    return null;
  }

  private keeperHold(k: MatchKeeper, save: boolean) {
    k.holding = true;
    k.holdT = 0;
    k.plan = null;
    this.owner = k;
    this.receiver = null;
    this.lastTouch = k.team;
    this.ball.vel.set(0, 0, 0);
    this.ball.spin = 0;
    this.ball.knuckle = 0;
    if (save) {
      this.saves[k.team]++;
      this.events.onSave?.(k.team, k.def);
    }
  }

  /** the keeper throws it out to the best-placed team-mate */
  private distribute(t: Team) {
    const k = t.keeper;
    const feet = k.feet(new THREE.Vector3());
    let best: MatchPlayer | null = null;
    let bs = -1e9;
    for (const q of t.players) {
      let free = 99;
      for (const o of this.other(t.id).players) free = Math.min(free, o.pos.distanceTo(q.pos));
      const d = q.pos.distanceTo(feet);
      const s = Math.min(free, 6) - d / 12;
      if (s > bs) (bs = s), (best = q);
    }
    k.holding = false;
    k.cooldown = 0.6;
    k.gk.home.set(0, 0, 0.7);
    k.gk.reset();
    k.tracking = false;
    k.plan = null;
    const b = this.ball;
    b.place(feet.x + t.dir * 1.2, feet.z, 0.9);
    this.owner = null;
    if (!best) return;
    const d = Math.hypot(best.pos.x - b.pos.x, best.pos.z - b.pos.z);
    const sp = Math.min(19, 6 + d * 0.75);
    b.kick([((best.pos.x - b.pos.x) / d) * sp, 1.6, ((best.pos.z - b.pos.z) / d) * sp]);
    this.receiver = best;
    this.runTo.copy(best.pos);
    this.lastTouch = t.id;
    if (t.id === 'home' && !this.autopilot) this.controlled = best;
  }

  // ── ball: physics, woodwork, net, goal, out ──────────────────────────
  private ballStep(dt: number) {
    const b = this.ball;
    if (this.owner instanceof MatchKeeper && this.owner.holding) return;
    b.step(dt);
    // a hard shot passing through a crowd can hit a body (a block)
    if (b.speed > 14 && b.pos.y < 1.7 && !this.owner) {
      for (const p of this.allPlayers()) {
        if (this.lastShooter && p === this.lastShooter.p && b.flightT < 0.2) continue;
        if (b.flightT < 0.08) continue;
        const d = Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z);
        if (d < 0.32) {
          const n = tmp.set(b.pos.x - p.pos.x, 0, b.pos.z - p.pos.z).normalize();
          const vn = b.vel.dot(n);
          if (vn < 0) b.vel.addScaledVector(n, -1.6 * vn);
          b.vel.multiplyScalar(0.45);
          b.spin = 0;
          b.knuckle = 0;
          this.lastTouch = p.team;
          break;
        }
      }
    }
    for (const end of this.ends) this.woodwork(end);
    if (this.phase === 'play') this.checkGoalOrOut();
    else if (this.phase === 'goal') for (const end of this.ends) this.net(end);
  }

  /** posts + crossbar (capsules, in the goal's frame) */
  private woodwork(end: GoalEnd) {
    const b = this.ball;
    const lp = end.toLocal(b.pos, tmp);
    if (lp.z > 1.5 || lp.z < -PITCH.goalDepth - 0.5 || Math.abs(lp.x) > PITCH.goalHW + 1) return;
    const R = PITCH.ballR + PITCH.postR;
    const hit = (cx: number, cy: number, cz: number) => {
      const dx = lp.x - cx;
      const dy = lp.y - cy;
      const dz = lp.z - cz;
      const d = Math.hypot(dx, dy, dz);
      if (d >= R || d < 1e-5) return false;
      const n = new THREE.Vector3(dx / d, dy / d, dz / d);
      const lv = end.dirToLocal(b.vel, tmp2);
      const vn = lv.dot(n);
      if (vn < 0) lv.addScaledVector(n, -1.6 * vn);
      lv.multiplyScalar(0.8);
      lp.addScaledVector(n, R - d + 0.005);
      end.dirToWorld(lv, b.vel);
      const wp = end.dirToWorld(lp, tmp3).add(tmp2.set(end.gx, 0, 0));
      b.pos.copy(wp);
      b.spin *= 0.4;
      end.frame.impact(0, 1, 0);
      return true;
    };
    for (const s of [-1, 1]) if (lp.y < PITCH.goalH && hit(s * PITCH.goalHW, clamp(lp.y, 0, PITCH.goalH), 0)) return;
    if (Math.abs(lp.x) < PITCH.goalHW) hit(lp.x, PITCH.goalH, 0);
  }

  /** inside the goal the net stops the ball */
  private net(end: GoalEnd) {
    const b = this.ball;
    const lp = end.toLocal(b.pos, tmp);
    if (lp.z > 0 || Math.abs(lp.x) > PITCH.goalHW + 0.2) return;
    const lv = end.dirToLocal(b.vel, tmp2);
    const R = PITCH.ballR;
    let touched = false;
    if (lp.z < -PITCH.goalDepth + R) (lp.z = -PITCH.goalDepth + R), (lv.z = Math.abs(lv.z) * 0.12), (touched = true);
    if (Math.abs(lp.x) > PITCH.goalHW - R) (lp.x = Math.sign(lp.x) * (PITCH.goalHW - R)), (lv.x *= -0.15);
    const roof = GoalFrame.roofY(lp.z) - R;
    if (lp.y > roof) (lp.y = roof), (lv.y = -Math.abs(lv.y) * 0.2);
    if (touched) {
      lv.x *= 0.5;
      lv.y *= 0.6;
      end.frame.impact(lp.x, lp.y, b.speed);
    }
    end.dirToWorld(lv, b.vel);
    b.pos.copy(end.dirToWorld(lp, tmp3).add(tmp2.set(end.gx, 0, 0)));
  }

  private checkGoalOrOut() {
    const b = this.ball;
    const R = PITCH.ballR;
    for (const end of this.ends) {
      const lp = end.toLocal(b.pos, tmp);
      if (lp.z < -R) {
        // the whole ball over the line: between the posts and under the bar → GOAL
        if (Math.abs(lp.x) < PITCH.goalHW - R * 0.2 && lp.y < PITCH.goalH - R * 0.2) {
          const scoredOn = this.home.keeper.end === end ? this.home : this.away;
          const scorers = this.other(scoredOn.id);
          this.goal(scorers.id, scoredOn.id === this.lastTouch);
        } else {
          // over the goal line: a goal kick for the keeper of that end
          const keeperTeam = this.home.keeper.end === end ? this.home : this.away;
          this.restart = { team: keeperTeam.id, kind: 'goalkick', x: end.gx + end.inward * 2, z: 0 };
          this.setPhase('restart');
          this.owner = null;
          this.events.onOut?.('goalkick');
        }
        return;
      }
    }
    if (Math.abs(b.pos.z) > PITCH.HALF_W + R) {
      const team = this.lastTouch === 'home' ? 'away' : 'home';
      this.restart = { team, kind: 'throw', x: clamp(b.pos.x, -PITCH.HALF_L + 3, PITCH.HALF_L - 3), z: Math.sign(b.pos.z) * (PITCH.HALF_W - 0.4) };
      this.owner = null;
      this.setPhase('restart');
      this.events.onOut?.('throw');
    }
  }

  private doRestart() {
    const r = this.restart!;
    this.restart = null;
    const t = this.team(r.team);
    if (r.kind === 'goalkick') {
      this.ball.vel.set(0, 0, 0);
      this.keeperHold(t.keeper, false);
      t.keeper.holdT = 0.4;
      this.setPhase('play');
      return;
    }
    const p = this.nearestTo(t, tmp.set(r.x, 0, r.z))!;
    p.pos.set(r.x, 0, r.z + (r.z > 0 ? 0.6 : -0.6));
    p.vel.set(0, 0, 0);
    this.ball.place(r.x, r.z - Math.sign(r.z) * 0.1);
    this.giveBall(p);
    p.yaw = Math.atan2(-0, r.z > 0 ? 1 : -1);
    this.setPhase('play');
  }

  private goal(team: TeamId, ownGoal: boolean) {
    this.score[team]++;
    const shooter = this.lastShooter && this.lastShooter.team === team ? this.lastShooter.p : null;
    const byTeam = this.team(team);
    const scorer = shooter ?? this.nearestTo(byTeam, this.ball.pos) ?? byTeam.players[3];
    const e: GoalEvent = { team, scorer: scorer.def, evo: scorer.evo, minute: Math.max(1, Math.ceil(this.gameSec / 60)), ownGoal: ownGoal && !shooter };
    this.goals.push(e);
    this.lastGoal = e;
    this.owner = null;
    this.receiver = null;
    this.setPhase('goal');
    scorer.celebrate();
    for (const p of byTeam.players) if (p !== scorer) p.celebrate();
    for (const p of this.other(team).players) p.sad();
    this.other(team).keeper.gk.react('goal');
    this.events.onGoal?.(e);
  }

  private celebrate(dt: number) {
    // team-mates run to the scorer; the others walk back
    const e = this.lastGoal;
    const t = e ? this.team(e.team) : null;
    const sc = t?.players.find((p) => p.def === e?.scorer) ?? null;
    for (const p of this.allPlayers()) {
      if (t && p.team === t.id && sc && p !== sc) {
        const dx = sc.pos.x - p.pos.x;
        const dz = sc.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        p.want.set(d > 1.6 ? (dx / d) * 5 : 0, 0, d > 1.6 ? (dz / d) * 5 : 0);
      } else p.want.set(0, 0, 0);
      p.move(dt, 6);
    }
  }

  private holdPositions(dt: number, speedFrac: number) {
    for (const t of [this.home, this.away]) {
      for (const p of t.players) {
        const goal = this.phase === 'halftime' ? this.restSpot(t, p) : this.phase === 'kickoff' ? p.pos.clone() : this.slotPos(t, p, false);
        const dx = goal.x - p.pos.x;
        const dz = goal.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        const v = Math.min(MOVE.run * speedFrac, d * 2);
        p.want.set(d > 0.05 ? (dx / d) * v : 0, 0, d > 0.05 ? (dz / d) * v : 0);
        p.move(dt, MOVE.run);
        if (d < 0.3 && this.phase !== 'halftime') p.face(0, 0, dt);
      }
    }
  }

  private restSpot(t: Team, p: MatchPlayer) {
    // the team gathers near its bench (+z touchline) in its own half
    const x = -t.dir * (6 + p.slot * 1.8);
    return new THREE.Vector3(x, 0, PITCH.HALF_W - 3 - (p.slot % 2) * 1.8);
  }

  private startHalftime() {
    this.setPhase('halftime');
    this.owner = null;
    this.receiver = null;
    this.ball.place(0, 0);
    this.allPlayers().forEach((p, i) => p.rest(i));
    for (const t of [this.home, this.away]) t.keeper.gk.reset();
  }

  private startSecondHalf() {
    this.half = 2;
    this.gameSec = 45 * 60;
    // ends swap: the teams attack the other way, the keepers change goals
    this.home.dir = this.home.dir === 1 ? -1 : 1;
    this.away.dir = this.away.dir === 1 ? -1 : 1;
    this.home.keeper.moveTo(this.ownEnd(this.home));
    this.away.keeper.moveTo(this.ownEnd(this.away));
    this.setupKickoff(this.firstKickoff === 'home' ? 'away' : 'home');
  }

  private endMatch() {
    this.gameSec = CLOCK.gameMinutes * 60;
    this.owner = null;
    this.setPhase('fulltime');
    const r = this.result;
    for (const p of this.home.players) r === 'VICTORY' ? p.celebrate() : r === 'DEFEAT' ? p.sad() : p.calm();
    for (const p of this.away.players) r === 'DEFEAT' ? p.celebrate() : r === 'VICTORY' ? p.sad() : p.calm();
  }

  get result(): 'VICTORY' | 'DRAW' | 'DEFEAT' {
    return this.score.home > this.score.away ? 'VICTORY' : this.score.home < this.score.away ? 'DEFEAT' : 'DRAW';
  }

  // ── AI ───────────────────────────────────────────────────────────────
  /** formation spot: own half when defending, pushed up when attacking, shifted with the ball */
  slotPos(t: Team, p: MatchPlayer, attacking: boolean) {
    const f = p.formation;
    const ownX = -t.dir * PITCH.HALF_L;
    // the team block shifts with the ball (compact), pushes up when attacking
    const bx = this.ball.pos.x * t.dir; // ball position seen from the team (+ = attacking half)
    const push = attacking ? 0.16 : -0.06;
    let fx = f.x * (attacking ? 0.95 : 0.78) + push + clamp(bx / PITCH.HALF_L, -1, 1) * (f.line === 'DEF' ? 0.28 : 0.36);
    if (f.line === 'DEF') fx = Math.min(fx, attacking ? 1.05 : 0.9);
    let x = ownX + t.dir * fx * PITCH.HALF_L;
    let z = f.z * PITCH.HALF_W * (attacking ? 0.88 : 0.72) + this.ball.pos.z * (f.line === 'FWD' ? 0.15 : 0.3);
    // forwards attack the box when the ball is in the last third
    if (attacking && f.line === 'FWD' && bx > PITCH.HALF_L * 0.3) {
      x = t.dir * (PITCH.HALF_L - 9 - Math.abs(f.z) * 5);
      z = f.z * 9;
    }
    return new THREE.Vector3(clamp(x, -PITCH.HALF_L + 2, PITCH.HALF_L - 2), 0, clamp(z, -PITCH.HALF_W + 1.5, PITCH.HALF_W - 1.5));
  }

  private aiNoise = new Map<MatchPlayer, THREE.Vector3>();
  private ai(p: MatchPlayer, t: Team, dt: number, decide: boolean) {
    const b = this.ball;
    const ownerTeam = this.ownerTeam();
    p.sprinting = false;
    const go = (x: number, z: number, speed: number, stopAt = 0.3, chase = false) => {
      const dx = x - p.pos.x;
      const dz = z - p.pos.z;
      const d = Math.hypot(dx, dz);
      // chasing the ball: full speed onto it (no easing off)
      const v = d < stopAt ? 0 : chase ? speed : Math.min(speed, d * 2.2);
      p.want.set(d > 1e-3 ? (dx / d) * v : 0, 0, d > 1e-3 ? (dz / d) * v : 0);
      if (speed > MOVE.run) p.sprinting = true;
      if (d < 1.2) p.face(b.pos.x, b.pos.z, dt);
    };
    if (this.owner === p) {
      this.aiOwner(p, t, decide);
      return;
    }
    if (this.receiver === p) {
      // a pass / cross for him: meet it (a cross: run to where it comes down)
      if (b.pos.y > 1.2 && b.vel.y !== 0) go(this.runTo.x, this.runTo.z, MOVE.sprint, 0);
      else {
        // step onto the ball's line (interception point) instead of running after it
        const hs = Math.hypot(b.vel.x, b.vel.z);
        if (hs > 1.5) {
          const ux = b.vel.x / hs;
          const uz = b.vel.z / hs;
          const proj = (p.pos.x - b.pos.x) * ux + (p.pos.z - b.pos.z) * uz;
          if (proj > 0.5) go(b.pos.x + ux * proj, b.pos.z + uz * proj, MOVE.sprint, 0, true);
          else go(b.pos.x + b.vel.x * 0.2, b.pos.z + b.vel.z * 0.2, MOVE.sprint, 0, true);
        } else go(b.pos.x, b.pos.z, MOVE.sprint, 0, true);
      }
      return;
    }
    if (ownerTeam === t.id) {
      let n = this.aiNoise.get(p);
      if (!n || (decide && this.rng() < 0.05)) {
        n = new THREE.Vector3((this.rng() - 0.5) * 7, 0, (this.rng() - 0.5) * 7);
        this.aiNoise.set(p, n);
      }
      const s = this.slotPos(t, p, true);
      go(s.x + n.x, s.z + n.z, MOVE.run * 0.95);
      return;
    }
    // defending or a loose ball
    const chasers = t.players
      .filter((q) => !q.sliding && (this.autopilot || t.id !== 'home' || q !== this.controlled))
      .sort((a, c) => a.pos.distanceTo(b.pos) - c.pos.distanceTo(b.pos));
    const rank = chasers.indexOf(p);
    const userDefends = t.id === 'home' && !this.autopilot;
    const presser = userDefends ? (this.pressHelp > 0 ? 0 : -1) : 0;
    const loose = !this.owner;
    const o = this.owner instanceof MatchPlayer ? this.owner : null;
    if ((loose && rank === 0) || rank === presser) {
      const tx = o ? o.pos.x + o.vel.x * 0.3 : b.pos.x + b.vel.x * 0.35;
      const tz = o ? o.pos.z + o.vel.z * 0.3 : b.pos.z + b.vel.z * 0.35;
      go(tx, tz, loose ? MOVE.sprint : MOVE.run * 1.05, 0, true);
      // the AI sometimes goes to ground: a sliding tackle from close by
      if (o && decide && (t.id === 'away' || p !== this.controlled || this.autopilot) && !p.sliding && p.tackleCd <= 0 && o.pos.distanceTo(p.pos) < 2.0 && this.rng() < 0.05 + ((p.def.def?.tackle ?? 50) - 50) / 900) this.slideTackle(p);
      return;
    }
    if (rank === (presser < 0 ? 0 : 1)) {
      const gx = -t.dir * PITCH.HALF_L;
      go(b.pos.x + (gx - b.pos.x) * 0.3, b.pos.z * 0.6, MOVE.run);
      return;
    }
    // defenders mark the nearest attacker in their zone (goal side); the rest hold the shape
    const s = this.slotPos(t, p, false);
    if (p.formation.line === 'DEF' || p.formation.id === 'CDM') {
      let best: MatchPlayer | null = null;
      let bd = 11;
      for (const q of this.other(t.id).players) {
        const d = Math.hypot(q.pos.x - s.x, q.pos.z - s.z);
        if (d < bd) (bd = d), (best = q);
      }
      if (best) {
        const gx = -t.dir * PITCH.HALF_L;
        const k = 1.6 / Math.max(1.6, Math.hypot(gx - best.pos.x, best.pos.z));
        go(best.pos.x + (gx - best.pos.x) * k, best.pos.z * (1 - k), MOVE.run * (p.offPos ? 0.85 : 0.95));
        return;
      }
    }
    go(s.x, s.z, MOVE.run * 0.9);
  }

  private aiOwner(p: MatchPlayer, t: Team, decide: boolean) {
    const end = this.attackEnd(t);
    const gx = end.gx;
    const dGoal = Math.hypot(gx - p.pos.x, p.pos.z);
    let press = 99;
    for (const o of this.other(t.id).players) {
      const d = o.pos.distanceTo(p.pos);
      const ahead = (o.pos.x - p.pos.x) * t.dir > -0.5;
      if (ahead) press = Math.min(press, d);
    }
    const inOwnHalf = p.pos.x * t.dir < -PITCH.HALF_L * 0.55;
    if (decide) {
      const sk = p.def.stats;
      if (dGoal < 26 && Math.abs(p.pos.z) < 17 && (press > 1.4 || dGoal < 14) && this.rng() < (dGoal < 15 ? 0.5 : 0.16)) {
        const r = this.rng();
        const type: ShotType =
          r < 0.1 && dGoal > 11 ? 'chip' : r < 0.42 && sk && sk.curve >= 84 ? 'curl' : r < 0.6 && sk && sk.power >= 86 ? 'power' : r < 0.66 ? 'outside' : 'normal';
        this.shoot(p, type, { x: 0, z: (this.rng() - 0.5) * 2 }, p.team === 'home' && !this.autopilot ? 1 : 1.6);
        return;
      }
      // wide in the last third → a cross
      if (Math.abs(p.pos.z) > PITCH.HALF_W * 0.38 && Math.abs(gx - p.pos.x) < 30 && this.rng() < 0.12) {
        if (this.cross(p, null)) return;
      }
      // a defender under pressure deep in his half clears it
      if (inOwnHalf && press < 2.5 && (p.formation.line === 'DEF' || p.def.defender) && this.rng() < 0.4) {
        if (this.clearance(p, null)) return;
      }
      // UPDATE 11 patch (11 vs 11): carry the ball into space, pass when pressed or a lane opens
      if (press < 2.2 && this.rng() < 0.3) {
        if (this.pass(p, tmp.set(t.dir, 0, (this.rng() - 0.5) * 1.2).normalize(), false)) return;
      }
      // play forward: through balls to the runners, passes into the next line
      const forwardRoom = Math.abs(gx - p.pos.x) > 24;
      if (forwardRoom && this.rng() < 0.035) {
        if (this.pass(p, tmp.set(t.dir, 0, (this.rng() - 0.5) * 0.6).normalize(), true)) return;
      }
      if (this.rng() < (press > 6 ? 0.02 : 0.045)) {
        if (this.pass(p, tmp.set(t.dir, 0, (this.rng() - 0.5) * 1.4).normalize(), false)) return;
      }
      if (press < 1.8 && this.rng() < 0.1) this.skill(p, null);
    }
    let ax = gx - t.dir * 8 - p.pos.x;
    // wingers run down the line until the box is near (then cut in / cross)
    const wing = (p.formation.id === 'LW' || p.formation.id === 'RW' || p.formation.id === 'LB' || p.formation.id === 'RB') && Math.abs(p.pos.z) > 9 && Math.abs(gx - p.pos.x) > 14;
    let az = wing ? 0 : -p.pos.z * 0.35;
    const near = this.nearestTo(this.other(t.id), p.pos);
    if (near) {
      const dx = p.pos.x - near.pos.x;
      const dz = p.pos.z - near.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 4) {
        az += (dz / Math.max(0.3, d)) * (4 - d) * 2.2;
        ax += (dx / Math.max(0.3, d)) * (4 - d) * 0.6;
      }
    }
    const l = Math.hypot(ax, az) || 1;
    const sp = MOVE.run * 0.95;
    p.want.set((ax / l) * sp, 0, (az / l) * sp);
  }

  // ── substitutions ────────────────────────────────────────────────────
  canSub(team: TeamId) {
    return this.team(team).subsUsed < MOVE.maxSubs && this.phase !== 'fulltime';
  }
  /** who is on the pitch / on the bench (for the SUB screen) */
  lineup(team: TeamId) {
    const t = this.team(team);
    return {
      onPitch: [...t.players.map((p) => ({ def: p.def, evo: p.evo, gk: false, slot: p.formation.id as SlotId, offPos: p.offPos })), { def: t.keeper.def, evo: t.keeper.evo, gk: true, slot: 'GK' as SlotId, offPos: false }],
      bench: t.bench.map((b) => ({ ...b, gk: b.def.role === 'GK' })),
      left: MOVE.maxSubs - t.subsUsed,
    };
  }
  /**
   * OUT (index in onPitch: 0–9 field, 10 = GK) ↔ IN (bench index). A keeper only for a
   * keeper; the new player's body, name, stats and evolution play from now on.
   */
  substitute(team: TeamId, outIdx: number, benchIdx: number): { ok: boolean; message?: string } {
    const t = this.team(team);
    if (t.subsUsed >= MOVE.maxSubs) return { ok: false, message: `교체는 한 경기 최대 ${MOVE.maxSubs}번이에요` };
    const inn = t.bench[benchIdx];
    if (!inn) return { ok: false, message: '교체할 선수를 골라주세요' };
    const isGk = outIdx === t.players.length;
    if (isGk !== (inn.def.role === 'GK')) return { ok: false, message: isGk ? '골키퍼는 골키퍼와만 교체할 수 있어요' : '필드 선수는 필드 선수와 교체해주세요' };
    let outDef: PlayerDef;
    if (isGk) {
      outDef = t.keeper.def;
      const holding = this.owner === t.keeper;
      t.keeper.replace(inn.def, inn.evo);
      if (holding) this.keeperHold(t.keeper, false);
    } else {
      const p = t.players[outIdx];
      if (!p) return { ok: false, message: '나갈 선수를 골라주세요' };
      outDef = p.def;
      p.replace(inn.def, inn.evo);
    }
    t.bench.splice(benchIdx, 1);
    t.subsUsed++;
    this.events.onSub?.(team, outDef, inn.def);
    return { ok: true };
  }

  private maybeAiSub() {
    if (this.aiSubDone || this.half !== 2 || this.gameSec < 60 * 60 || this.phase === 'fulltime') return;
    this.aiSubDone = true;
    const t = this.away;
    const bi = t.bench.findIndex((b) => b.def.role !== 'GK');
    if (bi < 0) return;
    let worst = 0;
    t.players.forEach((p, i) => {
      if (statOvr(p.def) < statOvr(t.players[worst].def)) worst = i;
    });
    if (this.owner === t.players[worst]) return void (this.aiSubDone = false);
    this.substitute('away', worst, bi);
  }

  private animate(dt: number) {
    for (const p of this.allPlayers()) p.animate(dt);
    for (const e of this.ends) e.frame.update(dt);
  }
}

/**
 * an AI FC line-up in 4-3-3 HOLDING near the user's level (by ability, seeded), real
 * defenders in the back four when there are any, never the user's own players
 */
export function aiTeamFrom(pool: PlayerDef[], avgOvr: number, seed: number, exclude: Set<string>): TeamSetup {
  const rnd = mulberry32(seed);
  const free = pool.filter((p) => !exclude.has(p.id) && (p.stats || p.gk));
  const used = new Set<string>();
  const pick = (ok: (p: PlayerDef) => boolean, n = 1) => {
    const list = free
      .filter((p) => !used.has(p.id) && ok(p))
      .map((p) => ({ p, k: Math.abs(statOvr(p) - avgOvr) + rnd() * 6 }))
      .sort((a, b) => a.k - b.k)
      .slice(0, Math.max(6, n * 3));
    const out: PlayerDef[] = [];
    while (out.length < n && list.length) {
      const x = list.splice(Math.floor(rnd() * Math.min(list.length, 5)), 1)[0].p;
      used.add(x.id);
      out.push(x);
    }
    return out;
  };
  const gk = pick((p) => p.role === 'GK')[0];
  const field = FORMATION_433H.slice(1).map((f) => {
    let got = pick((p) => p.role !== 'GK' && slotFit(p, f) === 'ok')[0];
    if (!got) got = pick((p) => p.role !== 'GK' && slotFit(p, f) !== 'off')[0];
    if (!got) got = pick((p) => p.role !== 'GK')[0];
    return got;
  });
  const bench = [...pick((p) => p.role !== 'GK', 3), ...pick((p) => p.role === 'GK', 1)];
  return {
    name: 'AI FC',
    field: field.map((def) => ({ def, evo: 0 })),
    keeper: { def: gk, evo: 0 },
    bench: bench.map((def) => ({ def, evo: 0 })),
  };
}
