import * as THREE from 'three';
import { clamp, lerp, lerpAngle } from '../game/core/math';
import { blendPose, Humanoid, mirrorPose, type Kit, type Pose } from '../game/entities/Humanoid';
import { BACKSWING, CONTACT, FOLLOW, RUN_L, RUN_R, sampleReact, STANCE } from '../game/entities/Player';
import { CELEBRATIONS, FRUSTRATIONS } from '../game/entities/reactions';
import type { PlayerDef, SkillMoveId } from '../players/players';
import { FORMATION_433H, slotFit, type FormationSlot } from './formation';

export type TeamId = 'home' | 'away';

export const HOME_KIT = { jersey: 0x13294b, trim: 0xc8ff3d, shorts: 0xf2f4f0, socks: 0x13294b, boots: 0xc8ff3d, printColor: '#c8ff3d' };
export const AWAY_KIT = { jersey: 0xd8332a, trim: 0xffffff, shorts: 0x1c1c1c, socks: 0xd8332a, boots: 0xffffff, printColor: '#ffffff' };

/** halftime: hands on the hips / a quad stretch / arms up stretch */
/** UPDATE 11 patch — the sliding tackle: down low, leading leg out straight, the other bent under */
const SLIDE: Pose = {
  hipsPos: [0, -0.62, 0.05], spine: [-0.55, 0, 0.1], head: [0.35, 0, 0],
  rHip: [-1.45, 0, 0.05], rKnee: [-0.08, 0, 0], rAnkle: [0.4, 0, 0],
  lHip: [-0.45, 0, -0.25], lKnee: [-1.9, 0, 0],
  lShoulder: [0.2, 0, -1.1], rShoulder: [-0.6, 0, 0.6], lElbow: [0.6, 0, 0], rElbow: [0.6, 0, 0],
};
const CROUCH: Pose = { hipsPos: [0, -0.22, 0], spine: [0.35, 0, 0], rHip: [-0.9, 0, 0], rKnee: [-1.2, 0, 0], lHip: [-0.3, 0, 0], lKnee: [-0.9, 0, 0], lShoulder: [0.5, 0, -0.4], rShoulder: [-0.5, 0, 0.4] };
/** a header: legs tucked in the air, chest arched back then the neck snaps the head through */
const HEAD_BACK: Pose = { spine: [-0.32, 0, 0], neck: [-0.35, 0, 0], head: [-0.25, 0, 0], lHip: [-0.5, 0, 0], rHip: [-0.3, 0, 0], lKnee: [-1.2, 0, 0], rKnee: [-1.0, 0, 0], lShoulder: [0.4, 0, -0.9], rShoulder: [0.4, 0, 0.9] };
const HEAD_HIT: Pose = { spine: [0.32, 0, 0], neck: [0.3, 0, 0], head: [0.35, 0, 0], lHip: [-0.6, 0, 0], rHip: [-0.4, 0, 0], lKnee: [-1.0, 0, 0], rKnee: [-0.9, 0, 0], lShoulder: [0.2, 0, -0.6], rShoulder: [0.2, 0, 0.6] };
/** skill-move key poses (common set, each player has his signature one) */
const SKILL_POSES: Record<SkillMoveId, Pose[]> = {
  BODY_FEINT: [{ spine: [0.1, 0, 0.42], hipsPos: [0.08, -0.08, 0], lHip: [-0.3, 0, -0.3], rHip: [0.2, 0, 0.1], head: [0, 0, 0.2] }, { spine: [0.15, 0, -0.4], hipsPos: [-0.1, -0.08, 0], rHip: [-0.4, 0, 0.35], lHip: [0.2, 0, -0.1] }],
  STEPOVER: [{ rHip: [-0.9, 0, -0.75], rKnee: [-1.2, 0, 0], spine: [0.1, 0, -0.2], hipsPos: [0, -0.05, 0] }, { lHip: [-0.9, 0, 0.75], lKnee: [-1.2, 0, 0], spine: [0.1, 0, 0.2], hipsPos: [0, -0.05, 0] }],
  ELASTICO: [{ rHip: [-0.5, 0, -0.5], rKnee: [-0.4, 0, 0], rAnkle: [0, 0.6, 0], spine: [0.1, 0, -0.15] }, { rHip: [-0.55, 0, 0.45], rKnee: [-0.4, 0, 0], rAnkle: [0, -0.7, 0], spine: [0.1, 0, 0.2] }],
  BURST: [{ spine: [0.5, 0, 0], hipsPos: [0, -0.12, 0], rHip: [-1.0, 0, 0], lHip: [0.5, 0, 0], lKnee: [-0.9, 0, 0] }, { spine: [0.42, 0, 0], lHip: [-1.0, 0, 0], rHip: [0.5, 0, 0], rKnee: [-0.9, 0, 0] }],
  SIDE_STEP: [{ hipsPos: [0, -0.15, 0], lHip: [-0.2, 0, -0.55], rHip: [-0.2, 0, 0.2], spine: [0.15, 0, 0.25] }, { hipsPos: [0, -0.1, 0], rHip: [-0.2, 0, 0.55], spine: [0.15, 0, -0.2] }],
  QUICK_TURN: [{ spine: [0.25, 0.6, 0], rHip: [-0.7, 0.5, 0], rKnee: [-0.6, 0, 0], hipsPos: [0, -0.1, 0] }, { spine: [0.2, -0.3, 0], lHip: [-0.6, 0, 0] }],
  KNOCK_ON: [{ rHip: [-1.1, 0, 0], rKnee: [-0.2, 0, 0], spine: [0.3, 0, 0] }, { spine: [0.45, 0, 0], lHip: [-1.0, 0, 0], rHip: [0.5, 0, 0], rKnee: [-1.0, 0, 0] }],
  RAINBOW: [{ rHip: [0.6, 0, 0], rKnee: [-1.9, 0, 0], lKnee: [-0.3, 0, 0], spine: [0.25, 0, 0], hipsPos: [0, -0.05, 0] }, { rHip: [0.9, 0, 0], rKnee: [-2.2, 0, 0], spine: [-0.1, 0, 0], head: [-0.35, 0, 0] }],
  DRAG_BACK: [{ rHip: [-0.3, 0, 0], rKnee: [-0.3, 0, 0], rAnkle: [0.5, 0, 0], spine: [-0.15, 0, 0] }, { rHip: [0.4, 0, 0], rKnee: [-1.1, 0, 0], spine: [0.2, 0.5, 0] }],
};

