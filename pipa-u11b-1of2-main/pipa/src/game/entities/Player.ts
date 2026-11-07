import * as THREE from 'three';
import { clamp, lerp, lerpAngle, smoothstep } from '../core/math';
import { blendPose, Humanoid, mirrorPose, sampleKeyframes, type Keyframe, type Kit, type Pose } from './Humanoid';
import { CELEBRATIONS, frustrationFor, type ReactKey, type ShotResultKind } from './reactions';

export type KickStyle = 'penalty' | 'freekick';
/** how the boot meets the ball — chosen from the shot (UPDATE 5) */
export type StrikeType = 'drive' | 'instep' | 'outside' | 'knuckle' | 'low';

// ── Kicker poses (right-footed; left-footers use the mirror) ─────────────────
// 1 ready · 2 run-up · 3 lean in · 4 plant beside the ball · 5 hips open/rotate ·
// 6 backswing · 7 knee drives through · 8 contact · 9 arms counter-balance ·
// 10 follow-through · 11 land and settle
export const STANCE: Pose = {
  spine: [-0.04, 0, 0],
  lShoulder: [0.05, 0, -0.13], rShoulder: [0.05, 0, 0.13],
  lElbow: [0.3, 0, 0], rElbow: [0.3, 0, 0],
  lHip: [0.04, 0, -0.04], rHip: [-0.02, 0, 0.05],
};
export const READY: Pose = {
  spine: [-0.22, 0, 0], head: [0.12, 0, 0],
  lHip: [0.3, 0, -0.04], rHip: [0.12, 0, 0.04], lKnee: [-0.42, 0, 0], rKnee: [-0.3, 0, 0],
  lAnkle: [0.12, 0, 0], rAnkle: [0.18, 0, 0],
  lShoulder: [0.25, 0, -0.28], rShoulder: [-0.1, 0, 0.28], lElbow: [0.7, 0, 0], rElbow: [0.6, 0, 0],
  hipsPos: [0, -0.06, 0],
};
export const RUN_R: Pose = {
  spine: [-0.3, 0.08, 0], head: [0.16, 0, 0],
  rHip: [0.8, 0, 0.02], rKnee: [-0.55, 0, 0], rAnkle: [0.15, 0, 0],
  lHip: [-0.45, 0, -0.02], lKnee: [-1.0, 0, 0], lAnkle: [-0.35, 0, 0],
  lShoulder: [0.65, 0, -0.18], rShoulder: [-0.55, 0, 0.18], lElbow: [1.1, 0, 0], rElbow: [0.9, 0, 0],
  hipsPos: [0, -0.04, 0],
};
export const RUN_L: Pose = mirrorPose(RUN_R);
/** long last stride: body leans in, support (left) leg reaching for the plant */
const LEAN_IN: Pose = {
  spine: [-0.34, 0.12, 0.06], head: [0.25, 0, 0],
  lHip: [0.75, 0, -0.06], lKnee: [-0.35, 0, 0], lAnkle: [0.25, 0, 0],
  rHip: [-0.55, 0, 0.04], rKnee: [-1.1, 0, 0], rAnkle: [-0.5, 0, 0],
  lShoulder: [-0.2, 0, -0.6], rShoulder: [0.4, 0, 0.35], lElbow: [0.6, 0, 0], rElbow: [0.9, 0, 0],
  hipsPos: [0, -0.07, 0],
};
/** support foot lands beside the ball, hips open, kicking leg cocked */
const PLANT: Pose = {
  spine: [-0.2, 0.28, 0.18], head: [0.3, -0.1, 0],
  lHip: [0.32, 0, -0.08], lKnee: [-0.45, 0, 0], lAnkle: [0.12, 0, 0],
  rHip: [-0.8, 0, 0.05], rKnee: [-1.55, 0, 0], rAnkle: [-0.7, 0, 0],
  lShoulder: [0.2, 0, -1.3], rShoulder: [0.3, 0, 0.5], lElbow: [0.3, 0, 0], rElbow: [0.55, 0, 0],
  hipsPos: [0, -0.1, 0],
};
/** top of the backswing, hips rotating back towards the ball, knee leading */
export const BACKSWING: Pose = {
  spine: [-0.18, 0.12, 0.22], head: [0.3, -0.05, 0],
  lHip: [0.3, 0, -0.08], lKnee: [-0.42, 0, 0], lAnkle: [0.1, 0, 0],
  rHip: [-0.35, 0, 0], rKnee: [-1.75, 0, 0], rAnkle: [-0.8, 0, 0],
  lShoulder: [0.22, 0, -1.35], rShoulder: [0.2, 0, 0.55], lElbow: [0.35, 0, 0], rElbow: [0.5, 0, 0],
  hipsPos: [0, -0.09, 0],
};
export const CONTACT: Pose = {
  spine: [-0.22, -0.05, 0.16], head: [0.34, 0, 0],
  lHip: [0.18, 0, -0.08], lKnee: [-0.34, 0, 0], lAnkle: [0.05, 0, 0],
  rHip: [0.55, 0, 0], rKnee: [-0.35, 0, 0], rAnkle: [-0.85, 0, 0],
  lShoulder: [0.15, 0, -1.2], rShoulder: [-0.45, 0, 0.6], lElbow: [0.35, 0, 0], rElbow: [0.4, 0, 0],
  hipsPos: [0, -0.06, 0],
};
export const FOLLOW: Pose = {
  spine: [0.1, -0.2, 0.06], head: [0.12, 0, 0],
  lHip: [-0.06, 0, -0.05], lKnee: [-0.15, 0, 0], lAnkle: [-0.35, 0, 0],
  rHip: [1.35, 0, 0], rKnee: [-0.15, 0, 0], rAnkle: [-0.55, 0, 0],
  lShoulder: [0.5, 0, -0.95], rShoulder: [-0.25, 0, 0.85], lElbow: [0.4, 0, 0], rElbow: [0.3, 0, 0],
  hipsPos: [0, 0.03, 0],
};
/** kicking foot comes down ahead, weight forward */
const LAND: Pose = {
  spine: [-0.15, -0.1, 0], head: [0.1, 0, 0],
  lHip: [-0.35, 0, -0.05], lKnee: [-0.5, 0, 0], lAnkle: [-0.2, 0, 0],
  rHip: [0.45, 0, 0.03], rKnee: [-0.3, 0, 0],
  lShoulder: [0.35, 0, -0.45], rShoulder: [-0.1, 0, 0.4], lElbow: [0.6, 0, 0], rElbow: [0.5, 0, 0],
  hipsPos: [0, -0.05, 0],
};
const RECOVER: Pose = {
  spine: [-0.06, -0.1, 0],
  lHip: [-0.05, 0, -0.05], lKnee: [-0.1, 0, 0],
  rHip: [0.25, 0, 0.03], rKnee: [-0.2, 0, 0],
  lShoulder: [0.1, 0, -0.25], rShoulder: [0.05, 0, 0.25], lElbow: [0.35, 0, 0], rElbow: [0.35, 0, 0],
};

