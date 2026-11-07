import { hasArtifactRuntime } from './channel/ArtifactRoomChannel';
import type { Squad } from '../players/squad';

/**
 * Accounts on the PIPA server (server/accounts.mjs): one nickname = one account,
 * protected by its password, with the squad saved on the server.
 * The claude.ai copy and a file:// copy have no server → device-only login.
 */
export function accountsAvailable(): boolean {
  if (hasArtifactRuntime()) return false;
  if (typeof location === 'undefined' || location.protocol === 'file:') return false;
  return true;
}

const SESSION_KEY = 'pipa.session.v1';
export interface StoredSession {
  token: string;
  nickname: string;
}
export function loadSession(): StoredSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
    return s && typeof s.token === 'string' && typeof s.nickname === 'string' ? s : null;
  } catch {
    return null;
  }
}
export function storeSession(s: StoredSession | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode — stays logged in for this visit only */
  }
}

// ── UPDATE 7 types ──
export interface DailyStatus {
  canClaim: boolean;
  streak: number;
  nextDay: number;
  lastClaim: string | null;
  today: string;
}
export interface SaleNotice {
  id: string;
  type: 'sold';
  playerId: string;
  price: number;
  revenue: number;
  fee: number;
  buyer: string;
  at: string;
}
export interface Listing {
  id: string;
  playerId: string;
  price: number;
  createdAt: string;
}
export interface RankRow {
  rank: number;
  nickname: string;
  level: number;
  mp: number;
  wins?: number;
  losses?: number;
  draws?: number;
  games?: number;
  winRate?: number;
}
export interface RecordStats {
  wins: number;
  losses: number;
  draws: number;
}
export interface Profile {
  nickname: string;
  level: number;
  xp: number;
  xpNext: number;
  mp: number;
  fv: number;
  online: boolean;
  stats: { total: RecordStats; penalty: RecordStats; freekick: RecordStats };
}

/** UPDATE 8: one pack result (decided by the server) */
export interface PackPull {
  id: string;
  cardId: string;
  playerId: string;
  tier: 'base' | 'rare' | 'epic' | 'elite' | 'icon';
  /** UPDATE 9: which pack gave it (top = 홍 TOP LEGEND) */
  kind?: 'player' | 'good' | 'legend' | 'top';
  at: string;
}

/** UPDATE 10 — weekly missions as the server reports them */
export interface MissionView {
  id: string;
  title: string;
  desc: string;
  goal: number;
  unit: string;
  reward: { fv?: number; mp?: number };
  progress: number;
  done: boolean;
  claimed: boolean;
}
export interface StatRow {
  nickname: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  rate: number;
}

/** UPDATE 9.5 — 감자의 제왕 best score + recent games */
export interface PotatoStats {
  best: number;
  played: number;
  recent: { id: string; score: number; reward: { mp?: number; pack?: 'good' } | null; at: string }[];
}

/** UPDATE 9 — EVENT CENTER */
export type HongGradeId = 'bronze' | 'silver' | 'gold' | 'red';
export type HongTokens = Record<HongGradeId, number>;
export interface PotatoSessionView {
  sessionId: string;
  status: 'playing' | 'done';
  startAt: number;
  endAt: number;
  round: number;
  score: number;
  rounds: { hole: number; kind: 'normal' | 'red' | 'rotten' }[][];
  clicked: string[];
  reward: { mp?: number; pack?: 'good' } | null;
  /** UPDATE 9.5: this game beat my best score */
  newBest?: boolean;
}

/** UPDATE 11 patch: the weekday play time limit (decided by the server's clock) */
export interface AccessState {
  locked: boolean;
  mode: 'auto' | 'open';
  window: boolean;
  endsAt: string | null;
  serverTime: string;
}
/** anything that hits the limit (HTTP 423) tells the app at once */
let onLocked: ((a: AccessState) => void) | null = null;
export const setLockedHandler = (f: ((a: AccessState) => void) | null) => (onLocked = f);

