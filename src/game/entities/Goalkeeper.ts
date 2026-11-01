import * as THREE from 'three';
import type { KeeperTuning } from '../core/config';
import { clamp, easeOutCubic, gauss, lerp, smoothstep } from '../core/math';
import { blendPose, Humanoid, type Kit, type MarkerName, type Pose } from './Humanoid';

export interface Collider {
  pos: THREE.Vector3;
  r: number;
}

export type KeeperAction = 'none' | 'dive' | 'catch' | 'scoop' | 'jump';

/**
 * What the keeper is allowed to know about a penalty when he commits: only what
 * a real keeper reads from the kicker's body — the direction the hips/foot open
 * to and how much the body leans back (height). Never the drawn path.
 */
export interface KickerRead {
  ball: THREE.Vector3;
  /** horizontal direction the kicker is striking along */
  heading: THREE.Vector3;
  /** initial rise per metre (from body lean / foot angle) */
  rise: number;
}

const K_READY: Pose = {
  spine: [-0.3, 0, 0], head: [0.22, 0, 0],
  lHip: [0.55, 0, -0.18], rHip: [0.55, 0, 0.18], lKnee: [-0.85, 0, 0], rKnee: [-0.85, 0, 0],
  lAnkle: [0.3, 0, 0], rAnkle: [0.3, 0, 0],
  lShoulder: [0.45, 0, -0.75], rShoulder: [0.45, 0, 0.75], lElbow: [0.9, 0, 0], rElbow: [0.9, 0, 0],
};
/** tensed: lower, wider, hands out — "set" as the kicker strikes */
const K_SET: Pose = {
  spine: [-0.42, 0, 0], head: [0.32, 0, 0],
  lHip: [0.75, 0, -0.26], rHip: [0.75, 0, 0.26], lKnee: [-1.1, 0, 0], rKnee: [-1.1, 0, 0],
  lAnkle: [0.38, 0, 0], rAnkle: [0.38, 0, 0],
  lShoulder: [0.55, 0, -0.95], rShoulder: [0.55, 0, 0.95], lElbow: [0.75, 0, 0], rElbow: [0.75, 0, 0],
};
const K_DIVE: Pose = {
  spine: [0.02, 0, 0], head: [0.05, 0, 0],
  lShoulder: [0.18, 0, -2.75], rShoulder: [0.18, 0, 2.75], lElbow: [0.15, 0, 0], rElbow: [0.15, 0, 0],
  lHip: [0.2, 0, -0.32], rHip: [0.35, 0, 0.22], lKnee: [-0.55, 0, 0], rKnee: [-0.25, 0, 0],
  lAnkle: [0.3, 0, 0], rAnkle: [0.3, 0, 0],
};
const K_CATCH: Pose = {
  spine: [-0.32, 0, 0], head: [0.25, 0, 0],
  lShoulder: [1.3, 0, 0.12], rShoulder: [1.3, 0, -0.12], lElbow: [0.5, 0, 0], rElbow: [0.5, 0, 0],
  lHip: [0.5, 0, -0.14], rHip: [0.5, 0, 0.14], lKnee: [-0.7, 0, 0], rKnee: [-0.7, 0, 0],
  lAnkle: [0.25, 0, 0], rAnkle: [0.25, 0, 0],
};
const K_SCOOP: Pose = {
  spine: [-0.75, 0, 0], head: [0.45, 0, 0],
  lShoulder: [0.75, 0, 0.12], rShoulder: [0.75, 0, -0.12], lElbow: [0.2, 0, 0], rElbow: [0.2, 0, 0],
  lHip: [1.05, 0, -0.12], rHip: [1.05, 0, 0.12], lKnee: [-1.35, 0, 0], rKnee: [-1.35, 0, 0],
  lAnkle: [0.4, 0, 0], rAnkle: [0.4, 0, 0],
};
const K_JUMP: Pose = {
  spine: [0.05, 0, 0], head: [0.2, 0, 0],
  lShoulder: [0.25, 0, -2.85], rShoulder: [0.25, 0, 2.85], lElbow: [0.1, 0, 0], rElbow: [0.1, 0, 0],
  lHip: [0.45, 0, -0.05], rHip: [-0.1, 0, 0.05], lKnee: [-1.0, 0, 0], rKnee: [-0.3, 0, 0],
};
/** side-step: one leg reaching out */
const K_STEP: Pose = {
  ...K_READY,
  lHip: [0.5, 0, -0.42], rHip: [0.6, 0, 0.08], lKnee: [-0.6, 0, 0], rKnee: [-1.0, 0, 0],
};