const REST_POSES: Pose[] = [
  { ...STANCE, spine: [-0.05, 0, 0], lShoulder: [-0.15, 0, -0.55], rShoulder: [-0.15, 0, 0.55], lElbow: [1.75, 0, 0], rElbow: [1.75, 0, 0], head: [0.3, 0, 0] },
  { ...STANCE, rHip: [-0.3, 0, 0], rKnee: [-2.3, 0, 0], rShoulder: [-0.6, 0, 0.1], rElbow: [0.4, 0, 0], lShoulder: [0.1, 0, -0.5] },
  { ...STANCE, lShoulder: [0.2, 0, -2.9], rShoulder: [0.2, 0, 2.9], lElbow: [0.3, 0, 0], rElbow: [0.3, 0, 0], spine: [0.08, 0, 0.12] },
];

/**
 * A 5-a-side field player: PIPA's low-poly body (same Humanoid as the kicker), a run
 * cycle that follows where he really moves, a short strike for passes / shots, the
 * goal celebration and halftime rest poses. Position / speed live here; the rules
 * (who has the ball, AI) live in MatchEngine.
 */
export class MatchPlayer {
  body: Humanoid;
  def: PlayerDef;
  evo: number;
  readonly team: TeamId;
  /** UPDATE 11 patch: index in FORMATION_433H (1–10; 0 is the keeper) */
  slot: number;
  /** out of position in a defensive slot → defends worse */
  offPos = false;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  /** facing (yaw, radians; 0 = −z) */
  yaw = 0;
  /** wanted velocity (set by the controller / AI each step) */
  readonly want = new THREE.Vector3();
  sprinting = false;
  /** time until he may win the ball again */
  cooldown = 0;
  /** dribble touch timer */
  touchT = 0;
  skillT = 0;
  /** opponents nearby hesitate after a skill move */
  frozen = 0;
  private phase = Math.random() * 6;
  private kickT = -1;
  private kickLeft = false;
  private react: 'none' | 'celebrate' | 'sad' | 'rest' = 'none';
  private reactT = 0;
  private restPose = 0;
  private pose: Pose = {};

  /** UPDATE 11 patch: a sliding tackle (s) · header jump (s) · skill move · short burst */
  slideT = -1;
  slideHit = false;
  tackleCd = 0;
  jumpT = -1;
  skillAnim: { type: SkillMoveId; t: number } | null = null;
  boostT = 0;

