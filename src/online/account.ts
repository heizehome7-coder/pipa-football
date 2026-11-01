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

export interface AccountReply {
  ok: boolean;
  created?: boolean;
  token?: string;
  nickname?: string;
  squad?: unknown;
  error?: string;
  message?: string;
}

/** 'offline' = the server could not be reached at all */
export class AccountError extends Error {
  constructor(
    readonly code: string,
    message: string,
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
  if (!data.ok) throw new AccountError(data.error ?? 'error', data.message ?? '잠시 후 다시 시도해주세요');
  return data;
}

export const accountApi = {
  auth: (nickname: string, password: string) => post('/api/auth', { nickname, password }),
  session: (token: string) => post('/api/session', { token }, 30_000),
  saveSquad: (token: string, squad: Squad) => post('/api/squad', { token, squad }, 20_000),
  logout: (token: string) => post('/api/logout', { token }, 8_000),
};
