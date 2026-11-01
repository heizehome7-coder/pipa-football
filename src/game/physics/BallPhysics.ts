import * as THREE from 'three';
import { FIELD, type ModeConfig } from '../core/config';
import { clamp, lerp } from '../core/math';
import type { ShotInput } from '../core/types';

/**
 * PIPA core ball physics (UPDATE 3) — one module for every shot:
 * single-player penalty, free kick, the online shoot-out on both phones AND the
 * server's judge, and the white dashed preview.
 *
 *   calculateShotParameters()  drawn intent → a real launch (velocity + side spin)
 *   simulateBallPhysics()      launch → flight, fixed 1/480 s steps:
 *                                gravity · quadratic air drag · Magnus side force
 *                                (clamped) · spin decay · ground bounce/roll
 *
 * The drawn line is NOT a rail any more: it only says where, how high, how hard
 * and which way to bend. Whatever is drawn, the ball can only do what a real ball
 * does — no S-turns, no 90° turns, no climbing after launch, no hanging in the air.
 *
 * Determinism: the integrator uses only + − × ÷ and sqrt (exactly specified by
 * IEEE-754), constants are literals, so every device and the server get the same
 * flight from the same launch numbers.
 */

export const BALL = {
  g: FIELD.gravity,
  /** fixed physics step */
  dt: 1 / 480,
  /** quadratic drag k (1/m): a = −k·|v|·v — light, so the ball keeps its pace to the goal */
  drag: 0.0085,
  /** side-spin decay per step (≈ e^(−0.5/s)) */
  spinDecay: 0.99896,
  /** largest side-spin parameter (1/s) and Magnus acceleration (m/s²) at curve multiplier 1 */
  spinMax: 0.5,
  magnusMax: 10,
  /** ground contact */
  bounce: 0.5,
  bounceFriction: 0.85,
  rollFriction: 1.2,
  maxSpeed: 40,
} as const;

export type ShotProfile = 'STRAIGHT' | 'CURLED' | 'OUTSIDE_FOOT';

/** What the player meant, read from the drawn stroke (curve and loft are separate). */
export interface ShotIntent {
  /** where the stroke ends on the goal plane (z = 0) */
  target: THREE.Vector3;
  /** side spin (1/s): + curls left (right-foot instep), − curls right (outside of the right foot) */
  spin: number;
  profile: ShotProfile;
  /** 0 straight · 1 light · 2 medium · 3 strong */
  curveLevel: number;
  /** drawn peak height for a lofted shot, or null for a driven shot */
  apex: number | null;
  /** 0..1 from drawing speed */
  power: number;
}

/**
 * Stroke bend (dominant bow ÷ chord, + = bulges right) → shot profile + side spin.
 * Three strengths so a light bend stays nearly straight and a big one really curls;
 * the kicker is right-footed: bulging right = curls back left = instep (CURLED),
 * bulging left = curls right = outside of the foot (OUTSIDE_FOOT).
 */
export function shotProfile(bend: number, cfg: ModeConfig): { profile: ShotProfile; spin: number; level: number } {
  const a = Math.abs(bend);
  const level = a < 0.04 ? 0 : a < 0.09 ? 1 : a < 0.15 ? 2 : 3;
  if (!level) return { profile: 'STRAIGHT', spin: 0, level };
  const frac = [0, 0.35, 0.65, 0.9][level];
  const spin = Math.sign(bend) * frac * curveLimits(cfg).spinMax;
  return { profile: bend > 0 ? 'CURLED' : 'OUTSIDE_FOOT', spin: Math.round(spin * 10000) / 10000, level };
}

export interface Trajectory {
  dt: number;
  /** number of samples (sample i is at time i·dt, the last one may be shorter: tEnd) */
  n: number;
  tEnd: number;
  pos: Float64Array;
  vel: Float64Array;
  /** reached the goal plane (z ≤ stopZ) — false when it stopped short / timed out */
  reached: boolean;
  apex: number;
}

export function curveLimits(cfg: ModeConfig) {
  return { spinMax: BALL.spinMax * cfg.curveMultiplier, magnusMax: BALL.magnusMax * cfg.curveMultiplier, maxApex: cfg.maxApex };
}

/**
 * Integrates one flight from the strike. Stops when the ball reaches the goal
 * plane (z ≤ stopZ, crossing point interpolated), comes to rest, or after maxT.
 */
