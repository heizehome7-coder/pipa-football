import type { Pose } from './Humanoid';

/**
 * UPDATE 5 — short post-shot reactions for the kicker (right-footed space; mirrored
 * for left-footers like the strike). Each key: a pose plus where the body is
 * relative to where the follow-through ended (fwd = towards the goal, side = his
 * right, up = jump height) and a yaw turn. 1.5–2.6 s, then he holds the last pose.
 */
export interface ReactKey {
  t: number;
  pose: Pose;
  fwd?: number;
  side?: number;
  up?: number;
  yaw?: number;
}

// ── building blocks ─────────────────────────────────────────────────────────
const STAND: Pose = { spine: [0, 0, 0], lShoulder: [0.05, 0, -0.15], rShoulder: [0.05, 0, 0.15], lElbow: [0.3, 0, 0], rElbow: [0.3, 0, 0] };
const JOG_A: Pose = {
  spine: [-0.15, 0, 0], rHip: [0.65, 0, 0], rKnee: [-0.6, 0, 0], lHip: [-0.35, 0, 0], lKnee: [-0.9, 0, 0],
  lShoulder: [0.55, 0, -0.2], rShoulder: [-0.45, 0, 0.2], lElbow: [1.2, 0, 0], rElbow: [1.2, 0, 0], hipsPos: [0, -0.03, 0],
};
const JOG_B: Pose = {
  spine: [-0.15, 0, 0], lHip: [0.65, 0, 0], lKnee: [-0.6, 0, 0], rHip: [-0.35, 0, 0], rKnee: [-0.9, 0, 0],
  rShoulder: [0.55, 0, 0.2], lShoulder: [-0.45, 0, -0.2], lElbow: [1.2, 0, 0], rElbow: [1.2, 0, 0], hipsPos: [0, -0.03, 0],
};
const run = (t0: number, n: number, dt: number, from: Partial<ReactKey>, to: Partial<ReactKey>, poseOverride?: Pose): ReactKey[] =>
  Array.from({ length: n }, (_, i) => {
    const u = (i + 1) / n;
    const lerp = (a = 0, b = 0) => a + (b - a) * u;
    return {
      t: t0 + dt * (i + 1),
      pose: { ...(i % 2 ? JOG_B : JOG_A), ...(poseOverride ?? {}) },
      fwd: lerp(from.fwd, to.fwd),
      side: lerp(from.side, to.side),
      yaw: lerp(from.yaw, to.yaw),
    };
  });

