import * as THREE from 'three';
import { FIELD, type ModeConfig } from './core/config';
import { mulberry32 } from './core/math';
import type { Phase, ShotInput, ShotOutcome } from './core/types';
import { Ball } from './entities/Ball';
import { DefensiveWall } from './entities/DefensiveWall';
import { Goalkeeper, PERFECT_WINDOW, type Collider } from './entities/Goalkeeper';
import type { GkStats, SpecialId } from '../players/players';
import { Kicker, type KickerLook, type KickStyle } from './entities/Player';
import { buildShotPlan, shotPositionAt, shotVelocityAt, type ShotPlan } from './physics/ShotModel';
import { GoalFrame } from './world/Goal';

export interface KickSpot {
  ball: THREE.Vector3;
  /** unit xz vector from the ball towards the goal centre */
  aim: THREE.Vector3;
  wallCount?: number;
}

export interface KickGameOptions {
  visuals: boolean;
  nickname: string;
  seed: number;
  /** online PvP: the keeper is a person (no AI guess / late reach); dives come from setKeeperDive */
  humanKeeper?: boolean;
  /** UPDATE 4: the chosen players' looks (cosmetic only — physics and timing are identical) */
  kickerLook?: KickerLook;
  keeperLook?: ConstructorParameters<typeof Goalkeeper>[0];
  /** UPDATE 5: the keeper's abilities (reflex/diving/reach/… — AI and human alike) */
  keeperStats?: GkStats;
  /** UPDATE 7 hotfix: the keeper's special (BLACK SPIDER, LONG REACH …) */
  keeperSpecial?: SpecialId | null;
}

/** A person's dive: world target (x, y on the keeper's line) and when (s since the run-up started). */
export interface KeeperDiveCommand {
  x: number;
  y: number;
  at: number;
}

export interface KickGameListener {
  onPhase?(p: Phase): void;
  onOutcome?(o: ShotOutcome, detail: string): void;
  onLaunch?(plan: ShotPlan): void;
}

const R = FIELD.ballRadius;
const G = FIELD.gravity;
const STEP = 1 / 120; // fixed simulation step → deterministic, frame-rate independent
/** seconds after the result before the players react (celebration / frustration / keeper) */
const REACT_DELAY = 0.35;
const SUB = 0.003; // ball collision sub-step (≈9 cm at top speed, no tunnelling)

/**
 * Renderer-agnostic simulation of one set-piece attempt. Owns the dynamic
 * entities (ball, kicker, keeper, wall, goal) and the shot state machine:
 *   aim → runup → flight → result
 * Can run headless (Node) for tests and, later, on a server for PvP validation.
 */
export abstract class KickGame {
  readonly group = new THREE.Group();
  readonly ball: Ball;
  readonly kicker: Kicker;
  readonly keeper: Goalkeeper;
  readonly goal: GoalFrame;
  readonly wall: DefensiveWall | null;
  readonly ballPos = new THREE.Vector3();
  readonly ballVel = new THREE.Vector3();

  phase: Phase = 'aim';
  outcome: ShotOutcome | null = null;
  detail = '';
  attempt = 0;
  spot!: KickSpot;
  plan: ShotPlan | null = null;
  lastInput: ShotInput | null = null;
  listener: KickGameListener = {};

  protected rng: () => number;
  private acc = 0;
  private flying = false;
  private free = false;
  private caught = false;
  private flightT = 0;
  private freeT = 0;
  resultT = 0;
  private sideSpin = 0;
  private keeperLead = 0;
  private humanDive: KeeperDiveCommand | null = null;
  /** hit the post/bar: outcome decided by where the rebound goes */
  private woodwork: '' | 'post' | 'bar' = '';
  private tmp = new THREE.Vector3();

  protected abstract pickSpot(attempt: number): KickSpot;
  protected createWall(): DefensiveWall | null {
    return null;
  }

