import * as THREE from 'three';
import type { ModeConfig } from '../core/config';
import { clamp } from '../core/math';
import type { ShotInput } from '../core/types';
import { BALL, simulateBallPhysics, type Trajectory } from './BallPhysics';

/**
 * A shot plan = the ball's physical flight from the strike to the goal plane,
 * integrated once by the shared ball physics (gravity, drag, Magnus, ground).
 * The game, the online judge and the white dashed preview all read this same
 * trajectory, so the preview is exactly what the ball does (until it hits a body,
 * the wall, the woodwork or the keeper — handled by KickGame).
 */
export interface ShotPlan {
  origin: THREE.Vector3;
  /** where the flight meets the goal plane (or where it stopped short) */
  target: THREE.Vector3;
  /** initial horizontal direction of travel (the kicker swings along this) */
  forward: THREE.Vector3;
  traj: Trajectory;
  /** launch speed (m/s) */
  speed: number;
  power: number;
  spin: number;
  /** normalised bend, −1..1 (+ = bulges right / curls back left; visual spin) */
  curve: number;
  /** highest point of the flight (m) */
  apex: number;
  /** seconds from the strike to the goal plane (or to the end of the flight) */
  duration: number;
  /** false → the ball never reached the goal line */
  reaches: boolean;
}

export function buildShotPlan(origin: THREE.Vector3, input: ShotInput, cfg: ModeConfig): ShotPlan {
  const traj = simulateBallPhysics(origin, input.v, input.spin, cfg, { maxT: 6 });
  const k = (traj.n - 1) * 3;
  const target = new THREE.Vector3(traj.pos[k], traj.pos[k + 1], traj.pos[k + 2]);
  const forward = new THREE.Vector3(input.v[0], 0, input.v[2]);
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();
  return {
    origin: origin.clone(),
    target,
    forward,
    traj,
    speed: Math.hypot(input.v[0], input.v[1], input.v[2]),
    power: clamp(input.power, 0, 1),
    spin: input.spin,
    curve: clamp(input.spin / BALL.spinMax || 0, -1, 1),
    apex: traj.apex,
    duration: traj.tEnd,
    reaches: traj.reached,
  };
}

function sample(arr: Float64Array, traj: Trajectory, t: number, out: THREE.Vector3) {
  const f = clamp(t, 0, traj.tEnd) / BALL.dt;
  let i = Math.floor(f);
  if (i >= traj.n - 1) i = traj.n - 2;
  if (i < 0) i = 0;
  // the last sample can be closer than one step (exact goal-plane crossing)
  const t0 = i * BALL.dt;
  const t1 = i + 1 === traj.n - 1 ? traj.tEnd : (i + 1) * BALL.dt;
  const u = t1 > t0 ? clamp((clamp(t, 0, traj.tEnd) - t0) / (t1 - t0), 0, 1) : 0;
  const a = i * 3;
  const b = a + 3;
  if (traj.n < 2) return out.set(arr[0], arr[1], arr[2]);
  return out.set(arr[a] + (arr[b] - arr[a]) * u, arr[a + 1] + (arr[b + 1] - arr[a + 1]) * u, arr[a + 2] + (arr[b + 2] - arr[a + 2]) * u);
}

export function shotPositionAt(plan: ShotPlan, t: number, out = new THREE.Vector3()) {
  return sample(plan.traj.pos, plan.traj, t, out);
}

export function shotVelocityAt(plan: ShotPlan, t: number, out = new THREE.Vector3()) {
  return sample(plan.traj.vel, plan.traj, t, out);
}

/** Samples the flight for drawing (strike → goal plane), evenly in time. */
export function samplePlan(plan: ShotPlan, n = 40) {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) out.push(shotPositionAt(plan, (plan.duration * i) / n));
  return out;
}

const _a = new THREE.Vector3();
/** First time the ball reaches the plane z = zPlane (null if it never does). */
export function timeToReachZ(plan: ShotPlan, zPlane: number) {
  let prevT = 0;
  let prevZ = shotPositionAt(plan, 0, _a).z;
  for (let t = 0.004; t <= plan.duration + 1e-6; t += 0.004) {
    const z = shotPositionAt(plan, t, _a).z;
    if ((prevZ - zPlane) * (z - zPlane) <= 0) {
      const f = (prevZ - zPlane) / (prevZ - z || 1);
      return prevT + (t - prevT) * f;
    }
    prevT = t;
    prevZ = z;
  }
  return null;
}
