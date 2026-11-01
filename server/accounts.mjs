/**
 * PIPA accounts — unique nicknames + saved account data (squad).
 *
 *   POST /api/auth     {nickname, password}  → new nickname: account is created
 *                                              existing nickname: password must match
 *                      ← {ok, created, token, nickname, squad}
 *   POST /api/session  {token}               ← {ok, nickname, squad}      (auto-login)
 *   POST /api/squad    {token, squad}        ← {ok}                       (save squad)
 *   POST /api/logout   {token}               ← {ok}
 *
 * Storage:
 *   DATABASE_URL set   → PostgreSQL (permanent; e.g. a free Neon database)
 *   otherwise          → JSON file (PIPA_DATA_DIR or server/data). On Render's free
 *                        plan that file is wiped on every restart / spin-down.
 *
 * Passwords are stored only as scrypt hashes; login tokens only as sha256 hashes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NICK_MAX = 12;
const PASS_MIN = 4;
const PASS_MAX = 64;
const MAX_TOKENS = 8; // devices kept logged in per account

/** case/width-insensitive key so "Haze", "haze" and "ｈａｚｅ" are the same nickname */
export const nickKey = (n) => String(n).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const cleanNick = (n) => String(n ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(pw, salt, 32).toString('hex');
  return { salt, hash };
}
function checkPassword(pw, salt, hash) {
  const h = crypto.scryptSync(pw, salt, 32);
  const want = Buffer.from(hash, 'hex');
  return want.length === h.length && crypto.timingSafeEqual(h, want);
}

// ── storage backends ────────────────────────────────────────
// record: { key, nickname, salt, hash, tokens: [sha256], data: {squad?}, createdAt }

function fileStore(dir) {
  const file = path.join(dir, 'accounts.json');
  let db = {};
  try {
    db = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    db = {};
  }
  let timer = null;
  const flush = () => {
    timer = null;
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(db));
      fs.renameSync(file + '.tmp', file);
    } catch (e) {
      console.error('accounts: save failed', e.message);
    }
  };
  return {
    kind: 'file',
    async get(key) {
      return db[key] ?? null;
    },
    async byToken(t) {
      return Object.values(db).find((r) => r.tokens.includes(t)) ?? null;
    },
    async create(rec) {
      if (db[rec.key]) return false;
      db[rec.key] = rec;
      timer ??= setTimeout(flush, 200);
      return true;
    },
    async put(rec) {
      db[rec.key] = rec;
      timer ??= setTimeout(flush, 200);
    },
    async count() {
      return Object.keys(db).length;
    },
  };
}