/** hips → fingertips with arms overhead */
const ARM_REACH = 1.08;
const HIPS_IDLE_Y = 0.82;
const HIPS_SET_Y = 0.74;

const MARKERS: [MarkerName, number][] = [
  ['lHand', 0.17], ['rHand', 0.17], ['lForearm', 0.11], ['rForearm', 0.11],
  ['head', 0.15], ['chest', 0.24], ['pelvis', 0.2],
  ['lKnee', 0.12], ['rKnee', 0.12], ['lFoot', 0.12], ['rFoot', 0.12],
];

export const KEEPER_KIT = {
  jersey: 0xff8a1f,
  trim: 0x161616,
  shorts: 0x161616,
  socks: 0xff8a1f,
  boots: 0x161616,
  skin: 0xe0b08a,
  hair: 0x3a2516,
  gloves: 0xf4f4f4,
  backNumber: '1',
  printColor: '#161616',
};

type Stage = 'idle' | 'set' | 'watch' | 'action';

/**
 * Goalkeeper body + two decision models:
 *
 *  PENALTY  — predictive. Tenses during the run-up, then commits to a guess at
 *             (or a hair before) foot-ball contact, using only the kicker's body
 *             read. Often right, sometimes wrong-footed or stays central.
 *
 *  FREE KICK — reactive. Holds the centre until the ball is struck, waits a
 *             human reaction delay (faster for fast shots), then watches the real
 *             ball (position, velocity, measured curl and drop), side-steps to
 *             cover, and dives/jumps once the ball is close enough. He never sees
 *             the drawn path; a curler fools him until it actually bends.
 *
 * Every movement has real speed and reach limits — no teleporting to the ball.
 */
export class Goalkeeper {
  readonly body: Humanoid;
  readonly home = new THREE.Vector3(0, 0, 0.45);
  readonly colliders: Collider[];
  readonly predicted = new THREE.Vector3();
  action: KeeperAction = 'none';
  stage: Stage = 'idle';
  /** debug/telemetry */
  guess: 'read' | 'wrong' | 'centre' | 'tracked' | null = null;
  reaction = 0;
  committedAt = -1;

  private k!: KeeperTuning;
  private rng: () => number = Math.random;
  private idleT = 0;
  private setT = 0;
  // lateral footwork
  private rootX = 0;
  private rootV = 0;
  private stepGoal = 0;
  private stepPhase = 0;
  // action
  private actT = 0;
  private actDur = 0.5;
  private roll = 0;
  private hipsStart = new THREE.Vector3();
  private hipsTarget = new THREE.Vector3();
  private hipsCur = new THREE.Vector3();
  private actionPose: Pose = K_DIVE;
  private fromPose: Pose = K_READY;
  private pose: Pose = {};
  // free-kick tracking
  private tracking = false;
  private sinceLaunch = 0;
  private hist: { t: number; p: THREE.Vector3; v: THREE.Vector3 }[] = [];
  private bias = new THREE.Vector2();
  private lastEval = -1;
  /** penalty: watching only for a late hand/step adjustment after staying up */
  private lateOnly = false;
  private adjusted = false;

  /** UPDATE 4: a real keeper's looks (hair, beard, skin, name/number) — never his size */
  constructor(look?: { shirt: string; number: string; skin: number; hair: number; hairStyle: Kit['hairStyle']; beard: Kit['beard'] }) {
    this.body = new Humanoid(
      look
        ? { ...KEEPER_KIT, skin: look.skin, hair: look.hair, hairStyle: look.hairStyle, beard: look.beard, backName: look.shirt, backNumber: look.number }
        : KEEPER_KIT,
    );
    this.body.root.rotation.y = Math.PI; // faces the kicker (+z)
    this.colliders = MARKERS.map(([, r]) => ({ pos: new THREE.Vector3(), r }));
    this.reset();
  }

  reset() {
    this.action = 'none';
    this.stage = 'idle';
    this.guess = null;
    this.reaction = 0;
    this.committedAt = -1;
    this.tracking = false;
    this.sinceLaunch = 0;
    this.hist = [];
    this.lastEval = -1;
    this.lateOnly = false;
    this.adjusted = false;
    this.rootX = this.rootV = this.stepGoal = 0;
    this.roll = 0;
    this.setT = 0;
    this.body.root.position.copy(this.home);
    this.applyStance(0);
  }

