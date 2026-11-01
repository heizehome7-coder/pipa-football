import * as THREE from 'three';
import { lerpAngle, smoothstep } from '../core/math';
import { Humanoid, mirrorPose, sampleKeyframes, type Keyframe, type Kit, type Pose } from './Humanoid';

export type KickStyle = 'penalty' | 'freekick';

// ── Kicker poses (right-footed) ────────────────────────────────────────────
const STANCE: Pose = {
  spine: [-0.04, 0, 0],
  lShoulder: [0.05, 0, -0.13], rShoulder: [0.05, 0, 0.13],
  lElbow: [0.3, 0, 0], rElbow: [0.3, 0, 0],
  lHip: [0.04, 0, -0.04], rHip: [-0.02, 0, 0.05],
};
const READY: Pose = {
  spine: [-0.2, 0, 0], head: [0.12, 0, 0],
  lHip: [0.28, 0, -0.04], rHip: [0.12, 0, 0.04], lKnee: [-0.4, 0, 0], rKnee: [-0.32, 0, 0],
  lAnkle: [0.12, 0, 0], rAnkle: [0.18, 0, 0],
  lShoulder: [0.25, 0, -0.28], rShoulder: [-0.1, 0, 0.28], lElbow: [0.7, 0, 0], rElbow: [0.6, 0, 0],
  hipsPos: [0, -0.06, 0],
};
const RUN_R: Pose = {
  spine: [-0.28, 0.08, 0], head: [0.16, 0, 0],
  rHip: [0.8, 0, 0.02], rKnee: [-0.55, 0, 0], rAnkle: [0.15, 0, 0],
  lHip: [-0.45, 0, -0.02], lKnee: [-1.0, 0, 0], lAnkle: [-0.35, 0, 0],
  lShoulder: [0.65, 0, -0.18], rShoulder: [-0.55, 0, 0.18], lElbow: [1.1, 0, 0], rElbow: [0.9, 0, 0],
  hipsPos: [0, -0.04, 0],
};
const RUN_L: Pose = mirrorPose(RUN_R);
const BACKSWING: Pose = {
  spine: [-0.14, 0.1, 0.2], head: [0.22, -0.05, 0],
  lHip: [0.3, 0, -0.08], lKnee: [-0.38, 0, 0], lAnkle: [0.1, 0, 0],
  rHip: [-0.72, 0, 0], rKnee: [-1.65, 0, 0], rAnkle: [-0.75, 0, 0],
  lShoulder: [0.25, 0, -1.25], rShoulder: [0.35, 0, 0.45], lElbow: [0.35, 0, 0], rElbow: [0.5, 0, 0],
  hipsPos: [0, -0.08, 0],
};
const CONTACT: Pose = {
  spine: [-0.2, 0, 0.16], head: [0.32, 0, 0],
  lHip: [0.18, 0, -0.08], lKnee: [-0.32, 0, 0], lAnkle: [0.05, 0, 0],
  rHip: [0.55, 0, 0], rKnee: [-0.35, 0, 0], rAnkle: [-0.85, 0, 0],
  lShoulder: [0.15, 0, -1.15], rShoulder: [-0.45, 0, 0.6], lElbow: [0.35, 0, 0], rElbow: [0.4, 0, 0],
  hipsPos: [0, -0.06, 0],
};
const FOLLOW: Pose = {
  spine: [0.1, -0.06, 0.06], head: [0.12, 0, 0],
  lHip: [-0.06, 0, -0.05], lKnee: [-0.15, 0, 0], lAnkle: [-0.3, 0, 0],
  rHip: [1.35, 0, 0], rKnee: [-0.15, 0, 0], rAnkle: [-0.55, 0, 0],
  lShoulder: [0.45, 0, -0.95], rShoulder: [-0.25, 0, 0.85], lElbow: [0.4, 0, 0], rElbow: [0.3, 0, 0],
  hipsPos: [0, 0.03, 0],
};
const RECOVER: Pose = {
  spine: [-0.06, -0.1, 0],
  lHip: [-0.05, 0, -0.05], lKnee: [-0.1, 0, 0],
  rHip: [0.35, 0, 0.03], rKnee: [-0.25, 0, 0],
  lShoulder: [0.1, 0, -0.25], rShoulder: [0.05, 0, 0.25], lElbow: [0.35, 0, 0], rElbow: [0.35, 0, 0],
};