const ARMS_UP: Pose = { ...STAND, lShoulder: [0.2, 0, -2.85], rShoulder: [0.2, 0, 2.85], lElbow: [0.15, 0, 0], rElbow: [0.15, 0, 0], head: [-0.25, 0, 0] };
const POINT_UP: Pose = { ...STAND, spine: [0.08, 0, 0], lShoulder: [2.75, 0, -0.25], rShoulder: [2.75, 0, 0.25], lElbow: [0.25, 0, 0], rElbow: [0.25, 0, 0], head: [-0.4, 0, 0] };
const SIU: Pose = {
  spine: [0.18, 0, 0], head: [-0.25, 0, 0],
  lHip: [0.15, 0, -0.42], rHip: [0.15, 0, 0.42], lKnee: [-0.35, 0, 0], rKnee: [-0.35, 0, 0],
  lShoulder: [0.1, 0, -0.95], rShoulder: [0.1, 0, 0.95], lElbow: [0.1, 0, 0], rElbow: [0.1, 0, 0], hipsPos: [0, -0.1, 0],
};
const TUCK: Pose = {
  spine: [-0.1, 0, 0], lHip: [0.9, 0, -0.1], rHip: [0.9, 0, 0.1], lKnee: [-1.4, 0, 0], rKnee: [-1.4, 0, 0],
  lShoulder: [0.4, 0, -1.6], rShoulder: [0.4, 0, 1.6], lElbow: [0.3, 0, 0], rElbow: [0.3, 0, 0],
};
const ARMS_CROSSED: Pose = {
  spine: [0.1, 0, 0], head: [-0.15, 0, 0],
  lShoulder: [1.05, 0, 0.62], rShoulder: [1.05, 0, -0.62], lElbow: [2.05, 0, 0], rElbow: [2.05, 0, 0],
};
const EAR: Pose = { ...STAND, spine: [0.12, 0, 0], head: [-0.1, -0.25, 0], rShoulder: [0.4, 0, 1.75], rElbow: [2.3, 0, 0], lShoulder: [0.2, 0, -0.35] };
const FRAME: Pose = {
  ...STAND, head: [0.05, 0, 0.1],
  lShoulder: [1.55, 0, 0.32], rShoulder: [1.55, 0, -0.32], lElbow: [1.95, 0, 0], rElbow: [1.95, 0, 0],
};
const FIST_HIGH: Pose = { ...STAND, spine: [-0.15, 0, 0], head: [-0.2, 0, 0], rShoulder: [1.2, 0, 0.5], rElbow: [2.2, 0, 0], lShoulder: [0.3, 0, -0.5], lElbow: [1.4, 0, 0], hipsPos: [0, -0.08, 0], lKnee: [-0.4, 0, 0], rKnee: [-0.4, 0, 0], lHip: [0.3, 0, -0.1], rHip: [0.3, 0, 0.1] };
const FIST_LOW: Pose = { ...FIST_HIGH, rShoulder: [0.35, 0, 0.35], rElbow: [1.9, 0, 0] };
const BOTH_FISTS: Pose = { ...STAND, spine: [-0.25, 0, 0], head: [-0.15, 0, 0], lShoulder: [0.5, 0, -0.45], rShoulder: [0.5, 0, 0.45], lElbow: [2.1, 0, 0], rElbow: [2.1, 0, 0], hipsPos: [0, -0.1, 0], lHip: [0.35, 0, -0.12], rHip: [0.35, 0, 0.12], lKnee: [-0.5, 0, 0], rKnee: [-0.5, 0, 0] };
const BOTH_FISTS_UP: Pose = { ...BOTH_FISTS, spine: [0.05, 0, 0], head: [-0.35, 0, 0], lShoulder: [0.9, 0, -1.2], rShoulder: [0.9, 0, 1.2], lElbow: [1.7, 0, 0], rElbow: [1.7, 0, 0], hipsPos: [0, 0, 0] };
const MEDITATE: Pose = {
  spine: [-0.05, 0, 0], head: [0.25, 0, 0],
  lHip: [1.45, 0.35, -0.75], rHip: [1.45, -0.35, 0.75], lKnee: [-2.3, 0, 0], rKnee: [-2.3, 0, 0],
  lShoulder: [0.55, 0, -0.42], rShoulder: [0.55, 0, 0.42], lElbow: [0.7, 0, 0], rElbow: [0.7, 0, 0], hipsPos: [0, -0.62, 0],
};
const WIDE_ARMS: Pose = { ...STAND, spine: [0.1, 0, 0], head: [-0.15, 0, 0], lShoulder: [0, 0, -1.55], rShoulder: [0, 0, 1.55], lElbow: [0, 0, 0], rElbow: [0, 0, 0] };
const ONE_ARM_UP: Pose = { ...STAND, head: [-0.2, 0, 0], rShoulder: [0.2, 0, 2.8], rElbow: [0.1, 0, 0], lShoulder: [0.45, 0, -0.5], lElbow: [1.9, 0, 0] };
const DANCE_A: Pose = { spine: [0, 0.2, 0.18], lHip: [0.2, 0, -0.15], lKnee: [-0.55, 0, 0], rHip: [-0.05, 0, 0.12], rKnee: [-0.15, 0, 0], lShoulder: [0.6, 0, -0.75], rShoulder: [-0.2, 0, 1.1], lElbow: [1.6, 0, 0], rElbow: [1.5, 0, 0], hipsPos: [0.06, -0.06, 0] };
const DANCE_B: Pose = { spine: [0, -0.2, -0.18], rHip: [0.2, 0, 0.15], rKnee: [-0.55, 0, 0], lHip: [-0.05, 0, -0.12], lKnee: [-0.15, 0, 0], rShoulder: [0.6, 0, 0.75], lShoulder: [-0.2, 0, -1.1], lElbow: [1.5, 0, 0], rElbow: [1.6, 0, 0], hipsPos: [-0.06, -0.06, 0] };
const dance = (t0: number, n: number, beat: number): ReactKey[] =>
  Array.from({ length: n }, (_, i) => ({ t: t0 + beat * (i + 1), pose: i % 2 ? DANCE_B : DANCE_A, side: (i % 2 ? -1 : 1) * 0.04 }));