  get committed() {
    return this.stage === 'action';
  }

  get feetX() {
    return this.home.x + this.rootX;
  }

  // ── shared entry points ────────────────────────────────────────────────
  /** Kicker has started the run-up: get set (crouch, weight forward). No sideways move. */
  prepare(k: KeeperTuning, rng: () => number) {
    this.k = k;
    this.rng = rng;
    if (this.stage === 'idle') {
      this.stage = 'set';
      this.setT = 0;
    }
  }

  // ── PENALTY: predict from the kicker ──────────────────────────────────
  /** Called at (or a few ms before) foot-ball contact. Uses only the body read. */
  predictPenalty(read: KickerRead) {
    if (this.stage === 'action') return;
    const k = this.k;
    const kz = this.home.z;
    // where the kicker's body says the ball is going
    const run = (read.ball.z - kz) / Math.max(0.2, -read.heading.z);
    let x = read.ball.x + read.heading.x * run;
    let y = read.ball.y + read.rise * run;
    const r = this.rng();
    if (r < k.guessCorrect) {
      this.guess = 'read';
      x += gauss(this.rng) * k.readNoise;
      y += gauss(this.rng) * k.readNoise * 0.7;
    } else if (r < k.guessCorrect + k.guessCentre) {
      this.guess = 'centre';
      x = gauss(this.rng) * 0.25;
      y = 0.9 + this.rng() * 0.5;
    } else {
      this.guess = 'wrong';
      const side = Math.abs(x) > 0.4 ? -Math.sign(x) : this.rng() < 0.5 ? -1 : 1;
      x = side * (1.4 + this.rng() * 1.6);
      y = 0.3 + this.rng() * 1.6;
    }
    this.commit(clamp(x, -3.9, 3.9), clamp(y, 0.15, 2.5));
  }

  // ── FREE KICK: react to the real ball ─────────────────────────────────
  /**
   * Penalty, after his guess: a keeper who stayed on his feet (catch/scoop) can
   * still react to the real ball once — a committed dive cannot change direction.
   */
  watchAfterGuess() {
    this.lateOnly = true;
    this.adjusted = false;
    this.tracking = true;
    this.sinceLaunch = 0;
    this.hist = [];
    this.reaction = 0.2 + this.rng() * 0.08;
    this.bias.set(gauss(this.rng) * 0.2, gauss(this.rng) * 0.1);
  }

  /** Ball has left the boot. Only its observed speed sets the reaction time. */
  startTracking(launchSpeed: number) {
    const k = this.k;
    const fast = clamp((launchSpeed - 15) / 15, 0, 1);
    this.reaction = clamp(lerp(k.reactionMax, k.reactionMin, fast) + (this.rng() - 0.5) * 0.05, k.reactionMin, k.reactionMax);
    this.tracking = true;
    this.sinceLaunch = 0;
    this.hist = [];
    this.stage = 'watch';
    this.guess = 'tracked';
    // a persistent per-shot misjudgement that shrinks as the ball approaches
    this.bias.set(gauss(this.rng) * k.readNoise, gauss(this.rng) * k.readNoise * 0.6);
  }

