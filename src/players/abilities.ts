import type { GameMode } from '../game/core/types';
import type { PlayerDef, SpecialId } from './players';

/**
 * UPDATE 5 — how a player's abilities shape a drawn shot. Small modifiers on top of
 * the user's own stroke (user ≈ 70 %, player ≈ 30 %): nothing here ever changes
 * where the user aimed or which way he curled it.
 *
 *   POWER     → top ball speed            CURVE     → side-spin strength
 *   ACCURACY  → smaller aim error         KNUCKLE   → wobble of straight, spinless strikes
 *   COMPOSURE → less error at full power  LOW SHOT  → pace + accuracy of low shots
 *   FREE KICK → curl/accuracy at free kicks
 * Specials fire by themselves when the stroke matches them (no buttons).
 */
export interface ShotContext {
  mode: GameMode;
  power: number;
  /** curve level 0 straight · 1–3 light/medium/strong */
  level: number;
  /** side-spin sign: + curls left, − curls right */
  spinSign: number;
  lofted: boolean;
  /** arrives low (y < 0.75 m) */
  low: boolean;
}

export interface ShotMods {
  speedMul: number;
  spinMul: number;
  /** aim error radius at the goal (m) */
  err: number;
  knuckle: number;
  special: SpecialId | null;
}

const n = (v: number, lo: number, hi: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

/** instep (natural curl) for this player's strong foot; Son (two-footed) both ways */
export function isInstep(p: PlayerDef, spinSign: number) {
  if (p.foot === 'B') return true;
  return p.foot === 'L' ? spinSign < 0 : spinSign > 0;
}

export function shotModifiers(p: PlayerDef | null | undefined, c: ShotContext): ShotMods {
  const neutral: ShotMods = { speedMul: 1, spinMul: 1, err: 0, knuckle: 0, special: null };
  const s = p?.stats;
  if (!p || !s) return neutral;
  let special: SpecialId | null = null;
  const curl = c.level > 0;
  const straight = !curl && !c.lofted;
  const instep = curl && isInstep(p, c.spinSign);

  // POWER: top speed −3 %…+7 %
  let speedMul = 1 + 0.07 * ((s.power - 85) / 14);
  // CURVE: spin 0.82…1.18; outside of the boot is a little weaker (not for two-footed)
  let spinMul = 0.82 + 0.36 * n(s.curve, 79, 99);
  if (curl && !instep) spinMul *= 0.88;
  if (c.mode === 'freekick') spinMul *= 0.92 + 0.16 * n(s.freeKick, 75, 99);

  // ACCURACY / COMPOSURE: aim error grows with power, shrinks with ability
  const acc = n(s.accuracy, 70, 99);
  let comp = n(s.composure, 70, 99);
  let errMul = 1;
  if (c.mode === 'freekick') errMul *= 1.3 * (1.15 - 0.3 * n(s.freeKick, 75, 99));
  if (c.low && !c.lofted) {
    speedMul *= 1 + 0.02 * ((s.lowShot - 85) / 14);
    errMul *= 1.15 - 0.3 * n(s.lowShot, 79, 99);
  }

  let knuckle = 0;
  const knuckleOk = straight && c.power >= 0.72;
  if (knuckleOk) knuckle = n(s.knuckle, 75, 99) * 0.55;

  switch (p.special) {
    case 'POWER_BURST':
      if (straight && c.power > 0.7) (speedMul *= 1.04), (special = p.special);
      break;
    case 'POWER_FINISH':
      if (c.power > 0.7) (speedMul *= straight ? 1.05 : 1.02), (special = straight ? p.special : null);
      break;
    case 'FINESSE_MASTER':
      knuckle = 0; // his curl never wobbles
      if (instep && c.level >= 2) (spinMul *= 1.12), (errMul *= 0.85), (special = p.special);
      break;
    case 'KNUCKLE_DRIVE':
      if (knuckleOk) (knuckle = Math.min(1, knuckle + 0.45)), (special = p.special);
      break;
    case 'LOW_DISGUISE':
      if (c.low && !c.lofted) (errMul *= 0.6), (speedMul *= 1.02), (special = p.special);
      break;
    case 'LEFT_CURL':
    case 'LEFT_FINESSE':
      if (instep) (spinMul *= 1.08), (errMul *= 0.8), (special = p.special);
      break;
    case 'TWO_FOOT_FINESSE':
      if (curl) (spinMul *= 1.04), (special = p.special);
      break;
    case 'QUICK_LOW_CURL':
      if (curl && c.low) (spinMul *= 1.1), (speedMul *= 1.03), (special = p.special);
      break;
    case 'DRIVEN_CURVE':
      if (curl && c.power > 0.6) (errMul *= 0.6), (spinMul *= c.mode === 'freekick' ? 1.06 : 1), (special = p.special);
      break;
    case 'PENALTY_PRECISION':
      if (c.mode === 'penalty') (comp = 1), (errMul *= 0.7), (special = c.power > 0.7 ? p.special : null);
      break;
    case 'CLINICAL_FINISH':
      if (c.mode === 'penalty' || c.low) (errMul *= 0.7), (special = c.low ? p.special : null);
      break;
    case 'SET_PIECE_CONTROL':
      errMul *= 0.75;
      if (c.mode === 'freekick') special = p.special;
      break;
    case 'CONTROLLED_DRIVE':
      if (straight) (errMul *= 0.75), (special = c.power > 0.6 ? p.special : null);
      break;
    case 'BALANCED_FINISH':
      errMul *= 0.95;
      break;
  }
  const err = 0.6 * (1 - 0.8 * acc) * (0.35 + 0.65 * c.power * c.power * (1 - 0.8 * comp)) * errMul;
  return { speedMul, spinMul, err, knuckle: Math.round(knuckle * 1000) / 1000, special };
}

/** deterministic pseudo-random in [-1, 1] from the stroke itself (so preview = flight) */
export function strokeHash(points: { x: number; y: number; t: number }[]) {
  let h = 2166136261 >>> 0;
  for (const p of points) {
    h ^= Math.round(p.x * 10) & 0xffff;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= Math.round(p.y * 10) & 0xffff;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= Math.round(p.t) & 0xffff;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
