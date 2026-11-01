import * as THREE from 'three';
import { FIELD, type ModeConfig } from '../core/config';
import { clamp, lerp } from '../core/math';
import type { ShotInput } from '../core/types';
import { calculateShotParameters, type ShotIntent } from '../physics/BallPhysics';

export interface SwipeSample {
  x: number;
  y: number;
  t: number;
}

export interface Pt {
  x: number;
  y: number;
}

/** Camera services the reader needs (kept abstract so it also runs headless in tests). */
export interface StrokeContext {
  viewportH: number;
  ball: THREE.Vector3;
  project(p: THREE.Vector3): Pt;
  ray(sx: number, sy: number): THREE.Ray;
}

export interface StrokeReading {
  /** the physical launch (velocity + side spin) — what the game and the network use */
  input: ShotInput;
  /** what the stroke asked for: direction/end point, main bend, height, power */
  intent: ShotIntent;
  /** stroke drawing speed, screen-heights per second */
  speed: number;
}

const R = FIELD.ballRadius;
const RESAMPLE = 48;

/** Resample a polyline to n points evenly spaced by arc length. */
function resample(pts: Pt[], n: number): Pt[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = cum[cum.length - 1] || 1;
  const out: Pt[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const d = (total * k) / (n - 1);
    while (j < cum.length - 2 && cum[j + 1] < d) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const f = clamp((d - cum[j]) / seg, 0, 1);
    out.push({ x: lerp(pts[j].x, pts[j + 1].x, f), y: lerp(pts[j].y, pts[j + 1].y, f) });
  }
  return out;
}

/** Light [1 2 1] smoothing; endpoints fixed. Removes finger jitter, keeps the bend. */
function smooth(pts: Pt[], passes: number): Pt[] {
  let a = pts;
  for (let p = 0; p < passes; p++) {
    const b = a.map((q) => ({ ...q }));
    for (let i = 1; i < a.length - 1; i++) {
      b[i].x = (a[i - 1].x + 2 * a[i].x + a[i + 1].x) / 4;
      b[i].y = (a[i - 1].y + 2 * a[i].y + a[i + 1].y) / 4;
    }
    a = b;
  }
  return a;
}

function arcFractions(pts: Pt[]) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = cum[cum.length - 1] || 1;
  return cum.map((c) => c / total);
}

/** Display version of a raw stroke (same smoothing as the shot uses). */
export function smoothStroke(samples: Pt[]): Pt[] {
  if (samples.length < 3) return samples;
  return smooth(resample(samples, Math.min(64, Math.max(8, samples.length * 2))), 2);
}

/**
 * Converts the player's screen stroke into a shot (UPDATE 3: intent → physics).
 *
 * The stroke is read into a smooth 3D path first (below), but that path is no
 * longer a rail: from it we only take the INTENT — where it ends on the goal, its
 * one main sideways bend, how high it arcs, and the drawing speed — and
 * calculateShotParameters() turns that into a real launch. The ball then flies by
 * physics, so it lands where the stroke pointed with a believable shape.
 *
 * How the path is read:
 *
 * Every point of the (smoothed) stroke keeps its own screen position; we only
 * decide how far down the pitch it is. Depth comes from the stroke's arc-length
 * fraction, corrected for perspective with the straight reference line
 * ball → end point. So:
 *   - a straight stroke reproduces exactly that straight 3D line,
 *   - a stroke bowing left/right becomes a ball that bends left/right,
 *   - a stroke arching high becomes a lob (the ray at mid-depth is high),
 * and the projected 3D path lies exactly under the finger's line.
 */
