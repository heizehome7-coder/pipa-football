import * as THREE from 'three';
import { BALL, curveLimits, knuckleNoise } from '../game/physics/BallPhysics';
import { MATCH_MODE, PITCH } from './config';

/**
 * UPDATE 11 — the match ball: the SAME force model as PIPA's shot physics
 * (BallPhysics.simulateBallPhysics: gravity, quadratic drag, Magnus side spin about the
 * vertical axis with the real-ball cap, early-curl onset, knuckle wobble, bounce and
 * grass friction), integrated live step by step so players, posts and keepers can touch it.
 */
export class MatchBall {
  readonly pos = new THREE.Vector3(0, PITCH.ballR, 0);
  readonly vel = new THREE.Vector3();
  /** side spin (1/s) */
  spin = 0;
  knuckle = 0;
  kseed = 0;
  /** seconds since the last strike (curl onset / knuckle envelope) */
  flightT = 0;
  /** visual roll (radians) */
  readonly rot = new THREE.Quaternion();
  private acc = 0;

  place(x: number, z: number, y: number = PITCH.ballR) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.spin = 0;
    this.knuckle = 0;
    this.flightT = 0;
  }

  /** a strike: new velocity (+ spin / knuckle) */
  kick(v: THREE.Vector3 | [number, number, number], spin = 0, knuckle = 0, kseed = 0) {
    if (Array.isArray(v)) this.vel.set(v[0], v[1], v[2]);
    else this.vel.copy(v);
    const sp = this.vel.length();
    if (sp > BALL.maxSpeed) this.vel.multiplyScalar(BALL.maxSpeed / sp);
    this.spin = spin;
    this.knuckle = knuckle;
    this.kseed = kseed >>> 0;
    this.flightT = 0;
  }

  get speed() {
    return this.vel.length();
  }
  get onGround() {
    return this.pos.y <= PITCH.ballR + 0.02 && Math.abs(this.vel.y) < 0.5;
  }

  /** advances `dt` seconds in fixed BALL.dt steps (deterministic) */
  step(dt: number) {
    this.acc += dt;
    const h = BALL.dt * 2; // 1/240 s: plenty for open play
    while (this.acc >= h) {
      this.acc -= h;
      this.sub(h);
    }
  }

  private sub(dt: number) {
    const cfg = MATCH_MODE;
    const lim = curveLimits(cfg);
    const R = PITCH.ballR;
    const v = this.vel;
    const sp = v.length();
    let ax = -BALL.drag * sp * v.x;
    let ay = -BALL.drag * sp * v.y - BALL.g;
    let az = -BALL.drag * sp * v.z;
    if (this.spin !== 0 && sp > 1) {
      const magnusMax = lim.magnusMax * Math.min(1.45, Math.max(1, Math.abs(this.spin) / lim.spinMax));
      // a = s · (ŷ × v): sideways only, never lifts the ball
      let mx = this.spin * v.z;
      let mz = -this.spin * v.x;
      const m = Math.hypot(mx, mz);
      if (m > magnusMax) {
        mx *= magnusMax / m;
        mz *= magnusMax / m;
      }
      if (cfg.curveOnset) {
        const w = cfg.curveOnset.gain * Math.exp(-this.flightT / cfg.curveOnset.tau);
        mx *= w;
        mz *= w;
      }
      ax += mx;
      az += mz;
    }
    if (this.knuckle > 0 && this.pos.y > R + 0.05) {
      const t = this.flightT;
      const env = t < 0.05 ? 0 : t > 0.25 ? 1 : (t - 0.05) / 0.2;
      const q = (sp * sp) / 900;
      const kn = this.knuckle * cfg.knuckleScale;
      // the knuckle wobble works across the flight (perpendicular to the ball's path)
      const nx = -v.z / Math.max(1, Math.hypot(v.x, v.z));
      const nz = v.x / Math.max(1, Math.hypot(v.x, v.z));
      const side = kn * BALL.knuckleX * env * q * knuckleNoise(this.kseed, 0, t);
      ax += nx * side;
      az += nz * side;
      ay += kn * BALL.knuckleY * env * q * knuckleNoise(this.kseed, 1, t);
    }
    v.x += ax * dt;
    v.y += ay * dt;
    v.z += az * dt;
    this.pos.addScaledVector(v, dt);
    this.spin *= Math.pow(BALL.spinDecay, dt / BALL.dt);
    this.flightT += dt;
    if (this.pos.y < R) {
      this.pos.y = R;
      if (v.y < -1.0) {
        v.y = -v.y * BALL.bounce;
        v.x *= BALL.bounceFriction;
        v.z *= BALL.bounceFriction;
        this.spin *= 0.6;
        this.knuckle *= 0.3;
      } else {
        v.y = 0;
        // grass: a rolling ball slows (a little more than the shot model: open-play passes)
        const f = Math.max(0, 1 - 1.05 * dt);
        v.x *= f;
        v.z *= f;
        this.spin *= 0.98;
        if (v.x * v.x + v.z * v.z < 0.0025) v.x = v.z = 0;
      }
    }
    // visual roll
    const hs = Math.hypot(v.x, v.z);
    if (hs > 0.01) {
      const axis = new THREE.Vector3(v.z, 0, -v.x).normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(axis, (hs * dt) / R);
      this.rot.premultiply(q);
    }
  }
}

/** ground-pass speed so a rolling ball covers `d` metres and still arrives with pace */
export function passSpeed(d: number) {
  return Math.max(6.5, Math.min(23, 4.2 + d * 1.15));
}