  constructor(
    readonly cfg: ModeConfig,
    protected readonly opts: KickGameOptions,
  ) {
    this.rng = mulberry32(opts.seed);
    this.goal = new GoalFrame(opts.visuals);
    this.ball = new Ball(opts.visuals);
    this.kicker = new Kicker(opts.nickname, opts.kickerLook);
    this.keeper = new Goalkeeper(opts.keeperLook, opts.keeperStats, opts.keeperSpecial);
    this.wall = this.createWall();
    this.group.add(this.goal.group, this.ball.group, this.kicker.body.root, this.keeper.body.root);
    if (this.wall) this.group.add(this.wall.group);
  }

  get style(): KickStyle {
    return this.cfg.id === 'penalty' ? 'penalty' : 'freekick';
  }

  start() {
    this.attempt = 0;
    this.newAttempt();
  }

  next() {
    this.attempt++;
    this.newAttempt();
  }

  private newAttempt() {
    this.spot = this.pickSpot(this.attempt);
    this.ballPos.copy(this.spot.ball);
    this.ballVel.set(0, 0, 0);
    this.ball.reset();
    this.ball.setPosition(this.ballPos);
    this.kicker.setup(this.spot.ball, this.spot.aim, this.style);
    this.keeper.reset();
    this.wall?.setup(this.spot.ball, this.spot.wallCount ?? 4);
    this.goal.reset();
    this.plan = null;
    this.lastInput = null;
    this.outcome = null;
    this.detail = '';
    this.flying = this.free = this.caught = false;
    this.flightT = this.freeT = this.resultT = this.acc = 0;
    this.humanDive = null;
    this.woodwork = '';
    this.setPhase('aim');
  }

  planFor(input: ShotInput): ShotPlan {
    return buildShotPlan(this.spot.ball, input, this.cfg);
  }

  /** Accepts a shot only while aiming. The ball leaves when the kicker's boot reaches it. */
  shoot(input: ShotInput): boolean {
    if (this.phase !== 'aim') return false;
    this.lastInput = input;
    this.plan = this.planFor(input);
    const aim = new THREE.Vector3(this.plan.forward.x, 0, this.plan.forward.z);
    // the foot matches the shot: instep curl / outside of the boot (per strong foot),
    // knuckle punch, low drive or a plain laces drive
    const sp = this.plan.spin;
    const foot = this.opts.kickerLook?.foot ?? 'R';
    const instep = foot === 'B' || (foot === 'L' ? sp < 0 : sp > 0);
    this.kicker.setStrike(
      this.plan.knuckle > 0 ? 'knuckle' : Math.abs(sp) > 0.01 ? (instep ? 'instep' : 'outside') : this.plan.target.y < 0.7 && this.plan.apex < 1 ? 'low' : 'drive',
    );
    this.kicker.kick(this.spot.ball, aim, () => this.launch());
    // keeper gets set as the run-up starts; penalty keepers commit a hair before contact
    this.keeper.prepare(this.cfg.keeper, this.rng);
    this.keeperLead = this.rng() * this.cfg.keeper.leadMax;
    this.setPhase('runup');
    return true;
  }

  /**
   * Online keeper input. Applied on the fixed step once the run-up clock reaches
   * `at` — never before foot-ball contact (a keeper may not leave his line early),
   * and only once (a committed dive cannot change direction).
   */
  setKeeperDive(cmd: KeeperDiveCommand) {
    if (!this.opts.humanKeeper || this.humanDive || this.keeper.committed) return false;
    this.humanDive = cmd;
    return true;
  }

  get keeperDive() {
    return this.humanDive;
  }

  /** next shot only once the celebration / reaction has played (UPDATE 5) */
  canContinue() {
    return this.phase === 'result' && this.resultT > REACT_DELAY + 1.6;
  }

