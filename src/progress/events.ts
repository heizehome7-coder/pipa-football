/**
 * UPDATE 9 — EVENT CENTER configuration (one place; the SERVER uses these numbers and runs
 * every draw with a crypto random number — a phone never decides a result).
 *
 *  홍 나와라 뚝딱: 100 FV a draw (×10 = 1,000 FV — UPDATE 10; was 50 / 500, ten independent draws, same odds, no pity)
 *    동 50 % · 은 30 % · 금 15 % · 홍 5 % → tokens, exchanged one at a time:
 *    동 → 20,000,000 MP · 은 → 50,000,000 MP · 금 → LEGEND PACK ×1 · 홍 → TOP LEGEND (5 players, 20 % each)
 *
 *  감자의 제왕: 50 FV a game · 8 holes (4 × 2) · 20 rounds of 1 s (UPDATE 10; was 12)
 *    rounds 1–4 normal (+1) · from 5 + red (−1) · from 8 + rotten (−2) · never two in one hole
 *    score = max(0, score + points) · 10–12 → GOOD PLAYER PACK · 6–9 → 30,000,000 MP · 0–5 → 10,000,000 MP
 */
const M = 1_000_000;

export type HongGrade = 'bronze' | 'silver' | 'gold' | 'red';
export const HONG_GRADES: HongGrade[] = ['bronze', 'silver', 'gold', 'red'];

export const HONG = {
  // UPDATE 10: 100 FV a draw (×10 = 1,000 FV) — odds and exchange unchanged
  costOne: 100,
  costTen: 1000,
  odds: [
    { grade: 'bronze', weight: 50 },
    { grade: 'silver', weight: 30 },
    { grade: 'gold', weight: 15 },
    { grade: 'red', weight: 5 },
  ] as { grade: HongGrade; weight: number }[],
  /** what ONE token of each grade is exchanged for */
  exchange: {
    bronze: { mp: 20 * M },
    silver: { mp: 50 * M },
    gold: { pack: 'legend' as const },
    red: { topLegend: true },
  } as Record<HongGrade, { mp?: number; pack?: 'legend'; topLegend?: boolean }>,
  label: { bronze: '동', silver: '은', gold: '금', red: '홍' } as Record<HongGrade, string>,
};

/** one grade from one uniform random r ∈ [0, 1) (deterministic for a given r — testable) */
export function drawHongGrade(r: number): HongGrade {
  const total = HONG.odds.reduce((a, o) => a + o.weight, 0);
  let x = Math.min(Math.max(r, 0), 1 - 1e-12) * total;
  for (const o of HONG.odds) {
    if (x < o.weight) return o.grade;
    x -= o.weight;
  }
  return HONG.odds[HONG.odds.length - 1].grade;
}

export type PotatoKind = 'normal' | 'red' | 'rotten';
export interface PotatoSpawn {
  hole: number;
  kind: PotatoKind;
}

export const POTATO = {
  cost: 50,
  holes: 8,
  cols: 4,
  // UPDATE 10: 20 rounds (same rules, same cost and rewards)
  rounds: 20,
  roundMs: 1000,
  /** "3 · 2 · 1" before round 1 */
  leadMs: 2000,
  /** late taps still count this long after a round ended (mobile network) */
  graceMs: 450,
  /** taps a little before the server's round start (clock skew) */
  earlyMs: 120,
  points: { normal: 1, red: -1, rotten: -2 } as Record<PotatoKind, number>,
  redFrom: 5,
  rottenFrom: 8,
  rewards: [
    { min: 10, pack: 'good' as const },
    { min: 6, mp: 30 * M },
    { min: 0, mp: 10 * M },
  ] as { min: number; pack?: 'good'; mp?: number }[],
};

/** the potatoes of one round (1-based), holes all different; `rand()` = uniform [0, 1) */
export function potatoRound(round: number, rand: () => number): PotatoSpawn[] {
  const kinds: PotatoKind[] = ['normal'];
  if (round >= POTATO.redFrom) kinds.push('red');
  if (round >= POTATO.rottenFrom) kinds.push('rotten');
  const holes = Array.from({ length: POTATO.holes }, (_, i) => i);
  return kinds.map((kind) => {
    const j = Math.min(holes.length - 1, Math.floor(rand() * holes.length));
    const [hole] = holes.splice(j, 1);
    return { hole, kind };
  });
}

/** score after a tap: never below 0 */
export const potatoScore = (score: number, kind: PotatoKind) => Math.max(0, score + POTATO.points[kind]);

/** the reward for a final score (exactly one) */
export function potatoReward(score: number): { pack?: 'good'; mp?: number } {
  const r = POTATO.rewards.find((x) => score >= x.min) ?? POTATO.rewards[POTATO.rewards.length - 1];
  return r.pack ? { pack: r.pack } : { mp: r.mp };
}