async function pgStore(url) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: url,
    max: 4,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
  });
  await pool.query(`CREATE TABLE IF NOT EXISTS pipa_accounts (
    nick_key   TEXT PRIMARY KEY,
    nickname   TEXT NOT NULL,
    salt       TEXT NOT NULL,
    hash       TEXT NOT NULL,
    tokens     TEXT[] NOT NULL DEFAULT '{}',
    data       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  const row = (r) => r && { key: r.nick_key, nickname: r.nickname, salt: r.salt, hash: r.hash, tokens: r.tokens, data: r.data, createdAt: r.created_at };
  return {
    kind: 'postgres',
    async get(key) {
      const { rows } = await pool.query('SELECT * FROM pipa_accounts WHERE nick_key = $1', [key]);
      return row(rows[0]) ?? null;
    },
    async byToken(t) {
      const { rows } = await pool.query('SELECT * FROM pipa_accounts WHERE $1 = ANY(tokens) LIMIT 1', [t]);
      return row(rows[0]) ?? null;
    },
    async create(rec) {
      const r = await pool.query(
        'INSERT INTO pipa_accounts (nick_key, nickname, salt, hash, tokens, data) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (nick_key) DO NOTHING',
        [rec.key, rec.nickname, rec.salt, rec.hash, rec.tokens, rec.data],
      );
      return r.rowCount === 1;
    },
    async put(rec) {
      await pool.query('UPDATE pipa_accounts SET tokens = $2, data = $3 WHERE nick_key = $1', [rec.key, rec.tokens, rec.data]);
    },
    async count() {
      const { rows } = await pool.query('SELECT count(*)::int AS n FROM pipa_accounts');
      return rows[0].n;
    },
  };
}

// ── squad check (ids only; the client validates against the real roster) ──
function cleanSquad(s) {
  if (!s || typeof s !== 'object') return null;
  const id = (x) => typeof x === 'string' && /^[a-z]{2,20}$/.test(x);
  if (!Array.isArray(s.penaltyOrder) || s.penaltyOrder.length !== 5 || !s.penaltyOrder.every(id)) return null;
  if (!id(s.goalkeeperId) || !id(s.freeKickTakerId)) return null;
  return { penaltyOrder: [...s.penaltyOrder], goalkeeperId: s.goalkeeperId, freeKickTakerId: s.freeKickTakerId };
}

// ── manager ──────────────────────────────────────────────
export async function createAccounts({ databaseUrl, dataDir, log = () => {} } = {}) {
  let store;
  if (databaseUrl) {
    try {
      store = await pgStore(databaseUrl);
    } catch (e) {
      log(`accounts: database unavailable (${e.message}) — falling back to file storage`);
    }
  }
  store ??= fileStore(dataDir ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'data'));
  log(`accounts: storage = ${store.kind}`);

  // brute-force guard: failed password attempts per IP and per nickname
  const fails = new Map();
  const tooMany = (k) => {
    const f = fails.get(k);
    return !!f && f.n >= 8 && Date.now() - f.t < 10 * 60_000;
  };
  const fail = (k) => {
    const f = fails.get(k);
    if (!f || Date.now() - f.t > 10 * 60_000) fails.set(k, { n: 1, t: Date.now() });
    else f.n++;
  };

  const newToken = async (rec) => {
    const token = crypto.randomBytes(24).toString('base64url');
    rec.tokens = [...rec.tokens.filter(Boolean), sha(token)].slice(-MAX_TOKENS);
    return token;
  };
  const view = (rec) => ({ nickname: rec.nickname, squad: rec.data?.squad ?? null });

  async function auth({ nickname, password }, ip) {
    const nick = cleanNick(nickname);
    if (!nick) return { status: 400, body: { ok: false, error: 'nickname', message: '닉네임을 입력해주세요' } };
    if ([...nick].length > NICK_MAX) return { status: 400, body: { ok: false, error: 'nickname', message: `닉네임은 ${NICK_MAX}자 이하로 입력해주세요` } };
    if (/[<>{}\\]/.test(nick)) return { status: 400, body: { ok: false, error: 'nickname', message: '닉네임에 쓸 수 없는 문자가 있어요' } };
    if (typeof password !== 'string' || password.length < PASS_MIN || password.length > PASS_MAX)
      return { status: 400, body: { ok: false, error: 'password', message: `비밀번호는 ${PASS_MIN}자 이상으로 입력해주세요` } };
    const key = nickKey(nick);
    if (tooMany(ip) || tooMany(key)) return { status: 429, body: { ok: false, error: 'rate', message: '잠시 후 다시 시도해주세요' } };

    let rec = await store.get(key);
    if (!rec) {
      const { salt, hash } = hashPassword(password);
      rec = { key, nickname: nick, salt, hash, tokens: [], data: {}, createdAt: new Date().toISOString() };
      const token = await newToken(rec);
      if (await store.create(rec)) {
        log(`accounts: created "${nick}"`);
        return { status: 200, body: { ok: true, created: true, token, ...view(rec) } };
      }
      rec = await store.get(key); // lost a race — treat as an existing account
      if (!rec) return { status: 500, body: { ok: false, error: 'server', message: '잠시 후 다시 시도해주세요' } };
    }
    if (!checkPassword(password, rec.salt, rec.hash)) {
      fail(ip);
      fail(key);
      return {
        status: 409,
        body: { ok: false, error: 'taken', message: '이미 사용 중인 닉네임이에요. 내 계정이면 비밀번호를 확인하고, 아니면 다른 닉네임을 써주세요' },
      };
    }
    fails.delete(key);
    const token = await newToken(rec);
    await store.put(rec);
    return { status: 200, body: { ok: true, created: false, token, ...view(rec) } };
  }

  async function session({ token }) {
    if (typeof token !== 'string' || token.length < 16) return { status: 401, body: { ok: false, error: 'session' } };
    const rec = await store.byToken(sha(token));
    if (!rec) return { status: 401, body: { ok: false, error: 'session' } };
    return { status: 200, body: { ok: true, ...view(rec) } };
  }

  async function saveSquad({ token, squad }) {
    if (typeof token !== 'string') return { status: 401, body: { ok: false, error: 'session' } };
    const rec = await store.byToken(sha(token));
    if (!rec) return { status: 401, body: { ok: false, error: 'session' } };
    const s = cleanSquad(squad);
    if (!s) return { status: 400, body: { ok: false, error: 'squad' } };
    rec.data = { ...(rec.data ?? {}), squad: s };
    await store.put(rec);
    return { status: 200, body: { ok: true } };
  }

  async function logout({ token }) {
    if (typeof token !== 'string') return { status: 200, body: { ok: true } };
    const t = sha(token);
    const rec = await store.byToken(t);
    if (rec) {
      rec.tokens = rec.tokens.filter((x) => x !== t);
      await store.put(rec);
    }
    return { status: 200, body: { ok: true } };
  }

  /** nickname for a login token (used to verify WebSocket presence) */
  async function nicknameFor(token) {
    if (typeof token !== 'string' || token.length < 16) return null;
    const rec = await store.byToken(sha(token));
    return rec?.nickname ?? null;
  }
  async function isRegistered(nickname) {
    return !!(await store.get(nickKey(cleanNick(nickname))));
  }

  const routes = { '/api/auth': auth, '/api/session': session, '/api/squad': saveSquad, '/api/logout': logout };

  /** returns true when it handled the request */
  function handleHttp(req, res, pathname) {
    const fn = routes[pathname];
    if (!fn) return false;
    const reply = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST') {
      reply(405, { ok: false });
      return true;
    }
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 8192) req.destroy();
    });
    req.on('end', async () => {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        return reply(400, { ok: false });
      }
      const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
      try {
        const r = await fn(body ?? {}, ip);
        reply(r.status, r.body);
      } catch (e) {
        log(`accounts: error ${e.message}`);
        reply(500, { ok: false, error: 'server', message: '서버 오류 — 잠시 후 다시 시도해주세요' });
      }
    });
    return true;
  }

  return { handleHttp, nicknameFor, isRegistered, nickKey, kind: store.kind, count: () => store.count(), _store: store };
}