  constructor(def: PlayerDef, team: TeamId, slot: number, evo = 0) {
    this.def = def;
    this.team = team;
    this.slot = slot;
    this.evo = evo;
    this.body = MatchPlayer.makeBody(def, team);
    this.refit();
  }

  get formation(): FormationSlot {
    return FORMATION_433H[this.slot];
  }
  /** a non-defender in the back four is out of position (warning + weaker defending) */
  refit() {
    const f = this.formation;
    this.offPos = !!f && f.line === 'DEF' && slotFit(this.def, f) === 'off';
  }
  get sliding() {
    return this.slideT >= 0;
  }
  /** PACE (defender stats) — +/- 9 % around the base speed */
  get pace() {
    const pace = this.def.def?.pace ?? 75;
    return 1 + Math.max(-0.09, Math.min(0.09, (pace - 80) * 0.0045)) - (this.offPos ? 0.02 : 0);
  }

  static makeBody(def: PlayerDef, team: TeamId) {
    const kit = team === 'home' ? HOME_KIT : AWAY_KIT;
    const l = def.look;
    const k: Kit = { ...kit, skin: l.skin, hair: l.hair, hairStyle: l.hairStyle, beard: l.beard, backName: def.shirt, backNumber: def.number };
    const b = new Humanoid({ ...k, rightCast: def.rightCast });
    b.root.scale.set(l.build, l.height, l.build);
    return b;
  }

