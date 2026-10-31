import * as THREE from 'three';
import { FIELD, type ModeConfig } from '../core/config';
import { clamp, lerp } from '../core/math';
import type { ShotInput } from '../core/types';

/**
 * A shot is a 3D path the player drew (ball → goal plane) plus a speed.
 *   shape  — a centripetal Catmull-Rom spline through the drawn control points,
 *            so the ball follows the stroke exactly (straight, curled, lobbed…)
 *   speed  — from how fast the stroke was drawn, with mild air drag along the path
 * Shape and speed are independent. Nothing is auto-generated: no target-point
 * parabola, no automatic side-spin.
 */
export interface ShotPlan {
  origin: THREE.Vector3;
  /** where the path meets the goal plane */
  target: THREE.Vector3;
  /** initial horizontal direction of travel (the kicker swings along this) */
  forward: THREE.Vector3;
  curve3: THREE.CatmullRomCurve3;
  length: number;
  speed: number;
  power: number;
  /** signed sideways bow of the path relative to its chord, -1..1 (visual spin only) */
  curve: number;
  /** highest point of the path (m) */
  apex: number;
  duration: number;
  drag: number;
}

export function buildShotPlan(origin: THREE.Vector3, input: ShotInput, cfg: ModeConfig): ShotPlan {
  const pts = input.points.map((p) => new THREE.Vector3(p[0], Math.max(FIELD.ballRadius, p[1]), p[2]));
  if (pts.length < 2 || pts[0].distanceTo(origin) > 1e-3) pts.unshift(origin.clone());
  // drop near-duplicate points (they make Catmull-Rom kink)
  const clean: THREE.Vector3[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].distanceTo(clean[clean.length - 1]) > 0.05 || i === pts.length - 1) clean.push(pts[i]);
  }
  if (clean.length < 2) clean.push(origin.clone().add(new THREE.Vector3(0, 0, -1)));
  const curve3 = new THREE.CatmullRomCurve3(clean, false, 'centripetal');
  curve3.arcLengthDivisions = 160;
  const length = Math.max(0.5, curve3.getLength());

  const power = clamp(input.power, 0, 1);
  const speed = lerp(cfg.minSpeed, cfg.maxSpeed, power);
  const k = cfg.drag;
  const x = (k * length) / speed;
  const duration = x < 0.9 ? -Math.log(1 - x) / k : (length / speed) * 1.6;

  const target = clean[clean.length - 1].clone();
  const tan = curve3.getTangentAt(0.02);
  const forward = new THREE.Vector3(tan.x, 0, tan.z);
  if (forward.lengthSq() < 1e-6) forward.set(target.x - origin.x, 0, target.z - origin.z);
  forward.normalize();

  // sideways bow (for visual spin) and apex
  const chord = new THREE.Vector3(target.x - origin.x, 0, target.z - origin.z);
  const chordLen = Math.max(0.5, chord.length());
  chord.divideScalar(chordLen);
  const right = new THREE.Vector3(-chord.z, 0, chord.x);
  let bow = 0;
  let apex = 0;
  const p = new THREE.Vector3();
  for (let i = 0; i <= 40; i++) {
    curve3.getPointAt(i / 40, p);
    const off = (p.x - origin.x) * right.x + (p.z - origin.z) * right.z;
    if (Math.abs(off) > Math.abs(bow)) bow = off;
    apex = Math.max(apex, p.y);
  }
  return {
    origin: origin.clone(),
    target,
    forward,
    curve3,
    length,
    speed,
    power,
    curve: clamp(bow / (chordLen * 0.18), -1, 1),
    apex,
    duration,
    drag: k,
  };
}

/** metres travelled along the path after t seconds */
function distanceAt(plan: ShotPlan, t: number) {
  const k = plan.drag;
  return k < 1e-4 ? plan.speed * t : (plan.speed * (1 - Math.exp(-k * t))) / k;
}

export function shotPositionAt(plan: ShotPlan, t: number, out = new THREE.Vector3()) {
  const u = clamp(distanceAt(plan, Math.max(0, t)) / plan.length, 0, 1);
  return plan.curve3.getPointAt(u, out);
}

export function shotVelocityAt(plan: ShotPlan, t: number, out = new THREE.Vector3()) {
  const u = clamp(distanceAt(plan, Math.max(0, t)) / plan.length, 0, 1);
  const v = plan.speed * Math.exp(-plan.drag * Math.max(0, t));
  return plan.curve3.getTangentAt(Math.min(u, 0.999), out).multiplyScalar(v);
}

/** Samples the path for drawing (ball → goal plane). */
export function samplePlan(plan: ShotPlan, n = 40) {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) out.push(plan.curve3.getPointAt(i / n));
  return out;
}

const _a = new THREE.Vector3();
/** First time the ball reaches the plane z = zPlane (null if it never does). */
export function timeToReachZ(plan: ShotPlan, zPlane: number) {
  const end = plan.duration;
  let prevT = 0;
  let prevZ = shotPositionAt(plan, 0, _a).z;
  for (let t = 0.004; t <= end + 1e-6; t += 0.004) {
    const z = shotPositionAt(plan, t, _a).z;
    if ((prevZ - zPlane) * (z - zPlane) <= 0) {
      const f = (prevZ - zPlane) / (prevZ - z || 1);
      return lerp(prevT, t, f);
    }
    prevT = t;
    prevZ = z;
  }
  return null;
}