// ── per-player goal celebrations ─────────────────────────────────────────────
export const CELEBRATIONS: Record<string, ReactKey[]> = {
  // short run, then both index fingers to the sky
  messi: [{ t: 0, pose: STAND }, ...run(0, 4, 0.16, {}, { fwd: 0.8, side: 0.9, yaw: 0.9 }), { t: 0.9, pose: POINT_UP, fwd: 0.85, side: 0.95, yaw: 1.4 }, { t: 2.4, pose: POINT_UP, fwd: 0.85, side: 0.95, yaw: 1.5 }],
  // backwards run, jump with a half spin, wide landing, arms out
  ronaldo: [
    { t: 0, pose: STAND },
    ...run(0, 4, 0.15, { yaw: 0 }, { fwd: -0.9, yaw: Math.PI }),
    // jump with a full turn in the air, landing facing the crowd (camera)
    { t: 0.75, pose: TUCK, fwd: -1.0, up: 0.45, yaw: Math.PI * 2 },
    { t: 0.98, pose: TUCK, fwd: -1.05, up: 0.2, yaw: Math.PI * 2.85 },
    { t: 1.1, pose: SIU, fwd: -1.05, up: 0, yaw: Math.PI * 3 },
    { t: 2.5, pose: SIU, fwd: -1.05, yaw: Math.PI * 3 },
  ],
  neymar: [{ t: 0, pose: STAND }, ...dance(0, 8, 0.24), { t: 2.2, pose: ARMS_UP }],
  mbappe: [{ t: 0, pose: STAND }, ...run(0, 3, 0.16, {}, { fwd: 0.4, yaw: 0.6 }), { t: 0.7, pose: ARMS_CROSSED, fwd: 0.45, yaw: 0.9 }, { t: 2.4, pose: ARMS_CROSSED, fwd: 0.45, yaw: 0.95 }],
  yamal: [{ t: 0, pose: STAND }, ...run(0, 3, 0.16, {}, { fwd: 0.5, side: -0.5, yaw: -0.8 }), { t: 0.7, pose: EAR, fwd: 0.5, side: -0.55, yaw: -1.2 }, { t: 2.3, pose: EAR, fwd: 0.5, side: -0.55, yaw: -1.25 }],
  son: [{ t: 0, pose: STAND }, ...run(0, 3, 0.16, {}, { fwd: 0.3, yaw: 0.5 }), { t: 0.75, pose: FRAME, fwd: 0.3, yaw: Math.PI * 0.9 }, { t: 2.4, pose: FRAME, fwd: 0.3, yaw: Math.PI * 0.95 }],
  kane: [{ t: 0, pose: STAND }, { t: 0.35, pose: FIST_HIGH, yaw: 0.6 }, { t: 0.6, pose: FIST_LOW, yaw: 0.7 }, { t: 0.85, pose: FIST_HIGH, yaw: 0.75 }, { t: 1.1, pose: FIST_LOW, yaw: 0.8 }, { t: 2.2, pose: FIST_LOW, yaw: 0.8 }],
  // sits down cross-legged, eyes closed
  haaland: [{ t: 0, pose: STAND }, ...run(0, 2, 0.18, {}, { fwd: 0.3, yaw: Math.PI }), { t: 1.0, pose: MEDITATE, fwd: 0.3, yaw: Math.PI }, { t: 2.5, pose: MEDITATE, fwd: 0.3, yaw: Math.PI }],
  vinicius: [{ t: 0, pose: STAND }, ...dance(0, 10, 0.17), { t: 2.0, pose: DANCE_A }],
  bellingham: [{ t: 0, pose: STAND }, ...run(0, 3, 0.16, {}, { fwd: 0.4, yaw: Math.PI * 0.8 }), { t: 0.75, pose: WIDE_ARMS, fwd: 0.4, yaw: Math.PI }, { t: 2.4, pose: WIDE_ARMS, fwd: 0.4, yaw: Math.PI }],
  rodri: [{ t: 0, pose: STAND }, { t: 0.4, pose: BOTH_FISTS, yaw: 0.5 }, { t: 0.7, pose: BOTH_FISTS_UP, yaw: 0.6 }, { t: 1.0, pose: BOTH_FISTS, yaw: 0.6 }, { t: 2.1, pose: BOTH_FISTS, yaw: 0.6 }],
  salah: [{ t: 0, pose: STAND }, ...run(0, 6, 0.16, {}, { fwd: 1.1, side: 1.2, yaw: 1.0 }, { lShoulder: [0.2, 0, -1.35], rShoulder: [0.2, 0, 1.35], lElbow: [0.2, 0, 0], rElbow: [0.2, 0, 0] }), { t: 1.2, pose: WIDE_ARMS, fwd: 1.15, side: 1.25, yaw: 1.1 }, { t: 2.3, pose: WIDE_ARMS, fwd: 1.15, side: 1.25, yaw: 1.1 }],
  debruyne: [{ t: 0, pose: STAND }, { t: 0.45, pose: FIST_LOW, yaw: 0.4 }, { t: 0.75, pose: { ...FIST_LOW, rElbow: [2.3, 0, 0] }, yaw: 0.45 }, { t: 1.9, pose: FIST_LOW, yaw: 0.45 }],
  lewandowski: [{ t: 0, pose: STAND }, { t: 0.35, pose: BOTH_FISTS }, { t: 0.65, pose: BOTH_FISTS_UP }, { t: 0.95, pose: BOTH_FISTS }, { t: 1.9, pose: BOTH_FISTS_UP }],
  bruno: [{ t: 0, pose: STAND }, ...run(0, 3, 0.16, {}, { fwd: 0.5, side: 0.3, yaw: 0.6 }), { t: 0.75, pose: ONE_ARM_UP, fwd: 0.5, side: 0.3, yaw: 0.8 }, { t: 2.2, pose: ARMS_UP, fwd: 0.5, side: 0.3, yaw: 0.8 }],
  default: [{ t: 0, pose: STAND }, { t: 0.45, pose: ARMS_UP }, { t: 2.0, pose: ARMS_UP }],
};