export function readStroke(samples: SwipeSample[], ctx: StrokeContext, cfg: ModeConfig): StrokeReading | null {
  if (samples.length < 3) return null;
  const H = ctx.viewportH;
  const S = samples[0];
  const E = samples[samples.length - 1];
  let len = 0;
  let t0 = S.t;
  let moved = false;
  let minY = S.y;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    len += Math.hypot(b.x - a.x, b.y - a.y);
    minY = Math.min(minY, b.y);
    if (!moved && Math.hypot(b.x - S.x, b.y - S.y) > 6) {
      moved = true;
      t0 = a.t;
    }
  }
  // must travel up-screen (towards goal) by a meaningful amount
  if (len < H * 0.06 || S.y - minY < H * 0.05 || S.y - E.y < H * 0.02) return null;

  // speed → power (independent of shape)
  const dur = Math.max(30, E.t - t0);
  const speed = len / H / (dur / 1000);
  const power = Math.pow(clamp((speed - cfg.swipeSpeedMin) / (cfg.swipeSpeedMax - cfg.swipeSpeedMin), 0, 1), 0.8);

  // 1) smooth (resample by arc length + gentle filter)
  let pts = smooth(resample(samples, RESAMPLE), 2);

  // 2) anchor the stroke start on the ball, fading the correction out along the stroke
  const ballS = ctx.project(ctx.ball);
  const ox = ballS.x - pts[0].x;
  const oy = ballS.y - pts[0].y;
  const fr = arcFractions(pts);
  pts = pts.map((p, i) => ({ x: p.x + ox * (1 - fr[i]), y: p.y + oy * (1 - fr[i]) }));

  // 3) a stroke that stops short of the goal line is continued along its final direction
  const goalLineY = ctx.project(new THREE.Vector3(0, 0, 0)).y;
  const last = pts[pts.length - 1];
  if (last.y > goalLineY) {
    const k = Math.max(0, Math.floor(pts.length * 0.8) - 1);
    const dx = last.x - pts[k].x;
    const dy = last.y - pts[k].y;
    if (dy < -1) {
      const m = (goalLineY - 2 - last.y) / dy;
      for (let s = 1; s <= 8; s++) pts.push({ x: last.x + (dx * m * s) / 8, y: last.y + (dy * m * s) / 8 });
    }
  }

  // 4) end point on the goal plane (z = 0)
  const endRay = ctx.ray(pts[pts.length - 1].x, pts[pts.length - 1].y);
  const goalPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const T = endRay.intersectPlane(goalPlane, new THREE.Vector3());
  if (!T) return null;
  T.y = clamp(T.y, R, 9);
  const B = ctx.ball.clone();
  const fwd = new THREE.Vector3(T.x - B.x, 0, T.z - B.z);
  const dist = fwd.length();
  if (dist < 1) return null;
  fwd.divideScalar(dist);

  // 5) perspective re-spacing: resample the stroke so equal index steps are equal
  //    3D steps along the straight reference line ball → end (near the ball one
  //    metre covers many pixels, near the goal only a few).
  const NG = 64;
  const g: number[] = [0];
  let prev = ctx.project(B);
  const tmp = new THREE.Vector3();
  for (let i = 1; i <= NG; i++) {
    const q = ctx.project(tmp.lerpVectors(B, T, i / NG));
    g.push(g[i - 1] + Math.hypot(q.x - prev.x, q.y - prev.y));
    prev = q;
  }
  const gTot = g[NG] || 1;
  const n = RESAMPLE;
  const frs = arcFractions(pts);
  const at = (f: number): Pt => {
    let j = 0;
    while (j < frs.length - 2 && frs[j + 1] < f) j++;
    const u = clamp((f - frs[j]) / (frs[j + 1] - frs[j] || 1), 0, 1);
    return { x: lerp(pts[j].x, pts[j + 1].x, u), y: lerp(pts[j].y, pts[j + 1].y, u) };
  };
  const sp: Pt[] = [];
  for (let k = 0; k < n; k++) sp.push(at(g[Math.round((k / (n - 1)) * NG)] / gTot));
  // finer than NG: interpolate g
  for (let k = 0; k < n; k++) {
    const x = (k / (n - 1)) * NG;
    const i0 = Math.min(NG - 1, Math.floor(x));
    sp[k] = at(lerp(g[i0], g[i0 + 1], x - i0) / gTot);
  }

  //    each point lies on its camera ray; on that ray its 3D position is affine in
  //    its depth s (0 = ball, 1 = goal plane): P_k(s) = A_k + C_k·s
  const A: THREE.Vector3[] = [];
  const C: THREE.Vector3[] = [];
  const fB = fwd.dot(B);
  for (let k = 0; k < n; k++) {
    const ray = ctx.ray(sp[k].x, sp[k].y);
    const den = fwd.dot(ray.direction);
    if (den < 1e-4) {
      A.push(B.clone());
      C.push(T.clone().sub(B));
      continue;
    }
    const t0 = (fB - fwd.dot(ray.origin)) / den;
    A.push(ray.origin.clone().addScaledVector(ray.direction, t0));
    C.push(ray.direction.clone().multiplyScalar(dist / den));
  }
  //    fit a ball-flight curve to the rays. Parametrised by depth s:
  //      P(s) = B + fwd·dist·s + right·Lat(s) + up·Hgt(s)
  //      Lat(s) = s(1−s)(c0 + c1 s)                   (sideways bend: spin, can bend late)
  //      Hgt(s) = lerp(By, Ty, s) + d0·s(1−s)                (arc: one gravity parabola)
  //    Height gets a single parabola on purpose: a central shot flies in a plane
  //    that nearly contains the camera, where any height/depth mix projects to the
  //    same stroke — gravity's constant curvature is what makes it unambiguous.
  //    Alternate: (a) depths fixed → shape coefficients by linear least squares,
  //    (b) shape fixed → each stroke point's depth = closest approach to its ray.
  //    Straight, curled and lobbed strokes are reproduced without flattening.
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const cam = ctx.ray(ballS.x, ballS.y).origin;
  const sK = sp.map((_, k) => k / (n - 1));
  const c = [0, 0, 0];
  const d = [0, 0, 0];
  const phi = (sv: number, j: number) => sv * (1 - sv) * Math.pow(sv, j);
  const curveAt = (sv: number, out: THREE.Vector3) => {
    let lat = 0;
    let hgt = lerp(B.y, T.y, sv);
    for (let j = 0; j < 3; j++) {
      lat += c[j] * phi(sv, j);
      hgt += d[j] * phi(sv, j);
    }
    return out.copy(B).addScaledVector(fwd, dist * sv).addScaledVector(right, lat).setY(hgt);
  };
  const q = new THREE.Vector3();
  const cp = new THREE.Vector3();
  for (let iter = 0; iter < 16; iter++) {
    // (a) shape
    const Ml = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const Mh = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const bl = [0, 0, 0];
    const bh = [0, 0, 0];
    for (let k = 1; k < n - 1; k++) {
      const sv = sK[k];
      q.copy(A[k]).addScaledVector(C[k], sv);
      const w = 1 / Math.max(1, q.distanceTo(cam));
      const w2 = w * w;
      const lat = right.dot(q.clone().sub(B));
      const hgt = q.y - lerp(B.y, T.y, sv);
      for (let i = 0; i < 3; i++) {
        const pi = phi(sv, i);
        for (let j = 0; j < 3; j++) {
          Ml[i][j] += w2 * pi * phi(sv, j);
          if (i === 0 && j === 0) Mh[0][0] += w2 * pi * pi;
        }
        bl[i] += w2 * pi * lat;
        bh[i] += w2 * pi * hgt;
      }
    }
    // lateral: two terms (c2 stays 0)
    const det2 = Ml[0][0] * Ml[1][1] - Ml[0][1] * Ml[1][0];
    if (Math.abs(det2) > 1e-14) {
      c[0] = (bl[0] * Ml[1][1] - Ml[0][1] * bl[1]) / det2;
      c[1] = (Ml[0][0] * bl[1] - Ml[1][0] * bl[0]) / det2;
    }
    d[0] = Mh[0][0] > 1e-12 ? bh[0] / Mh[0][0] : 0;
    // (b) depths
    for (let k = 1; k < n - 1; k++) {
      let best = sK[k];
      let bestE = Infinity;
      const lo = Math.max(0.0005, sK[k] - 0.3);
      const hi = Math.min(0.9995, sK[k] + 0.3);
      for (let t = 0; t <= 24; t++) {
        const sv = lo + ((hi - lo) * t) / 24;
        const e = curveAt(sv, cp).distanceToSquared(q.copy(A[k]).addScaledVector(C[k], sv));
        if (e < bestE) {
          bestE = e;
          best = sv;
        }
      }
      sK[k] = best;
    }
  }

  // 6) intent from the fitted path — ONE dominant bend (an S stroke can't make an S ball)
  let bow = 0;
  let apex = Math.max(B.y, T.y);
  for (let i = 1; i < 40; i++) {
    const p = curveAt(i / 40, cp);
    const lat = right.x * (p.x - B.x) + right.z * (p.z - B.z);
    if (Math.abs(lat) > Math.abs(bow)) bow = lat;
    apex = Math.max(apex, clamp(p.y, R, 14));
  }
  const intent: ShotIntent = { target: T.clone(), bow, apex, power };
  const input = calculateShotParameters(B, intent, cfg);
  return { input, intent, speed };
}
