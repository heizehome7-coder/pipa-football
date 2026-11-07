import type { GameMode } from '../game/core/types';
import type { PlayerDef, SpecialId } from './players';
import { evoShotBoost } from '../progress/evolution';

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
  /** UPDATE 11: 'match' = the 5-a-side MATCH mode (open play) */
  mode: GameMode | 'match';
  power: number;
  /** curve level 0 straight · 1–3 light/medium/strong */
  level: number;
  /** side-spin sign: + curls left, − curls right */
  spinSign: number;
  lofted: boolean;
  /** arrives low (y < 0.75 m) */
  low: boolean;
  /** UPDATE 10: the kicker's evolution level (+0 … +12, checked by the server online) */
  evo?: number;
}

export interface ShotMods {
  speedMul: number;
  spinMul: number;
  /** aim error radius at the goal (m) */
  err: number;
  knuckle: number;
  special: SpecialId | null;
}

/** UPDATE 9: the strongest knuckle a shot may carry (only KNUCKLE DRIVE goes above 1) */
export const KNUCKLE_LIMIT = 1.35;
/** UPDATE 9: KNUCKLE DRIVE — the lowest power that still makes a knuckle */
export const KNUCKLE_DRIVE_POWER = 0.64;

/** UPDATE 9: Ronaldo's nearly-straight, fast stroke (a LIGHT curve) is read as straight → knuckle */
export function knuckleStroke(p: PlayerDef | null | undefined, level: number, power: number, lofted: boolean) {
  return !!p && p.special === 'KNUCKLE_DRIVE' && level === 1 && !lofted && power >= KNUCKLE_DRIVE_POWER + 0.04;
}

