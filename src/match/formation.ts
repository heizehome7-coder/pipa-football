import type { PlayerDef } from '../players/players';

/**
 * UPDATE 11 patch — the MATCH formation 4-3-3 HOLDING (GK · LB CB CB RB · CDM · CM CM · LW ST RW).
 * x: from the own goal line 0 → halfway line 1 (beyond 1 = the opponent half), z: −1 far touchline … +1 near.
 * Shared by the MATCH SQUAD SETUP screen, the engine and the server's validation.
 */
export type SlotId = 'GK' | 'LB' | 'LCB' | 'RCB' | 'RB' | 'CDM' | 'LCM' | 'RCM' | 'LW' | 'ST' | 'RW';
export interface FormationSlot {
  id: SlotId;
  /** the position it asks for */
  pos: 'GK' | 'LB' | 'CB' | 'RB' | 'CDM' | 'CM' | 'LW' | 'ST' | 'RW';
  line: 'GK' | 'DEF' | 'MID' | 'FWD';
  x: number;
  z: number;
}
export const FORMATION_ID = '4-3-3H';
export const FORMATION_NAME = '4-3-3 HOLDING';
export const FORMATION_433H: FormationSlot[] = [
  { id: 'GK', pos: 'GK', line: 'GK', x: 0.04, z: 0 },
  { id: 'LB', pos: 'LB', line: 'DEF', x: 0.36, z: -0.74 },
  { id: 'LCB', pos: 'CB', line: 'DEF', x: 0.26, z: -0.26 },
  { id: 'RCB', pos: 'CB', line: 'DEF', x: 0.26, z: 0.26 },
  { id: 'RB', pos: 'RB', line: 'DEF', x: 0.36, z: 0.74 },
  { id: 'CDM', pos: 'CDM', line: 'MID', x: 0.5, z: 0 },
  { id: 'LCM', pos: 'CM', line: 'MID', x: 0.72, z: -0.38 },
  { id: 'RCM', pos: 'CM', line: 'MID', x: 0.72, z: 0.38 },
  { id: 'LW', pos: 'LW', line: 'FWD', x: 1.12, z: -0.68 },
  { id: 'ST', pos: 'ST', line: 'FWD', x: 1.28, z: 0 },
  { id: 'RW', pos: 'RW', line: 'FWD', x: 1.12, z: 0.68 },
];
export const SLOT_IDS = FORMATION_433H.map((s) => s.id);
export const MATCH_SUBS = 4;

export interface MatchSquad {
  formation: typeof FORMATION_ID;
  /** slot → playerId (11) */
  xi: Record<SlotId, string>;
  /** 4 substitutes */
  subs: string[];
}

const FIT: Record<FormationSlot['pos'], string[]> = {
  GK: ['GK'],
  LB: ['LB', 'LWB'],
  RB: ['RB', 'RWB'],
  CB: ['CB'],
  CDM: ['CDM', 'CM'],
  CM: ['CM', 'CDM', 'CAM'],
  LW: ['LW', 'LM', 'LF'],
  RW: ['RW', 'RM', 'RF'],
  ST: ['ST', 'CF'],
};
/** how well a player fits a slot: 'ok' · 'near' (same line) · 'off' (out of position) */
export function slotFit(p: PlayerDef, slot: FormationSlot): 'ok' | 'near' | 'off' {
  if (slot.pos === 'GK') return p.role === 'GK' ? 'ok' : 'off';
  if (p.role === 'GK') return 'off';
  if (p.positions.some((x) => FIT[slot.pos].includes(x))) return 'ok';
  const line = p.defender ? 'DEF' : p.role === 'FW' ? 'FWD' : 'MID';
  return line === slot.line ? 'near' : 'off';
}

/** a first MATCH squad from what he owns (best fits first, keepers in goal) */
export function autoMatchSquad(pool: PlayerDef[], ovrOf: (p: PlayerDef) => number): MatchSquad | null {
  const used = new Set<string>();
  const xi = {} as Record<SlotId, string>;
  const order = [...FORMATION_433H].sort((a, b) => (a.pos === 'GK' ? -1 : b.pos === 'GK' ? 1 : 0));
  const rank = (p: PlayerDef, s: FormationSlot) => ({ ok: 2, near: 1, off: 0 })[slotFit(p, s)] * 1000 + ovrOf(p);
  for (const s of order) {
    const cand = pool.filter((p) => !used.has(p.id) && (s.pos === 'GK' ? p.role === 'GK' : p.role !== 'GK')).sort((a, b) => rank(b, s) - rank(a, s));
    if (!cand[0]) return null;
    xi[s.id] = cand[0].id;
    used.add(cand[0].id);
  }
  const subs = pool
    .filter((p) => !used.has(p.id))
    .sort((a, b) => ovrOf(b) - ovrOf(a))
    .slice(0, MATCH_SUBS)
    .map((p) => p.id);
  return { formation: FORMATION_ID, xi, subs };
}

/** shape check (ownership is the server's / the wallet's job) */
export function validMatchSquad(m: unknown, getPlayer: (id: string) => PlayerDef | null | undefined): m is MatchSquad {
  if (!m || typeof m !== 'object') return false;
  const q = m as MatchSquad;
  if (q.formation !== FORMATION_ID || !q.xi || typeof q.xi !== 'object' || !Array.isArray(q.subs) || q.subs.length > MATCH_SUBS) return false;
  const keys = Object.keys(q.xi);
  if (keys.length !== 11 || !SLOT_IDS.every((k) => typeof (q.xi as Record<string, unknown>)[k] === 'string')) return false;
  const ids = [...SLOT_IDS.map((k) => q.xi[k]), ...q.subs];
  if (new Set(ids).size !== ids.length) return false;
  for (const s of FORMATION_433H) {
    const p = getPlayer(q.xi[s.id]);
    if (!p) return false;
    if ((s.pos === 'GK') !== (p.role === 'GK')) return false;
  }
  return q.subs.every((id) => typeof id === 'string' && !!getPlayer(id));
}
