/**
 * UPDATE 7 — RANKING & PROGRESSION balance (shared by the browser and the server judge
 * bundle, so both compute exactly the same levels and rewards). Change numbers here only.
 */
export const PROGRESSION = {
  maxLevel: 50,
  /** XP for one properly finished online match (penalty and free kick alike) */
  xp: { win: 120, draw: 80, loss: 60 },
  /** XP needed to go from `level` to `level + 1` — one rule per band [fromLevel, base, perLevel] */
  bands: [
    [0, 100, 20], // 0→1 100 · 5→6 200 · 9→10 280
    [10, 300, 35],
    [20, 650, 50],
    [30, 1200, 100],
    [40, 2200, 160],
  ] as [number, number, number][],
  /** FV for every 5th level (claimed with a button) */
  fvRewards: { 5: 100, 10: 200, 15: 350, 20: 500, 25: 750, 30: 1000, 35: 1500, 40: 2200, 45: 3200, 50: 5000 } as Record<number, number>,
  /** 7-day DAILY LOGIN cycle (server date, Korea time) — PLAYER PACKs are only stored for now */
  daily: [
    { day: 1, mp: 2_000_000 },
    { day: 2, mp: 3_000_000 },
    { day: 3, mp: 5_000_000 },
    { day: 4, mp: 7_000_000 },
    { day: 5, mp: 10_000_000 },
    { day: 6, packs: 1 },
    { day: 7, packs: 1 },
  ] as { day: number; mp?: number; packs?: number }[],
  /** TRANSFER MARKET resale */
  market: { minFactor: 0.8, maxFactor: 1.2, fee: 0.3 },
} as const;

export function xpToNext(level: number): number {
  if (level >= PROGRESSION.maxLevel) return 0;
  let band = PROGRESSION.bands[0];
  for (const b of PROGRESSION.bands) if (level >= b[0]) band = b;
  return band[1] + (level - band[0]) * band[2];
}

/** add XP to (level, xp-into-level); returns the new state (no XP is kept at MAX LEVEL) */
export function addXp(level: number, xp: number, gain: number): { level: number; xp: number } {
  let l = Math.max(0, Math.min(PROGRESSION.maxLevel, Math.floor(level)));
  let x = Math.max(0, Math.floor(xp)) + Math.max(0, Math.floor(gain));
  while (l < PROGRESSION.maxLevel && x >= xpToNext(l)) {
    x -= xpToNext(l);
    l++;
  }
  if (l >= PROGRESSION.maxLevel) x = 0;
  return { level: l, xp: x };
}

export const FV_LEVELS = Object.keys(PROGRESSION.fvRewards).map(Number).sort((a, b) => a - b);

/** level rewards reached but not yet claimed */
export const availableRewards = (level: number, claimed: number[]) => FV_LEVELS.filter((l) => l <= level && !claimed.includes(l));

/** a resale price must stay within 80–120 % of the player's market value */
export function saleRange(marketValue: number) {
  return { min: Math.ceil(marketValue * PROGRESSION.market.minFactor), max: Math.floor(marketValue * PROGRESSION.market.maxFactor) };
}
export const saleFee = (price: number) => Math.round(price * PROGRESSION.market.fee);
export const sellerRevenue = (price: number) => price - saleFee(price);

/** "YYYY-MM-DD" of a moment in Korea time (the server's daily-login day) */
export function kstDay(ms: number) {
  const d = new Date(ms + 9 * 3600_000);
  return d.toISOString().slice(0, 10);
}