// contact times are fixed (ball launch + online timing depend on them)
const PENALTY_KF: Keyframe[] = [
  { t: 0.0, pose: STANCE, root: 0 },
  { t: 0.14, pose: READY, root: 0 },
  { t: 0.32, pose: RUN_R, root: 0.32 },
  { t: 0.5, pose: RUN_L, root: 0.62 },
  { t: 0.64, pose: LEAN_IN, root: 0.86 },
  { t: 0.74, pose: PLANT, root: 0.99 },
  { t: 0.85, pose: BACKSWING, root: 1.0 },
  { t: 0.93, pose: CONTACT, root: 1.03 },
  { t: 1.12, pose: FOLLOW, root: 1.14 },
  { t: 1.4, pose: LAND, root: 1.28 },
  { t: 1.8, pose: RECOVER, root: 1.32 },
];
const FREEKICK_KF: Keyframe[] = [
  { t: 0.0, pose: STANCE, root: 0 },
  { t: 0.18, pose: READY, root: 0 },
  { t: 0.38, pose: RUN_R, root: 0.18 },
  { t: 0.58, pose: RUN_L, root: 0.38 },
  { t: 0.78, pose: RUN_R, root: 0.58 },
  { t: 0.97, pose: RUN_L, root: 0.78 },
  { t: 1.1, pose: LEAN_IN, root: 0.9 },
  { t: 1.2, pose: PLANT, root: 0.995 },
  { t: 1.3, pose: BACKSWING, root: 1.0 },
  { t: 1.38, pose: CONTACT, root: 1.03 },
  { t: 1.6, pose: FOLLOW, root: 1.14 },
  { t: 1.9, pose: LAND, root: 1.28 },
  { t: 2.3, pose: RECOVER, root: 1.32 },
];
const CONTACT_TIME: Record<KickStyle, number> = { penalty: 0.93, freekick: 1.38 };
const RUN_LENGTH: Record<KickStyle, number> = { penalty: 1.6, freekick: 3.2 };

export const KICKER_KIT = {
  jersey: 0x13294b,
  trim: 0xc8ff3d,
  shorts: 0xf2f4f0,
  socks: 0x13294b,
  boots: 0xc8ff3d,
  skin: 0xc68a62,
  hair: 0x1e1712,
  printColor: '#c8ff3d',
};

