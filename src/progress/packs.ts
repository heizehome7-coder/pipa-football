/**
 * UPDATE 8 — PLAYER PACK configuration + the weighted draw.
 *
 * The SERVER runs `drawPackPlayer` with a crypto random number (never the phone).
 * Every account uses the same odds. Change the odds here (one place).
 *
 *   tier     market value             chance (whole tier)
 *   BASE     10M – 150M                ≈ 45 %
 *   RARE     >150M – 400M              ≈ 30 %
 *   EPIC     >400M – 800M              ≈ 17 %
 *   ELITE    >800M – 1.4B              ≈ 6 %
 *   ICON+    >1.4B (top ICONS)         ≈ 2 %
 *
 * Inside a tier every player is equally likely. A tier with no players hands its share
 * to the others in proportion. Free starters (tradeable = false) are never in the pool.
 */
import { MARKET_PLAYERS, type PlayerDef } from '../players/players';

const M = 1_000_000;

export type PackTier = 'base' | 'rare' | 'epic' | 'elite' | 'icon';

export const PACK_CONFIG = {
  /** cards per PLAYER PACK (UPDATE 8: one) */
  cardsPerPack: 1,
  tiers: [
    { tier: 'base', max: 150 * M, weight: 45 },
    { tier: 'rare', max: 400 * M, weight: 30 },
    { tier: 'epic', max: 800 * M, weight: 17 },
    { tier: 'elite', max: 1400 * M, weight: 6 },
    { tier: 'icon', max: Infinity, weight: 2 },
  ] as { tier: PackTier; max: number; weight: number }[],
  /** the developer can grant at most this many packs in one go */
  maxDevGrant: 100,
};

/** pack tier of a market value (also drives the reveal's glow colour) */
export function packTier(price: number): PackTier {
  for (const t of PACK_CONFIG.tiers) if (price <= t.max) return t.tier;
  return 'icon';
}

/** every player a pack can give: tradeable market players only */
export function packPool(players: PlayerDef[] = MARKET_PLAYERS): PlayerDef[] {
  return players.filter((p) => p.tradeable && !p.starter && typeof p.price === 'number');
}

/** chance (0–1) of every pool player — for tests and an odds list */
export function packOdds(pool = packPool()): Map<string, number> {
  const groups = new Map<PackTier, PlayerDef[]>();
  for (const p of pool) {
    const t = packTier(p.price!);
    groups.set(t, [...(groups.get(t) ?? []), p]);
  }
  const live = PACK_CONFIG.tiers.filter((t) => (groups.get(t.tier)?.length ?? 0) > 0);
  const total = live.reduce((a, t) => a + t.weight, 0);
  const out = new Map<string, number>();
  for (const t of live) {
    const g = groups.get(t.tier)!;
    for (const p of g) out.set(p.id, t.weight / total / g.length);
  }
  return out;
}

/**
 * The draw. `r` is ONE uniform random number in [0, 1) from the server (crypto).
 * Deterministic for a given r, so it can be tested.
 */
export function drawPackPlayer(r: number, pool = packPool()): { player: PlayerDef; tier: PackTier } {
  const odds = packOdds(pool);
  let acc = 0;
  const x = Math.min(Math.max(r, 0), 1 - 1e-12);
  let last: PlayerDef = pool[pool.length - 1];
  for (const p of pool) {
    const w = odds.get(p.id) ?? 0;
    if (w <= 0) continue;
    last = p;
    acc += w;
    if (x < acc) return { player: p, tier: packTier(p.price!) };
  }
  return { player: last, tier: packTier(last.price!) };
}
