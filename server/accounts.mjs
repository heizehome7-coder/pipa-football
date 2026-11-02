/**
 * PIPA accounts — unique nicknames + saved account data (squad).
 *
 *   POST /api/auth     {nickname, password}  → new nickname: account is created
 *                                              existing nickname: password must match
 *                      ← {ok, created, token, nickname, squad}
 *   POST /api/session  {token}               ← {ok, nickname, squad}      (auto-login)
 *   POST /api/squad    {token, squad}        ← {ok}                       (save squad)
 *   POST /api/logout   {token}               ← {ok}
 *   POST /api/me       {token}               ← {ok, nickname, squad, mp, owned}       (UPDATE 6)
 *   POST /api/market/buy {token, playerId}   ← {ok, mp, owned, playerId}              (UPDATE 6)
 *
 * UPDATE 6 (patch) — DEVELOPER MODE (all checks on the server):
 *   POST /api/dev/auth  {code}                     ← {ok, devToken}   (code = env DEVELOPER_CODE;
 *                                                     never in the browser bundle)
 *   POST /api/dev/users {devToken, q?}             ← {ok, users:[…]}  recent 100 (lastSeenAt desc)
 *   POST /api/dev/grant {devToken, nickname, amount} ← {ok, nickname, mp, granted}
 *   Every grant is written to the developer action log (file devlog.json / table pipa_dev_log).
 *   Accounts also keep lastLoginAt / lastSeenAt (server time) and online records per mode:
 *   stats: { penalty:{wins,losses,draws}, freekick:{…} } — once per finished game (results:[keys]).
 *
 * UPDATE 6 account data: { squad, mp, owned:[market player ids], rewards:[match keys], v6:true }
 *  - MP only changes on the server: +reward for a finished online win (once per match
 *    game), −price for a purchase. The client never sends an amount.
 *  - starters are free for everyone; market players must be owned to be in a squad.
 *  - accounts made before UPDATE 6 keep the market players already in their squad.
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
    async list() {
      return Object.values(db);
    },
    async logAction(entry) {
      const f = path.join(dir, 'devlog.json');
      let a = [];
      try {
        a = JSON.parse(fs.readFileSync(f, 'utf8'));
      } catch {
        a = [];
      }
      a.push(entry);
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(f, JSON.stringify(a.slice(-2000)));
      } catch (e) {
        console.error('devlog: save failed', e.message);
      }
    },
    async actions(limit = 50) {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, 'devlog.json'), 'utf8')).slice(-limit).reverse();
      } catch {
        return [];
      }
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
  await pool.query(`CREATE TABLE IF NOT EXISTS pipa_dev_log (
    id      BIGSERIAL PRIMARY KEY,
    at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    action  TEXT NOT NULL,
    target  TEXT,
    amount  BIGINT,
    detail  JSONB NOT NULL DEFAULT '{}'::jsonb
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
    async list() {
      const { rows } = await pool.query('SELECT * FROM pipa_accounts');
      return rows.map(row);
    },
    async logAction(e) {
      await pool.query('INSERT INTO pipa_dev_log (at, action, target, amount, detail) VALUES ($1,$2,$3,$4,$5)', [e.timestamp, e.action, e.target, e.amount, e]);
    },
    async actions(limit = 50) {
      const { rows } = await pool.query('SELECT detail FROM pipa_dev_log ORDER BY id DESC LIMIT $1', [limit]);
      return rows.map((r) => r.detail);
    },
  };
}

// ── squad check (ids only; the client validates against the real roster) ──
function cleanSquad(s, catalog) {
  if (!s || typeof s !== 'object') return null;
  const id = (x) => typeof x === 'string' && /^[a-z]{2,20}$/.test(x);
  if (!Array.isArray(s.penaltyOrder) || s.penaltyOrder.length !== 5 || !s.penaltyOrder.every(id)) return null;
  if (new Set(s.penaltyOrder).size !== 5) return null;
  if (!id(s.goalkeeperId) || !id(s.freeKickTakerId)) return null;
  if (catalog) {
    const role = (x) => catalog.getPlayer(x)?.role;
    if (!s.penaltyOrder.every((x) => role(x) && role(x) !== 'GK') || role(s.goalkeeperId) !== 'GK') return null;
    if (!s.penaltyOrder.includes(s.freeKickTakerId)) return null;
  }
  return { penaltyOrder: [...s.penaltyOrder], goalkeeperId: s.goalkeeperId, freeKickTakerId: s.freeKickTakerId };
}
const squadIds = (s) => (s ? [...s.penaltyOrder, s.goalkeeperId, s.freeKickTakerId] : []);

// ── manager ──────────────────────────────────────────────
// ── DEVELOPER MODE code: env DEVELOPER_CODE, else this salted scrypt hash (no plain code anywhere) ──
const DEV_FALLBACK = { salt: '20d3533f38dbf627da335afdfefbd312', hash: '6564308164c28fe299c0950d21a924af43b5f7b2cc641eae273ce580bbb37e41' };
const DEV_TOKEN_MS = 2 * 60 * 60_000;
/** the largest single grant (100 billion MP) — anything above is refused as abnormal */
export const MAX_GRANT = 100_000_000_000;