/** UPDATE 10: CHIP SHOT ONLY — every stroke is played as a chip over the keeper */
export const isChipOnly = (p: PlayerDef | null | undefined) => !!p && p.special === 'CHIP_SHOT_ONLY';

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
  // UPDATE 9: KNUCKLE DRIVE fires a little more easily (slightly slower stroke is enough)
  const knuckleOk = straight && c.power >= (p.special === 'KNUCKLE_DRIVE' ? KNUCKLE_DRIVE_POWER : 0.72);
  if (knuckleOk) knuckle = n(s.knuckle, 75, 99) * 0.55;

  // UPDATE 9 — every special a clearly noticeable strength (each one ONE strength, not all)
  switch (p.special) {
    case 'POWER_BURST':
      if (straight && c.power > 0.7) (speedMul *= 1.06), (special = p.special);
      break;
    case 'POWER_FINISH':
      if (c.power > 0.7) (speedMul *= straight ? 1.07 : 1.03), (special = straight ? p.special : null);
      break;
    case 'FINESSE_MASTER':
      knuckle = 0; // his curl never wobbles
      if (instep) (spinMul *= c.level >= 2 ? 1.2 : 1.12), (errMul *= 0.75), (special = p.special);
      break;
    case 'KNUCKLE_DRIVE':
      // a much clearer, stronger knuckle than any other player (still a wandering ball, no zig-zag)
      if (knuckleOk) (knuckle = Math.min(KNUCKLE_LIMIT, knuckle + 0.75)), (speedMul *= 1.03), (special = p.special);
      break;
    case 'LOW_DISGUISE':
      if (c.low && !c.lofted) (errMul *= 0.5), (speedMul *= 1.04), (special = p.special);
      if (instep) spinMul *= 1.08;
      break;
    case 'LEFT_CURL':
    case 'LEFT_FINESSE':
      if (instep) (spinMul *= 1.15), (errMul *= 0.72), (special = p.special);
      break;
    case 'TWO_FOOT_FINESSE':
      if (curl) (spinMul *= 1.1), (errMul *= 0.85), (special = p.special);
      break;
    case 'QUICK_LOW_CURL':
      if (curl && c.low) (spinMul *= 1.15), (speedMul *= 1.05), (special = p.special);
      break;
    case 'DRIVEN_CURVE':
      if (curl && c.power > 0.6) (errMul *= 0.55), (spinMul *= c.mode === 'freekick' ? 1.12 : 1.06), (special = p.special);
      break;
    case 'PENALTY_PRECISION':
      if (c.mode === 'penalty') (comp = 1), (errMul *= 0.55), (special = c.power > 0.7 ? p.special : null);
      break;
    case 'CLINICAL_FINISH':
      if (c.mode === 'penalty' || c.low) (errMul *= 0.6), (special = c.low ? p.special : null);
      break;
    case 'SET_PIECE_CONTROL':
      errMul *= 0.65;
      if (c.mode === 'freekick') special = p.special;
      break;
    case 'CONTROLLED_DRIVE':
      if (straight) (errMul *= 0.65), (special = c.power > 0.6 ? p.special : null);
      break;
    // UPDATE 8
    case 'KOREAN_LEGEND':
      if (c.power > 0.7 && !curl) (speedMul *= 1.05), (errMul *= 0.78), (special = p.special);
      else if (c.low) (errMul *= 0.75), (special = p.special);
      break;
    case 'RED_FINISHER':
      if (c.power > 0.65 && !c.lofted) (speedMul *= 1.04), (errMul *= 0.78), (special = straight ? p.special : null);
      break;
    case 'BALANCED_FINISH':
      errMul *= 0.9;
      break;
    // UPDATE 9 — Pelé: accurate even at full power, a fine curl, a controlled low shot.
    // Only the error around HIS aim shrinks: never an auto-aim towards the goal.
    case 'KING_OF_FOOTBALL':
      comp = 1;
      errMul *= 0.5;
      if (curl && instep) spinMul *= 1.1;
      if (c.low && !c.lofted) speedMul *= 1.03;
      if (straight && c.power > 0.7) speedMul *= 1.04;
      if (c.power > 0.6 || curl || c.low) special = p.special;
      break;
    // UPDATE 10 — PIPA ORIGINALS
    case 'TWO_FOOT_CURL_MASTER':
      knuckle = 0; // never wobbles: one smooth bend, either foot
      if (curl) (spinMul *= 1.18), (errMul *= 0.75), (special = p.special);
      else if (straight && c.power > 0.7) speedMul *= 0.97;
      break;
    case 'THUNDER_STRIKE':
      if (straight && c.power > 0.7) (speedMul *= 1.07), (errMul *= 0.9), (special = p.special);
      break;
    case 'UNSTABLE_CANNON':
      // huge pace — and the harder he hits it, the further it can fly off
      if (c.power > 0.65) speedMul *= straight ? 1.07 : 1.03;
      if (c.power > 0.6) errMul *= 1 + 1.5 * ((c.power - 0.6) / 0.4);
      if (straight && c.power > 0.8) special = p.special;
      break;
    case 'ICON_POWER_DRIVE':
      if (straight && c.power > 0.7) (speedMul *= 1.05), (errMul *= 0.85), (special = p.special);
      if (c.mode === 'freekick') (errMul *= 1.35), (spinMul *= 0.9);
      break;
    case 'SILK_FINESSE':
      knuckle = 0;
      if (curl) (spinMul *= 1.15), (errMul *= 0.65), (special = p.special);
      else if (straight && c.power > 0.75) speedMul *= 0.97;
      break;
    case 'CHIP_SHOT_ONLY':
      knuckle = 0; // every shot becomes a chip (strokeReader) — a soft, accurate lob
      errMul *= 0.85;
      special = p.special;
      break;
    case 'WILD_POWER':
      if (c.power > 0.65) speedMul *= 1.05;
      if (c.power > 0.6) errMul *= 1 + 1.0 * ((c.power - 0.6) / 0.4);
      if (straight && c.power > 0.8) special = p.special;
      break;
    case 'WILD_LEFT_CURL':
      if (instep) (spinMul *= 1.18), (errMul *= 1 + 0.25 * c.level), (special = p.special);
      break;
    // UPDATE 11
    case 'PRECISION_MASTER':
      // weak shot (POWER 63 already makes it slow) — but it goes exactly where he aims
      comp = Math.max(comp, 0.9);
      errMul *= 0.6;
      if (c.low && !c.lofted) (errMul *= 0.7), (special = p.special);
      if (instep) (spinMul *= 1.08), (errMul *= 0.85), (special = p.special);
      break;
    // UPDATE 11 patch
    case 'TOE_POKE_SPECIALIST':
      // a toe-poke: low, quick off the boot, straight — weak (POWER 43); the outside of the boot is natural
      if (straight) (errMul *= 0.85), (special = p.special);
      if (curl && !instep) (spinMul *= (1 / 0.88) * (1 + 0.25 * n(p.outsideFoot ?? 80, 80, 99))), (errMul *= 0.85), (special = p.special);
      knuckle *= 0.5;
      break;
    case 'DEFENSIVE_WALL':
      // a defender: shooting really is not his thing
      errMul *= 1.6;
      speedMul *= 0.97;
      knuckle = 0;
      break;
    case 'ONE_FOOT_FINESSE':
      // left foot only: sharp instep curls, accurate
      if (instep) (spinMul *= 1.2), (errMul *= 0.8), (special = p.special);
      else if (curl) spinMul *= 0.95;
      break;
    case 'CHAOTIC_CANNON':
      // a brutal strike with a small, irregular wobble — but no finesse: a real curl is hard for him
      if (straight && c.power > 0.72) (speedMul *= 1.05), (knuckle = Math.min(1, knuckle + 0.25)), (special = p.special);
      if (instep) (spinMul *= 0.6), (errMul *= 1.25);
      break;
    case 'OUTSIDE_POWER':
      // the outside of the right boot: a fast, strongly bending ball the other way — not very accurate
      if (curl && !instep) (spinMul *= 1.42), (speedMul *= 1.06), (errMul *= 1.12), (special = p.special);
      else if (straight && c.power > 0.7) speedMul *= 1.04;
      break;
    case 'GALLOPING_CANNON':
      if (straight && c.power > 0.7) (speedMul *= 1.07), (errMul *= 0.8), (special = p.special);
      break;
    case 'BOX_BOMBER':
      if (c.mode === 'penalty' || c.mode === 'match' || c.low) (errMul *= 0.55), (special = c.low || c.mode === 'match' ? p.special : null);
      if (c.low && !c.lofted) speedMul *= 1.04;
      break;
    case 'FREE_KICK_ARTIST':
      if (c.mode === 'freekick' && curl) (spinMul *= 1.18), (errMul *= 0.6), (special = p.special);
      else if (curl && instep) spinMul *= 1.06;
      break;
    case 'MAESTRO_CURL':
      if (curl && instep) (spinMul *= 1.12), (errMul *= 0.65), (special = p.special);
      if (c.lofted) (errMul *= 0.7), (special = p.special);
      if (c.mode === 'freekick') errMul *= 0.85;
      break;
    case 'MAGIC_LEFT':
      if (instep && (c.low || c.level <= 2)) (spinMul *= 1.12), (errMul *= 0.65), (special = p.special);
      break;
  }
  // UPDATE 10: EVOLUTION — the higher the level, the faster, truer and bendier (physics caps stay)
  if (c.evo) {
    const b = evoShotBoost(c.evo);
    speedMul *= b.speedMul;
    errMul *= b.errMul * (c.low && !c.lofted ? b.lowMul : 1) * (c.mode === 'freekick' ? b.fkMul : 1);
    if (curl) spinMul *= b.spinMul;
    if (knuckle > 0) knuckle = Math.min(p.special === 'KNUCKLE_DRIVE' ? KNUCKLE_LIMIT : 1, knuckle + b.knuckleAdd);
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

/**
 * UPDATE 9 — the most this player's shot can ever be (online anti-cheat): the server
 * compares a submitted shot with the envelope of the player who really takes the kick, so a
 * client cannot inflate its stats or force a special it does not have.
 */
export function shotEnvelope(p: PlayerDef | null | undefined, mode: GameMode, evo = 0) {
  let speedMul = 1;
  let spinMul = 1;
  let knuckle = 0;
  for (const level of [0, 1, 2, 3])
    for (const spinSign of [1, -1])
      for (const lofted of [false, true])
        for (const low of [false, true])
          for (const power of [0.65, 0.7, 0.75, 1]) {
            const m = shotModifiers(p, { mode, power, level, spinSign, lofted, low, evo });
            speedMul = Math.max(speedMul, m.speedMul);
            if (level > 0) spinMul = Math.max(spinMul, m.spinMul);
            if (level === 0) knuckle = Math.max(knuckle, m.knuckle);
          }
  return { speedMul: Math.min(1.15, speedMul), spinMul, knuckle };
}
