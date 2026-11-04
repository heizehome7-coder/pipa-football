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
 * UPDATE 7 — RANKING & PROGRESSION (all server-authoritative):
 *   POST /api/ranking   {token?, board: mp|penalty|freekick} ← {ok, rows (TOP 100), me}
 *   POST /api/profile   {nickname}                ← {ok, profile}
 *   POST /api/daily/claim {token}                  ← {ok, day, mp?, packs?, …}   once per Korea-time day
 *   POST /api/level/claim {token, level}           ← {ok, fv, …}                 every 5th level, once
 *   POST /api/market/state {token}                 ← {ok, listings:{playerId:{count,min}}, mine:[…]}
 *   POST /api/market/sell  {token, playerId, price} → LISTED (80–120 % of value; MP only when sold)
 *   POST /api/market/cancel {token, listingId}
 *   /api/market/buy now takes the cheapest USER listing first (oldest at equal price; never
 *   your own), and only then the system card. Buyer + seller + listing change in one
 *   transaction; the seller gets 70 % (30 % fee). Account data adds:
 *   { fv, level, xp, claimedLevelRewards, dailyStreak, lastDailyClaim, unopenedPacks,
 *     listed:[playerId], notices:[…] } — XP once per finished online game (win 120 / draw 80 / loss 60).
 *
 * UPDATE 6 (patch) — DEVELOPER MODE (all checks on the server):
 *   POST /api/dev/auth  {code}                     ← {ok, devToken}   (code = env DEVELOPER_CODE;
 *                                                     never in the browser bundle)
 *   POST /api/dev/users {devToken, q?}             ← {ok, users:[…]}  recent 100 (lastSeenAt desc)
 *   POST /api/dev/grant {devToken, nickname, amount} ← {ok, nickname, mp, granted}
 *   POST /api/dev/squad {devToken, nickname}       ← {ok, user:{nickname, squad, owned, …}} | {ok, matches:[…]}
 *   POST /api/packs/open {token}                    ← {ok, pull:{cardId, playerId, tier}, …me}   (UPDATE 8, server draw)
 *   POST /api/dev/grant-packs {devToken, nickname, count} ← {ok, granted, unopenedPacks}  (UPDATE 8)
 *   UPDATE 9 — EVENT CENTER (results decided here with crypto random, one write per action):
 *   POST /api/packs/open {token, kind?: player|good|legend}   (goodPacks / legendPacks counts)
 *   POST /api/events/state {token}                  ← {ok, hong, potato, …me}  (settles a finished 감자 game)
 *   POST /api/events/hong/draw {token, count:1|10, nonce} ← {ok, results:[grade], …me}  −50 / −500 FV
 *   POST /api/events/hong/exchange {token, grade, nonce}  ← {ok, reward:{mp|pack|pull}, …me}  one token
 *   POST /api/events/potato/start {token, nonce}    ← {ok, potato:{sessionId, startAt, rounds…}, serverNow}  −50 FV
 *   POST /api/events/potato/tap {token, sessionId, round, holeId} ← {ok, hit, score}
 *   POST /api/events/potato/finish {token, sessionId} ← {ok, potato:{status:'done', reward}}  paid once
 *                                                     (UPDATE 7 hotfix: read-only, server data only)
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
  const lfile = path.join(dir, 'listings.json');
  let db = {};
  let listings = {};
  try {
    db = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    db = {};
  }
  try {
    listings = JSON.parse(fs.readFileSync(lfile, 'utf8'));
  } catch {
    listings = {};
  }
  let timer = null;
  const flush = () => {
    timer = null;
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(db));
      fs.writeFileSync(lfile + '.tmp', JSON.stringify(listings));
      fs.renameSync(file + '.tmp', file);
      fs.renameSync(lfile + '.tmp', lfile);
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
    // UPDATE 7: market listings
    async listings() {
      return Object.values(listings);
    },
    /** all-or-nothing: puts + listing adds/removes (a required removal that finds nothing → false) */
    async tx(ops) {
      for (const o of ops) if (o.type === 'delListing' && o.required && !listings[o.id]) return false;
      for (const o of ops) {
        if (o.type === 'put') db[o.rec.key] = o.rec;
        else if (o.type === 'addListing') listings[o.listing.id] = o.listing;
        else if (o.type === 'delListing') delete listings[o.id];
      }
      timer ??= setTimeout(flush, 200);
      return true;
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
  await pool.query(`CREATE TABLE IF NOT EXISTS pipa_listings (
    id          TEXT PRIMARY KEY,
    player_id   TEXT NOT NULL,
    seller_key  TEXT NOT NULL,
    seller_name TEXT NOT NULL,
    price       BIGINT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
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
    async listings() {
      const { rows } = await pool.query('SELECT * FROM pipa_listings');
      return rows.map((r) => ({ id: r.id, playerId: r.player_id, seller: r.seller_key, sellerName: r.seller_name, price: Number(r.price), createdAt: new Date(r.created_at).toISOString() }));
    },
    /** one PostgreSQL transaction: buyer + seller + listing change together or not at all */
    async tx(ops) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        for (const o of ops) {
          if (o.type === 'put') await c.query('UPDATE pipa_accounts SET tokens = $2, data = $3 WHERE nick_key = $1', [o.rec.key, o.rec.tokens, o.rec.data]);
          else if (o.type === 'addListing')
            await c.query('INSERT INTO pipa_listings (id, player_id, seller_key, seller_name, price, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [
              o.listing.id, o.listing.playerId, o.listing.seller, o.listing.sellerName, o.listing.price, o.listing.createdAt,
            ]);
          else if (o.type === 'delListing') {
            const r = await c.query('DELETE FROM pipa_listings WHERE id = $1', [o.id]);
            if (o.required && r.rowCount !== 1) {
              await c.query('ROLLBACK');
              return false;
            }
          }
        }
        await c.query('COMMIT');
        return true;
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        c.release();
      }
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

  // ── UPDATE 8: card instances ─────────────────────────────────────────
  // `cards` = every market-player card the account holds, each with its own id (two Messi
  // cards are two cards). `owned` stays the list of their player ids (duplicates allowed),
  // so every UPDATE 6/7 check keeps working.
  const newCardId = () => crypto.randomBytes(8).toString('base64url');
  function cardsOf(data) {
    const owned = data?.owned ?? [];
    const cards = Array.isArray(data?.cards) ? data.cards : [];
    if (cards.length === owned.length && cards.every((c, i) => c?.playerId === owned[i])) return cards;
    // older data (or out of step): rebuild from `owned`, keeping the ids we already had
    const pool = [...cards];
    return owned.map((pid) => {
      const i = pool.findIndex((c) => c?.playerId === pid);
      return i >= 0 ? pool.splice(i, 1)[0] : { id: newCardId(), playerId: pid, source: 'legacy', at: null };
    });
  }
  const withCards = (data, cards) => ({ ...data, cards, owned: cards.map((c) => c.playerId) });
  const addCard = (data, playerId, source, id) => withCards(data, [...cardsOf(data), { id: id ?? newCardId(), playerId, source, at: new Date().toISOString() }]);
  /** removes one card of that player (a given card id, else the newest) → {data, card} | null */
  function takeCard(data, playerId, cardId) {
    const cards = [...cardsOf(data)];
    let i = cardId ? cards.findIndex((c) => c.id === cardId && c.playerId === playerId) : -1;
    if (i < 0) for (let j = cards.length - 1; j >= 0; j--) if (cards[j].playerId === playerId) (i = j), (j = -1);
    if (i < 0) return null;
    const [card] = cards.splice(i, 1);
    return { data: withCards(data, cards), card };
  }
  /** older data: give its cards ids once and save them, so a card id never changes */
  function syncCards(rec) {
    const cards = cardsOf(rec.data);
    if (cards === rec.data?.cards) return false;
    rec.data = withCards(rec.data ?? {}, cards);
    return true;
  }
  const countOf = (rec, id) => (rec.data?.owned ?? []).filter((x) => x === id).length;

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
  // ── UPDATE 7 progression helpers (balance numbers live in src/progress/progression.ts) ──
  const P = catalog?.PROGRESSION ?? null;
  const today = () => (catalog?.kstDay ? catalog.kstDay(Date.now()) : new Date().toISOString().slice(0, 10));
  const yesterday = () => (catalog?.kstDay ? catalog.kstDay(Date.now() - 86_400_000) : '');
  function dailyStatus(rec) {
    const d = rec.data ?? {};
    const t = today();
    const canClaim = d.lastDailyClaim !== t;
    const cont = d.lastDailyClaim === yesterday();
    const nextDay = canClaim ? (cont ? ((d.dailyStreak ?? 0) % 7) + 1 : 1) : d.dailyStreak ?? 1;
    return { canClaim, streak: d.dailyStreak ?? 0, nextDay, lastClaim: d.lastDailyClaim ?? null, today: t };
  }
  const progressOf = (rec) => {
    const d = rec.data ?? {};
    const level = d.level ?? 0;
    return {
      level,
      xp: d.xp ?? 0,
      xpNext: catalog?.xpToNext ? catalog.xpToNext(level) : 0,
      fv: d.fv ?? 0,
      claimedLevelRewards: d.claimedLevelRewards ?? [],
      unopenedPacks: d.unopenedPacks ?? 0,
      // UPDATE 9: GOOD PLAYER PACK / LEGEND PACK (kept apart from the PLAYER PACK count)
      goodPacks: d.goodPacks ?? 0,
      legendPacks: d.legendPacks ?? 0,
    };
  };
  // ── UPDATE 9: EVENT CENTER state shown to the client ──
  const hongOf = (d) => ({ bronze: d?.hong?.bronze ?? 0, silver: d?.hong?.silver ?? 0, gold: d?.hong?.gold ?? 0, red: d?.hong?.red ?? 0 });
  const potatoView = (sess) =>
    sess && {
      sessionId: sess.id,
      status: sess.status,
      startAt: sess.startAt,
      endAt: sess.endAt,
      round: sess.round,
      score: sess.score,
      rounds: sess.rounds,
      clicked: sess.clicked,
      reward: sess.reward ?? null,
    };
  const view = (rec) => ({
    nickname: rec.nickname,
    squad: rec.data?.squad ?? null,
    mp: rec.data?.mp ?? 0,
    owned: rec.data?.owned ?? [],
    // UPDATE 8: every card with its own id (duplicates allowed)
    cards: cardsOf(rec.data).map((c) => ({ id: c.id, playerId: c.playerId, source: c.source ?? null })),
    // UPDATE 7
    listed: rec.data?.listed ?? [],
    ...progressOf(rec),
    daily: dailyStatus(rec),
    notices: rec.data?.notices ?? [],
    // UPDATE 9
    hong: hongOf(rec.data),
  });

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
      const m = migrate(rec);
      if (syncCards(rec) || m) await store.put(rec);
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
  /** the client showed these notices (sale completed …) */
  const ackNotices = ({ token, ids }) =>
    withAccount(token, async (rec) => {
      const drop = new Set(Array.isArray(ids) ? ids : []);
      rec.data = { ...rec.data, notices: (rec.data.notices ?? []).filter((n) => !drop.has(n.id)) };
      await store.put(rec);
      return { status: 200, body: { ok: true } };
    });

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

  // ── TRANSFER MARKET (UPDATE 6 buy · UPDATE 7 user listings, sell, cancel) ─────────
  const inSquad = (rec, id) => squadIds(rec.data?.squad).includes(id);
  const MARKET_LOCK = '\u0000market';
  const notice = (n) => ({ id: crypto.randomBytes(6).toString('hex'), at: new Date().toISOString(), ...n });

  /** cheapest user listing for a player (oldest first at equal price), never the buyer's own */
  async function bestListing(playerId, exceptKey) {
    const ls = (await store.listings()).filter((l) => l.playerId === playerId && l.seller !== exceptKey);
    ls.sort((a, b) => a.price - b.price || String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
    return ls[0] ?? null;
  }

  /**
   * BUY: a user listing of that player is always sold before the system card. Buyer
   * (−price, +player), seller (−listed player, +70 %) and the listing change in ONE
   * transaction. `maxPrice` = what the buyer saw; a dearer listing → 409 price_changed.
   */
  function buy({ token, playerId, maxPrice }) {
    if (typeof token !== 'string' || token.length < 16) return NO_SESSION;
    return withLock(MARKET_LOCK, async () => {
      const found = await store.byToken(sha(token));
      if (!found) return NO_SESSION;
      return withLock(found.key, async () => {
        const rec = (await load(found.key)) ?? found;
        if (!rec.tokens.includes(sha(token))) return NO_SESSION;
        migrate(rec);
        syncCards(rec);
        const value = typeof playerId === 'string' && catalog ? catalog.marketPrice(playerId) : null;
        if (value == null) return { status: 400, body: { ok: false, error: 'not_for_sale', message: '판매하지 않는 선수예요' } };
        const owned = rec.data.owned ?? [];
        if (owned.includes(playerId) || (rec.data.listed ?? []).includes(playerId))
          return { status: 409, body: { ok: false, error: 'owned', message: '이미 보유한 선수예요', ...view(rec) } };
        const listing = await bestListing(playerId, rec.key);
        const price = listing ? listing.price : value;
        if (typeof maxPrice === 'number' && price > maxPrice)
          return { status: 409, body: { ok: false, error: 'price_changed', message: '가격이 바뀌었어요. 다시 확인해주세요', price, source: listing ? 'user' : 'system', ...view(rec) } };
        const mp = rec.data.mp ?? 0;
        if (mp < price) return { status: 402, body: { ok: false, error: 'mp', message: 'MP가 부족합니다.', ...view(rec) } };
        if (!listing) {
          rec.data = { ...addCard(rec.data, playerId, 'market'), mp: mp - price };
          await store.put(rec);
          log(`accounts: "${rec.nickname}" bought ${playerId} for ${price} MP (system, left ${rec.data.mp})`);
          rankingChanged();
          return { status: 200, body: { ok: true, playerId, price, source: 'system', ...view(rec) } };
        }
        // user listing: seller paid 70 %, all in one transaction
        return withLock(listing.seller, async () => {
          const seller = await load(listing.seller);
          if (!seller) return { status: 409, body: { ok: false, error: 'price_changed', message: '매물이 사라졌어요. 다시 시도해주세요', ...view(rec) } };
          const revenue = catalog.sellerRevenue(price);
          const buyerNext = { ...rec, data: { ...addCard(rec.data, playerId, 'market'), mp: mp - price } };
          const sellerListed = [...(seller.data?.listed ?? [])];
          const at = sellerListed.indexOf(playerId);
          if (at >= 0) sellerListed.splice(at, 1);
          const sellerCards = (seller.data?.listedCards ?? []).filter((c) => c.listingId !== listing.id);
          const sold = notice({ type: 'sold', playerId, price, revenue, fee: price - revenue, buyer: rec.nickname });
          const sellerNext = { ...seller, data: { ...seller.data, mp: (seller.data?.mp ?? 0) + revenue, listed: sellerListed, listedCards: sellerCards, notices: [...(seller.data?.notices ?? []), sold].slice(-30) } };
          const ok = await store.tx([{ type: 'delListing', id: listing.id, required: true }, { type: 'put', rec: buyerNext }, { type: 'put', rec: sellerNext }]);
          if (!ok) return { status: 409, body: { ok: false, error: 'price_changed', message: '방금 다른 사람이 샀어요. 다시 시도해주세요', ...view(rec) } };
          remember(buyerNext);
          remember(sellerNext);
          log(`market: "${rec.nickname}" bought ${playerId} from "${seller.nickname}" for ${price} (seller +${revenue})`);
          try {
            onSold(seller.nickname, sold, sellerNext.data.mp);
          } catch {
            /* seller offline: the notice waits in their account */
          }
          rankingChanged();
          return { status: 200, body: { ok: true, playerId, price, source: 'user', seller: seller.nickname, ...view(buyerNext) } };
        });
      });
    });
  }

  /** SELL: list an owned market player (not a starter, not in the squad) for 80–120 % of value */
  function sell({ token, playerId, price, cardId }) {
    if (typeof token !== 'string' || token.length < 16) return NO_SESSION;
    return withLock(MARKET_LOCK, () =>
      withAccount(token, async (rec) => {
        if (typeof playerId !== 'string' || !catalog?.getPlayer(playerId)) return { status: 400, body: { ok: false, error: 'player', message: '선수를 찾을 수 없어요' } };
        if (catalog.isStarter(playerId)) return { status: 403, body: { ok: false, error: 'untradeable', message: 'UNTRADEABLE — 무료 스타터 선수는 판매할 수 없어요' } };
        const owned = rec.data.owned ?? [];
        if (!owned.includes(playerId)) return { status: 403, body: { ok: false, error: 'not_owned', message: '보유하지 않은 선수예요', ...view(rec) } };
        // UPDATE 8: a spare copy of a squad player can be sold (the squad keeps one card)
        if (inSquad(rec, playerId) && countOf(rec, playerId) <= 1) return { status: 409, body: { ok: false, error: 'in_squad', message: '현재 스쿼드에서 사용 중인 선수입니다.' } };
        const value = catalog.marketPrice(playerId);
        const { min, max } = catalog.saleRange(value);
        if (typeof price !== 'number' || !Number.isSafeInteger(price) || price < min || price > max)
          return { status: 400, body: { ok: false, error: 'price', message: `판매 가격은 ${min.toLocaleString('en-US')} ~ ${max.toLocaleString('en-US')} MP 사이여야 해요`, min, max } };
        const listing = { id: crypto.randomBytes(9).toString('base64url'), playerId, seller: rec.key, sellerName: rec.nickname, price, createdAt: new Date().toISOString() };
        const taken = takeCard(rec.data, playerId, typeof cardId === 'string' ? cardId : null);
        if (!taken) return { status: 403, body: { ok: false, error: 'not_owned', message: '보유하지 않은 선수예요', ...view(rec) } };
        const next = {
          ...rec,
          data: {
            ...taken.data,
            listed: [...(rec.data.listed ?? []), playerId],
            listedCards: [...(rec.data.listedCards ?? []), { ...taken.card, listingId: listing.id }],
          },
        };
        await store.tx([{ type: 'addListing', listing }, { type: 'put', rec: next }]);
        remember(next);
        Object.assign(rec, next);
        log(`market: "${rec.nickname}" listed ${playerId} for ${price}`);
        return { status: 200, body: { ok: true, listing, ...view(next) } };
      }),
    );
  }

  /** CANCEL LISTING: the player goes back to MY PLAYERS (no fee) */
  function cancel({ token, listingId }) {
    if (typeof token !== 'string' || token.length < 16) return NO_SESSION;
    return withLock(MARKET_LOCK, () =>
      withAccount(token, async (rec) => {
        const l = (await store.listings()).find((x) => x.id === listingId);
        if (!l || l.seller !== rec.key) return { status: 404, body: { ok: false, error: 'listing', message: '판매 중인 매물이 없어요', ...view(rec) } };
        const listed = [...(rec.data.listed ?? [])];
        const at = listed.indexOf(l.playerId);
        if (at >= 0) listed.splice(at, 1);
        const lc = (rec.data.listedCards ?? []).find((c) => c.listingId === l.id);
        const back = addCard(rec.data, l.playerId, lc?.source ?? 'market', lc?.id);
        const next = { ...rec, data: { ...back, listed, listedCards: (rec.data.listedCards ?? []).filter((c) => c.listingId !== l.id) } };
        const ok = await store.tx([{ type: 'delListing', id: l.id, required: true }, { type: 'put', rec: next }]);
        if (!ok) return { status: 409, body: { ok: false, error: 'sold', message: '이미 판매된 매물이에요', ...view(rec) } };
        remember(next);
        Object.assign(rec, next);
        log(`market: "${rec.nickname}" cancelled ${l.playerId}`);
        return { status: 200, body: { ok: true, ...view(next) } };
      }),
    );
  }

  /** what the market shows: user listings per player (others' cheapest) + my own listings */
  async function marketState({ token }) {
    let me = null;
    if (typeof token === 'string' && token.length >= 16) me = await store.byToken(sha(token));
    const all = await store.listings();
    const per = {};
    for (const l of all) {
      if (me && l.seller === me.key) continue;
      const p = (per[l.playerId] ??= { count: 0, min: Infinity });
      p.count++;
      p.min = Math.min(p.min, l.price);
    }
    const mine = me ? all.filter((l) => l.seller === me.key).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) : [];
    return { status: 200, body: { ok: true, listings: per, mine } };
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
      rankingChanged();
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
      if (result === 'win') st.lastWinAt = new Date().toISOString();
      // UPDATE 7: XP for a properly finished online match (once per game, same key)
      const before = { level: rec.data?.level ?? 0, xp: rec.data?.xp ?? 0 };
      const gained = P ? P.xp[result] : 0;
      const after = catalog?.addXp ? catalog.addXp(before.level, before.xp, gained) : before;
      rec.data = { ...rec.data, stats: { ...stats, [m]: st }, results: [...done, key].slice(-300), level: after.level, xp: after.xp };
      await store.put(rec);
      const claimed = rec.data.claimedLevelRewards ?? [];
      const newRewards = catalog?.availableRewards ? catalog.availableRewards(after.level, claimed).filter((l) => l > before.level) : [];
      const res = { counted: true, key, mode: m, result, gained, before, after: { ...after, xpNext: catalog?.xpToNext?.(after.level) ?? 0 }, newRewards: newRewards.map((l) => ({ level: l, fv: P.fvRewards[l] })) };
      try {
        onProgress(rec.nickname, res);
      } catch {
        /* offline */
      }
      rankingChanged();
      return res;
    });
  }

  // ── UPDATE 7: LEVEL REWARDS (CLAIM) · DAILY LOGIN ───────────────────────
  function claimLevel({ token, level }) {
    return withAccount(token, async (rec) => {
      const l = Number(level);
      const amount = P?.fvRewards?.[l];
      if (!Number.isInteger(l) || !amount) return { status: 400, body: { ok: false, error: 'level', message: '보상이 없는 레벨이에요' } };
      const lv = rec.data?.level ?? 0;
      if (l > lv) return { status: 403, body: { ok: false, error: 'locked', message: '아직 도달하지 않은 레벨이에요', ...view(rec) } };
      const claimed = rec.data?.claimedLevelRewards ?? [];
      if (claimed.includes(l)) return { status: 409, body: { ok: false, error: 'claimed', message: '이미 받은 보상이에요', ...view(rec) } };
      rec.data = { ...rec.data, fv: (rec.data?.fv ?? 0) + amount, claimedLevelRewards: [...claimed, l].sort((a, b) => a - b) };
      await store.put(rec);
      log(`accounts: "${rec.nickname}" claimed LV ${l} reward +${amount} FV`);
      return { status: 200, body: { ok: true, claimedLevel: l, fvGained: amount, ...view(rec) } };
    });
  }

  function claimDaily({ token }) {
    return withAccount(token, async (rec) => {
      const st = dailyStatus(rec);
      if (!st.canClaim) return { status: 409, body: { ok: false, error: 'claimed', message: '오늘의 보상은 이미 받았어요', ...view(rec) } };
      const day = st.nextDay;
      const r = P.daily.find((d) => d.day === day) ?? P.daily[0];
      rec.data = {
        ...rec.data,
        lastDailyClaim: st.today,
        dailyStreak: day,
        mp: (rec.data?.mp ?? 0) + (r.mp ?? 0),
        unopenedPacks: (rec.data?.unopenedPacks ?? 0) + (r.packs ?? 0),
      };
      await store.put(rec);
      log(`accounts: "${rec.nickname}" daily DAY ${day} (${r.mp ? r.mp + ' MP' : r.packs + ' pack'})`);
      if (r.mp) rankingChanged();
      return { status: 200, body: { ok: true, day, rewardMp: r.mp ?? 0, rewardPacks: r.packs ?? 0, ...view(rec) } };
    });
  }

  // ── UPDATE 8: PLAYER PACKS (the result is decided HERE, never on a phone) ────────
  /**
   * OPEN one pack: check there is one → take it → weighted draw (crypto random) over the
   * tradeable market players → add the card → save, all in one write under the account
   * lock. A reload can't re-roll: the card is already saved before the reply goes out.
   */
  // UPDATE 9: three kinds of pack — each has its own saved count
  const PACK_FIELD = { player: 'unopenedPacks', good: 'goodPacks', legend: 'legendPacks' };
  function openPack({ token, kind = 'player' }) {
    return withAccount(token, async (rec) => {
      if (!catalog?.drawPackPlayer) return { status: 503, body: { ok: false, error: 'packs', message: '팩을 열 수 없어요' } };
      const field = PACK_FIELD[kind];
      if (!field || (kind !== 'player' && !catalog.drawAnyPack)) return { status: 400, body: { ok: false, error: 'kind', message: '알 수 없는 팩이에요' } };
      const left = rec.data?.[field] ?? 0;
      if (!(left > 0)) return { status: 409, body: { ok: false, error: 'no_pack', message: '열 수 있는 팩이 없어요', ...view(rec) } };
      const r = crypto.randomInt(0, 2 ** 47) / 2 ** 47;
      let { player, tier } = kind === 'player' ? catalog.drawPackPlayer(r) : catalog.drawAnyPack(kind, r);
      // automated browser tests only (env on the TEST server, never set on Render): a fixed queue
      const forced = TEST_PACKS.shift();
      if (forced && catalog.getPlayer(forced) && catalog.marketPrice(forced)) {
        player = catalog.getPlayer(forced);
        tier = catalog.packTier(catalog.marketPrice(forced));
      }
      const cardId = newCardId();
      const pull = { id: crypto.randomBytes(6).toString('hex'), cardId, playerId: player.id, tier, kind, at: new Date().toISOString() };
      rec.data = {
        ...addCard(rec.data, player.id, kind === 'player' ? 'pack' : `${kind}-pack`, cardId),
        [field]: left - 1,
        packsOpened: (rec.data?.packsOpened ?? 0) + 1,
        packLog: [...(rec.data?.packLog ?? []), pull].slice(-30),
      };
      await store.put(rec);
      log(`packs: "${rec.nickname}" opened a ${kind} pack → ${player.id} (${tier}), ${left - 1} left`);
      return { status: 200, body: { ok: true, pull, ...view(rec) } };
    });
  }

  // ── UPDATE 9: EVENT CENTER ───────────────────────────────────────────
  // Every result below is decided HERE with crypto random numbers, under the account lock,
  // and saved in ONE write together with the FV / MP / token / card change — a refresh, a
  // second tab or a repeated request can never re-roll or pay twice.
  const rnd = () => crypto.randomInt(0, 2 ** 47) / 2 ** 47;
  const H = () => catalog?.HONG;
  const PT = () => catalog?.POTATO;
  /** a repeated request (same nonce, e.g. a network retry) gets the SAME answer, never a second payout */
  const NONCE_RE = /^[A-Za-z0-9_-]{8,64}$/;
  function seenNonce(rec, nonce) {
    if (typeof nonce !== 'string' || !NONCE_RE.test(nonce)) return null;
    return (rec.data?.eventNonces ?? []).find((n) => n.nonce === nonce) ?? null;
  }
  const rememberNonce = (data, nonce, body) =>
    typeof nonce === 'string' && NONCE_RE.test(nonce) ? [...(data?.eventNonces ?? []), { nonce, body }].slice(-20) : data?.eventNonces ?? [];

  /** 홍 나와라 뚝딱 — draw ×1 (50 FV) or ×10 (500 FV, ten independent draws) */
  function hongDraw({ token, count, nonce }) {
    return withAccount(token, async (rec) => {
      if (!H()) return { status: 503, body: { ok: false, error: 'events', message: '이벤트를 사용할 수 없어요' } };
      const again = seenNonce(rec, nonce);
      if (again) return { status: 200, body: { ...again.body, repeated: true, ...view(rec) } };
      const n = count === 10 ? 10 : count === 1 ? 1 : 0;
      if (!n) return { status: 400, body: { ok: false, error: 'count', message: '1회 또는 10회만 뽑을 수 있어요' } };
      const cost = n === 10 ? H().costTen : H().costOne;
      const fv = rec.data?.fv ?? 0;
      if (fv < cost) return { status: 402, body: { ok: false, error: 'fv', message: `FV가 부족해요 (필요 ${cost} FV)`, ...view(rec) } };
      const results = Array.from({ length: n }, () => catalog.drawHongGrade(rnd()));
      const hong = hongOf(rec.data);
      for (const g of results) hong[g]++;
      const id = crypto.randomBytes(6).toString('hex');
      const entry = { id, count: n, cost, results, at: new Date().toISOString() };
      const body = { ok: true, drawId: id, results, cost };
      rec.data = { ...rec.data, fv: fv - cost, hong, hongLog: [...(rec.data?.hongLog ?? []), entry].slice(-50), eventNonces: rememberNonce(rec.data, nonce, body) };
      await store.put(rec);
      log(`events: "${rec.nickname}" 홍 나와라 뚝딱 ×${n} (−${cost} FV) → ${results.join(',')}`);
      return { status: 200, body: { ...body, ...view(rec) } };
    });
  }

  /** EXCHANGE SHOP — exactly ONE token of that grade → its reward */
  function hongExchange({ token, grade, nonce }) {
    return withAccount(token, async (rec) => {
      if (!H()) return { status: 503, body: { ok: false, error: 'events', message: '이벤트를 사용할 수 없어요' } };
      const again = seenNonce(rec, nonce);
      if (again) return { status: 200, body: { ...again.body, repeated: true, ...view(rec) } };
      const ex = H().exchange?.[grade];
      if (!ex) return { status: 400, body: { ok: false, error: 'grade', message: '알 수 없는 등급이에요' } };
      const hong = hongOf(rec.data);
      if (!(hong[grade] > 0)) return { status: 409, body: { ok: false, error: 'no_token', message: `${H().label[grade]} 토큰이 없어요`, ...view(rec) } };
      hong[grade] -= 1;
      const id = crypto.randomBytes(6).toString('hex');
      let data = { ...rec.data, hong };
      const reward = { grade };
      if (ex.mp) {
        data.mp = (data.mp ?? 0) + ex.mp;
        reward.mp = ex.mp;
      }
      if (ex.pack === 'legend') {
        data.legendPacks = (data.legendPacks ?? 0) + 1;
        reward.pack = 'legend';
      }
      if (ex.topLegend) {
        const { player, tier } = catalog.drawTopLegend(rnd());
        const cardId = newCardId();
        data = addCard(data, player.id, 'hong', cardId);
        reward.pull = { id, cardId, playerId: player.id, tier, kind: 'top', at: new Date().toISOString() };
        data.packLog = [...(data.packLog ?? []), reward.pull].slice(-30);
      }
      const body = { ok: true, exchangeId: id, reward };
      data.hongExchanges = [...(data.hongExchanges ?? []), { id, grade, reward: { mp: reward.mp ?? 0, pack: reward.pack ?? null, playerId: reward.pull?.playerId ?? null }, at: new Date().toISOString() }].slice(-50);
      data.eventNonces = rememberNonce(data, nonce, body);
      rec.data = data;
      await store.put(rec);
      log(`events: "${rec.nickname}" exchanged 1 ${grade} → ${reward.mp ? reward.mp + ' MP' : reward.pack ? 'LEGEND PACK' : reward.pull?.playerId}`);
      if (reward.mp) {
        rankingChanged();
        try {
          onWallet(rec.nickname, rec.data.mp);
        } catch {
          /* offline */
        }
      }
      return { status: 200, body: { ...body, ...view(rec) } };
    });
  }

  // ── 감자의 제왕: the server owns the session, the potatoes and the score ──
  function finishPotatoIfDue(rec, at = Date.now()) {
    const sess = rec.data?.potato ?? null;
    if (!sess || sess.status !== 'playing' || at < sess.endAt + PT().graceMs) return { sess, paid: false };
    // round over: pay exactly once (status 'done' is saved in the same write as the reward)
    const reward = catalog.potatoReward(sess.score);
    const done = { ...sess, status: 'done', finishedAt: new Date(at).toISOString(), reward };
    let data = { ...rec.data, potato: done };
    if (reward.mp) data.mp = (data.mp ?? 0) + reward.mp;
    if (reward.pack === 'good') data.goodPacks = (data.goodPacks ?? 0) + 1;
    data.potatoLog = [...(data.potatoLog ?? []), { id: sess.id, score: sess.score, reward, startedAt: new Date(sess.startAt).toISOString(), finishedAt: done.finishedAt }].slice(-30);
    rec.data = data;
    return { sess: done, paid: true };
  }
  async function settlePotato(rec) {
    const r = finishPotatoIfDue(rec);
    if (r.paid) {
      await store.put(rec);
      log(`events: "${rec.nickname}" 감자의 제왕 score ${r.sess.score} → ${r.sess.reward.mp ? r.sess.reward.mp + ' MP' : 'GOOD PLAYER PACK'}`);
      if (r.sess.reward.mp) {
        rankingChanged();
        try {
          onWallet(rec.nickname, rec.data.mp);
        } catch {
          /* offline */
        }
      }
    }
    return r;
  }

  function potatoStart({ token, nonce }) {
    return withAccount(token, async (rec) => {
      if (!PT()) return { status: 503, body: { ok: false, error: 'events', message: '이벤트를 사용할 수 없어요' } };
      const again = seenNonce(rec, nonce);
      if (again) return { status: 200, body: { ...again.body, repeated: true, ...view(rec), potato: potatoView(rec.data?.potato), serverNow: Date.now() } };
      await settlePotato(rec);
      const cur = rec.data?.potato;
      if (cur && cur.status === 'playing') return { status: 409, body: { ok: false, error: 'playing', message: '이미 진행 중인 게임이 있어요', ...view(rec), potato: potatoView(cur), serverNow: Date.now() } };
      const fv = rec.data?.fv ?? 0;
      if (fv < PT().cost) return { status: 402, body: { ok: false, error: 'fv', message: `FV가 부족해요 (필요 ${PT().cost} FV)`, ...view(rec) } };
      const now = Date.now();
      const startAt = now + PT().leadMs;
      const rounds = Array.from({ length: PT().rounds }, (_, i) => catalog.potatoRound(i + 1, rnd));
      const sess = {
        id: crypto.randomBytes(9).toString('base64url'),
        userId: rec.key,
        status: 'playing',
        round: 0,
        score: 0,
        startAt,
        endAt: startAt + PT().rounds * PT().roundMs,
        rounds,
        clicked: [],
        createdAt: new Date(now).toISOString(),
      };
      const body = { ok: true, sessionId: sess.id };
      rec.data = { ...rec.data, fv: fv - PT().cost, potato: sess, eventNonces: rememberNonce(rec.data, nonce, body) };
      await store.put(rec);
      log(`events: "${rec.nickname}" 감자의 제왕 start (−${PT().cost} FV) ${sess.id}`);
      return { status: 200, body: { ...body, ...view(rec), potato: potatoView(sess), serverNow: Date.now() } };
    });
  }

  /** one tap: {sessionId, round, holeId} — the server checks the round's time window and the hole */
  function potatoTap({ token, sessionId, round, holeId }) {
    const at = Date.now();
    return withAccount(token, async (rec) => {
      if (!PT()) return { status: 503, body: { ok: false, error: 'events' } };
      const sess = rec.data?.potato;
      if (!sess || sess.id !== sessionId) return { status: 404, body: { ok: false, error: 'session', message: '게임을 찾을 수 없어요' } };
      const reply = (hit, extra = {}) => ({ status: 200, body: { ok: true, hit, score: sess.score, round, ...extra, serverNow: Date.now() } });
      if (sess.status !== 'playing') return reply(null, { ended: true });
      const r = Number(round);
      const h = Number(holeId);
      if (!Number.isInteger(r) || r < 1 || r > PT().rounds || !Number.isInteger(h) || h < 0 || h >= PT().holes) return { status: 400, body: { ok: false, error: 'tap' } };
      // the round's window on the server clock, with room for mobile latency
      const from = sess.startAt + (r - 1) * PT().roundMs - PT().earlyMs;
      const to = sess.startAt + r * PT().roundMs + PT().graceMs;
      if (at < from || at > to) return reply(null, { late: at > to });
      const spawn = sess.rounds[r - 1].find((x) => x.hole === h);
      if (!spawn) return reply(null);
      const key = `${r}:${h}`;
      if (sess.clicked.includes(key)) return reply(null, { again: true });
      const score = catalog.potatoScore(sess.score, spawn.kind);
      rec.data = { ...rec.data, potato: { ...sess, score, round: Math.max(sess.round, r), clicked: [...sess.clicked, key] } };
      await store.put(rec);
      return { status: 200, body: { ok: true, hit: spawn.kind, score, round: r, serverNow: Date.now() } };
    });
  }

  /** the game is over on the server clock → settle (idempotent: the reward is paid once) */
  function potatoFinish({ token, sessionId }) {
    return withAccount(token, async (rec) => {
      if (!PT()) return { status: 503, body: { ok: false, error: 'events' } };
      const sess = rec.data?.potato;
      if (!sess || (sessionId && sess.id !== sessionId)) return { status: 404, body: { ok: false, error: 'session', message: '게임을 찾을 수 없어요', ...view(rec) } };
      const r = await settlePotato(rec);
      if (r.sess.status === 'playing') return { status: 425, body: { ok: false, error: 'not_over', message: '아직 게임 중이에요', potato: potatoView(r.sess), serverNow: Date.now(), ...view(rec) } };
      return { status: 200, body: { ok: true, potato: potatoView(r.sess), paidNow: r.paid, ...view(rec), serverNow: Date.now() } };
    });
  }

  /** EVENT CENTER: tokens, packs and the current 감자 game (settles a finished game first) */
  function eventsState({ token }) {
    return withAccount(token, async (rec) => {
      if (PT()) await settlePotato(rec);
      return { status: 200, body: { ok: true, ...view(rec), potato: potatoView(rec.data?.potato ?? null), serverNow: Date.now(), hongLog: (rec.data?.hongLog ?? []).slice(-10), potatoLog: (rec.data?.potatoLog ?? []).slice(-10) } };
    });
  }

  // ── UPDATE 7: RANKING · PROFILE ─────────────────────────────────────
  let rankCache = { at: 0, rows: null };
  const allRows = async () => {
    if (rankCache.rows && Date.now() - rankCache.at < 3000) return rankCache.rows;
    const rows = (await store.list()).map((rec) => ({ key: rec.key, nickname: rec.nickname, mp: rec.data?.mp ?? 0, level: rec.data?.level ?? 0, stats: statsOf(rec) }));
    rankCache = { at: Date.now(), rows };
    return rows;
  };
  const rate = (s) => {
    const n = s.wins + s.losses + s.draws;
    return n ? s.wins / n : 0;
  };
  const SORTS = {
    mp: (a, b) => b.mp - a.mp || a.nickname.localeCompare(b.nickname),
    penalty: (a, b) => byWins(a.stats.penalty, b.stats.penalty) || a.nickname.localeCompare(b.nickname),
    freekick: (a, b) => byWins(a.stats.freekick, b.stats.freekick) || a.nickname.localeCompare(b.nickname),
  };
  // same wins → better win rate → more games → most recent win
  function byWins(a, b) {
    return b.wins - a.wins || rate(b) - rate(a) || b.wins + b.losses + b.draws - (a.wins + a.losses + a.draws) || String(b.lastWinAt ?? '').localeCompare(String(a.lastWinAt ?? ''));
  }
  const rankRow = (r, i, board) => {
    const s = board === 'mp' ? null : r.stats[board];
    return { rank: i + 1, nickname: r.nickname, level: r.level, mp: r.mp, ...(s ? { wins: s.wins, losses: s.losses, draws: s.draws, games: s.wins + s.losses + s.draws, winRate: Math.round(rate(s) * 1000) / 10 } : {}) };
  };
  async function ranking({ token, board }) {
    const b = SORTS[board] ? board : 'mp';
    const rows = [...(await allRows())].sort(SORTS[b]);
    let me = null;
    if (typeof token === 'string' && token.length >= 16) {
      const found = await store.byToken(sha(token));
      if (found) {
        const i = rows.findIndex((r) => r.key === found.key);
        if (i >= 0) me = rankRow(rows[i], i, b);
      }
    }
    return { status: 200, body: { ok: true, board: b, rows: rows.slice(0, 100).map((r, i) => rankRow(r, i, b)), total: rows.length, me } };
  }
  async function profile({ nickname }) {
    if (typeof nickname !== 'string') return { status: 400, body: { ok: false } };
    const rec = await store.get(nickKey(cleanNick(nickname)));
    if (!rec) return { status: 404, body: { ok: false, error: 'user', message: '그런 유저가 없어요' } };
    const pr = progressOf(rec);
    return {
      status: 200,
      body: { ok: true, profile: { nickname: rec.nickname, level: pr.level, xp: pr.xp, xpNext: pr.xpNext, mp: rec.data?.mp ?? 0, fv: pr.fv, stats: statsOf(rec), online: !!isOnline(rec.nickname) } },
    };
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
  let onProgress = () => {};
  const TEST_PACKS = (process.env.PIPA_TEST_PACKS ?? '').split(',').filter(Boolean);
  let onPacks = () => {};
  let onSold = () => {};
  let onRanking = () => {};
  let rankTimer = null;
  /** throttled "ranking changed" broadcast (at most every 3 s) */
  const rankingChanged = () => {
    rankCache = { at: 0, rows: null };
    if (rankTimer) return;
    rankTimer = setTimeout(() => {
      rankTimer = null;
      try {
        onRanking();
      } catch {
        /* ignore */
      }
    }, 3000);
  };
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
    const total = {
      wins: s.penalty.wins + s.freekick.wins,
      losses: s.penalty.losses + s.freekick.losses,
      draws: s.penalty.draws + s.freekick.draws,
      lastWinAt: [s.penalty.lastWinAt, s.freekick.lastWinAt].filter(Boolean).sort().pop() ?? null,
    };
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
    // UPDATE 7
    level: rec.data?.level ?? 0,
    xp: rec.data?.xp ?? 0,
    fv: rec.data?.fv ?? 0,
    dailyStreak: rec.data?.dailyStreak ?? 0,
    unopenedPacks: rec.data?.unopenedPacks ?? 0,
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
    rankingChanged();
    try {
      onWallet(r.nickname, r.mp);
    } catch {
      /* the user may be offline */
    }
    return { status: 200, body: { ok: true, nickname: r.nickname, granted: amount, before: r.before, mp: r.mp } };
  }

  /**
   * UPDATE 7 hotfix — USER SQUADS (read-only). The squad exactly as the SERVER has it
   * (never anything from a phone): penalty order 1–5, goalkeeper, free-kick taker, the
   * owned players. A partial nickname returns the matching accounts to pick from.
   */
  async function devSquad({ devToken, nickname }) {
    if (!devOk(devToken)) return NO_DEV;
    if (typeof nickname !== 'string' || !nickname.trim()) return { status: 400, body: { ok: false, error: 'user', message: '닉네임을 입력해주세요' } };
    const q = nickKey(cleanNick(nickname) || nickname.trim()).slice(0, 40);
    const exact = q ? await load(q) : null;
    if (!exact) {
      const matches = (await store.list())
        .filter((r) => nickKey(r.nickname).includes(q))
        .sort((a, b) => a.nickname.localeCompare(b.nickname))
        .slice(0, 20)
        .map((r) => ({ nickname: r.nickname, online: !!isOnline(r.nickname), level: r.data?.level ?? 0 }));
      if (!matches.length) return { status: 404, body: { ok: false, error: 'user', message: '그런 유저가 없어요' } };
      return { status: 200, body: { ok: true, matches } };
    }
    const d = exact.data ?? {};
    const squad = d.squad ?? null;
    const owned = [...new Set([...(d.owned ?? []), ...squadIds(squad).filter((id) => catalog?.isStarter(id))])];
    return {
      status: 200,
      body: {
        ok: true,
        user: {
          nickname: exact.nickname,
          online: !!isOnline(exact.nickname),
          level: d.level ?? 0,
          mp: d.mp ?? 0,
          squad,
          // would the server let this squad play online right now? (owned / starter players only)
          squadUsable: squad ? allowedSquad(exact.nickname, squad) !== null : false,
          owned: d.owned ?? [],
          ownedAll: owned,
          listed: (d.listed ?? []).map((l) => (typeof l === 'string' ? l : l?.playerId)).filter(Boolean),
          updatedAt: d.lastSeenAt ?? null,
        },
      },
    };
  }

  /** UPDATE 8: give a user PLAYER PACKS (whole number 1 … PACK_CONFIG.maxDevGrant) */
  async function devGrantPacks({ devToken, nickname, count }, ip) {
    if (!devOk(devToken)) return NO_DEV;
    const max = catalog?.PACK_CONFIG?.maxDevGrant ?? 100;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count <= 0 || count > max)
      return { status: 400, body: { ok: false, error: 'count', message: `팩은 1 ~ ${max}개까지 지급할 수 있어요` } };
    if (typeof nickname !== 'string' || !nickname.trim()) return { status: 400, body: { ok: false, error: 'user', message: '유저를 선택해주세요' } };
    const k = nickKey(cleanNick(nickname));
    const r = await withLock(k, async () => {
      const rec = await load(k);
      if (!rec) return null;
      migrate(rec);
      const before = rec.data?.unopenedPacks ?? 0;
      rec.data = { ...rec.data, unopenedPacks: before + count };
      await store.put(rec);
      return { nickname: rec.nickname, before, after: rec.data.unopenedPacks };
    });
    if (!r) return { status: 404, body: { ok: false, error: 'user', message: '그런 유저가 없어요' } };
    const entry = { developer_action: 'GRANT_PACKS', action: 'GRANT_PACKS', target: r.nickname, amount: count, before: r.before, after: r.after, timestamp: new Date().toISOString(), ip };
    try {
      await store.logAction(entry);
    } catch (e) {
      log(`devlog failed: ${e.message}`);
    }
    log(`dev: GRANT_PACKS ${count} → "${r.nickname}" (${r.before} → ${r.after})`);
    try {
      onPacks(r.nickname, r.after);
    } catch {
      /* the user may be offline */
    }
    return { status: 200, body: { ok: true, nickname: r.nickname, granted: count, before: r.before, unopenedPacks: r.after } };
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
    '/api/market/sell': sell,
    '/api/market/cancel': cancel,
    '/api/market/state': marketState,
    '/api/notices/ack': ackNotices,
    '/api/daily/claim': claimDaily,
    '/api/level/claim': claimLevel,
    '/api/ranking': ranking,
    '/api/profile': profile,
    '/api/dev/auth': devAuth,
    '/api/dev/users': devUsers,
    '/api/dev/grant': devGrant,
    '/api/dev/log': devLog,
    '/api/dev/squad': devSquad,
    '/api/dev/grant-packs': devGrantPacks,
    '/api/packs/open': openPack,
    // UPDATE 9 — EVENT CENTER
    '/api/events/state': eventsState,
    '/api/events/hong/draw': hongDraw,
    '/api/events/hong/exchange': hongExchange,
    '/api/events/potato/start': potatoStart,
    '/api/events/potato/tap': potatoTap,
    '/api/events/potato/finish': potatoFinish,
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
    setProgressPush: (fn) => (onProgress = fn),
    setPacksPush: (fn) => (onPacks = fn),
    setSalePush: (fn) => (onSold = fn),
    setRankingPush: (fn) => (onRanking = fn),
    kind: store.kind,
    count: () => store.count(),
    _store: store,
  };
}