  /** Called every sim step with the ball's actual state (nothing else). */
  observe(pos: THREE.Vector3, vel: THREE.Vector3, dt: number) {
    if (!this.tracking) return;
    this.sinceLaunch += dt;
    this.hist.push({ t: this.sinceLaunch, p: pos.clone(), v: vel.clone() });
    while (this.hist.length > 2 && this.hist[0].t < this.sinceLaunch - 0.14) this.hist.shift();
    if (this.sinceLaunch < this.reaction) return;
    if (this.stage === 'action' && !(this.lateOnly && !this.adjusted && (this.action === 'catch' || this.action === 'scoop'))) return;
    if (this.sinceLaunch - this.lastEval < 0.05) return; // re-evaluate ~20×/s
    this.lastEval = this.sinceLaunch;

    // estimate acceleration (curl + drop) from the recent velocity change
    const a = new THREE.Vector3();
    const h0 = this.hist[0];
    const span = this.sinceLaunch - h0.t;
    if (span > 0.04) a.subVectors(vel, h0.v).divideScalar(span);
    a.clampLength(0, 40);
    if (vel.z > -0.5) return; // ball not heading to goal (deflected)
    // time until the ball reaches the keeper's plane (quadratic in z)
    const kz = this.home.z;
    const dz = kz - pos.z;
    let tArr = dz / vel.z;
    if (Math.abs(a.z) > 0.1) {
      const disc = vel.z * vel.z + 2 * a.z * dz;
      if (disc > 0) {
        const t1 = (-vel.z - Math.sqrt(disc)) / a.z;
        const t2 = (-vel.z + Math.sqrt(disc)) / a.z;
        const cands = [t1, t2].filter((t) => t > 0);
        if (cands.length) tArr = Math.min(...cands);
      }
    }
    if (!(tArr > 0)) return;
    // perception error fades as the ball comes closer
    const blur = clamp(tArr / 0.7, 0.35, 1);
    const px = pos.x + vel.x * tArr + 0.5 * a.x * tArr * tArr + this.bias.x * blur;
    const py = pos.y + vel.y * tArr + 0.5 * a.y * tArr * tArr + this.bias.y * blur;
    this.predicted.set(px, clamp(py, 0.1, 3.2), kz);

    if (this.lateOnly) {
      // one late reach from a standing keeper: a step and a stretch, not a full dive
      this.adjusted = true;
      if (Math.abs(px - this.feetX) > 0.3 && Math.abs(px - this.feetX) < 1.9 && py < 2.4) {
        this.commit(px, clamp(py, 0.12, 2.4));
        this.actDur = Math.min(this.actDur, Math.max(0.2, tArr));
      }
      return;
    }
    // going clearly wide/high: watch it, no dive
    if (Math.abs(px) > 4.4 || py > 3.0) {
      this.stepGoal = clamp(px, -1, 1) * 0.5;
      return;
    }
    // footwork: shuffle across to cover the line (1–2 steps)
    this.stepGoal = clamp(px * 0.75, -this.k.stepRange, this.k.stepRange);
    // commit when there is just enough time left for the save
    const dx = px - this.feetX;
    const dy = py - HIPS_IDLE_Y;
    const travel = Math.max(0, Math.hypot(dx, dy) - ARM_REACH);
    const need = this.actionDuration(travel) * 1.1 + 0.06; // commits before he is certain
    const close = Math.abs(dx) < 0.5 && py < 1.8;
    if (tArr <= need || (close && tArr < 0.28)) this.commit(px, clamp(py, 0.12, 2.6));
  }

  /** Online PvP: a person chose where to go — same body limits as the AI (speed, reach). */
  diveTo(px: number, py: number) {
    if (this.stage === 'action') return;
    this.guess = null;
    this.commit(clamp(px, -3.9, 3.9), clamp(py, 0.12, 2.6));
  }

  // ── action (shared) ───────────────────────────────────────────────────
  private actionDuration(travel: number) {
    return clamp(this.k.diveBase + this.k.diveScale * travel, this.k.diveBase, this.k.diveBase + this.k.diveScale * this.k.maxHipTravel);
  }

  private commit(px: number, py: number) {
    this.predicted.set(px, py, this.home.z);
    this.stage = 'action';
    this.committedAt = this.tracking ? this.sinceLaunch : 0;
    this.actT = 0;
    this.fromPose = { ...this.pose };
    this.hipsStart.copy(this.body.joints.hips.position);
    const k = this.k;
    // keeper root is rotated 180°: local x = -(world x - feet x)
    const vx = px - this.feetX;
    const vy = py - HIPS_IDLE_Y;
    const lx = -vx;
    const base = new THREE.Vector3(0, HIPS_IDLE_Y, 0);
    let travel = 0;
    if (Math.abs(vx) < 0.55 && py < 1.8) {
      if (py < 0.5) {
        this.action = 'scoop';
        this.actionPose = K_SCOOP;
        this.hipsTarget.set(lx * 0.9, -0.22, 0).add(base);
      } else {
        this.action = 'catch';
        this.actionPose = K_CATCH;
        this.hipsTarget.set(lx * 0.9, clamp(py - 1.25, -0.25, 0.15), 0).add(base);
      }
      this.roll = 0;
      travel = Math.abs(vx);
    } else if (Math.abs(vx) < 1.0 && py >= 1.8) {
      this.action = 'jump';
      this.actionPose = K_JUMP;
      this.hipsTarget.set(lx * 0.8, clamp(py - ARM_REACH - HIPS_IDLE_Y + 0.05, 0, 0.55), 0).add(base);
      this.roll = Math.atan2(-lx, Math.max(0.5, vy)) * 0.5;
      travel = 0.6;
    } else {
      this.action = 'dive';
      this.actionPose = K_DIVE;
      const len = Math.hypot(vx, vy);
      travel = clamp(len - ARM_REACH, 0, k.maxHipTravel);
      this.hipsTarget.set((lx / len) * travel, clamp(HIPS_IDLE_Y + (vy / len) * travel, 0.42, 1.45), 0);
      this.roll = clamp(Math.atan2(-lx, vy), -1.5, 1.5);
    }
    this.actDur = this.actionDuration(travel);
    this.rootV = 0;
    this.stepGoal = this.rootX;
  }

