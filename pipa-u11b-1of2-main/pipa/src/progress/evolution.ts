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
 * UPDATE 11 — the material GRADE now clearly matters. Same player, same level:
 *   OVR 130 < 135 < 140 < 145 < 150 (always strictly higher).
 *   grade    × 0.65 / 0.775 / 0.90 / 1.025 / 1.15
 *   vs the player's current (evolved) OVR: lower × 0.70 · equal × 1.00 · higher × 1.12
 */
export const MATERIAL_GRADE_MUL: Record<number, number> = { 130: 0.65, 135: 0.775, 140: 0.9, 145: 1.025, 150: 1.15 };
export function gradeMultiplier(matOvr: number) {
  return MATERIAL_GRADE_MUL[matOvr] ?? 0.65;
}
export function compareMultiplier(matOvr: number, playerOvr: number) {
  return matOvr < playerOvr ? 0.7 : matOvr === playerOvr ? 1 : 1.12;
}
export function materialMultiplier(matOvr: number, playerOvr: number) {
  return gradeMultiplier(matOvr) * compareMultiplier(matOvr, playerOvr);
}
/**
 * Upper limit per step (+n → +n+1). High steps stay very hard even with OVR 150:
 * +9→+10 ≤ 8 %, +10→+11 ≤ 3 %, +11→+12 ≤ 1.25 %.
 */
export const EVO_RATE_CAP = [0.95, 0.95, 0.9, 0.85, 0.75, 0.6, 0.45, 0.3, 0.18, 0.08, 0.03, 0.0125];
/** a soft limit: unchanged up to 80 % of the cap, then bends towards the cap (never reaches it),
 *  so a better material is always a bit better — never two grades with the same rate */
function softCap(raw: number, cap: number) {
  const knee = cap * 0.8;
  if (raw <= knee) return raw;
  return knee + (cap - knee) * (1 - Math.exp(-(raw - knee) / (cap - knee)));
}

/** the base rate, the material correction and the final rate — exactly what the server rolls */
export function evoRateParts(level: number, matOvr: number, playerOvr: number) {
  if (level >= EVO_MAX || level < 0) return { base: 0, grade: 1, compare: 1, mul: 1, raw: 0, cap: 0, capped: false, rate: 0 };
  const base = EVO_BASE_RATE[level];
  const grade = gradeMultiplier(matOvr);
  const compare = compareMultiplier(matOvr, playerOvr);
  const mul = grade * compare;
  const raw = base * mul;
  const cap = EVO_RATE_CAP[level];
  const rate = Math.round(softCap(raw, cap) * 1e7) / 1e7;
  return { base, grade, compare, mul, raw, cap, capped: raw > cap * 0.8, rate };
}

/** the real success rate of evolving a player at `level` with a material of `matOvr` (0 when maxed) */
export function evoSuccessRate(level: number, matOvr: number, playerOvr: number) {
  return evoRateParts(level, matOvr, playerOvr).rate;
}

/** "65%" · "0.75%" */
export function rateLabel(r: number) {
  const p = r * 100;
  return `${p >= 10 ? Math.round(p * 10) / 10 : p >= 1 ? Math.round(p * 100) / 100 : Math.round(p * 1000) / 1000}%`;
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