// ── frustration pool (shared) ────────────────────────────────────────────────
const HANDS_HIPS: Pose = { ...STAND, head: [0.55, 0, 0], spine: [-0.1, 0, 0], lShoulder: [-0.15, 0, -0.55], rShoulder: [-0.15, 0, 0.55], lElbow: [1.75, 0, 0], rElbow: [1.75, 0, 0] };
const HANDS_HEAD: Pose = { ...STAND, head: [-0.4, 0, 0], spine: [0.1, 0, 0], lShoulder: [0.5, 0, -2.35], rShoulder: [0.5, 0, 2.35], lElbow: [2.3, 0, 0], rElbow: [2.3, 0, 0] };
const CROUCH: Pose = { ...HANDS_HEAD, head: [0.3, 0, 0], spine: [-0.45, 0, 0], lHip: [1.5, 0, -0.15], rHip: [1.5, 0, 0.15], lKnee: [-2.45, 0, 0], rKnee: [-2.45, 0, 0], lAnkle: [0.9, 0, 0], rAnkle: [0.9, 0, 0], hipsPos: [0, -0.52, 0] };
const SLUMP: Pose = { ...STAND, head: [0.6, 0, 0], spine: [-0.2, 0, 0], lShoulder: [0, 0, -0.08], rShoulder: [0, 0, 0.08], lElbow: [0.1, 0, 0], rElbow: [0.1, 0, 0] };

export const FRUSTRATIONS: Record<'hips' | 'head' | 'crouch' | 'turn', ReactKey[]> = {
  hips: [{ t: 0, pose: STAND }, { t: 0.45, pose: HANDS_HIPS, yaw: 0.25 }, { t: 1.4, pose: HANDS_HIPS, yaw: 0.3 }, { t: 1.8, pose: { ...HANDS_HIPS, head: [0.75, 0, 0] }, yaw: 0.3 }],
  head: [{ t: 0, pose: STAND }, { t: 0.4, pose: HANDS_HEAD, fwd: -0.15 }, { t: 1.8, pose: HANDS_HEAD, fwd: -0.25 }],
  crouch: [{ t: 0, pose: STAND }, { t: 0.35, pose: HANDS_HEAD }, { t: 0.8, pose: CROUCH }, { t: 1.9, pose: CROUCH }],
  turn: [{ t: 0, pose: STAND }, ...run(0, 3, 0.2, {}, { fwd: -0.5, yaw: Math.PI * 0.85 }, { head: [0.5, 0, 0] }), { t: 0.85, pose: SLUMP, fwd: -0.55, yaw: Math.PI * 0.9 }, { t: 1.9, pose: SLUMP, fwd: -0.6, yaw: Math.PI * 0.9 }],
};

export type ShotResultKind = 'GOAL' | 'SAVE' | 'MISS' | 'WOODWORK';

/** frustration for a failed shot, varied but deterministic per attempt */
export function frustrationFor(kind: ShotResultKind, pick: number): ReactKey[] {
  const pool: (keyof typeof FRUSTRATIONS)[] = kind === 'SAVE' ? ['hips', 'turn'] : kind === 'MISS' ? ['head', 'turn', 'hips'] : ['head', 'crouch'];
  return FRUSTRATIONS[pool[Math.abs(pick) % pool.length]];
}