/** UPDATE 4/5: how a real player looks and moves on the pitch (cosmetic only) */
export interface KickerLook {
  shirt: string;
  number: string;
  skin: number;
  hair: number;
  hairStyle: Kit['hairStyle'];
  beard: Kit['beard'];
  height: number;
  build: number;
  /** strong foot: left-footers strike with the mirrored animation */
  foot?: 'R' | 'L' | 'B';
  /** player id → his goal celebration */
  celebration?: string;
  /** UPDATE 11 patch: a cast on the right leg (이주성) */
  rightCast?: boolean;
}

const yawOf = (d: THREE.Vector3) => Math.atan2(-d.x, -d.z);
const add = (a: [number, number, number] | undefined, b: [number, number, number], w: number): [number, number, number] => {
  const x = a ?? [0, 0, 0];
  return [x[0] + b[0] * w, x[1] + b[1] * w, x[2] + b[2] * w];
};

export function sampleReact(keys: ReactKey[], t: number, out: Pose) {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t < t) i++;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const u = b.t > a.t ? smoothstep(clamp((t - a.t) / (b.t - a.t), 0, 1)) : 1;
  blendPose(a.pose, b.pose, u, out);
  return { fwd: lerp(a.fwd ?? 0, b.fwd ?? 0, u), side: lerp(a.side ?? 0, b.side ?? 0, u), up: lerp(a.up ?? 0, b.up ?? 0, u), yaw: lerp(a.yaw ?? 0, b.yaw ?? 0, u) };
}

/** The kicker. Runs up, plants, swings and fires `onContact` exactly when the boot meets the ball. */
export class Kicker {
  readonly body: Humanoid;
  private style: KickStyle = 'penalty';
  private kfs = PENALTY_KF;
  private mode: 'idle' | 'kick' | 'react' = 'idle';
  private time = 0;
  private idleT = 0;
  private fired = false;
  private onContact: (() => void) | null = null;
  private start = new THREE.Vector3();
  private contact = new THREE.Vector3();
  private aim = new THREE.Vector3(0, 0, -1);
  private approachYaw = 0;
  private aimYaw = 0;
  private pose: Pose = {};
  private strike: StrikeType = 'drive';
  private readonly left: boolean;
  private readonly celebration: string;
  // reaction
  private react: ReactKey[] | null = null;
  private reactT = 0;
  private reactFrom: Pose = {};
  private reactBase = new THREE.Vector3();
  private reactYaw = 0;

  constructor(nickname: string, look?: KickerLook) {
    this.body = new Humanoid({
      ...KICKER_KIT,
      backName: look?.shirt ?? nickname,
      backNumber: look?.number ?? '10',
      ...(look ? { skin: look.skin, hair: look.hair, hairStyle: look.hairStyle, beard: look.beard, rightCast: look.rightCast } : {}),
    });
    // UPDATE 4: height/build are cosmetic — the run-up and strike timing stay identical
    if (look) this.body.root.scale.set(look.build, look.height, look.build);
    this.left = look?.foot === 'L';
    this.celebration = look?.celebration ?? 'default';
  }

  /** seconds since the kick animation started (0 when idle) */
  get elapsed() {
    return this.mode === 'kick' || this.mode === 'react' ? this.time : 0;
  }

  get contactTime() {
    return CONTACT_TIME[this.style];
  }

  get leftFooted() {
    return this.left;
  }

  private computeContact(ball: THREE.Vector3, aim: THREE.Vector3) {
    const right = new THREE.Vector3(-aim.z, 0, aim.x);
    // the support foot is planted beside the ball on the non-kicking side
    this.contact.set(ball.x, 0, ball.z).addScaledVector(right, this.left ? 0.095 : -0.095).addScaledVector(aim, -0.32);
  }

  setup(ball: THREE.Vector3, aim: THREE.Vector3, style: KickStyle) {
    this.style = style;
    this.kfs = style === 'penalty' ? PENALTY_KF : FREEKICK_KF;
    this.computeContact(ball, aim);
    const right = new THREE.Vector3(-aim.z, 0, aim.x);
    const run = RUN_LENGTH[style];
    // right-footers approach from the left, left-footers from the right
    this.start.copy(this.contact).addScaledVector(aim, -run * 0.9).addScaledVector(right, (this.left ? 1 : -1) * run * 0.32);
    this.approachYaw = yawOf(this.contact.clone().sub(this.start));
    this.aimYaw = yawOf(aim);
    this.aim.copy(aim);
    this.mode = 'idle';
    this.time = 0;
    this.fired = false;
    this.onContact = null;
    this.strike = 'drive';
    this.react = null;
    this.body.root.position.copy(this.start);
    this.body.root.rotation.set(0, this.approachYaw, 0);
    this.body.applyPose(STANCE);
  }

  /** instep curl · outside of the boot · knuckle punch · low drive · plain laces drive */
  setStrike(s: StrikeType) {
    this.strike = s;
  }

