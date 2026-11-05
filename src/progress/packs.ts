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
  // UPDATE 10: same policy as the market — no defenders in packs (cards already given stay)
  return players.filter((p) => p.tradeable && !p.starter && typeof p.price === 'number' && !p.defender);
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

// ── UPDATE 9: GOOD PLAYER PACK · LEGEND PACK · TOP LEGEND ──────────────────────
/** price band [min, max) — the last band of a pack includes its max (exactly one band per price) */
export interface PackBand {
  min: number;
  max: number;
  weight: number;
  /** the last band: max is included */
  inclusive?: boolean;
}
export type PackKind = 'player' | 'good' | 'legend';

export const SPECIAL_PACKS: Record<'good' | 'legend', { name: string; bands: PackBand[] }> = {
  /** 감자의 제왕 10–12 점: nothing under 100M, top players rare */
  good: {
    name: 'GOOD PLAYER PACK',
    bands: [
      { min: 100 * M, max: 400 * M, weight: 50 },
      { min: 400 * M, max: 800 * M, weight: 30 },
      { min: 800 * M, max: 1400 * M, weight: 15 },
      { min: 1400 * M, max: 2000 * M, weight: 5, inclusive: true },
    ],
  },
  /** 홍 나와라 뚝딱 — 금 1개: 1.2B – 2B players only */
  legend: {
    name: 'LEGEND PACK',
    bands: [
      { min: 1200 * M, max: 1400 * M, weight: 55 },
      { min: 1400 * M, max: 1700 * M, weight: 30 },
      { min: 1700 * M, max: 2000 * M, weight: 15, inclusive: true },
    ],
  },
};

/** 홍 1개 — one of these five, 20 % each */
export const TOP_LEGENDS = ['pele', 'maradona', 'nazario', 'ronaldinho', 'zidane'] as const;

const inBand = (price: number, b: PackBand) => price >= b.min && (b.inclusive ? price <= b.max : price < b.max);

/**
 * Chance of every player in a banded pack. A band without players hands its share to the
 * others in proportion. Inside a band a cheaper player is more likely (weight ∝ 1 / price).
 */
export function bandOdds(bands: PackBand[], pool = packPool()): Map<string, number> {
  const groups = bands.map((b) => pool.filter((p) => inBand(p.price!, b)));
  const live = bands.map((b, i) => (groups[i].length ? b.weight : 0));
  const total = live.reduce((a, w) => a + w, 0);
  const out = new Map<string, number>();
  if (!total) return out;
  bands.forEach((_, i) => {
    const g = groups[i];
    if (!g.length) return;
    const inv = g.map((p) => 1 / p.price!);
    const sum = inv.reduce((a, b) => a + b, 0);
    g.forEach((p, j) => out.set(p.id, (live[i] / total) * (inv[j] / sum)));
  });
  return out;
}

/** draw from a banded pack with ONE server (crypto) random number r ∈ [0, 1) */
export function drawBandPlayer(r: number, bands: PackBand[], pool = packPool()): { player: PlayerDef; tier: PackTier } {
  const odds = bandOdds(bands, pool);
  const list = pool.filter((p) => (odds.get(p.id) ?? 0) > 0);
  const x = Math.min(Math.max(r, 0), 1 - 1e-12);
  let acc = 0;
  for (const p of list) {
    acc += odds.get(p.id)!;
    if (x < acc) return { player: p, tier: packTier(p.price!) };
  }
  const last = list[list.length - 1];
  return { player: last, tier: packTier(last.price!) };
}

/** a pack of any kind (player = the UPDATE 8 PLAYER PACK) */
export function drawAnyPack(kind: PackKind, r: number) {
  return kind === 'player' ? drawPackPlayer(r) : drawBandPlayer(r, SPECIAL_PACKS[kind].bands);
}

/** 홍 → TOP LEGEND (r ∈ [0, 1): five equal shares) */
export function drawTopLegend(r: number): { player: PlayerDef; tier: PackTier } {
  const ids = TOP_LEGENDS.filter((id) => MARKET_PLAYERS.some((p) => p.id === id));
  const i = Math.min(ids.length - 1, Math.floor(Math.min(Math.max(r, 0), 1 - 1e-12) * ids.length));
  const player = MARKET_PLAYERS.find((p) => p.id === ids[i])!;
  return { player, tier: 'icon' };
}