  // ── per-step animation ────────────────────────────────────────────────
  private applyStance(t: number) {
    const set = this.stage === 'set' || this.stage === 'watch' ? smoothstep(this.setT / 0.35) : 0;
    blendPose(K_READY, K_SET, set, this.pose);
    // footwork: alternate a reaching step while moving sideways
    const moving = Math.min(1, Math.abs(this.rootV) / 1.5);
    if (moving > 0.02) {
      const s = Math.abs(Math.sin(this.stepPhase));
      blendPose(this.pose, K_STEP, s * moving, this.pose);
    }
    this.body.applyPose(this.pose);
    const bob = this.stage === 'idle' ? Math.sin(t * 3.1) * 0.012 : Math.sin(t * 7) * 0.006;
    const y = lerp(HIPS_IDLE_Y, HIPS_SET_Y, set) + bob - moving * 0.03;
    this.body.joints.hips.position.set(0, y, 0);
    this.body.joints.hips.rotation.z = 0;
    this.hipsCur.set(0, y, 0);
  }

  update(dt: number) {
    this.idleT += dt;
    if (this.stage === 'set' || this.stage === 'watch') this.setT += dt;

    // lateral footwork (only after the strike, free kick)
    if (this.stage === 'watch') {
      const k = this.k;
      const err = this.stepGoal - this.rootX;
      const want = clamp(err * 6, -k.stepSpeed, k.stepSpeed);
      this.rootV += clamp(want - this.rootV, -16 * dt, 16 * dt);
      this.rootX += this.rootV * dt;
      this.stepPhase += Math.abs(this.rootV) * dt * 4.5;
    } else if (this.stage !== 'action') {
      this.rootV = 0;
    }
    this.body.root.position.set(this.home.x + this.rootX, 0, this.home.z);

    if (this.stage !== 'action') {
      this.applyStance(this.idleT);
      return;
    }
    // action: explosive but not instantaneous
    this.actT += dt;
    const u = this.actT / this.actDur;
    const e = easeOutCubic(Math.pow(clamp(u, 0, 1), 1.25));
    blendPose(this.fromPose, this.actionPose, smoothstep(Math.min(1, u * 1.6)), this.pose);
    this.body.applyPose(this.pose);
    this.hipsCur.lerpVectors(this.hipsStart, this.hipsTarget, e);
    const after = Math.max(0, (u - 1) * this.actDur);
    if (this.action === 'dive') {
      this.hipsCur.y += Math.sin(Math.PI * Math.min(1, u)) * 0.16;
      if (after > 0) this.hipsCur.y = lerp(this.hipsTarget.y, 0.3, smoothstep(after / 0.32));
    } else if (this.action === 'jump' && after > 0) {
      this.hipsCur.y = lerp(this.hipsTarget.y, HIPS_IDLE_Y, smoothstep(after / 0.35));
    }
    this.body.joints.hips.position.copy(this.hipsCur);
    this.body.joints.hips.rotation.z = this.roll * e;
  }

  /** world x of the hips (for tests/telemetry) */
  hipsWorldX() {
    this.body.root.updateMatrixWorld(true);
    return this.body.joints.hips.getWorldPosition(new THREE.Vector3()).x;
  }

  updateColliders() {
    this.body.root.updateMatrixWorld(true);
    for (let i = 0; i < MARKERS.length; i++) this.body.markerWorld(MARKERS[i][0], this.colliders[i].pos);
  }

  handsCenter(out: THREE.Vector3) {
    const a = this.body.markerWorld('lHand', new THREE.Vector3());
    const b = this.body.markerWorld('rHand', out);
    return b.add(a).multiplyScalar(0.5);
  }
}