export function simulateBallPhysics(
  start: { x: number; y: number; z: number },
  v0: [number, number, number],
  spin: number,
  cfg: ModeConfig,
  opts: { stopZ?: number; maxT?: number; record?: boolean; ground?: boolean } = {},
): Trajectory {
  const { magnusMax } = curveLimits(cfg);
  const dt = BALL.dt;
  const stopZ = opts.stopZ ?? 0;
  const maxT = opts.maxT ?? 6;
  const rec = opts.record !== false;
  const ground = opts.ground !== false;
  const cap = Math.ceil(maxT / dt) + 2;
  const pos = new Float64Array(rec ? cap * 3 : 6);
  const vel = new Float64Array(rec ? cap * 3 : 6);
  const R = FIELD.ballRadius;
  let px = start.x;
  let py = start.y;
  let pz = start.z;
  let vx = v0[0];
  let vy = v0[1];
  let vz = v0[2];
  let s = spin;
  let n = 0;
  let apex = py;
  const put = () => {
    if (rec) {
      const k = n * 3;
      pos[k] = px;
      pos[k + 1] = py;
      pos[k + 2] = pz;
      vel[k] = vx;
      vel[k + 1] = vy;
      vel[k + 2] = vz;
    }
    n++;
  };
  put();
  let reached = false;
  let tEnd = 0;
  const steps = Math.floor(maxT / dt);
  for (let i = 1; i <= steps; i++) {
    const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
    // drag (opposes motion) + gravity
    let ax = -BALL.drag * sp * vx;
    let ay = -BALL.drag * sp * vy - BALL.g;
    let az = -BALL.drag * sp * vz;
    // Magnus from side spin about the vertical axis: a = s·(ŷ × v) — sideways only,
    // never lifts the ball; strength grows with speed, clamped to a real-ball maximum
    let mx = s * vz;
    let mz = -s * vx;
    const m = Math.sqrt(mx * mx + mz * mz);
    if (m > magnusMax) {
      mx *= magnusMax / m;
      mz *= magnusMax / m;
    }
    ax += mx;
    az += mz;
    // semi-implicit Euler (stable, deterministic)
    vx += ax * dt;
    vy += ay * dt;
    vz += az * dt;
    const ox = px;
    const oy = py;
    const oz = pz;
    px += vx * dt;
    py += vy * dt;
    pz += vz * dt;
    s *= BALL.spinDecay;
    // ground
    if (ground && py < R) {
      py = R;
      if (vy < -1.0) {
        vy = -vy * BALL.bounce;
        vx *= BALL.bounceFriction;
        vz *= BALL.bounceFriction;
        s *= 0.6;
      } else {
        vy = 0;
        const f = 1 - BALL.rollFriction * dt;
        vx *= f;
        vz *= f;
      }
    }
    if (py > apex) apex = py;
    if (pz <= stopZ && oz > stopZ) {
      // exact crossing of the goal plane
      const u = (oz - stopZ) / (oz - pz);
      px = ox + (px - ox) * u;
      py = oy + (py - oy) * u;
      pz = stopZ;
      tEnd = (i - 1 + u) * dt;
      reached = true;
      put();
      break;
    }
    tEnd = i * dt;
    put();
    if (ground && py <= R + 1e-6 && vy === 0 && vx * vx + vz * vz < 0.09) break; // came to rest
    if (!ground && py < -6) break;
  }
  return { dt, n, tEnd, pos, vel, reached, apex };
}

// ── intent → launch ───────────────────────────────────────────────────────
/** crossing point of the goal plane (or the extrapolated equivalent when short) */
function crossing(B: THREE.Vector3, v: [number, number, number], spin: number, cfg: ModeConfig) {
  // solver probes fly through the grass (no bounce) so the search space stays smooth
  const tr = simulateBallPhysics(B, v, spin, cfg, { maxT: 4, ground: false });
  const k = (tr.n - 1) * 3;
  let x = tr.pos[k];
  let y = tr.pos[k + 1];
  if (!tr.reached) {
    // fell short: pretend it carried on along its last direction (pushes the solver up/harder)
    const vz = tr.vel[k + 2];
    const rem = tr.pos[k + 2];
    const tt = vz < -0.5 ? rem / -vz : 2;
    x += tr.vel[k] * tt;
    y = y - rem * 0.5;
  }
  return { x, y, t: tr.tEnd, apex: tr.apex, reached: tr.reached };
}

function launch(psi: number, theta: number, speed: number): [number, number, number] {
  const c = Math.cos(theta);
  return [Math.sin(psi) * c * speed, Math.sin(theta) * speed, -Math.cos(psi) * c * speed];
}