function devCodeOk(code, envCode) {
  if (typeof code !== 'string' || !code || code.length > 128) return false;
  if (envCode) {
    const a = crypto.createHash('sha256').update(code).digest();
    const b = crypto.createHash('sha256').update(envCode).digest();
    return crypto.timingSafeEqual(a, b);
  }
  const h = crypto.scryptSync(code, DEV_FALLBACK.salt, 32);
  return crypto.timingSafeEqual(h, Buffer.from(DEV_FALLBACK.hash, 'hex'));
}

const emptyStats = () => ({ penalty: { wins: 0, losses: 0, draws: 0 }, freekick: { wins: 0, losses: 0, draws: 0 } });

export async function createAccounts({ databaseUrl, dataDir, catalog = null, log = () => {}, developerCode = process.env.DEVELOPER_CODE } = {}) {
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

  // UPDATE 6 ─ per-account serialisation (purchases, rewards and squad saves never interleave)
  const locks = new Map();
  const withLock = (key, fn) => {
    const prev = locks.get(key) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => {});
    locks.set(key, tail);
    tail.then(() => locks.get(key) === tail && locks.delete(key));
    return run;
  };
  /** latest record per account (ownership checks for online matches are synchronous) */
  const cache = new Map();
  const remember = (rec) => (rec && cache.set(rec.key, rec), rec);
  const isMarket = (id) => !!catalog && catalog.marketPrice(id) != null;
  const owns = (rec, id) => !!catalog && (catalog.isStarter(id) || (rec.data?.owned ?? []).includes(id));

  /** accounts from before UPDATE 6: market players already in the saved squad become owned */
  function migrate(rec, squad = rec.data?.squad) {
    if (!rec || rec.data?.v6) return false;
    // no squad on the server yet: wait for the first squad this account saves
    if (!squad) return false;
    const owned = new Set(rec.data?.owned ?? []);
    for (const id of squadIds(squad)) if (isMarket(id)) owned.add(id);
    rec.data = { ...(rec.data ?? {}), owned: [...owned], mp: rec.data?.mp ?? 0, rewards: rec.data?.rewards ?? [], v6: true };
    log(`accounts: "${rec.nickname}" migrated to UPDATE 6 (kept ${owned.size} market player(s))`);
    return true;
  }
  const load = async (key) => remember(await store.get(key));
  /** server-time login / activity stamps */
  function stamp(rec, login = false) {
    const now = new Date().toISOString();
    rec.data = { ...(rec.data ?? {}), lastSeenAt: now, ...(login ? { lastLoginAt: now } : {}) };
  }

  const newToken = async (rec) => {
    const token = crypto.randomBytes(24).toString('base64url');
    rec.tokens = [...rec.tokens.filter(Boolean), sha(token)].slice(-MAX_TOKENS);
    return token;
  };
  const view = (rec) => ({ nickname: rec.nickname, squad: rec.data?.squad ?? null, mp: rec.data?.mp ?? 0, owned: rec.data?.owned ?? [] });

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
      const now = new Date().toISOString();
      rec = { key, nickname: nick, salt, hash, tokens: [], data: { v6: true, mp: 0, owned: [], rewards: [], lastLoginAt: now, lastSeenAt: now }, createdAt: now };
      const token = await newToken(rec);
      if (await store.create(rec)) {
        remember(rec);
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
    return withLock(key, async () => {
      const cur = (await load(key)) ?? rec;
      migrate(cur);
      stamp(cur, true);
      const token = await newToken(cur);
      await store.put(cur);
      return { status: 200, body: { ok: true, created: false, token, ...view(cur) } };
    });
  }

  const NO_SESSION = { status: 401, body: { ok: false, error: 'session', message: '다시 로그인해주세요' } };
  /** token → account, migrated + saved if needed, inside that account's lock */
  async function withAccount(token, fn) {
    if (typeof token !== 'string' || token.length < 16) return NO_SESSION;
    const found = await store.byToken(sha(token));
    if (!found) return NO_SESSION;
    return withLock(found.key, async () => {
      const rec = (await load(found.key)) ?? found;
      if (!rec.tokens.includes(sha(token))) return NO_SESSION;
      if (migrate(rec)) await store.put(rec);
      return fn(rec);
    });
  }

  // auto-login counts as a login (server time)
  const session = ({ token }) =>
    withAccount(token, async (rec) => {
      stamp(rec, true);
      await store.put(rec);
      return { status: 200, body: { ok: true, ...view(rec) } };
    });
  const me = ({ token }) => withAccount(token, (rec) => ({ status: 200, body: { ok: true, ...view(rec) } }));

  function saveSquad({ token, squad }) {
    if (typeof token !== 'string' || token.length < 16) return NO_SESSION;
    return (async () => {
      const found = await store.byToken(sha(token));
      if (!found) return NO_SESSION;
      return withLock(found.key, async () => {
        const rec = (await load(found.key)) ?? found;
        const s = cleanSquad(squad, catalog);
        if (!s) return { status: 400, body: { ok: false, error: 'squad', message: '스쿼드 구성이 올바르지 않아요' } };
        // a pre-UPDATE-6 account that never saved a squad on the server: its device squad counts
        migrate(rec, rec.data?.squad ?? s);
        if (catalog && !squadIds(s).every((id) => owns(rec, id)))
          return { status: 403, body: { ok: false, error: 'not_owned', message: '보유하지 않은 선수가 있어요' } };
        rec.data = { ...(rec.data ?? {}), squad: s };
        await store.put(rec);
        return { status: 200, body: { ok: true } };
      });
    })();
  }

  /** TRANSFER MARKET purchase — the price comes from the server's own catalogue */
  function buy({ token, playerId }) {
    return withAccount(token, async (rec) => {
      const price = typeof playerId === 'string' && catalog ? catalog.marketPrice(playerId) : null;
      if (price == null) return { status: 400, body: { ok: false, error: 'not_for_sale', message: '판매하지 않는 선수예요' } };
      const owned = rec.data.owned ?? [];
      if (owned.includes(playerId)) return { status: 409, body: { ok: false, error: 'owned', message: '이미 보유한 선수예요', ...view(rec) } };
      const mp = rec.data.mp ?? 0;
      if (mp < price) return { status: 402, body: { ok: false, error: 'mp', message: 'MP가 부족합니다.', ...view(rec) } };
      rec.data = { ...rec.data, mp: mp - price, owned: [...owned, playerId] };
      await store.put(rec);
      log(`accounts: "${rec.nickname}" bought ${playerId} for ${price} MP (left ${rec.data.mp})`);
      return { status: 200, body: { ok: true, playerId, ...view(rec) } };
    });
  }

  /**
   * Online win reward (called by the match server, never by a client). `key` identifies
   * the finished game; a key is paid at most once per account. Returns the new balance
   * (null when nothing was paid).
   */
  function grantReward(nickname, key, amount) {
    if (!(amount > 0)) return Promise.resolve(null);
    const k = nickKey(cleanNick(nickname));
    return withLock(k, async () => {
      const rec = await load(k);
      if (!rec) return null;
      migrate(rec);
      const rewards = rec.data.rewards ?? [];
      if (rewards.includes(key)) return null;
      rec.data = { ...rec.data, mp: (rec.data.mp ?? 0) + amount, rewards: [...rewards, key].slice(-200) };
      await store.put(rec);
      log(`accounts: "${rec.nickname}" +${amount} MP (${key}) → ${rec.data.mp}`);
      return rec.data.mp;
    });
  }

  /** UPDATE 6 patch: online result for one finished game — once per key (resultRecorded) */
  function recordResult(nickname, key, mode, result) {
    if (!['win', 'loss', 'draw'].includes(result)) return Promise.resolve(false);
    const m = mode === 'freekick' ? 'freekick' : 'penalty';
    const k = nickKey(cleanNick(nickname));
    return withLock(k, async () => {
      const rec = await load(k);
      if (!rec) return false;
      const done = rec.data?.results ?? [];
      if (done.includes(key)) return false;
      const stats = { ...emptyStats(), ...(rec.data?.stats ?? {}) };
      const st = { ...stats[m] };
      st[result === 'win' ? 'wins' : result === 'loss' ? 'losses' : 'draws']++;
      rec.data = { ...rec.data, stats: { ...stats, [m]: st }, results: [...done, key].slice(-300) };
      await store.put(rec);
      return true;
    });
  }

  /** activity heartbeat from the realtime server (written at most once a minute per account) */
  const lastWrite = new Map();
  function touch(nickname, force = false) {
    if (!nickname) return Promise.resolve();
    const k = nickKey(cleanNick(nickname));
    const t = Date.now();
    if (!force && t - (lastWrite.get(k) ?? 0) < 60_000) return Promise.resolve();
    lastWrite.set(k, t);
    return withLock(k, async () => {
      const rec = await load(k);
      if (!rec) return;
      stamp(rec);
      await store.put(rec);
    }).catch(() => {});
  }

  // ── DEVELOPER MODE ───────────────────────────────────────
  const devTokens = new Map(); // sha(token) → expiry
  const devFails = new Map();
  let isOnline = () => false;
  let onWallet = () => {};
  const devOk = (t) => {
    if (typeof t !== 'string' || t.length < 16) return false;
    const e = devTokens.get(sha(t));
    if (!e) return false;
    if (e < Date.now()) {
      devTokens.delete(sha(t));
      return false;
    }
    return true;
  };
  const NO_DEV = { status: 401, body: { ok: false, error: 'dev', message: '개발자 인증이 필요합니다.' } };

  function devAuth({ code }, ip) {
    const f = devFails.get(ip);
    if (f && f.n >= 6 && Date.now() - f.t < 10 * 60_000) return { status: 429, body: { ok: false, error: 'rate', message: '잠시 후 다시 시도해주세요' } };
    if (!devCodeOk(code, developerCode)) {
      if (!f || Date.now() - f.t > 10 * 60_000) devFails.set(ip, { n: 1, t: Date.now() });
      else f.n++;
      log(`dev: wrong developer code from ${ip}`);
      return { status: 403, body: { ok: false, error: 'code', message: '인증이 되지 않았습니다.' } };
    }
    devFails.delete(ip);
    const token = crypto.randomBytes(32).toString('base64url');
    devTokens.set(sha(token), Date.now() + DEV_TOKEN_MS);
    log(`dev: developer session opened from ${ip}`);
    return { status: 200, body: { ok: true, devToken: token, expiresIn: DEV_TOKEN_MS } };
  }

  const statsOf = (rec) => {
    const s = { ...emptyStats(), ...(rec.data?.stats ?? {}) };
    const total = { wins: s.penalty.wins + s.freekick.wins, losses: s.penalty.losses + s.freekick.losses, draws: s.penalty.draws + s.freekick.draws };
    return { penalty: s.penalty, freekick: s.freekick, total };
  };
  const userRow = (rec) => ({
    nickname: rec.nickname,
    lastLoginAt: rec.data?.lastLoginAt ?? null,
    lastSeenAt: rec.data?.lastSeenAt ?? rec.data?.lastLoginAt ?? (rec.createdAt ? new Date(rec.createdAt).toISOString() : null),
    online: !!isOnline(rec.nickname),
    mp: rec.data?.mp ?? 0,
    owned: (rec.data?.owned ?? []).length,
    stats: statsOf(rec),
  });

  async function devUsers({ devToken, q }) {
    if (!devOk(devToken)) return NO_DEV;
    const query = typeof q === 'string' ? nickKey(q).slice(0, 40) : '';
    let rows = (await store.list()).map(userRow);
    if (query) rows = rows.filter((u) => nickKey(u.nickname).includes(query));
    rows.sort((a, b) => (b.online - a.online) || String(b.lastSeenAt ?? '').localeCompare(String(a.lastSeenAt ?? '')));
    return { status: 200, body: { ok: true, users: rows.slice(0, 100), total: rows.length, serverNow: new Date().toISOString() } };
  }

  async function devGrant({ devToken, nickname, amount }, ip) {
    if (!devOk(devToken)) return NO_DEV;
    // positive whole numbers only: no negatives, NaN, text, Infinity, 0 or absurd amounts
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0)
      return { status: 400, body: { ok: false, error: 'amount', message: '지급할 MP는 1 이상의 정수만 가능해요' } };
    if (amount > MAX_GRANT) return { status: 400, body: { ok: false, error: 'amount', message: `한 번에 ${MAX_GRANT.toLocaleString('en-US')} MP까지 지급할 수 있어요` } };
    if (typeof nickname !== 'string' || !nickname.trim()) return { status: 400, body: { ok: false, error: 'user', message: '유저를 선택해주세요' } };
    const k = nickKey(cleanNick(nickname));
    const r = await withLock(k, async () => {
      const rec = await load(k);
      if (!rec) return null;
      migrate(rec);
      const before = rec.data?.mp ?? 0;
      rec.data = { ...rec.data, mp: before + amount };
      await store.put(rec);
      return { nickname: rec.nickname, before, mp: rec.data.mp };
    });
    if (!r) return { status: 404, body: { ok: false, error: 'user', message: '그런 유저가 없어요' } };
    const entry = { developer_action: 'GRANT_MP', action: 'GRANT_MP', target: r.nickname, amount, before: r.before, after: r.mp, timestamp: new Date().toISOString(), ip };
    try {
      await store.logAction(entry);
    } catch (e) {
      log(`devlog failed: ${e.message}`);
    }
    log(`dev: GRANT_MP ${amount} → "${r.nickname}" (${r.before} → ${r.mp})`);
    try {
      onWallet(r.nickname, r.mp);
    } catch {
      /* the user may be offline */
    }
    return { status: 200, body: { ok: true, nickname: r.nickname, granted: amount, before: r.before, mp: r.mp } };
  }

  async function devLog({ devToken }) {
    if (!devOk(devToken)) return NO_DEV;
    return { status: 200, body: { ok: true, actions: await store.actions(50) } };
  }

  /** synchronous: the squad this account may use online (unowned market players → null squad) */
  function allowedSquad(nickname, squad) {
    if (!catalog || !squad) return squad;
    const rec = nickname ? cache.get(nickKey(cleanNick(nickname))) : null;
    const ok = (id) => catalog.isStarter(id) || (!!rec && owns(rec, id));
    return squadIds(squad).filter(Boolean).every(ok) ? squad : null;
  }

  async function logout({ token }) {
    if (typeof token !== 'string') return { status: 200, body: { ok: true } };
    const t = sha(token);
    const found = await store.byToken(t);
    if (found)
      await withLock(found.key, async () => {
        const rec = (await load(found.key)) ?? found;
        rec.tokens = rec.tokens.filter((x) => x !== t);
        await store.put(rec);
      });
    return { status: 200, body: { ok: true } };
  }

  /** nickname for a login token (used to verify WebSocket presence) */
  async function nicknameFor(token) {
    if (typeof token !== 'string' || token.length < 16) return null;
    const found = await store.byToken(sha(token));
    if (!found) return null;
    return withLock(found.key, async () => {
      const rec = (await load(found.key)) ?? found;
      if (migrate(rec)) await store.put(rec);
      return rec.nickname;
    });
  }
  async function isRegistered(nickname) {
    return !!(await store.get(nickKey(cleanNick(nickname))));
  }

  const routes = {
    '/api/auth': auth,
    '/api/session': session,
    '/api/squad': saveSquad,
    '/api/logout': logout,
    '/api/me': me,
    '/api/market/buy': buy,
    '/api/dev/auth': devAuth,
    '/api/dev/users': devUsers,
    '/api/dev/grant': devGrant,
    '/api/dev/log': devLog,
  };

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

  return {
    handleHttp,
    nicknameFor,
    isRegistered,
    nickKey,
    grantReward,
    allowedSquad,
    recordResult,
    touch,
    /** realtime hooks: who is online right now, and pushing a new balance to a player */
    setOnlineCheck: (fn) => (isOnline = fn),
    setWalletPush: (fn) => (onWallet = fn),
    kind: store.kind,
    count: () => store.count(),
    _store: store,
  };
}