  cameraRig(pos: THREE.Vector3, look: THREE.Vector3) {
    const c = this.cfg.camera;
    const { ball, aim } = this.spot;
    const right = this.tmp.set(-aim.z, 0, aim.x);
    pos.set(ball.x, 0, ball.z).addScaledVector(aim, -c.back).addScaledVector(right, c.side);
    pos.y = c.height;
    look.set(0, c.lookY, 0).lerp(new THREE.Vector3(ball.x, 0, ball.z), c.lookBlend);
  }

  update(dt: number) {
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= STEP && n < 14) {
      this.step(STEP);
      this.acc -= STEP;
      n++;
    }
    if (n === 14) this.acc = 0;
    this.goal.update(dt);
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.listener.onPhase?.(p);
  }

  /** UPDATE 5: celebration / frustration / keeper reaction — purely visual */
  private startReactions() {
    const o = this.outcome;
    if (!o) return;
    const wood = /골대|크로스바/.test(this.detail);
    const kind = o === 'GOAL' ? 'GOAL' : o === 'SAVE' ? 'SAVE' : wood ? 'WOODWORK' : 'MISS';
    // variety without touching the game RNG (keeps online replays identical)
    const pick = Math.floor(Math.abs(this.ballPos.x * 1000 + this.ballPos.y * 100 + this.attempt * 7));
    this.kicker.reactTo(kind, pick);
    this.keeper.react(o === 'SAVE' ? 'save' : o === 'GOAL' ? 'goal' : 'miss');
  }

  private setOutcome(o: ShotOutcome, detail: string) {
    if (this.outcome) return;
    this.outcome = o;
    this.detail = detail;
    this.resultT = 0;
    this.setPhase('result');
    this.listener.onOutcome?.(o, detail);
  }

  private launch() {
    if (!this.plan) return;
    this.flying = true;
    this.flightT = 0;
    // gentle visual spin that matches the drawn bend — never adds curve by itself
    this.sideSpin = -this.plan.curve * 7;
    // free kick: the keeper starts reading the real ball now (never the drawn path)
    if (this.opts.humanKeeper) {
      /* a person keeps goal: no AI reaction */
    } else if (this.style === 'freekick') this.keeper.startTracking(shotVelocityAt(this.plan, 0).length());
    else this.keeper.watchAfterGuess();
    this.wall?.jump();
    this.setPhase('flight');
    this.listener.onLaunch?.(this.plan);
  }

  private step(h: number) {
    this.kicker.update(h);
    if (this.opts.humanKeeper) {
      const d = this.humanDive;
      if (d && this.plan && !this.keeper.committed && this.phase !== 'aim' &&
          this.kicker.elapsed >= Math.max(d.at, this.kicker.contactTime - 0.03)) {
        // UPDATE 7 hotfix: a dive started right at the strike gets a cleaner push (internal)
        const c = this.kicker.contactTime;
        const v0 = shotVelocityAt(this.plan, 0);
        const b = this.spot.ball;
        const tz = v0.z < -0.5 ? (this.keeper.home.z - b.z) / v0.z : 0;
        const read = tz > 0 ? { x: b.x + v0.x * tz, y: b.y + v0.y * tz - 4.9 * tz * tz } : undefined;
        this.keeper.diveTo(d.x, d.y, d.at >= c - PERFECT_WINDOW.before && d.at <= c + PERFECT_WINDOW.after, read);
      }
    } else if (this.style === 'penalty' && this.plan && !this.keeper.committed && this.phase !== 'aim' &&
        this.kicker.elapsed >= this.kicker.contactTime - this.keeperLead) {
      // penalty: guess from the kicker's body (strike direction + lean), not the path
      // the body read: hips/shoulders square up to where the ball is being sent over
      // the first metres (strike direction + early bend), plus lean-back for height
      const early = shotPositionAt(this.plan, this.plan.duration * 0.3, new THREE.Vector3());
      const heading = new THREE.Vector3(early.x - this.spot.ball.x, 0, early.z - this.spot.ball.z).normalize();
      const flat = Math.hypot(early.x - this.spot.ball.x, early.z - this.spot.ball.z) || 1;
      this.keeper.predictPenalty({ ball: this.spot.ball, heading, rise: (early.y - this.spot.ball.y) / flat });
    }
    this.keeper.update(h);
    this.wall?.update(h);
    if (this.phase === 'result') {
      const before = this.resultT;
      this.resultT += h;
      if (before < REACT_DELAY && this.resultT >= REACT_DELAY) this.startReactions();
    }
    if (this.flying) {
      this.stepBall(h);
      if (!this.free && !this.caught) this.keeper.observe(this.ballPos, this.ballVel, h);
      this.ball.spin(this.ballVel, this.free ? this.sideSpin * 0.3 : this.sideSpin, h);
    }
    this.ball.setPosition(this.ballPos);
  }

  private stepBall(h: number) {
    if (this.caught) {
      this.keeper.body.root.updateMatrixWorld(true);
      this.keeper.handsCenter(this.ballPos);
      this.ballPos.z += 0.12;
      this.ballVel.set(0, 0, 0);
      return;
    }
    if (this.free) {
      this.integrateFree(h);
      return;
    }
    const plan = this.plan!;
    this.keeper.updateColliders();
    let remaining = h;
    while (remaining > 1e-9) {
      const sub = Math.min(SUB, remaining);
      remaining -= sub;
      let t = this.flightT + sub;
      let crossing = false;
      if (t >= plan.duration) {
        t = plan.duration;
        crossing = true;
      }
      this.flightT = t;
      shotPositionAt(plan, t, this.ballPos);
      shotVelocityAt(plan, t, this.ballVel);
      if (this.wall && this.collide(this.wall.colliders, 'wall')) break;
      if (this.collide(this.keeper.colliders, 'keeper')) break;
      if (this.hitWoodwork()) {
        this.free = true;
        if (remaining > 0) this.integrateFree(remaining);
        break;
      }
      if (crossing) {
        if (plan.reaches) this.resolveGoalPlane();
        else this.setOutcome('MISS', '골대까지 못 미침');
        this.free = true;
        if (remaining > 0) this.integrateFree(remaining);
        break;
      }
    }
  }

  private collide(list: Collider[], who: 'wall' | 'keeper'): boolean {
    for (let ci = 0; ci < list.length; ci++) {
      const c = list[ci];
      const rr = c.r + R;
      if (this.ballPos.distanceToSquared(c.pos) >= rr * rr) continue;
      const n = this.tmp.copy(this.ballPos).sub(c.pos);
      if (n.lengthSq() < 1e-8) n.set(0, 0, 1);
      n.normalize();
      this.ballPos.copy(c.pos).addScaledVector(n, rr + 0.002);
      const speed = this.ballVel.length();
      this.free = true;
      if (who === 'keeper') {
        const a = this.keeper.action;
        // UPDATE 6: the ball only clips a glove at full stretch → fingertip parry, out wide
        const glove = ci < 2; // lHand / rHand
        const outside = Math.abs(this.ballPos.x) > Math.abs(c.pos.x) - 0.04 || this.ballPos.y > c.pos.y + 0.05;
        const fingertip = glove && outside && a !== 'catch' && a !== 'scoop';
        // UPDATE 7 hotfix — BLACK SPIDER: a medium-pace ball into the middle of both gloves
        // is held in the air (power shots and fingertip touches are still parried)
        const aerial = a === 'dive' && this.keeper.special === 'BLACK_SPIDER' && !fingertip &&
          speed < this.cfg.keeper.catchSpeed * 0.92 && this.keeper.ballInBothHands(this.ballPos);
        if (((a === 'catch' || a === 'scoop' || a === 'jump') && speed < this.cfg.keeper.catchSpeed && !fingertip) || aerial) {
          this.caught = true;
          this.ballVel.set(0, 0, 0);
          if (aerial) {
            this.setOutcome('SAVE', 'BLACK SPIDER 공중 캐치!');
            return true;
          }
        } else if (fingertip) {
          // keeps much of its pace, turned away from goal: round the post or over the bar
          const side = Math.sign(this.ballPos.x || c.pos.x || 1);
          const high = this.ballPos.y > FIELD.goalHeight - 0.45;
          this.ballVel.set(
            side * (0.3 * speed + 2.2 + this.rng() * 1.5),
            high ? 3.6 + this.rng() * 1.6 : Math.max(this.ballVel.y * 0.4, 0.8 + this.rng() * 1.2),
            1.2 + 0.1 * speed + this.rng() * 1.2,
          );
          this.detail = '';
          this.setOutcome('SAVE', high ? '손끝으로 크로스바 위로!' : '손끝 선방!');
          return true;
        } else {
          const vn = this.ballVel.dot(n);
          if (vn < 0) this.ballVel.addScaledVector(n, -1.45 * vn);
          this.ballVel.multiplyScalar(0.45);
          this.ballVel.z = Math.max(this.ballVel.z, 2.5 + this.rng() * 2.5);
          this.ballVel.x += Math.sign(this.ballPos.x || this.rng() - 0.5) * (1 + this.rng() * 2.5);
          this.ballVel.y = Math.max(this.ballVel.y, 1.2 + this.rng() * 2);
        }
        this.setOutcome('SAVE', '골키퍼 선방');
      } else {
        const vn = this.ballVel.dot(n);
        if (vn < 0) this.ballVel.addScaledVector(n, -1.4 * vn);
        this.ballVel.multiplyScalar(0.45);
        const aim = this.spot.aim;
        const along = this.ballVel.x * aim.x + this.ballVel.z * aim.z;
        if (along > 0) {
          this.ballVel.x -= 1.6 * along * aim.x;
          this.ballVel.z -= 1.6 * along * aim.z;
        }
        this.setOutcome('BLOCKED', '수비벽에 막힘');
      }
      return true;
    }
    return false;
  }

  /**
   * Posts and crossbar are real cylinders: the ball bounces off them with its
   * actual velocity reflected about the contact normal (some energy lost).
   * Returns true when the ball touched the woodwork this sub-step.
   */
  private hitWoodwork(): boolean {
    const W = FIELD.goalHalfWidth;
    const H = FIELD.goalHeight;
    const rr = FIELD.postRadius + R;
    const p = this.ballPos;
    if (Math.abs(p.z) > rr || p.y > H + rr || Math.abs(p.x) > W + rr) return false;
    const n = this.tmp;
    let hit: '' | 'post' | 'bar' = '';
    for (const s of [-1, 1]) {
      // upright: vertical axis at x = ±W, z = 0
      const dx = p.x - s * W;
      const d = Math.hypot(dx, p.z);
      if (p.y <= H && d < rr) {
        n.set(dx, 0, p.z);
        hit = 'post';
        break;
      }
    }
    if (!hit && Math.abs(p.x) <= W) {
      // crossbar: horizontal axis at y = H, z = 0
      const dy = p.y - H;
      const d = Math.hypot(dy, p.z);
      if (d < rr) {
        n.set(0, dy, p.z);
        hit = 'bar';
      }
    }
    if (!hit) return false;
    if (n.lengthSq() < 1e-10) n.set(0, 0, 1);
    n.normalize();
    // push out of the woodwork, reflect the normal velocity (restitution 0.6)
    const axisDist = hit === 'post' ? Math.hypot(p.x - Math.sign(p.x) * W, p.z) : Math.hypot(p.y - H, p.z);
    p.addScaledVector(n, rr - axisDist + 0.002);
    const vn = this.ballVel.dot(n);
    if (vn < 0) this.ballVel.addScaledVector(n, -1.6 * vn);
    this.ballVel.multiplyScalar(0.9);
    this.woodwork = hit;
    this.goal.impact(p.x, p.y, Math.abs(vn));
    return true;
  }

  private resolveGoalPlane() {
    const W = FIELD.goalHalfWidth;
    const H = FIELD.goalHeight;
    const pr = FIELD.postRadius;
    const ax = Math.abs(this.ballPos.x);
    const y = this.ballPos.y;
    if (ax <= W - pr - R && y <= H - pr - R) {
      this.setOutcome('GOAL', '골!');
      return;
    }
    if (ax <= W + pr + R && y <= H + pr + R) {
      const bar = y > H - pr - R && ax <= W;
      this.ballVel.z = Math.abs(this.ballVel.z) * 0.45;
      if (bar) this.ballVel.y = (y > H ? 1 : -1) * 3;
      else this.ballVel.x = Math.sign(this.ballPos.x) * (Math.abs(this.ballVel.x) * 0.3 + 3) * (ax > W ? 1 : -1);
      this.ballPos.z = pr + R;
      this.setOutcome('MISS', bar ? '크로스바 강타' : '골대 강타');
      return;
    }
    this.setOutcome('MISS', y > H ? '크로스바 위로' : '골대 밖');
  }

  private integrateFree(h: number) {
    this.freeT += h;
    if (this.woodwork && !this.outcome) {
      const p = this.ballPos;
      // rebound inside the goal → in off the woodwork; back out / away → miss
      if (p.z < -R && Math.abs(p.x) < FIELD.goalHalfWidth - R && p.y < FIELD.goalHeight - R) {
        this.setOutcome('GOAL', this.woodwork === 'bar' ? '크로스바 맞고 골!' : '골대 맞고 골!');
      } else if (p.z < -R || p.z > 1.2 || this.freeT > 1.2) {
        this.setOutcome('MISS', this.woodwork === 'bar' ? '크로스바 강타' : '골대 강타');
      }
    }
    if (this.freeT > 6) return;
    let rem = h;
    while (rem > 1e-9) {
      const s = Math.min(SUB, rem);
      rem -= s;
      this.ballVel.y -= G * s;
      this.ballVel.multiplyScalar(1 - 0.08 * s);
      this.ballPos.addScaledVector(this.ballVel, s);
      if (this.ballPos.y < R) {
        this.ballPos.y = R;
        if (this.ballVel.y < -0.6) {
          this.ballVel.y = -this.ballVel.y * 0.48;
          this.ballVel.x *= 0.82;
          this.ballVel.z *= 0.82;
        } else {
          this.ballVel.y = 0;
          const f = Math.max(0, 1 - 1.8 * s);
          this.ballVel.x *= f;
          this.ballVel.z *= f;
        }
      }
      if (this.outcome === 'GOAL') this.containInNet();
      // LED boards behind the goal
      if (this.ballPos.z < -4.3 + R && this.ballPos.z > -4.8 && this.ballPos.y < 1.0) {
        this.ballPos.z = -4.3 + R;
        this.ballVel.z = Math.abs(this.ballVel.z) * 0.3;
      }
    }
  }

  private containInNet() {
    const W = FIELD.goalHalfWidth - 0.03;
    const D = FIELD.goalDepth - 0.05;
    const p = this.ballPos;
    const v = this.ballVel;
    if (p.z < -D + R) {
      p.z = -D + R;
      if (v.z < -1.5) this.goal.impact(p.x, p.y, -v.z);
      v.z = -v.z * 0.1;
      v.x *= 0.5;
      v.y *= 0.5;
    }
    if (Math.abs(p.x) > W - R) {
      p.x = Math.sign(p.x) * (W - R);
      v.x *= -0.15;
    }
    const roof = GoalFrame.roofY(p.z) - R;
    if (p.y > roof) {
      p.y = roof;
      v.y = -Math.abs(v.y) * 0.2;
    }
    if (p.z > -R) {
      p.z = -R;
      v.z = -Math.abs(v.z) * 0.2;
    }
  }
}
