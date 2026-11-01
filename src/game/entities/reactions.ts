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
// ── goal celebration (same for everyone: both arms up, cheering) ──
export const CELEBRATIONS: Record<string, ReactKey[]> = {
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
