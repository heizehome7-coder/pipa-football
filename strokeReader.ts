import * as THREE from 'three';
import { FIELD, type ModeConfig } from '../core/config';
import { clamp, lerp } from '../core/math';
import type { ShotInput } from '../core/types';
import { calculateShotParameters, shotProfile, type ShotIntent } from '../physics/BallPhysics';
import { isInstep, shotModifiers, strokeHash } from '../../players/abilities';
import type { PlayerDef } from '../../players/players';

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
 * Converts the player's screen stroke into a shot (intent → physics).
 *
 * The drawn line is not a rail. Four separate features are read from it:
 *   direction — where it ends on the goal (camera ray → goal plane)
 *   curve     — its dominant sideways bow → STRAIGHT / CURLED / OUTSIDE_FOOT side spin
 *               (3 strengths: light / medium / strong; an S stroke uses its main bend)
 *   loft      — how far it rises above its end point → a lofted shot (else driven)
 *   power     — drawing speed
 * calculateShotParameters() turns that into a real launch; the ball then flies by
 * physics (gravity, drag, Magnus) and arrives where the stroke ended.
 */
export function readStroke(samples: SwipeSample[], ctx: StrokeContext, cfg: ModeConfig, kicker?: PlayerDef | null): StrokeReading | null {
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
  const shape = pts.slice(); // the drawn shape (before any continuation) for curve/loft

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

  // 5) INTENT, read straight from the drawn shape on screen — curve and height are
  //    separate features (bending the stroke never lifts the ball):
  //      side curve = the stroke's dominant sideways bow from its chord  → side spin
  //      loft       = how far the stroke rises ABOVE where it ends      → lofted shot
  //      direction  = where it ends on the goal (T)                     → aim
  //      speed      = drawing speed                                     → power
  const A0 = shape[0];
  const A1 = shape[shape.length - 1];
  const cx = A1.x - A0.x;
  const cy = A1.y - A0.y;
  const chord = Math.hypot(cx, cy) || 1;
  // sideways bow = HORIZONTAL offset from the straight chord at the same point along the
  // stroke (arc-length fraction) — an arched (lofted) stroke adds no false curve
  const n = shape.length;
  let bowPx = 0;
  let archPx = 0;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const d = shape[i].x - (A0.x + cx * t);
    if (Math.abs(d) > Math.abs(bowPx)) bowPx = d; // ONE dominant lobe: an S stroke can't make an S ball
    archPx = Math.max(archPx, A0.y + cy * t - shape[i].y); // bulging upwards (a lofted path)
  }
  const bend = bowPx / chord;
  let topY = Infinity;
  for (const q of shape) topY = Math.min(topY, q.y);
  const rise = Math.max(0, (A1.y - topY) / H);
  const lofted = rise > 0.035;
  // seen in perspective, an arched path drifts a little sideways on screen just from
  // being arched: discount that part so an arch over the wall stays a straight shot
  const arch = archPx / chord;
  const shot = shotProfile(Math.sign(bend) * Math.max(0, Math.abs(bend) - Math.min(0.06, arch * 0.6)), cfg);
  // 6) UPDATE 5: the kicker's abilities — small modifiers, never overriding the stroke
  const seed = strokeHash(samples);
  const low = !lofted && T.y < 0.75;
  const mods = shotModifiers(kicker, { mode: cfg.id, power, level: shot.level, spinSign: Math.sign(shot.spin), lofted, low });
  const aim = T.clone();
  if (mods.err > 0) {
    // aim error (deterministic from the stroke, so the dashed preview is still the real flight)
    const e1 = ((seed & 0xffff) / 0xffff) * 2 - 1;
    const e2 = (((seed >>> 16) & 0xffff) / 0xffff) * 2 - 1;
    aim.x += mods.err * e1;
    aim.y = clamp(aim.y + mods.err * 0.6 * e2, R, 9);
  }
  const knuckle = shot.level === 0 ? mods.knuckle : 0;
  let profile = shot.profile;
  if (shot.level > 0 && kicker) profile = isInstep(kicker, Math.sign(shot.spin)) ? 'CURLED' : 'OUTSIDE_FOOT';
  if (knuckle > 0) profile = 'KNUCKLE';
  const intent: ShotIntent = {
    target: aim,
    spin: shot.spin * mods.spinMul,
    profile,
    curveLevel: shot.level,
    apex: lofted ? Math.min(cfg.maxApex, Math.max(B.y, T.y) + rise * cfg.loftPerScreen) : null,
    power,
    speedMul: mods.speedMul,
    knuckle,
    kseed: seed,
    special: mods.special,
  };
  const input = calculateShotParameters(B, intent, cfg);
  return { input, intent, speed };
}
