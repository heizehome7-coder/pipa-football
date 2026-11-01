import * as THREE from 'three';
import { FIELD, MODES } from '../../game/core/config';
import type { ShotInput } from '../../game/core/types';
import { KickGame, type KeeperDiveCommand, type KickGameOptions, type KickSpot } from '../../game/KickGame';
import type { DiveDir, RoundOutcome, WireDive } from './protocol';
import { DIVE_DIRS } from './protocol';
import { BALL } from '../../game/physics/BallPhysics';
import { getPlayer } from '../../players/players';

/**
 * One online penalty: same pitch, kicker, ball physics and drawn-path flight as the
 * single-player penalty, but the keeper is a person. Runs identically in the browser
 * (both players) and on the server (the authoritative judge).
 */
export class OnlinePenaltyGame extends KickGame {
  constructor(nickname: string, seed: number, visuals: boolean, looks: Pick<KickGameOptions, 'kickerLook' | 'keeperLook' | 'keeperStats'> = {}) {
    super(MODES.penalty, { visuals, nickname, seed, humanKeeper: true, ...looks });
  }

  protected pickSpot(): KickSpot {
    return {
      ball: new THREE.Vector3(0, FIELD.ballRadius, FIELD.penaltySpot),
      aim: new THREE.Vector3(0, 0, -1),
    };
  }
}

/**
 * Where each dive goes, in world metres on the keeper's line. Directions are SCREEN
 * directions: both players look at the goal from the pitch (camera towards −z), so
 * screen-left = world −x on both phones. Swipe left → the keeper flies to the left
 * of the screen (his own right — he faces the camera).
 */
const TARGETS: Record<DiveDir, [number, number]> = {
  left: [-2.9, 0.5],
  right: [2.9, 0.5],
  upLeft: [-2.45, 1.95],
  upRight: [2.45, 1.95],
  up: [0, 2.3],
  down: [0, 0.3],
  lowLeft: [-1.6, 0.25],
  lowRight: [1.6, 0.25],
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
  const num = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  if (!num(s.power) || !(s.power >= 0 && s.power <= 1)) return false;
  if (!num(s.spin) || Math.abs(s.spin) > BALL.spinLimit + 1e-6) return false;
  if (s.knuckle !== undefined && (!num(s.knuckle) || s.knuckle < 0 || s.knuckle > 1)) return false;
  if (s.kseed !== undefined && (!Number.isInteger(s.kseed) || s.kseed < 0 || s.kseed > 0xffffffff)) return false;
  if (!Array.isArray(s.v) || s.v.length !== 3 || !s.v.every(num)) return false;
  const sp = Math.hypot(s.v[0], s.v[1], s.v[2]);
  // a real strike: towards the goal, no faster than the game allows
  return sp > 2 && sp <= BALL.maxSpeed && s.v[2] < 0;
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
export function simulateRound(
  seed: number,
  shot: ShotInput,
  dive: WireDive | { dir: DiveDir; at: number } | null,
  /** UPDATE 5: the defending player's goalkeeper (his DIVING/REACH apply; never a direction) */
  keeperId?: string | null,
): RoundSimulation {
  const g = new OnlinePenaltyGame('KICKER', seed, false, { keeperStats: getPlayer(keeperId)?.gk });
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
