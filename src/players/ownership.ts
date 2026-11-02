import { PLAYER_BY_ID, STARTER_PLAYERS } from './players';
import { DEFAULT_SQUAD, validSquad, type Squad } from './squad';

/**
 * UPDATE 6 — which players a user may put in his squad: the 15 free starters plus the
 * market players he owns. On the PIPA server the owned list comes from the account
 * (MP and purchases are server-side only); a copy without server (claude.ai page)
 * keeps the market players that were already in this device's squad before UPDATE 6.
 */
export interface Wallet {
  /** null = no account server (market unavailable) */
  mp: number | null;
  owned: Set<string>;
}

export function makeOwned(marketOwned: Iterable<string>): Set<string> {
  const s = new Set<string>(STARTER_PLAYERS.map((p) => p.id));
  for (const id of marketOwned) if (PLAYER_BY_ID[id]) s.add(id);
  return s;
}

const LEGACY_KEY = 'pipa.owned.local.v6';

/** device-only copy: grandfather the market players already in the local squad (once) */
export function localOwned(nickname: string, localSquad: Squad | null): Set<string> {
  const key = `${LEGACY_KEY}.${nickname.trim().toLowerCase()}`;
  let ids: string[] | null = null;
  try {
    ids = JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    ids = null;
  }
  if (!Array.isArray(ids)) {
    ids = localSquad ? [...localSquad.penaltyOrder, localSquad.goalkeeperId].filter((id) => PLAYER_BY_ID[id] && !PLAYER_BY_ID[id].starter) : [];
    try {
      localStorage.setItem(key, JSON.stringify(ids));
    } catch {
      /* private mode */
    }
  }
  return makeOwned(ids);
}

/** a squad with only owned players (anything else is replaced by an owned starter) */
export function fitSquad(s: Squad | null, owned: Set<string>): Squad | null {
  if (!s || !validSquad(s)) return s;
  if ([...s.penaltyOrder, s.goalkeeperId].every((id) => owned.has(id))) return s;
  const order = s.penaltyOrder.filter((id) => owned.has(id));
  for (const p of STARTER_PLAYERS) {
    if (order.length >= 5) break;
    if (p.role !== 'GK' && !order.includes(p.id)) order.push(p.id);
  }
  const gk = owned.has(s.goalkeeperId) ? s.goalkeeperId : DEFAULT_SQUAD.goalkeeperId;
  return { penaltyOrder: order, goalkeeperId: gk, freeKickTakerId: order.includes(s.freeKickTakerId) ? s.freeKickTakerId : order[0] };
}

/** 30,000,000 MP */
export const formatMP = (n: number) => `${Math.round(n).toLocaleString('en-US')} MP`;

/** 3,000만 MP · 12억 5,000만 MP */
export function formatMPKo(n: number) {
  const eok = Math.floor(n / 100_000_000);
  const man = Math.round((n % 100_000_000) / 10_000);
  const parts: string[] = [];
  if (eok) parts.push(`${eok.toLocaleString('en-US')}억`);
  if (man) parts.push(`${man.toLocaleString('en-US')}만`);
  return `${parts.join(' ') || '0'} MP`;
}