// timeline: ready → 1-2 strides → plant + backswing → contact → follow-through
const PENALTY_KF: Keyframe[] = [
  { t: 0.0, pose: STANCE, root: 0 },
  { t: 0.16, pose: READY, root: 0 },
  { t: 0.38, pose: RUN_R, root: 0.38 },
  { t: 0.6, pose: RUN_L, root: 0.78 },
  { t: 0.8, pose: BACKSWING, root: 1.0 },
  { t: 0.93, pose: CONTACT, root: 1.04 },
  { t: 1.22, pose: FOLLOW, root: 1.2 },
  { t: 1.75, pose: RECOVER, root: 1.3 },
];
const FREEKICK_KF: Keyframe[] = [
  { t: 0.0, pose: STANCE, root: 0 },
  { t: 0.2, pose: READY, root: 0 },
  { t: 0.42, pose: RUN_R, root: 0.2 },
  { t: 0.64, pose: RUN_L, root: 0.42 },
  { t: 0.86, pose: RUN_R, root: 0.63 },
  { t: 1.06, pose: RUN_L, root: 0.84 },
  { t: 1.25, pose: BACKSWING, root: 1.0 },
  { t: 1.38, pose: CONTACT, root: 1.04 },
  { t: 1.68, pose: FOLLOW, root: 1.2 },
  { t: 2.2, pose: RECOVER, root: 1.3 },
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

/** UPDATE 4: how a real player looks on the pitch (cosmetic only) */
export interface KickerLook {
  shirt: string;
  number: string;
  skin: number;
  hair: number;
  hairStyle: Kit['hairStyle'];
  beard: Kit['beard'];
  height: number;
  build: number;
}

const yawOf = (d: THREE.Vector3) => Math.atan2(-d.x, -d.z);

/** The kicker. Runs up, plants, swings and fires `onContact` when the boot meets the ball. */
export class Kicker {
  readonly body: Humanoid;
  private style: KickStyle = 'penalty';
  private kfs = PENALTY_KF;
  private mode: 'idle' | 'kick' = 'idle';
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

  constructor(nickname: string, look?: KickerLook) {
    this.body = new Humanoid({
      ...KICKER_KIT,
      backName: look?.shirt ?? nickname,
      backNumber: look?.number ?? '10',
      ...(look ? { skin: look.skin, hair: look.hair, hairStyle: look.hairStyle, beard: look.beard } : {}),
    });
    // UPDATE 4: height/build are cosmetic — the run-up and strike timing stay identical
    if (look) this.body.root.scale.set(look.build, look.height, look.build);
  }

  /** seconds since the kick animation started (0 when idle) */
  get elapsed() {
    return this.mode === 'kick' ? this.time : 0;
  }

  get contactTime() {
    return CONTACT_TIME[this.style];
  }

  private computeContact(ball: THREE.Vector3, aim: THREE.Vector3) {
    const right = new THREE.Vector3(-aim.z, 0, aim.x);
    this.contact.set(ball.x, 0, ball.z).addScaledVector(right, -0.095).addScaledVector(aim, -0.32);
  }

  setup(ball: THREE.Vector3, aim: THREE.Vector3, style: KickStyle) {
    this.style = style;
    this.kfs = style === 'penalty' ? PENALTY_KF : FREEKICK_KF;
    this.computeContact(ball, aim);
    const right = new THREE.Vector3(-aim.z, 0, aim.x);
    const run = RUN_LENGTH[style];
    this.start.copy(this.contact).addScaledVector(aim, -run * 0.9).addScaledVector(right, -run * 0.32);
    this.approachYaw = yawOf(this.contact.clone().sub(this.start));
    this.aimYaw = yawOf(aim);
    this.aim.copy(aim);
    this.mode = 'idle';
    this.time = 0;
    this.fired = false;
    this.onContact = null;
    this.body.root.position.copy(this.start);
    this.body.root.rotation.set(0, this.approachYaw, 0);
    this.body.applyPose(STANCE);
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

  update(dt: number) {
    if (this.mode === 'idle') {
      this.idleT += dt;
      const b = Math.sin(this.idleT * 2.2) * 0.006;
      this.body.applyPose({ ...STANCE, hipsPos: [0, b, 0] });
      return;
    }
    this.time += dt;
    const root = sampleKeyframes(this.kfs, this.time, this.pose);
    this.body.applyPose(this.pose);

    const p = this.body.root.position;
    if (root <= 1) p.lerpVectors(this.start, this.contact, root);
    else p.copy(this.contact).addScaledVector(this.aim, (root - 1) * 1.0);

    const ct = this.contactTime;
    const turnFrom = ct - 0.45;
    const turnTo = ct - 0.14;
    this.body.root.rotation.y = lerpAngle(this.approachYaw, this.aimYaw, smoothstep((this.time - turnFrom) / (turnTo - turnFrom)));

    if (!this.fired && this.time >= ct) {
      this.fired = true;
      this.onContact?.();
    }
  }
}