export interface AccountReply {
  ok: boolean;
  /** UPDATE 11 patch */
  matchSquad?: import('../match/formation').MatchSquad | null;
  access?: AccessState;
  created?: boolean;
  token?: string;
  nickname?: string;
  squad?: unknown;
  /** UPDATE 6 */
  mp?: number;
  owned?: string[];
  playerId?: string;
  /** UPDATE 8 */
  cards?: { id: string; playerId: string; source: string | null; evo?: number }[];
  pull?: PackPull;
  packsOpened?: number;
  /** UPDATE 7 */
  listed?: string[];
  level?: number;
  xp?: number;
  xpNext?: number;
  fv?: number;
  claimedLevelRewards?: number[];
  unopenedPacks?: number;
  /** UPDATE 9 */
  goodPacks?: number;
  legendPacks?: number;
  hong?: HongTokens;
  potato?: PotatoSessionView | null;
  serverNow?: number;
  results?: HongGradeId[];
  reward?: { grade: HongGradeId; mp?: number; pack?: 'legend'; pull?: PackPull };
  hit?: 'normal' | 'red' | 'rotten' | null;
  score?: number;
  ended?: boolean;
  paidNow?: boolean;
  repeated?: boolean;
  /** UPDATE 9.5 */
  favorites?: string[];
  /** UPDATE 10 */
  season?: number;
  evo?: Record<string, number>;
  starterEvo?: Record<string, number>;
  materials?: { id: string; ovr: number }[];
  success?: boolean;
  rate?: number;
  from?: number;
  evoLevel?: number;
  ovr?: number;
  missions?: MissionView[];
  week?: string;
  resetInMs?: number;
  claimed?: string;
  potatoStats?: PotatoStats;
  daily?: DailyStatus;
  notices?: SaleNotice[];
  price?: number;
  source?: 'user' | 'system';
  seller?: string;
  listing?: Listing;
  day?: number;
  rewardMp?: number;
  rewardPacks?: number;
  fvGained?: number;
  min?: number;
  max?: number;
  error?: string;
  message?: string;
}

/** 'offline' = the server could not be reached at all */
export class AccountError extends Error {
  constructor(
    readonly code: string,
    message: string,
    /** the server's current balance/ownership, when it sent them with the error */
    readonly reply?: AccountReply,
  ) {
    super(message);
  }
}

const base = () => ((import.meta.env.VITE_PIPA_API_URL as string | undefined) || '').replace(/\/$/, '');

async function post(path: string, body: unknown, timeoutMs = 75_000): Promise<AccountReply> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch {
    throw new AccountError('offline', '서버에 연결할 수 없어요. 인터넷 연결을 확인하고 다시 시도해주세요');
  } finally {
    clearTimeout(timer);
  }
  let data: AccountReply;
  try {
    data = await res.json();
  } catch {
    throw new AccountError('offline', '서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요');
  }
  if (res.status === 423 && data.access) onLocked?.(data.access);
  if (!data.ok) throw new AccountError(data.error ?? 'error', data.message ?? '잠시 후 다시 시도해주세요', data);
  return data;
}

export const accountApi = {
  /** UPDATE 11 patch */
  access: () => post('/api/access', {}, 15_000) as Promise<AccountReply & AccessState>,
  saveMatchSquad: (token: string, matchSquad: import('../match/formation').MatchSquad) => post('/api/match-squad', { token, matchSquad }, 20_000),
  auth: (nickname: string, password: string) => post('/api/auth', { nickname, password }),
  session: (token: string) => post('/api/session', { token }, 30_000),
  saveSquad: (token: string, squad: Squad) => post('/api/squad', { token, squad }, 20_000),
  logout: (token: string) => post('/api/logout', { token }, 8_000),
  /** UPDATE 6: MP balance + owned market players */
  me: (token: string) => post('/api/me', { token }, 30_000),
  buy: (token: string, playerId: string, maxPrice?: number) => post('/api/market/buy', { token, playerId, maxPrice }, 30_000),
  // ── UPDATE 7 ──
  sell: (token: string, playerId: string, price: number, cardId?: string) => post('/api/market/sell', { token, playerId, price, cardId }, 30_000),
  /** UPDATE 8: open one PLAYER PACK — the SERVER draws the player */
  openPack: (token: string, kind: 'player' | 'good' | 'legend' = 'player') => post('/api/packs/open', { token, kind }, 30_000),
  // ── UPDATE 9: EVENT CENTER (every result decided by the server) ──
  eventsState: (token: string) => post('/api/events/state', { token }, 30_000),
  hongDraw: (token: string, count: 1 | 10, nonce: string) => post('/api/events/hong/draw', { token, count, nonce }, 30_000),
  hongExchange: (token: string, grade: HongGradeId, nonce: string) => post('/api/events/hong/exchange', { token, grade, nonce }, 30_000),
  potatoStart: (token: string, nonce: string) => post('/api/events/potato/start', { token, nonce }, 30_000),
  potatoTap: (token: string, sessionId: string, round: number, holeId: number) => post('/api/events/potato/tap', { token, sessionId, round, holeId }, 15_000),
  potatoFinish: (token: string, sessionId: string) => post('/api/events/potato/finish', { token, sessionId }, 30_000),
  /** UPDATE 9.5: 관심 선수 on/off (saved on the account) */
  setFavorite: (token: string, playerId: string, on: boolean) => post('/api/favorites', { token, playerId, on }, 15_000),
  // ── UPDATE 10 ──
  missions: (token: string) => post('/api/missions/state', { token }, 30_000),
  missionPlay: (token: string, seconds: number) => post('/api/missions/play', { token, seconds }, 15_000),
  missionClaim: (token: string, id: string) => post('/api/missions/claim', { token, id }, 30_000),
  stats: (q: string, board: 'total' | 'penalty' | 'freekick') => post('/api/stats', { q, board }, 30_000) as Promise<AccountReply & { rows?: StatRow[]; total?: number }>,
  evoBuy: (token: string, ovr: number, currency: 'mp' | 'fv', nonce: string) => post('/api/evo/buy', { token, ovr, currency, nonce }, 30_000),
  evolve: (token: string, cardKey: string, materialId: string, nonce: string) => post('/api/evo/evolve', { token, cardKey, materialId, nonce }, 30_000),
  cancel: (token: string, listingId: string) => post('/api/market/cancel', { token, listingId }, 30_000),
  marketState: (token: string | null) =>
    post('/api/market/state', { token }, 30_000) as Promise<AccountReply & { listings?: Record<string, { count: number; min: number }>; mine?: Listing[] }>,
  ackNotices: (token: string, ids: string[]) => post('/api/notices/ack', { token, ids }, 15_000),
  claimDaily: (token: string) => post('/api/daily/claim', { token }, 30_000),
  claimLevel: (token: string, level: number) => post('/api/level/claim', { token, level }, 30_000),
  ranking: (token: string | null, board: 'mp' | 'penalty' | 'freekick') =>
    post('/api/ranking', { token, board }, 30_000) as Promise<AccountReply & { rows?: RankRow[]; me?: RankRow | null; total?: number }>,
  profile: (nickname: string) => post('/api/profile', { nickname }, 30_000) as Promise<AccountReply & { profile?: Profile }>,
};

