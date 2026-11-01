import { FIELD_PLAYERS, GOALKEEPERS, PLAYER_BY_ID } from './players';

/**
 * A user's squad: 5 penalty takers (in order) + 1 goalkeeper + a free-kick taker.
 * Saved on this device per nickname (there is no account database); the online
 * match only sends the ids.
 */
export interface Squad {
  /** the 5 field players, in penalty order (== selectedPlayers) */
  penaltyOrder: string[];
  goalkeeperId: string;
  freeKickTakerId: string;
}

export const SQUAD_SIZE = 5;

const key = (nickname: string) => `pipa.squad.v1.${nickname.trim().toLowerCase()}`;

/** keeps only valid ids: 5 distinct field players, a real GK, FK taker inside the 5 */
export function validSquad(s: unknown): s is Squad {
  if (!s || typeof s !== 'object') return false;
  const q = s as Squad;
  if (!Array.isArray(q.penaltyOrder) || q.penaltyOrder.length !== SQUAD_SIZE) return false;
  if (new Set(q.penaltyOrder).size !== SQUAD_SIZE) return false;
  if (!q.penaltyOrder.every((id) => typeof id === 'string' && PLAYER_BY_ID[id] && PLAYER_BY_ID[id].role !== 'GK')) return false;
  if (typeof q.goalkeeperId !== 'string' || PLAYER_BY_ID[q.goalkeeperId]?.role !== 'GK') return false;
  return typeof q.freeKickTakerId === 'string' && q.penaltyOrder.includes(q.freeKickTakerId);
}

export function loadSquad(nickname: string): Squad | null {
  try {
    const raw = localStorage.getItem(key(nickname));
    if (!raw) return null;
    const s = JSON.parse(raw);
    return validSquad(s) ? s : null;
  } catch {
    return null;
  }
}

export function saveSquad(nickname: string, s: Squad) {
  try {
    localStorage.setItem(key(nickname), JSON.stringify({ ...s, selectedPlayers: s.penaltyOrder }));
  } catch {
    /* private mode etc. — the squad still works for this session */
  }
}

/** used when someone has no squad (e.g. an online opponent on an older version) */
export const DEFAULT_SQUAD: Squad = {
  penaltyOrder: FIELD_PLAYERS.slice(0, SQUAD_SIZE).map((x) => x.id),
  goalkeeperId: GOALKEEPERS[0].id,
  freeKickTakerId: FIELD_PLAYERS[0].id,
};

/** an opponent's squad from the network — anything unknown falls back to defaults */
export function sanitizeSquad(s: unknown): Squad {
  if (validSquad(s)) return s;
  const q = (s && typeof s === 'object' ? s : {}) as Partial<Squad>;
  const order = Array.isArray(q.penaltyOrder) ? q.penaltyOrder.filter((id) => PLAYER_BY_ID[id] && PLAYER_BY_ID[id].role !== 'GK') : [];
  for (const id of DEFAULT_SQUAD.penaltyOrder) if (order.length < SQUAD_SIZE && !order.includes(id)) order.push(id);
  const gk = q.goalkeeperId && PLAYER_BY_ID[q.goalkeeperId]?.role === 'GK' ? q.goalkeeperId : DEFAULT_SQUAD.goalkeeperId;
  const fk = q.freeKickTakerId && order.includes(q.freeKickTakerId) ? q.freeKickTakerId : order[0];
  return { penaltyOrder: order.slice(0, SQUAD_SIZE), goalkeeperId: gk, freeKickTakerId: fk };
}
