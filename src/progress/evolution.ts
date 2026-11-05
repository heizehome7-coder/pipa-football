/**
 * UPDATE 10 — PLAYER EVOLUTION (+0 … +12) and the EVOLUTION MATERIAL SHOP.
 * One place for every number. The SERVER rolls every evolution (crypto random); the phone
 * shows the same rate it will use (never a fake one).
 */
import { ovr, type PlayerDef } from '../players/players';

const M = 1_000_000;
export const EVO_MAX = 12;

/** base success rate of +n → +(n+1) */
export const EVO_BASE_RATE = [0.9, 0.8, 0.7, 0.6, 0.5, 0.38, 0.28, 0.18, 0.1, 0.05, 0.02, 0.0075];

/** the five material grades (MP or FV — never both) */
export const MATERIALS = [
  { ovr: 130, mp: 50 * M, fv: 150, name: '에보 루키', look: 0 },
  { ovr: 135, mp: 120 * M, fv: 300, name: '에보 프로', look: 1 },
  { ovr: 140, mp: 250 * M, fv: 600, name: '에보 스타', look: 2 },
  { ovr: 145, mp: 500 * M, fv: 1200, name: '에보 엘리트', look: 3 },
  { ovr: 150, mp: 900 * M, fv: 2200, name: '에보 레전드', look: 4 },
] as const;
export type MaterialOvr = (typeof MATERIALS)[number]['ovr'];
export const materialOf = (o: number) => MATERIALS.find((m) => m.ovr === o) ?? null;

/** OVR gained by evolution: +3 per step up to +9, +6 per step for +10 … +12 */
export function evoOvrBonus(level: number) {
  const l = Math.max(0, Math.min(EVO_MAX, Math.floor(level || 0)));
  return Math.min(l, 9) * 3 + Math.max(0, l - 9) * 6;
}
/** the OVR shown and compared with materials (base OVR + evolution) */
export const evoOvr = (p: PlayerDef, level: number) => ovr(p) + evoOvrBonus(level);

/**
 * material OVR vs the player's current (evolved) OVR:
 *   lower  → × 0.85 … 0.6 (the bigger the gap, the lower)
 *   equal  → × 1.1
 *   higher → × 1.2 … 1.3
 * From +10 on a better material never makes it easier (× 1 at most). Final rate ≤ 95 %.
 */
export function materialMultiplier(matOvr: number, playerOvr: number, targetLevel: number) {
  let m: number;
  if (matOvr < playerOvr) m = Math.max(0.6, 0.85 - 0.025 * (playerOvr - matOvr - 1));
  else if (matOvr === playerOvr) m = 1.1;
  else m = 1.2 + Math.min(0.1, 0.01 * (matOvr - playerOvr));
  if (targetLevel >= 10) m = Math.min(m, 1);
  return m;
}

/** the real success rate of evolving a player at `level` with a material of `matOvr` (0 when maxed) */
export function evoSuccessRate(level: number, matOvr: number, playerOvr: number) {
  if (level >= EVO_MAX || level < 0) return 0;
  const r = EVO_BASE_RATE[level] * materialMultiplier(matOvr, playerOvr, level + 1);
  return Math.min(0.95, Math.round(r * 1e6) / 1e6);
}

/** "65%" · "0.75%" */
export function rateLabel(r: number) {
  const p = r * 100;
  return `${p >= 10 ? Math.round(p * 10) / 10 : Math.round(p * 100) / 100}%`;
}

/** +10 / +11 / +12 titles */
export const EVO_TITLE: Record<number, string> = { 10: 'SPECIAL PERFORMANCE BOOST', 11: 'ELITE EVOLUTION BOOST', 12: 'MAX EVOLUTION' };

/**
 * The in-game effect of an evolution level. Separate from the physics limits (top speed,
 * spin cap, knuckle cap): those stay — evolution never makes a 90° curve or a sure goal.
 * Steps +1…+9 count 1 each, +10…+12 count 3 each (the big boost), so +12 = 18 units.
 */
export function evoUnits(level: number) {
  const l = Math.max(0, Math.min(EVO_MAX, Math.floor(level || 0)));
  return Math.min(l, 9) + Math.max(0, l - 9) * 3;
}
export function evoShotBoost(level: number) {
  const u = evoUnits(level);
  return {
    speedMul: 1 + 0.0028 * u, // +5 % at +12
    errMul: Math.max(0.45, 1 - 0.03 * u), // −54 % aim error at +12
    spinMul: 1 + 0.007 * u, // +12.6 % curl at +12
    knuckleAdd: 0.012 * u, // +0.22 wobble at +12 (only for strikers who make a knuckle)
    lowMul: Math.max(0.5, 1 - 0.02 * u),
    fkMul: Math.max(0.5, 1 - 0.025 * u),
  };
}
export function evoKeeperBoost(level: number) {
  const u = evoUnits(level);
  return {
    diveMul: Math.max(0.85, 1 - 0.0065 * u), // −11.7 % dive time at +12
    pushMul: Math.max(0.85, 1 - 0.006 * u),
    travelMul: 1 + 0.0035 * u, // +6.3 % hip travel
    stretchAdd: 0.0035 * u, // longer fingertips
    reactMul: Math.max(0.8, 1 - 0.01 * u),
    highMul: 1 + 0.003 * u,
    lowMul: 1 + 0.003 * u,
    hangMul: 1 + 0.006 * u,
  };
}