/** Solves a small square system F(u) = 0 by damped Newton with finite differences. */
function newton(u: number[], F: (u: number[]) => number[], lo: number[], hi: number[], iters: number) {
  let f = F(u);
  for (let it = 0; it < iters; it++) {
    const n = u.length;
    const J: number[][] = [];
    for (let j = 0; j < n; j++) {
      const h = Math.max(1e-4, Math.abs(u[j]) * 1e-3);
      const u2 = u.slice();
      u2[j] += h;
      const f2 = F(u2);
      for (let i = 0; i < n; i++) (J[i] ||= [])[j] = (f2[i] - f[i]) / h;
    }
    const d = solve(J, f.map((x) => -x));
    if (!d) break;
    let step = 1;
    let improved = false;
    const norm = (v: number[]) => v.reduce((a, b) => a + b * b, 0);
    for (let k = 0; k < 6; k++) {
      const un = u.map((x, i) => clamp(x + d[i] * step, lo[i], hi[i]));
      const fn = F(un);
      if (norm(fn) < norm(f)) {
        u = un;
        f = fn;
        improved = true;
        break;
      }
      step *= 0.5;
    }
    if (!improved || norm(f) < 1e-6) break;
  }
  return { u, f };
}

function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  return M.map((r, i) => r[n] / M[i][i]);
}

const round = (v: number) => Math.round(v * 10000) / 10000;

/**
 * Turns the drawn intent into a launch a real ball could have:
 *  - side spin comes straight from the stroke's curve (already chosen, per mode)
 *  - driven (default): speed from the drawing speed, aimed so that — spin, gravity and
 *    drag included — it arrives where the stroke ended; low/mid by default
 *  - lofted (only when the stroke rises above its end): peaks at the drawn height
 *    (capped per mode) and still travels forward as it drops; drawing it fast keeps
 *    it a driven, dipping shot
 */
export function calculateShotParameters(ball: THREE.Vector3, intent: ShotIntent, cfg: ModeConfig): ShotInput {
  const B = ball.clone();
  const T = intent.target;
  const lim = curveLimits(cfg);
  const dx = T.x - B.x;
  const dz = T.z - B.z;
  const dist = Math.max(1, Math.hypot(dx, dz));
  const power = clamp(intent.power, 0, 1);
  const speed = lerp(cfg.minSpeed, cfg.maxSpeed, power);
  const psi0 = Math.atan2(dx, -dz);
  const g = BALL.g;
  const spin = clamp(intent.spin, -lim.spinMax, lim.spinMax);

  // driven shot: aim (yaw, pitch) at the drawn end point
  const theta0 = Math.atan2(T.y - B.y + (g * dist * dist) / (2 * speed * speed), dist);
  const drive = newton(
    [psi0, theta0],
    (u) => {
      const c = crossing(B, launch(u[0], u[1], speed), spin, cfg);
      return [c.x - T.x, c.y - T.y];
    },
    [psi0 - 0.7, -0.08],
    [psi0 + 0.7, 0.6],
    10,
  );
  let v = launch(drive.u[0], drive.u[1], speed);
  const driven = crossing(B, v, spin, cfg);

  if (intent.apex !== null) {
    // lofted: peak at the drawn height (capped). Drawing fast keeps it closer to a
    // driven, dipping shot; drawing slowly floats it up to the drawn height.
    const drawnApex = Math.min(intent.apex, lim.maxApex);
    const wantApex = driven.apex + (drawnApex - driven.apex) * (1 - 0.7 * power);
    if (wantApex > Math.max(driven.apex, T.y) + 0.3) {
      const vy0 = Math.sqrt(2 * g * (wantApex - B.y));
      const tUp = vy0 / g;
      const tDn = Math.sqrt((2 * Math.max(0.05, wantApex - T.y)) / g);
      const vh0 = Math.max(dist / (tUp + tDn), cfg.minSpeed * 0.8); // keeps real forward pace
      const vel = (u: number[]): [number, number, number] => [Math.sin(u[0]) * u[1], u[2], -Math.cos(u[0]) * u[1]];
      const lob = newton(
        [psi0, vh0, vy0],
        (u) => {
          const c = crossing(B, vel(u), spin, cfg);
          return [c.x - T.x, c.y - T.y, (c.apex - wantApex) * 0.7];
        },
        [psi0 - 0.7, cfg.minSpeed * 0.75, 1],
        [psi0 + 0.7, BALL.maxSpeed, 14],
        12,
      );
      v = vel(lob.u);
    }
  }
  const sp = Math.hypot(v[0], v[1], v[2]);
  if (sp > cfg.maxSpeed) v = v.map((c) => (c * cfg.maxSpeed) / sp) as [number, number, number];
  return { v: [round(v[0]), round(v[1]), round(v[2])], spin: round(spin), power: round(power) };
}