  /** a substitution: the new player's body, name, stats and evolution — same place on the pitch */
  replace(def: PlayerDef, evo: number) {
    const parent = this.body.root.parent;
    parent?.remove(this.body.root);
    this.def = def;
    this.evo = evo;
    this.body = MatchPlayer.makeBody(def, this.team);
    parent?.add(this.body.root);
    this.react = 'none';
    this.kickT = -1;
    this.refit();
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /** a strike animation (pass / shot / clearance); the ball leaves at once (arcade) */
  strike() {
    this.kickT = 0;
    // 이주성 (right-leg cast) and every left-footer strike with the left boot
    this.kickLeft = this.def.foot === 'L' || !!this.def.rightCast;
  }
  slide() {
    this.slideT = 0;
    this.slideHit = false;
    this.kickT = -1;
  }
  jump() {
    this.jumpT = 0;
  }
  skill(type: SkillMoveId) {
    this.skillAnim = { type, t: 0 };
  }
  celebrate() {
    this.react = 'celebrate';
    this.reactT = 0;
  }
  sad() {
    this.react = 'sad';
    this.reactT = 0;
  }
  rest(i: number) {
    this.react = 'rest';
    this.reactT = 0;
    this.restPose = i % REST_POSES.length;
  }
  calm() {
    this.react = 'none';
  }

  /** physics of the body: accelerate towards `want`, turn to face the movement */
  move(dt: number, maxSpeed: number) {
    const w = this.want;
    const wl = Math.hypot(w.x, w.z);
    if (wl > maxSpeed) w.multiplyScalar(maxSpeed / wl);
    const dvx = w.x - this.vel.x;
    const dvz = w.z - this.vel.z;
    const dl = Math.hypot(dvx, dvz);
    const a = 26 * dt;
    if (dl > a) {
      this.vel.x += (dvx / dl) * a;
      this.vel.z += (dvz / dl) * a;
    } else {
      this.vel.x = w.x;
      this.vel.z = w.z;
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    if (this.speed > 0.4) this.yaw = lerpAngle(this.yaw, Math.atan2(-this.vel.x, -this.vel.z), clamp(11 * dt, 0, 1));
  }

  face(x: number, z: number, dt: number) {
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    if (dx * dx + dz * dz > 0.01) this.yaw = lerpAngle(this.yaw, Math.atan2(-dx, -dz), clamp(9 * dt, 0, 1));
  }

  /** animation (cosmetic only) */
  animate(dt: number) {
    const sp = this.speed;
    const run = clamp(sp / 6, 0, 1);
    this.phase += dt * (5 + sp * 1.35);
    const s = (Math.sin(this.phase) + 1) / 2;
    const cycle = blendPose(RUN_R, RUN_L, s, {});
    blendPose(STANCE, cycle, run, this.pose);
    let lift = Math.abs(Math.sin(this.phase)) * 0.05 * run;
    if (this.kickT >= 0) {
      this.kickT += dt;
      const k = this.kickT;
      const back = this.kickLeft ? mirrorPose(BACKSWING) : BACKSWING;
      const hit = this.kickLeft ? mirrorPose(CONTACT) : CONTACT;
      const fol = this.kickLeft ? mirrorPose(FOLLOW) : FOLLOW;
      if (k < 0.1) blendPose(this.pose, back, k / 0.1, this.pose);
      else if (k < 0.18) blendPose(back, hit, (k - 0.1) / 0.08, this.pose);
      else if (k < 0.4) blendPose(hit, fol, (k - 0.18) / 0.22, this.pose);
      else if (k < 0.6) blendPose(fol, this.pose, (k - 0.4) / 0.2, this.pose);
      else this.kickT = -1;
      lift = 0;
    }
    let up = 0;
    // UPDATE 11 patch: skill move / header jump / sliding tackle on top of the run
    if (this.skillAnim) {
      this.skillAnim.t += dt;
      const k = this.skillAnim.t;
      const [a, b2] = SKILL_POSES[this.skillAnim.type];
      if (k < 0.16) blendPose(this.pose, a, k / 0.16, this.pose);
      else if (k < 0.32) blendPose(a, b2, (k - 0.16) / 0.16, this.pose);
      else if (k < 0.52) blendPose(b2, this.pose, (k - 0.32) / 0.2, this.pose);
      else this.skillAnim = null;
      if (this.skillAnim?.type === 'SIDE_STEP' || this.skillAnim?.type === 'RAINBOW') up = Math.sin(Math.min(1, k / 0.4) * Math.PI) * 0.12;
    }
    if (this.jumpT >= 0) {
      this.jumpT += dt;
      const k = this.jumpT;
      const T = 0.62;
      up = Math.max(0, Math.sin((k / T) * Math.PI)) * 0.55;
      if (k < 0.12) blendPose(this.pose, CROUCH, k / 0.12, this.pose);
      else if (k < 0.3) blendPose(CROUCH, HEAD_BACK, (k - 0.12) / 0.18, this.pose);
      else if (k < 0.42) blendPose(HEAD_BACK, HEAD_HIT, (k - 0.3) / 0.12, this.pose);
      else if (k < T) blendPose(HEAD_HIT, this.pose, (k - 0.42) / 0.2, this.pose);
      else this.jumpT = -1;
      lift = 0;
    }
    if (this.slideT >= 0) {
      this.slideT += dt;
      const k = this.slideT;
      // run in → drop low → leg out → slide → get up (1.15 s)
      if (k < 0.12) blendPose(this.pose, CROUCH, k / 0.12, this.pose);
      else if (k < 0.24) blendPose(CROUCH, SLIDE, (k - 0.12) / 0.12, this.pose);
      else if (k < 0.7) blendPose(SLIDE, SLIDE, 0, this.pose);
      else if (k < 1.15) blendPose(SLIDE, STANCE, (k - 0.7) / 0.45, this.pose);
      else this.slideT = -1;
      lift = 0;
    }
    if (this.react !== 'none') {
      this.reactT += dt;
      if (this.react === 'celebrate') {
        const m = sampleReact(CELEBRATIONS.default, Math.min(this.reactT, 2.0), this.pose);
        up = (m.up ?? 0) + Math.max(0, Math.sin(this.reactT * 7)) * 0.12;
      } else if (this.react === 'sad') {
        sampleReact(FRUSTRATIONS.hips, Math.min(this.reactT, 1.8), this.pose);
      } else if (this.react === 'rest' && sp < 0.6) {
        const r = REST_POSES[this.restPose];
        blendPose(this.pose, r, clamp(this.reactT / 0.6, 0, 1), this.pose);
      }
    }
    this.body.applyPose(this.pose);
    const hp = this.pose.hipsPos;
    this.body.joints.hips.position.y = 0.98 + (hp ? hp[1] : 0) + lift;
    this.body.root.position.set(this.pos.x, up, this.pos.z);
    this.body.root.rotation.y = this.yaw;
    // lean into a sprint a little
    this.body.joints.spine.rotation.x += -0.12 * clamp((sp - 6) / 2, 0, 1);
  }

  /** where the ball sits when he controls it (in front of his feet) */
  footPoint(out: THREE.Vector3, ahead = 0.55) {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    return out.set(this.pos.x + fx * ahead, 0, this.pos.z + fz * ahead);
  }
  dir(out: THREE.Vector3) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}

export const lerpN = lerp;
