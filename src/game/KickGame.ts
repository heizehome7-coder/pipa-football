import * as THREE from 'three';
import { FIELD, type ModeConfig } from './core/config';
import { mulberry32 } from './core/math';
import type { Phase, ShotInput, ShotOutcome } from './core/types';
import { Ball } from './entities/Ball';
import { DefensiveWall } from './entities/DefensiveWall';
import { Goalkeeper, type Collider } from './entities/Goalkeeper';
import { Kicker, type KickStyle } from './entities/Player';
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
}

export interface KickGameListener {
  onPhase?(p: Phase): void;
  onOutcome?(o: ShotOutcome, detail: string): void;
  onLaunch?(plan: ShotPlan): void;
}

const R = FIELD.ballRadius;
const G = FIELD.gravity;
const STEP = 1 / 120; // fixed simulation step → deterministic, frame-rate independent
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
  private resultT = 0;
  private sideSpin = 0;
  private keeperLead = 0;
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
    this.kicker = new Kicker(opts.nickname);
    this.keeper = new Goalkeeper();
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
    this.kicker.kick(this.spot.ball, aim, () => this.launch());
    // keeper gets set as the run-up starts; penalty keepers commit a hair before contact
    this.keeper.prepare(this.cfg.keeper, this.rng);
    this.keeperLead = this.rng() * this.cfg.keeper.leadMax;
    this.setPhase('runup');
    return true;
  }

  canContinue() {
    return this.phase === 'result' && this.resultT > 0.7;
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
    if (this.style === 'freekick') this.keeper.startTracking(shotVelocityAt(this.plan, 0).length());
    else this.keeper.watchAfterGuess();
    this.wall?.jump();
    this.setPhase('flight');
    this.listener.onLaunch?.(this.plan);
  }

  private step(h: number) {
    this.kicker.update(h);
    if (this.style === 'penalty' && this.plan && !this.keeper.committed && this.phase !== 'aim' &&
        this.kicker.elapsed >= this.kicker.contactTime - this.keeperLead) {
      // penalty: guess from the kicker's body (strike direction + lean), not the path
      // the body read: hips/shoulders square up to where the ball is being sent over
      // the first metres (strike direction + early bend), plus lean-back for height
      const early = this.plan.curve3.getPointAt(0.3);
      const heading = new THREE.Vector3(early.x - this.spot.ball.x, 0, early.z - this.spot.ball.z).normalize();
      const flat = Math.hypot(early.x - this.spot.ball.x, early.z - this.spot.ball.z) || 1;
      this.keeper.predictPenalty({ ball: this.spot.ball, heading, rise: (early.y - this.spot.ball.y) / flat });
    }
    this.keeper.update(h);
    this.wall?.update(h);
    if (this.phase === 'result') this.resultT += h;
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
      if (crossing) {
        this.resolveGoalPlane();
        this.free = true;
        if (remaining > 0) this.integrateFree(remaining);
        break;
      }
    }
  }

  private collide(list: Collider[], who: 'wall' | 'keeper'): boolean {
    for (const c of list) {
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
        if ((a === 'catch' || a === 'scoop' || a === 'jump') && speed < this.cfg.keeper.catchSpeed) {
          this.caught = true;
          this.ballVel.set(0, 0, 0);
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