  kick(ball: THREE.Vector3, aim: THREE.Vector3, onContact: () => void) {
    this.computeContact(ball, aim);
    this.aim.copy(aim);
    this.aimYaw = yawOf(aim);
    this.mode = 'kick';
    this.time = 0;
    this.fired = false;
    this.onContact = onContact;
  }

  /** UPDATE 5: after the result — his celebration, or a frustrated reaction */
  reactTo(kind: ShotResultKind, pick: number) {
    if (this.mode !== 'kick' || !this.fired) return;
    this.react = kind === 'GOAL' ? CELEBRATIONS[this.celebration] ?? CELEBRATIONS.default : frustrationFor(kind, pick);
    this.reactT = 0;
    this.reactFrom = { ...this.pose };
    this.reactBase.copy(this.body.root.position);
    this.reactYaw = this.body.root.rotation.y;
    this.mode = 'react';
  }

  /** strike-type offsets on top of the base swing (right-footed space) */
  private strikeOffsets(pose: Pose) {
    const ct = this.contactTime;
    const t = this.time;
    const swing = smoothstep((t - (ct - 0.26)) / 0.16) * (1 - smoothstep((t - (ct + 0.1)) / 0.22));
    const follow = smoothstep((t - ct) / 0.1) * (1 - smoothstep((t - (ct + 0.35)) / 0.3));
    switch (this.strike) {
      case 'instep': // foot opened, wraps round the ball, swings across the body
        pose.rAnkle = add(pose.rAnkle, [0, -0.75, -0.35], swing);
        pose.rHip = add(pose.rHip, [0, -0.32, 0], swing);
        pose.rHip = add(pose.rHip, [-0.25, 0, -0.35], follow);
        pose.spine = add(pose.spine, [0.08, -0.15, 0], follow);
        break;
      case 'outside': // toes turned in, foot flicks out
        pose.rAnkle = add(pose.rAnkle, [0, 0.75, 0.35], swing);
        pose.rHip = add(pose.rHip, [0, 0.32, 0], swing);
        pose.rHip = add(pose.rHip, [-0.2, 0, 0.3], follow);
        break;
      case 'knuckle': // short, hard, straight through — follow-through stops early
        pose.rAnkle = add(pose.rAnkle, [-0.2, 0, 0], swing);
        pose.rHip = add(pose.rHip, [-0.75, 0, 0], follow);
        pose.rKnee = add(pose.rKnee, [-0.25, 0, 0], follow);
        pose.spine = add(pose.spine, [-0.12, 0, 0], swing + follow);
        break;
      case 'low': // body over the ball, low follow-through
        pose.spine = add(pose.spine, [-0.16, 0, 0], swing + follow);
        pose.hipsPos = add(pose.hipsPos, [0, -0.04, 0], swing + follow);
        pose.rHip = add(pose.rHip, [-0.55, 0, 0], follow);
        break;
    }
  }

  update(dt: number) {
    if (this.mode === 'idle') {
      this.idleT += dt;
      const b = Math.sin(this.idleT * 2.2) * 0.006;
      this.body.applyPose({ ...STANCE, hipsPos: [0, b, 0] });
      return;
    }
    this.time += dt;
    if (this.mode === 'react' && this.react) {
      this.reactT += dt;
      const m = sampleReact(this.react, this.reactT, this.pose);
      // ease out of the follow-through into the reaction
      const inW = smoothstep(this.reactT / 0.3);
      if (inW < 1) blendPose(this.reactFrom, this.pose, inW, this.pose);
      this.body.applyPose(this.left ? mirrorPose(this.pose) : this.pose);
      const fwd = this.aim;
      const sgn = this.left ? -1 : 1;
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      this.body.root.position.copy(this.reactBase).addScaledVector(fwd, m.fwd).addScaledVector(right, m.side * sgn);
      this.body.root.position.y = m.up;
      this.body.root.rotation.y = this.reactYaw - m.yaw * sgn;
      return;
    }
    const root = sampleKeyframes(this.kfs, this.time, this.pose);
    if (this.strike !== 'drive') this.strikeOffsets(this.pose);
    this.body.applyPose(this.left ? mirrorPose(this.pose) : this.pose);

    const p = this.body.root.position;
    if (root <= 1) p.lerpVectors(this.start, this.contact, root);
    else p.copy(this.contact).addScaledVector(this.aim, (root - 1) * 1.0);

    const ct = this.contactTime;
    const turnFrom = ct - 0.45;
    const turnTo = ct - 0.14;
    this.body.root.rotation.y = lerpAngle(this.approachYaw, this.aimYaw, smoothstep((this.time - turnFrom) / (turnTo - turnFrom)));

    // the ball leaves exactly on the contact frame of the swing
    if (!this.fired && this.time >= ct) {
      this.fired = true;
      this.onContact?.();
    }
  }
}