// ── UPDATE 6 patch: DEVELOPER MODE (the code is checked only by the server) ──
export interface DevStats {
  wins: number;
  losses: number;
  draws: number;
}
export interface DevUser {
  nickname: string;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  online: boolean;
  mp: number;
  owned: number;
  stats: { total: DevStats; penalty: DevStats; freekick: DevStats };
  level?: number;
  xp?: number;
  fv?: number;
  dailyStreak?: number;
  unopenedPacks?: number;
  /** UPDATE 9.5 */
  goodPacks?: number;
  legendPacks?: number;
  hong?: HongTokens;
}
/** UPDATE 7 hotfix — USER SQUADS (read-only, straight from the server) */
export interface DevSquadUser {
  nickname: string;
  online: boolean;
  level: number;
  mp: number;
  squad: { penaltyOrder: string[]; goalkeeperId: string; freeKickTakerId: string } | null;
  squadUsable: boolean;
  owned: string[];
  ownedAll: string[];
  listed: string[];
  updatedAt: string | null;
}
export type DevItem = 'fv' | 'bronze' | 'silver' | 'gold' | 'red' | 'good' | 'legend';
type DevReply = AccountReply & {
  devToken?: string;
  users?: DevUser[];
  total?: number;
  granted?: number;
  before?: number;
  user?: DevSquadUser;
  matches?: { nickname: string; online: boolean; level: number }[];
};
const devPost = (path: string, body: unknown) => post(path, body, 30_000) as Promise<DevReply>;
export const devApi = {
  auth: (code: string) => devPost('/api/dev/auth', { code }),
  users: (devToken: string, q = '') => devPost('/api/dev/users', { devToken, q }),
  grant: (devToken: string, nickname: string, amount: number) => devPost('/api/dev/grant', { devToken, nickname, amount }),
  squad: (devToken: string, nickname: string) => devPost('/api/dev/squad', { devToken, nickname }),
  /** UPDATE 8: give a user PLAYER PACKS */
  grantPacks: (devToken: string, nickname: string, count: number) =>
    devPost('/api/dev/grant-packs', { devToken, nickname, count }) as Promise<DevReply & { unopenedPacks?: number }>,
  /** UPDATE 9.5: FV, 홍 tokens, GOOD / LEGEND packs */
  grantItems: (devToken: string, nickname: string, item: DevItem, count: number) =>
    devPost('/api/dev/grant-items', { devToken, nickname, item, count }) as Promise<DevReply & { after?: number; item?: DevItem }>,
  /** UPDATE 11: take MP / FV back (never more than the user has) */
  /** UPDATE 11 patch: SERVER ACCESS CONTROL — 'open' = 전체 게임 열기 · 'auto' = 자동 시간 제한 복구 */
  access: (devToken: string, mode: 'open' | 'auto') => devPost('/api/dev/access', { devToken, mode }) as Promise<DevReply & AccessState>,
  removeCurrency: (devToken: string, nickname: string, currency: 'mp' | 'fv', amount: number) =>
    devPost('/api/dev/remove-currency', { devToken, nickname, currency, amount }) as Promise<DevReply & { before?: number; after?: number; removed?: number }>,
};

/** UPDATE 9: a fresh id per button press (a network retry of the same press is answered once) */
export function newNonce() {
  const a = new Uint8Array(12);
  try {
    crypto.getRandomValues(a);
  } catch {
    for (let i = 0; i < a.length; i++) a[i] = (Date.now() * (i + 7)) & 0xff;
  }
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
