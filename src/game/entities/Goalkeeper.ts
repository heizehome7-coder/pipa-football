import * as THREE from 'three';
import type { KeeperTuning } from '../core/config';
import { clamp, easeOutCubic, gauss, lerp, smoothstep } from '../core/math';
import { blendPose, Humanoid, mirrorPose, type Kit, type MarkerName, type Pose } from './Humanoid';
import type { GkStats, SpecialId } from '../../players/players';

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
// UPDATE 7 hotfix: both gloves reach TOGETHER towards the ball (no wide-spread arms)
const K_DIVE: Pose = {
  spine: [0.02, 0, 0], head: [0.05, 0, 0],
  lShoulder: [0.18, 0, -3.1], rShoulder: [0.18, 0, 3.1], lElbow: [0.12, 0, 0], rElbow: [0.12, 0, 0],
  lHip: [0.2, 0, -0.32], rHip: [0.35, 0, 0.22], lKnee: [-0.55, 0, 0], rKnee: [-0.25, 0, 0],
  lAnkle: [0.3, 0, 0], rAnkle: [0.3, 0, 0],
};
/** UPDATE 5: low dive — arms reach out low and forward, body flatter */
const K_DIVE_LOW: Pose = {
  ...K_DIVE,
  spine: [-0.1, 0, 0],
  lShoulder: [0.5, 0, -2.95], rShoulder: [0.5, 0, 2.95], lElbow: [0.08, 0, 0], rElbow: [0.08, 0, 0],
  lHip: [0.1, 0, -0.25], rHip: [0.15, 0, 0.18],
};
/** high dive — arms right above the head, body more upright */
const K_DIVE_HIGH: Pose = {
  ...K_DIVE,
  lShoulder: [0.05, 0, -3.18], rShoulder: [0.05, 0, 3.18], lElbow: [0.05, 0, 0], rElbow: [0.05, 0, 0],
  lHip: [0.3, 0, -0.38], rHip: [0.5, 0, 0.25], lKnee: [-0.8, 0, 0],
};
/** loading the legs + side step before the push */
const K_LOAD: Pose = {
  spine: [-0.45, 0, 0], head: [0.3, 0, 0],
  lHip: [0.85, 0, -0.38], rHip: [0.85, 0, 0.3], lKnee: [-1.25, 0, 0], rKnee: [-1.15, 0, 0],
  lAnkle: [0.45, 0, 0], rAnkle: [0.4, 0, 0],
  lShoulder: [0.6, 0, -0.95], rShoulder: [0.6, 0, 0.95], lElbow: [0.7, 0, 0], rElbow: [0.7, 0, 0],
};
const K_FIST: Pose = {
  spine: [0.05, 0, 0], head: [-0.25, 0, 0],
  lShoulder: [0.25, 0, -0.45], rShoulder: [0.6, 0, 2.6], lElbow: [1.4, 0, 0], rElbow: [1.6, 0, 0],
  lHip: [0.1, 0, -0.12], rHip: [0.1, 0, 0.12],
};
const K_DEJECTED: Pose = {
  spine: [-0.25, 0, 0], head: [0.6, 0, 0],
  lShoulder: [0, 0, -0.15], rShoulder: [0, 0, 0.15], lElbow: [0.2, 0, 0], rElbow: [0.2, 0, 0],
  lHip: [0.15, 0, -0.1], rHip: [0.15, 0, 0.1], lKnee: [-0.25, 0, 0], rKnee: [-0.25, 0, 0],
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
/** a stat as a small signed step: 90 → 0, 99 → +1, 81 → −1 (clamped) */
const sd = (v: number, mid = 90, span = 9) => clamp((v - mid) / span, -1.2, 1.1);
/**
 * UPDATE 6 keeper buff — REACH only (reaction, prediction and dive start untouched):
 *   arms +4 %, gloves +3 cm, dive travel +4.5 %, and the gloves' effective reach from the
 *   chest +10 % while stretching (fingertips) → about +5–7 % save range at full extension.
 */
export const KEEPER_BUFF = { arm: 1.04, glove: 0.03, travel: 1.045 } as const;
/**
 * UPDATE 7 hotfix — the dive is a real jump, not a slide to a point:
 *   READY → weight shift / side load → push-off (far leg) → take-off → full extension
 *   → a short hang at full stretch → fall to the grass.
 * The hips fly on a velocity arc (fast off the ground, slowing at full stretch); the reach
 * gain is in the body (hip travel + arms that visibly lengthen at full stretch), so the
 * gloves you see are exactly where the ball is stopped (no invisible collider stretch).
 *   push   — load + push-off time (s) before the feet leave the grass
 *   travel — extra hip travel at full stretch (horizontal +8–12 % reach overall)
 *   high / low — extra travel for high dives (+10–15 %) / low dives (+6–10 %)
 *   stretch — how far the arms lengthen at full extension (visible)
 *   hang   — time held at full stretch before the body starts to drop
 *   noise  — the tiny execution error (±) on travel; never a random save
 */
export const DIVE = { push: 0.1, travel: 1.015, high: 1.08, low: 1.0, stretch: 0.045, hang: 0.18, noise: 0.012 } as const;
/** UPDATE 7 hotfix: a human dive started right at the strike (not long before) */
/** how much of the dive depth comes from the keeper's read of the strike (0 = always full depth) */
export const DEPTH_READ = 0.3;
export const PERFECT_WINDOW = { before: 0.12, after: 0.07 } as const;
const HIPS_IDLE_Y = 0.82;
const HIPS_SET_Y = 0.74;

const MARKERS: [MarkerName, number][] = [
  ['lHand', 0.16], ['rHand', 0.16], ['lForearm', 0.11], ['rForearm', 0.11],
  ['head', 0.15], ['chest', 0.24], ['pelvis', 0.2],
  ['lKnee', 0.12], ['rKnee', 0.12], ['lFoot', 0.12], ['rFoot', 0.12],
  // UPDATE 7 hotfix: the upper arms block too (no hole between the head and the forearms)
  ['lUpperArm', 0.1], ['rUpperArm', 0.1],
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
  private loadPose: Pose = K_LOAD;
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
  /** UPDATE 5: the keeper's abilities (null = neutral standard keeper) */
  readonly stats: GkStats | null;
  /** hands' reach beyond the hips (REACH; LOW/HIGH SAVE per dive height) */
  private armReach = ARM_REACH;
  /** UPDATE 5 dive animation: which arm leads (+1 right arm, −1 left) and dive height 0 low … 1 high */
  private lead = 1;
  private diveH = 0.5;
  /** post-shot reaction */
  private reactKind: '' | 'save' | 'goal' | 'miss' = '';
  private reactT = 0;
  private reactFrom: Pose = {};
  private reactHips = new THREE.Vector3();
  private reactRoll = 0;
  // UPDATE 7 hotfix: phased dive
  private pushT = 0.1;
  private flightT = 0.3;
  private hangT = 0.15;
  private hipsLaunch = new THREE.Vector3();
  private arc = 0.1;
  private drift = 0;
  /** 0 … 1: arms at full stretch (visible arm length) */
  private ext = 0;
  private perfect = false;

  /** UPDATE 7 hotfix: the keeper's special (LONG REACH, HIGH REACH, LOW SAVE, BLACK SPIDER …) */
  readonly special: SpecialId | null;

  constructor(look?: { shirt: string; number: string; skin: number; hair: number; hairStyle: Kit['hairStyle']; beard: Kit['beard'] }, stats?: GkStats, special?: SpecialId | null) {
    this.stats = stats ?? null;
    this.special = stats ? special ?? null : null;
    this.body = new Humanoid(
      look
        ? { ...KEEPER_KIT, skin: look.skin, hair: look.hair, hairStyle: look.hairStyle, beard: look.beard, backName: look.shirt, backNumber: look.number }
        : KEEPER_KIT,
    );
    this.body.root.rotation.y = Math.PI; // faces the kicker (+z)
    this.setArmStretch(0);
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
    this.reactKind = '';
    this.reactT = 0;
    this.setT = 0;
    this.ext = 0;
    this.perfect = false;
    this.setArmStretch(0);
    this.body.root.position.copy(this.home);
    this.applyStance(0);
  }

  /** 0 … 1: how far the arms are into full stretch (debug / tests) */
  get armStretch() {
    return this.ext;
  }
  /** dive phase timings (debug / tests) */
  get diveTimes() {
    return { push: this.pushT, flight: this.flightT, hang: this.hangT, perfect: this.perfect };
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
    this.k = this.tuned(k);
    this.rng = rng;
    if (this.stage === 'idle') {
      this.stage = 'set';
      this.setT = 0;
    }
  }

  /**
   * UPDATE 5 abilities as small modifiers (a 90-rated keeper = the standard keeper):
   *   DIVING → quicker dive · REACH → longer stretch · REFLEX → quicker AI reaction
   *   POSITIONING → steadier AI read · PENALTY READ → AI guesses right more often
   * They never choose a direction for a human keeper online.
   */
  private tuned(base: KeeperTuning): KeeperTuning {
    const k = { ...base, maxHipTravel: base.maxHipTravel * KEEPER_BUFF.travel * DIVE.travel };
    const g = this.stats;
    if (!g) return k;
    const sp = this.special;
    return {
      ...k,
      // DIVING: a quicker, more explosive dive · REACH: more hip travel
      diveBase: k.diveBase * (1 - 0.07 * sd(g.diving)),
      diveScale: k.diveScale * (1 - 0.07 * sd(g.diving)),
      maxHipTravel: k.maxHipTravel * (1 + 0.03 * sd(g.reach)) * (sp === 'LONG_REACH' ? 1.015 : 1),
      // AI only: REFLEX (reaction), POSITIONING (read), PENALTY READ (guess)
      reactionMin: k.reactionMin * (1 - 0.1 * sd(g.reflex)),
      reactionMax: k.reactionMax * (1 - 0.1 * sd(g.reflex)),
      readNoise: k.readNoise * (1 - 0.14 * sd(g.positioning)) * (sp === 'POSITION_MASTER' ? 0.88 : 1),
      guessCorrect: Math.min(0.85, k.guessCorrect + 0.07 * sd(g.penaltyRead) + (sp === 'PENALTY_SPECIALIST' ? 0.04 : 0)),
    };
  }

  /** REACH lengthens the arms a touch; at full stretch they lengthen a little more (visible) */
  private get armScale() {
    return KEEPER_BUFF.arm * (this.stats ? 1 + 0.025 * sd(this.stats.reach) : 1);
  }
  private get stretchGain() {
    const g = this.stats;
    let s = DIVE.stretch * (g ? 1 + 0.2 * sd(g.reach) : 1);
    if (this.special === 'BLACK_SPIDER') s += 0.08; // hand reach +8–10 % at full stretch
    return s;
  }
  private setArmStretch(e: number) {
    this.ext = e;
    const a = this.armScale * (1 + this.stretchGain * e);
    this.body.joints.lShoulder.scale.set(1, a, 1);
    this.body.joints.rShoulder.scale.set(1, a, 1);
  }
  private reachFor(_py: number) {
    // the stretch is extra reach at full extension, on top of where he aims his gloves
    return ARM_REACH * this.armScale;
  }
  /** LOW SAVE / HIGH SAVE (+ specials): more dive travel towards low / high balls */
  private travelFor(py: number) {
    const g = this.stats;
    const sp = this.special;
    if (py < 0.7) return DIVE.low * (g ? 1 + 0.025 * sd(g.lowSave, 94, 5) : 1) * (sp === 'LOW_SAVE' ? 1.035 : 1);
    if (py > 1.6) return DIVE.high * (g ? 1 + 0.025 * sd(g.highSave, 94, 5) : 1) * (sp === 'HIGH_REACH' ? 1.04 : sp === 'BLACK_SPIDER' ? 1.07 : 1);
    return 1;
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
    const travel = Math.max(0, Math.hypot(dx, dy) - this.reachFor(py));
    const need = this.actionDuration(travel) * 1.1 + 0.06; // commits before he is certain
    const close = Math.abs(dx) < 0.5 && py < 1.8;
    if (tArr <= need || (close && tArr < 0.28)) this.commit(px, clamp(py, 0.12, 2.6));
  }

  /** Online PvP: a person chose where to go — same body limits as the AI (speed, reach). */
  diveTo(px: number, py: number, perfect = false, read?: { x: number; y: number }) {
    if (this.stage === 'action') return;
    this.guess = null;
    this.perfect = perfect;
    if (read) {
      // UPDATE 7 hotfix: the direction is the player's; how DEEP he flies along it is the
      // keeper's instinct from the strike (the boot's line, never the curl) — so a corner
      // dive does not fly past a ball struck closer to him. Never shorter than 60 %.
      const dx = px - this.feetX;
      const dy = py - HIPS_IDLE_Y;
      const L = Math.hypot(dx, dy);
      if (L > 2.2) {
        const proj = ((read.x - this.feetX) * dx + (read.y - HIPS_IDLE_Y) * dy) / L;
        const want = lerp(L, clamp(proj + 0.25, L * 0.6, L), py > 1.5 ? DEPTH_READ * 2 : DEPTH_READ);
        px = this.feetX + (dx / L) * want;
        py = HIPS_IDLE_Y + (dy / L) * want;
        // and a little higher / lower towards the strike's line when it is on his side
        if (proj > 0) {
          const perp = (-(read.x - this.feetX) * dy + (read.y - HIPS_IDLE_Y) * dx) / L;
          const shift = clamp(perp * 0.3, -0.25, 0.25);
          px += (-dy / L) * shift;
          py += (dx / L) * shift;
        }
      }
    }
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
    const dvAll = this.stats ? sd(this.stats.diving) : 0;
    this.hangT = DIVE.hang * (1 + 0.3 * dvAll) * (this.special === 'BLACK_SPIDER' ? 1.08 : 1);
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
      this.hipsTarget.set(lx * 0.8, clamp(py - this.reachFor(py) - HIPS_IDLE_Y + 0.05, 0, this.special === 'BLACK_SPIDER' ? 0.62 : 0.56), 0).add(base);
      this.roll = Math.atan2(-lx, Math.max(0.5, vy)) * 0.5;
      travel = 0.6;
    } else {
      this.action = 'dive';
      const len = Math.hypot(vx, vy);
      this.armReach = this.reachFor(py);
      const g = this.stats;
      const sp = this.special;
      // the tiny execution error (deterministic: the game's own seeded rng)
      const err = 1 + (this.rng() - 0.5) * 2 * DIVE.noise;
      const bonus = this.perfect ? 1.05 : 1; // perfect timing: a cleaner, longer push
      // the reactive free-kick AI keeps its UPDATE 6 difficulty (single-player balance)
      const fkAi = this.tracking && !this.lateOnly ? 1 / DIVE.travel : 1;
      travel = clamp(len - this.armReach, 0, k.maxHipTravel * this.travelFor(py) * err * bonus * fkAi);
      this.hipsTarget.set((lx / len) * travel, clamp(HIPS_IDLE_Y + (vy / len) * travel, 0.4, 1.5), 0);
      this.roll = clamp(Math.atan2(-lx, vy), -1.5, 1.5);
      // LOW / MID / HIGH dive, mirrored for the side (the far leg pushes, the near arm leads)
      this.diveH = clamp((py - 0.35) / 1.7, 0, 1);
      const pose =
        this.diveH < 0.5 ? blendPose(K_DIVE_LOW, K_DIVE, this.diveH * 2, {}) : blendPose(K_DIVE, K_DIVE_HIGH, (this.diveH - 0.5) * 2, {});
      const side = lx >= 0 ? 1 : -1;
      this.actionPose = side > 0 ? pose : mirrorPose(pose);
      this.loadPose = side > 0 ? K_LOAD : mirrorPose(K_LOAD);
      // phases: push-off (DIVING, REFLEX a touch, POSITION MASTER, LOW SAVE low) → flight → hang
      const dv = g ? sd(g.diving) : 0;
      const rf = g ? sd(g.reflex) : 0;
      this.pushT =
        DIVE.push * (1 - 0.14 * dv) * (1 - 0.03 * rf) * (this.perfect ? 0.8 : 1) *
        (sp === 'BLACK_SPIDER' ? 0.9 : sp === 'POSITION_MASTER' ? 0.95 : 1) *
        (sp === 'LOW_SAVE' && py < 0.7 ? 0.9 : 1) * (py < 0.7 ? 0.85 : py > 1.6 ? 1.1 : 1);
      const total = this.actionDuration(travel);
      this.flightT = Math.max(0.16, total - this.pushT);
      this.hangT = DIVE.hang * (1 + 0.3 * dv) * (sp === 'BLACK_SPIDER' ? 1.08 : 1) * (py > 1.6 ? 1.2 : py < 0.7 ? 0.7 : 1);
      // a short step/weight shift before take-off, the rest in the air
      this.hipsLaunch.set(this.hipsStart.x + (lx / len) * 0.14, HIPS_SET_Y - 0.03, 0);
      this.arc = py < 0.7 ? 0.1 : py > 1.6 ? 0.12 : 0.22;
      this.drift = (lx / len) * 0.07;
    }
    this.lead = lx >= 0 ? 1 : -1;
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
    let roll = this.roll * e;
    if (this.action === 'dive') {
      roll = this.updateDive();
    } else {
      blendPose(this.fromPose, this.actionPose, smoothstep(Math.min(1, u * 1.6)), this.pose);
      this.hipsCur.lerpVectors(this.hipsStart, this.hipsTarget, e);
      this.setArmStretch(this.action === 'jump' ? smoothstep((u - 0.4) / 0.6) : 0);
      const after = Math.max(0, (u - 1) * this.actDur);
      if (this.action === 'jump') {
        // a jump hangs a moment at the top before coming down
        const hang = this.hangT * 0.8;
        if (after > hang) this.hipsCur.y = lerp(this.hipsTarget.y, HIPS_IDLE_Y, smoothstep((after - hang) / 0.35));
      }
    }
    if (this.reactKind) roll = this.applyReaction(dt, roll);
    this.body.applyPose(this.pose);
    this.body.joints.hips.position.copy(this.hipsCur);
    this.body.joints.hips.rotation.z = roll;
  }

  /**
   * UPDATE 7 hotfix — the phased dive. Returns the body roll.
   *   push   : weight onto the far leg, a side load-step, hips dip → push-off
   *   flight : hips leave on a velocity arc (fast first, slowing as the body extends),
   *            lead arm first, then the other; arms lengthen into full stretch
   *   hang   : held at full stretch, drifting on with the momentum, dropping slowly
   *   fall   : gravity takes over → side landing on the grass
   */
  private updateDive() {
    const t = this.actT;
    const P = this.pushT;
    const F = this.flightT;
    const Hh = this.hangT;
    let roll: number;
    if (t < P) {
      const s = t / P;
      blendPose(this.fromPose, this.loadPose, smoothstep(s), this.pose);
      this.hipsCur.lerpVectors(this.hipsStart, this.hipsLaunch, smoothstep(s));
      roll = this.roll * 0.12 * s;
      this.setArmStretch(0);
    } else if (t < P + F) {
      const s = (t - P) / F;
      // take-off: high initial speed, slowing into the stretch (not a linear slide)
      const h = 1 - Math.pow(1 - s, 2.1);
      const v = 1 - Math.pow(1 - s, 1.6);
      this.hipsCur.set(
        lerp(this.hipsLaunch.x, this.hipsTarget.x, h),
        lerp(this.hipsLaunch.y, this.hipsTarget.y, v) + this.arc * Math.sin(Math.PI * Math.min(1, s * 1.15)),
        0,
      );
      blendPose(this.loadPose, this.actionPose, smoothstep(s / 0.6), this.pose);
      const leadArm = smoothstep(Math.min(1, s * 1.9));
      const otherArm = smoothstep(clamp((s - 0.12) * 1.7, 0, 1));
      const [lw, rw] = this.lead > 0 ? [otherArm, leadArm] : [leadArm, otherArm];
      for (const [j, w] of [['lShoulder', lw], ['lElbow', lw], ['rShoulder', rw], ['rElbow', rw]] as const) {
        const a = this.loadPose[j] ?? [0, 0, 0];
        const b = this.actionPose[j] ?? [0, 0, 0];
        this.pose[j] = [lerp(a[0], b[0], w), lerp(a[1], b[1], w), lerp(a[2], b[2], w)];
      }
      roll = this.roll * (0.12 + 0.88 * smoothstep(s / 0.75));
      this.setArmStretch(smoothstep((s - 0.45) / 0.55));
    } else {
      blendPose(this.actionPose, this.actionPose, 0, this.pose);
      const tf = t - P - F;
      if (tf < Hh) {
        // hang time: still at full stretch, carried on a little by the momentum
        const s = tf / Hh;
        this.hipsCur.set(this.hipsTarget.x + this.drift * s, this.hipsTarget.y + this.arc * 0.15 - 1.6 * tf * tf, 0);
        roll = this.roll;
        this.setArmStretch(1);
      } else {
        // fall: gravity → hips to the grass, the body settles on its side
        const tg = tf - Hh;
        const y0 = this.hipsTarget.y + this.arc * 0.15 - 1.6 * Hh * Hh;
        const y = Math.max(0.3, y0 - 0.5 * 9.8 * tg * tg - 0.6 * tg);
        this.hipsCur.set(this.hipsTarget.x + this.drift * (1 + Math.min(1, tg / 0.3) * 0.6), y, 0);
        roll = this.roll * (1 + 0.15 * smoothstep(tg / 0.4));
        this.setArmStretch(1 - smoothstep((tg - 0.15) / 0.5));
      }
    }
    return roll;
  }

  /**
   * UPDATE 5: after the result (visual only — the ball is decided already):
   * a save → back on his feet and a fist pump; a goal → slow, head-down recovery;
   * a miss → up again, relieved.
   */
  react(kind: 'save' | 'goal' | 'miss') {
    if (this.reactKind) return;
    this.reactKind = kind;
    this.reactT = 0;
    this.reactFrom = { ...this.pose };
    this.reactHips.copy(this.hipsCur);
    this.reactRoll = this.body.joints.hips.rotation.z;
    if (this.stage !== 'action') {
      // he never moved: react from the stance
      this.stage = 'action';
      this.action = 'none';
      this.actT = 0;
      this.actDur = 0.01;
      this.fromPose = { ...this.pose };
      this.actionPose = { ...this.pose };
      this.hipsStart.copy(this.body.joints.hips.position);
      this.hipsTarget.copy(this.hipsStart);
      this.roll = 0;
    }
  }

  private applyReaction(dt: number, roll: number) {
    // let a dive land first
    const landed = this.action !== 'dive' || this.actT > this.pushT + this.flightT + this.hangT + 0.38;
    if (!landed) {
      this.reactFrom = { ...this.pose };
      this.reactHips.copy(this.hipsCur);
      this.reactRoll = roll;
      return roll;
    }
    this.reactT += dt;
    const slow = this.reactKind === 'goal' ? 0.5 : 0;
    const up = smoothstep((this.reactT - slow) / 0.55);
    const target = this.reactKind === 'save' ? K_FIST : this.reactKind === 'goal' ? K_DEJECTED : K_READY;
    // the fist pump comes once he is up
    const pose = this.reactKind === 'save' ? blendPose(K_READY, K_FIST, smoothstep((this.reactT - 0.5) / 0.25), {}) : target;
    blendPose(this.reactFrom, pose, up, this.pose);
    this.hipsCur.set(this.reactHips.x, lerp(this.reactHips.y, HIPS_IDLE_Y, up), this.reactHips.z);
    return lerp(this.reactRoll, 0, up);
  }

  /** world x of the hips (for tests/telemetry) */
  hipsWorldX() {
    this.body.root.updateMatrixWorld(true);
    return this.body.joints.hips.getWorldPosition(new THREE.Vector3()).x;
  }

  updateColliders() {
    this.body.root.updateMatrixWorld(true);
    // UPDATE 7 hotfix: the colliders sit exactly on the visible body (REACH = real arm length)
    for (let i = 0; i < MARKERS.length; i++) this.body.markerWorld(MARKERS[i][0], this.colliders[i].pos);
  }

  /** the ball sits between both gloves (an aerial catch is possible, not a one-hand touch) */
  ballInBothHands(ball: THREE.Vector3) {
    const a = this.colliders[0].pos;
    const b = this.colliders[1].pos;
    const mid = this.tmpV.copy(a).add(b).multiplyScalar(0.5);
    return a.distanceTo(b) < 0.62 && ball.distanceTo(mid) < 0.3;
  }
  private tmpV = new THREE.Vector3();

  handsCenter(out: THREE.Vector3) {
    const a = this.body.markerWorld('lHand', new THREE.Vector3());
    const b = this.body.markerWorld('rHand', out);
    return b.add(a).multiplyScalar(0.5);
  }
}
