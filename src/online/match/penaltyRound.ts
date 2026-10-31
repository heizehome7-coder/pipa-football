import * as THREE from 'three';
import { FIELD, MODES } from '../../game/core/config';
import type { ShotInput } from '../../game/core/types';
import { KickGame, type KeeperDiveCommand, type KickSpot } from '../../game/KickGame';
import type { DiveDir, RoundOutcome, WireDive } from './protocol';
import { DIVE_DIRS } from './protocol';

/**
 * One online penalty: same pitch, kicker, ball physics and drawn-path flight as the
 * single-player penalty, but the keeper is a person. Runs identically in the browser
 * (both players) and on the server (the authoritative judge).
 */
export class OnlinePenaltyGame extends KickGame {
  constructor(nickname: string, seed: number, visuals: boolean) {
    super(MODES.penalty, { visuals, nickname, seed, humanKeeper: true });
  }

  protected pickSpot(): KickSpot {
    return {
      ball: new THREE.Vector3(0, FIELD.ballRadius, FIELD.penaltySpot),
      aim: new THREE.Vector3(0, 0, -1),
    };
  }
}

/**
 * Where each dive goes, in world metres on the keeper's line. The keeper faces the
 * kicker (+z), so HIS right is world −x — and on the keeper's screen (camera behind
 * him) screen-right is also world −x. Swipe right → dive to his right.
 */
const TARGETS: Record<DiveDir, [number, number]> = {
  right: [-2.9, 0.5],
  left: [2.9, 0.5],
  upRight: [-2.45, 1.95],
  upLeft: [2.45, 1.95],
  up: [0, 2.3],
  down: [0, 0.3],
  lowRight: [-1.6, 0.25],
  lowLeft: [1.6, 0.25],
};

export const PENALTY_CONTACT_TIME = 0.93;

export function diveCommand(d: { dir: DiveDir; at: number }): KeeperDiveCommand {
  const [x, y] = TARGETS[d.dir];
  // -1 = picked before the shot → goes at contact (the step clamps to contact anyway)
  return { x, y, at: d.at < 0 ? 0 : d.at };
}

export const isDiveDir = (v: unknown): v is DiveDir => typeof v === 'string' && (DIVE_DIRS as string[]).includes(v);

/** Sanity check for a shot coming over the network (never trust the sender). */
export function validShot(v: unknown): v is ShotInput {
  if (!v || typeof v !== 'object') return false;
  const s = v as ShotInput;
  if (typeof s.power !== 'number' || !(s.power >= 0 && s.power <= 1)) return false;
  if (!Array.isArray(s.points) || s.points.length < 2 || s.points.length > 80) return false;
  for (const p of s.points) {
    if (!Array.isArray(p) || p.length !== 3) return false;
    if (!p.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 60)) return false;
  }
  return true;
}

export interface RoundSimulation {
  outcome: RoundOutcome;
  detail: string;
  /** seconds from run-up start to foot-ball contact */
  contact: number;
  /** seconds from run-up start until the outcome was decided */
  decidedAt: number;
}

const STEP = 1 / 120;

/**
 * Plays one penalty headlessly with the given shot and (optional) dive and returns
 * the result — the server's authoritative judge, and the clients' prediction.
 */
export function simulateRound(seed: number, shot: ShotInput, dive: WireDive | { dir: DiveDir; at: number } | null): RoundSimulation {
  const g = new OnlinePenaltyGame('KICKER', seed, false);
  g.start();
  if (!g.shoot(shot)) throw new Error('shot rejected');
  if (dive) g.setKeeperDive(diveCommand(dive));
  let t = 0;
  while (!g.outcome && t < 8) {
    g.update(STEP);
    t += STEP;
  }
  const o = g.outcome ?? 'MISS';
  return {
    outcome: o === 'BLOCKED' ? 'MISS' : o,
    detail: g.outcome ? g.detail : '시간 초과',
    contact: g.kicker.contactTime,
    decidedAt: t,
  };
}
