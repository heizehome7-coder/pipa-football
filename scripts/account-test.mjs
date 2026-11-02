// Accounts: unique nicknames, password check, session, squad save, persistence, presence pinning.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
const await_ee = () => EventEmitter;

const PORT = 8899;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipa-acc-'));
let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`);
  if (!ok) fails++;
};
const start = () =>
  new Promise((res) => {
    const p = spawn('node', ['server/realtime-server.mjs'], { env: { ...process.env, PORT: String(PORT), PIPA_DATA_DIR: dir, DATABASE_URL: process.env.PIPA_TEST_DB ?? '' } });
    p.stdout.on('data', (d) => String(d).includes('PIPA realtime server') && res(p));
  });
const api = async (p, body) => {
  const r = await fetch(`http://localhost:${PORT}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const lobby = (token, nickname) =>
  new Promise((res) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws${token ? `?token=${token}` : ''}`);
    const st = { ws, peers: [], me: null };
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.t === 'welcome') {
        st.me = m.peer;
        ws.send(JSON.stringify({ t: 'presence', p: { app: 'pipa', v: 1, nickname, status: 'online' } }));
        res(st);
      }
      if (m.t === 'peers' && !m.room) st.peers = m.peers;
    });
  });

let srv = await start();
const a = await api('/api/auth', { nickname: 'Haze', password: 'secret1' });
check('new nickname → account created + token', a.ok && a.created && a.token && a.nickname === 'Haze', JSON.stringify(a));
const dup = await api('/api/auth', { nickname: 'haze', password: 'other12' });
check('same nickname (other case) + wrong password → taken (409)', dup.status === 409 && dup.error === 'taken', JSON.stringify(dup));
const dup2 = await api('/api/auth', { nickname: 'ｈａｚｅ', password: 'other12' });
check('full-width lookalike nickname → taken too', dup2.status === 409);
const again = await api('/api/auth', { nickname: 'HAZE', password: 'secret1' });
check('right password → login (not created), original spelling kept', again.ok && !again.created && again.nickname === 'Haze');
const short = await api('/api/auth', { nickname: 'Bob', password: '12' });
check('password shorter than 4 → rejected', short.status === 400);
const long = await api('/api/auth', { nickname: '1234567890123', password: '1234' });
check('nickname longer than 12 → rejected', long.status === 400);
const squad = { penaltyOrder: ['messi', 'ronaldo', 'kane', 'son', 'salah'], goalkeeperId: 'alisson', freeKickTakerId: 'messi' };
const sv = await api('/api/squad', { token: a.token, squad });
check('squad saved to the account', sv.ok);
const se = await api('/api/session', { token: a.token });
check('session token → auto-login with squad', se.ok && se.nickname === 'Haze' && se.squad?.penaltyOrder?.[1] === 'ronaldo', JSON.stringify(se));
const bad = await api('/api/session', { token: 'x'.repeat(30) });
check('bad token → 401', bad.status === 401);

// presence: logged-in socket shows the account name; an impostor without token is hidden
const real = await lobby(a.token, 'SomethingElse');
const fake = await lobby(null, 'HAZE');
const free = await lobby(null, 'Guest77');
await wait(400);
const names = real.peers.map((x) => x.p.nickname).filter(Boolean);
check('logged-in socket shows its account nickname', names.includes('Haze') && !names.includes('SomethingElse'), JSON.stringify(names));
check('socket without token cannot use a registered nickname', !names.includes('HAZE'), JSON.stringify(names));
check('unregistered nickname without token still shows (old clients)', names.includes('Guest77'), JSON.stringify(names));
for (const s of [real, fake, free]) s.ws.close();

// brute force guard
let last;
for (let i = 0; i < 9; i++) last = await api('/api/auth', { nickname: 'Haze', password: 'nope' + i });
check('many wrong passwords → temporarily blocked (429)', last.status === 429, String(last.status));

// persistence across a restart
srv.kill();
await wait(500);
srv = await start();
const after = await api('/api/session', { token: a.token });
check(`after server restart: account, token and squad still there (${process.env.PIPA_TEST_DB ? 'postgres' : 'file'})`, after.ok && after.squad?.goalkeeperId === 'alisson');
const h = await (await fetch(`http://localhost:${PORT}/health`)).json();
check('/health reports the storage kind', h.accounts === (process.env.PIPA_TEST_DB ? 'postgres' : 'file'), JSON.stringify(h));
// ── UPDATE 6 over HTTP: MP + market on the running server ─────────────────
const meH = await api('/api/me', { token: a.token });
check('UPDATE 6: /api/me → MP balance 0 and no market players for a new account', meH.ok && meH.mp === 0 && Array.isArray(meH.owned) && meH.owned.length === 0, JSON.stringify(meH));
const poor = await api('/api/market/buy', { token: a.token, playerId: 'gundogan' });
check('UPDATE 6: buying without enough MP → "MP가 부족합니다."', poor.status === 402 && poor.message === 'MP가 부족합니다.', JSON.stringify(poor));
const starter = await api('/api/market/buy', { token: a.token, playerId: 'messi' });
check('UPDATE 6: starters are not for sale', starter.status === 400 && starter.error === 'not_for_sale');
const hack = await api('/api/squad', { token: a.token, squad: { penaltyOrder: ['pele', 'messi', 'kane', 'son', 'salah'], goalkeeperId: 'yashin', freeKickTakerId: 'pele' } });
check('UPDATE 6: a squad with unowned market players is refused by the server', hack.status === 403 && hack.error === 'not_owned', JSON.stringify(hack));
srv.kill();

// ── UPDATE 6 direct: rewards, purchases, migration (same module the server runs) ──
{
  const { createAccounts } = await import('../server/accounts.mjs');
  const judge = await import('../server/judge.gen.mjs');
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pipa-acc6-'));
  // an account saved by UPDATE 5 (no v6 data) with De Bruyne + Donnarumma in its squad
  fs.writeFileSync(path.join(dir2, 'accounts.json'), JSON.stringify({
    old: { key: 'old', nickname: 'Old', salt: 's', hash: 'h', tokens: [], createdAt: '2026-10-31',
      data: { squad: { penaltyOrder: ['debruyne', 'messi', 'kane', 'son', 'salah'], goalkeeperId: 'donnarumma', freeKickTakerId: 'debruyne' } } },
  }));
  const acc = await createAccounts({ dataDir: dir2, catalog: judge, developerCode: 'unit-test-dev-code' });
  const call = (route, body) =>
    new Promise((res) => {
      const req = new (class extends (await_ee()) {})();
      req.method = 'POST';
      req.headers = {};
      req.socket = { remoteAddress: '1.2.3.4' };
      const out = { writeHead: (st) => ((out.status = st), out), end: (b) => res({ status: out.status, ...JSON.parse(b) }) };
      acc.handleHttp(req, out, route);
      req.emit('data', JSON.stringify(body));
      req.emit('end');
    });
  const r1 = await call('/api/auth', { nickname: 'Rich', password: 'pass1234' });
  const k = (n) => `cm${n}#1`;
  const m1 = await acc.grantReward('Rich', k(1), 10_000_000);
  const m1b = await acc.grantReward('rich', k(1), 10_000_000);
  check('UPDATE 6: a win pays +10,000,000 MP once — the same match key never pays twice', m1 === 10_000_000 && m1b === null, `${m1} ${m1b}`);
  for (let i = 2; i <= 20; i++) await acc.grantReward('Rich', k(i), 10_000_000);
  const bal = await call('/api/me', { token: r1.token });
  check('UPDATE 6: 20 wins = 200,000,000 MP', bal.mp === 200_000_000, String(bal.mp));
  const b1 = await call('/api/market/buy', { token: r1.token, playerId: 'gundogan' });
  check('UPDATE 6: buy Gündoğan (150,000,000 MP) → owned, 50,000,000 MP left', b1.ok && b1.mp === 50_000_000 && b1.owned.includes('gundogan'), JSON.stringify(b1));
  const b2 = await call('/api/market/buy', { token: r1.token, playerId: 'gundogan' });
  check('UPDATE 6: an owned player cannot be bought again', b2.status === 409 && b2.error === 'owned' && b2.mp === 50_000_000);
  for (let i = 21; i <= 35; i++) await acc.grantReward('Rich', k(i), 10_000_000); // → 200M
  const both = await Promise.all([call('/api/market/buy', { token: r1.token, playerId: 'felix' }), call('/api/market/buy', { token: r1.token, playerId: 'coman' })]);
  const after = await call('/api/me', { token: r1.token });
  check('UPDATE 6: two 180M purchases at the same moment with 200M → exactly one succeeds, never below 0',
    both.filter((x) => x.ok).length === 1 && both.filter((x) => x.status === 402).length === 1 && after.mp === 20_000_000, `${both.map((x) => x.status)} mp ${after.mp}`);
  const sq = await call('/api/squad', { token: r1.token, squad: { penaltyOrder: ['gundogan', 'messi', 'kane', 'son', 'salah'], goalkeeperId: 'neuer', freeKickTakerId: 'gundogan' } });
  check('UPDATE 6: a bought player can be put in the squad (server accepts it)', sq.ok, JSON.stringify(sq));
  const allowed = acc.allowedSquad('Rich', { penaltyOrder: ['gundogan', 'messi', 'kane', 'son', 'salah'], goalkeeperId: 'neuer', freeKickTakerId: 'gundogan' });
  const denied = acc.allowedSquad('Rich', { penaltyOrder: ['pele', 'messi', 'kane', 'son', 'salah'], goalkeeperId: 'neuer', freeKickTakerId: 'pele' });
  check('UPDATE 6: online squad check — owned players allowed, unowned refused', !!allowed && denied === null);
  // migration of a pre-UPDATE-6 account
  const st = acc._store;
  const old = await st.get('old');
  old.tokens = [crypto.createHash('sha256').update('t'.repeat(32)).digest('hex')];
  const om = await call('/api/me', { token: 't'.repeat(32) });
  check('UPDATE 6 migration: market players already in an old squad stay owned (De Bruyne, Donnarumma), MP 0',
    om.ok && om.owned.includes('debruyne') && om.owned.includes('donnarumma') && om.owned.length === 2 && om.mp === 0, JSON.stringify(om));
  const om2 = await call('/api/squad', { token: 't'.repeat(32), squad: { penaltyOrder: ['lewandowski', 'messi', 'kane', 'son', 'salah'], goalkeeperId: 'donnarumma', freeKickTakerId: 'messi' } });
  check('UPDATE 6 migration happens once — other market players must still be bought', om2.status === 403, JSON.stringify(om2));

  // ── UPDATE 6 patch: DEVELOPER MODE (server-side code, token, records, grants, log) ──
  const pushed = [];
  acc.setWalletPush((nick, mp) => pushed.push([nick, mp]));
  acc.setOnlineCheck((nick) => nick === 'Rich');
  const bad = await call('/api/dev/auth', { code: 'UNIT-TEST-DEV-CODE' });
  check('DEV: wrong code → 403 "인증이 되지 않았습니다."', bad.status === 403 && bad.message === '인증이 되지 않았습니다.' && !bad.devToken);
  const noTok = await call('/api/dev/users', { devToken: 'z'.repeat(40) });
  check('DEV: dashboard API without a developer session → 401', noTok.status === 401);
  const good = await call('/api/dev/auth', { code: 'unit-test-dev-code' });
  check('DEV: right code → a developer session token', good.ok && typeof good.devToken === 'string' && good.devToken.length > 30);
  const T = good.devToken;
  const ul = await call('/api/dev/users', { devToken: T });
  const rich = ul.users?.find((u) => u.nickname === 'Rich');
  check('DEV users: recent list with server times + ONLINE flag + MP', !!rich && rich.online === true && /^20\d\d-/.test(rich.lastLoginAt) && rich.mp === 20_000_000, JSON.stringify(rich));
  const q = await call('/api/dev/users', { devToken: T, q: 'ric' });
  check('DEV users: nickname search', q.users.length === 1 && q.users[0].nickname === 'Rich');
  for (const [amount, why] of [[-5, 'negative'], [0, 'zero'], [1.5, 'decimal'], ['100', 'text'], [null, 'NaN/Infinity (JSON null)'], [1e12, 'absurdly large']]) {
    const r = await call('/api/dev/grant', { devToken: T, nickname: 'Rich', amount });
    check(`DEV grant refuses ${why}`, r.status === 400 && r.error === 'amount', JSON.stringify(r));
  }
  const nobody = await call('/api/dev/grant', { devToken: T, nickname: 'NoSuchUser', amount: 5 });
  check('DEV grant to an unknown user → 404', nobody.status === 404);
  const g = await call('/api/dev/grant', { devToken: T, nickname: 'rich', amount: 500_000_000 });
  const after2 = await call('/api/me', { token: r1.token });
  check('DEV grant: +500,000,000 MP on the server, balance returned', g.ok && g.granted === 500_000_000 && g.before === 20_000_000 && g.mp === 520_000_000 && after2.mp === 520_000_000, JSON.stringify(g));
  check('DEV grant: pushed to the user’s open connections (wallet:update)', pushed.length === 1 && pushed[0][1] === 520_000_000);
  const dlog = JSON.parse(fs.readFileSync(path.join(dir2, 'devlog.json'), 'utf8'));
  check('DEV grant: developer action log (GRANT_MP · target · amount · timestamp)', dlog.length === 1 && dlog[0].developer_action === 'GRANT_MP' && dlog[0].target === 'Rich' && dlog[0].amount === 500_000_000 && !!dlog[0].timestamp);
  // online records, once per finished game
  const k1 = await acc.recordResult('Rich', 'cm-x#1', 'penalty', 'win');
  const k1b = await acc.recordResult('Rich', 'cm-x#1', 'penalty', 'win');
  await acc.recordResult('Rich', 'cm-x#2', 'penalty', 'loss');
  await acc.recordResult('Rich', 'cm-y#1', 'freekick', 'draw');
  const st6 = (await call('/api/dev/users', { devToken: T, q: 'rich' })).users[0].stats;
  check('records: win/loss/draw per mode, the same game never counted twice', k1 && !k1b && st6.penalty.wins === 1 && st6.penalty.losses === 1 && st6.freekick.draws === 1 && st6.total.wins === 1 && st6.total.losses === 1 && st6.total.draws === 1, JSON.stringify(st6));
  for (let i = 0; i < 6; i++) await call('/api/dev/auth', { code: 'guess' + i });
  const locked = await call('/api/dev/auth', { code: 'unit-test-dev-code' });
  check('DEV: too many wrong codes → temporarily locked (429)', locked.status === 429);

  // ── UPDATE 7: XP / LEVEL / FV ───────────────────────────────────────
  const prog = [];
  acc.setProgressPush((nick, r) => prog.push([nick, r]));
  const r2 = await call('/api/auth', { nickname: 'Lev', password: 'pass1234' });
  const w1 = await acc.recordResult('Lev', 'lv#1', 'penalty', 'win');
  check('XP: a finished online win gives +120 XP → LEVEL 1 (100 needed), 20 XP into level 1', w1.gained === 120 && w1.after.level === 1 && w1.after.xp === 20 && w1.after.xpNext === 120, JSON.stringify(w1.after));
  const dup = await acc.recordResult('Lev', 'lv#1', 'penalty', 'win');
  check('XP: the same match key never gives XP twice', dup === false);
  const l1 = await acc.recordResult('Lev', 'lv#2', 'freekick', 'loss');
  const d1 = await acc.recordResult('Lev', 'lv#3', 'penalty', 'draw');
  check('XP: loss +60, draw +80 (free kick and penalty alike)', l1.gained === 60 && d1.gained === 80 && d1.after.level === 2 && d1.after.xp === 40, JSON.stringify(d1.after));
  check('XP: LEVEL UP pushed to the player (progress:update)', prog.length === 3 && prog[0][0] === 'Lev' && prog[2][1].before.level === 1 && prog[2][1].after.level === 2);
  for (let i = 4; i < 40; i++) await acc.recordResult('Lev', `lv#${i}`, 'penalty', 'win');
  const meL = await call('/api/me', { token: r2.token });
  check('LEVEL: 38 games → level 10+ (fast early levels)', meL.level >= 10 && meL.level < 20, `LV ${meL.level} ${meL.xp}/${meL.xpNext}`);
  const c5 = await call('/api/level/claim', { token: r2.token, level: 5 });
  const c5b = await call('/api/level/claim', { token: r2.token, level: 5 });
  check('LEVEL REWARD: CLAIM LV 5 → +100 FV once (second CLAIM refused)', c5.ok && c5.fv === 100 && c5.claimedLevelRewards.includes(5) && c5b.status === 409, JSON.stringify([c5.fv, c5b.status]));
  const c10 = await call('/api/level/claim', { token: r2.token, level: 10 });
  check('LEVEL REWARD: LV 10 → +200 FV (FV 300, MP untouched)', c10.ok && c10.fv === 300 && c10.mp === meL.mp);
  const c50 = await call('/api/level/claim', { token: r2.token, level: 50 });
  const c7 = await call('/api/level/claim', { token: r2.token, level: 7 });
  check('LEVEL REWARD: a LOCKED level or a non-reward level is refused', c50.status === 403 && c7.status === 400);
  const { addXp, xpToNext } = judge;
  check('XP curve: 0→1 100 · 5→6 200 · 9→10 280 · 10 300 · 20 650 · 30 1200 · 40 2200', [0, 5, 9, 10, 20, 30, 40].map(xpToNext).join() === '100,200,280,300,650,1200,2200');
  check('MAX LEVEL 50: no level past 50, no XP kept', JSON.stringify(addXp(49, 0, 10_000_000)) === JSON.stringify({ level: 50, xp: 0 }) && xpToNext(50) === 0);

  // ── UPDATE 7: DAILY LOGIN ─────────────────────────────────────────
  const dd1 = await call('/api/daily/claim', { token: r2.token });
  const dd1b = await call('/api/daily/claim', { token: r2.token });
  check('DAILY: DAY 1 → +2,000,000 MP, once per (server) day', dd1.ok && dd1.day === 1 && dd1.rewardMp === 2_000_000 && dd1.mp === meL.mp + 2_000_000 && dd1b.status === 409, JSON.stringify([dd1.day, dd1.mp, dd1b.status]));
  // simulate later days by moving lastDailyClaim back one day each time (server-side data)
  const shiftDay = async (days) => {
    const r = await acc._store.get('lev');
    r.data.lastDailyClaim = judge.kstDay(Date.now() - days * 86_400_000);
    await acc._store.put(r);
  };
  const got = [];
  for (let d = 2; d <= 8; d++) {
    await shiftDay(1);
    const x = await call('/api/daily/claim', { token: r2.token });
    got.push(`${x.day}:${x.rewardMp || x.rewardPacks + 'P'}`);
  }
  const packs = (await call('/api/me', { token: r2.token })).unopenedPacks;
  check('DAILY: DAY 2–7 = 3M/5M/7M/10M MP, PLAYER PACK, PLAYER PACK; then back to DAY 1', got.join(' ') === '2:3000000 3:5000000 4:7000000 5:10000000 6:1P 7:1P 1:2000000' && packs === 2, got.join(' ') + ' packs ' + packs);
  await shiftDay(3);
  const gap = await call('/api/daily/claim', { token: r2.token });
  check('DAILY: a skipped day restarts at DAY 1', gap.day === 1);

  // ── UPDATE 7: RANKING / PROFILE ──────────────────────────────────
  const rk = await call('/api/ranking', { token: r2.token, board: 'mp' });
  check('RANKING MP: sorted by server MP, with MY RANK', rk.ok && rk.rows[0].nickname === 'Rich' && rk.rows.every((r, i) => i === 0 || rk.rows[i - 1].mp >= r.mp) && rk.me?.nickname === 'Lev', JSON.stringify(rk.rows.map((r) => [r.nickname, r.mp])));
  const rp = await call('/api/ranking', { token: r2.token, board: 'penalty' });
  check('RANKING PENALTY WINS: only online penalty wins count', rp.rows[0].nickname === 'Lev' && rp.rows[0].wins === 37, JSON.stringify(rp.rows[0]));
  const rf = await call('/api/ranking', { board: 'freekick' });
  check('RANKING FREE KICK WINS: separate from penalty', rf.rows.every((r) => r.wins === 0) && rf.me === null);
  const pf = await call('/api/profile', { nickname: 'lev' });
  check('PROFILE: level, MP, FV, penalty/free-kick record', pf.ok && pf.profile.level === meL.level && pf.profile.fv === 300 && pf.profile.stats.penalty.wins === 37 && pf.profile.stats.freekick.losses === 1);

  // ── UPDATE 7: SELL · user listings first · 30 % fee · atomic ──────────
  const sold = [];
  acc.setSalePush((nick, n, mp) => sold.push([nick, n, mp]));
  // Rich owns gundogan (in his squad) and coman (not in squad) from the UPDATE 6 checks
  const inSq = await call('/api/market/sell', { token: r1.token, playerId: 'gundogan', price: 150_000_000 });
  check('SELL: a player used in the squad → "현재 스쿼드에서 사용 중인 선수입니다."', inSq.status === 409 && inSq.message === '현재 스쿼드에서 사용 중인 선수입니다.');
  const st1 = await call('/api/market/sell', { token: r1.token, playerId: 'messi', price: 1 });
  check('SELL: starters are UNTRADEABLE', st1.status === 403 && st1.error === 'untradeable');
  const owns = (await call('/api/me', { token: r1.token })).owned;
  const mine = owns.includes('coman') ? 'coman' : 'felix';
  const val = judge.marketPrice(mine);
  const lo = await call('/api/market/sell', { token: r1.token, playerId: mine, price: Math.floor(val * 0.79) });
  const hi = await call('/api/market/sell', { token: r1.token, playerId: mine, price: Math.ceil(val * 1.21) });
  check('SELL: price must stay within 80–120 % of market value', lo.status === 400 && hi.status === 400);
  const mpBefore = (await call('/api/me', { token: r1.token })).mp;
  const ls1 = await call('/api/market/sell', { token: r1.token, playerId: mine, price: val });
  check('SELL: listed → player leaves MY PLAYERS (LISTED), no MP yet', ls1.ok && !ls1.owned.includes(mine) && ls1.listed.includes(mine) && ls1.mp === mpBefore);
  const selfBuy = await call('/api/market/buy', { token: r1.token, playerId: mine });
  check('BUY: a seller cannot buy his own listing', selfBuy.status === 409 && selfBuy.error === 'owned');
  // others: Seller2 / Buyer / Buyer2 / Buyer3 / Buyer4 (rich enough)
  const tk = {};
  for (const nick of ['Seller2', 'Buyer', 'Buyer2', 'Buyer3', 'Buyer4']) {
    tk[nick] = (await call('/api/auth', { nickname: nick, password: 'pass1234' })).token;
    for (let i = 0; i < 300; i++) await acc.grantReward(nick, `g${nick}${i}`, 10_000_000);
  }
  const mpOf = async (t) => (await call('/api/me', { token: t })).mp;
  // a. Seller2 wants that player: Rich's listing is sold first (not a new system card)
  const richBefore = await mpOf(r1.token);
  const bA = await call('/api/market/buy', { token: tk.Seller2, playerId: mine });
  const richAfter = await call('/api/me', { token: r1.token });
  check('BUY: an existing USER listing is sold before the system card', bA.ok && bA.source === 'user' && bA.seller === 'Rich' && bA.price === val);
  check('SALE: seller loses the player and receives 70 % (30 % fee) + a "sold" notice', !richAfter.listed.includes(mine) && !richAfter.owned.includes(mine)
    && richAfter.mp === richBefore + val - Math.round(val * 0.3) && sold.length === 1 && sold[0][0] === 'Rich' && sold[0][1].revenue === val - Math.round(val * 0.3)
    && richAfter.notices.some((n) => n.type === 'sold' && n.playerId === mine), `${richAfter.mp - richBefore}`);
  const ack = await call('/api/notices/ack', { token: r1.token, ids: richAfter.notices.map((n) => n.id) });
  check('SALE notice is cleared once shown', ack.ok && (await call('/api/me', { token: r1.token })).notices.length === 0);
  // b. no listing left → Buyer3 gets the system card
  const bB = await call('/api/market/buy', { token: tk.Buyer3, playerId: mine });
  check('BUY: no user listing → system card at market value', bB.ok && bB.source === 'system' && bB.price === val);
  // c. two listings: Seller2 cheap (80 %), Buyer3 dear (100 %, later)
  await call('/api/market/sell', { token: tk.Seller2, playerId: mine, price: Math.ceil(val * 0.8) });
  await call('/api/market/sell', { token: tk.Buyer3, playerId: mine, price: val });
  const state = await call('/api/market/state', { token: tk.Buyer });
  check('MARKET state: 2 user listings, cheapest shown', state.listings[mine].count === 2 && state.listings[mine].min === Math.ceil(val * 0.8), JSON.stringify(state.listings[mine]));
  const s2mp = await mpOf(tk.Seller2);
  const bC = await call('/api/market/buy', { token: tk.Buyer, playerId: mine, maxPrice: Math.ceil(val * 0.8) });
  check('BUY: the CHEAPEST user listing first (Seller2 at 80 %)', bC.ok && bC.source === 'user' && bC.seller === 'Seller2' && bC.price === Math.ceil(val * 0.8)
    && (await mpOf(tk.Seller2)) === s2mp + bC.price - Math.round(bC.price * 0.3));
  const bD = await call('/api/market/buy', { token: tk.Buyer2, playerId: mine, maxPrice: Math.ceil(val * 0.8) });
  check('BUY: the next listing is dearer → a new confirm is needed (price_changed)', bD.status === 409 && bD.error === 'price_changed' && bD.price === val);
  const bE = await call('/api/market/buy', { token: tk.Buyer2, playerId: mine, maxPrice: val });
  check('BUY: then the remaining user listing (Buyer3) — still before any system card', bE.ok && bE.source === 'user' && bE.seller === 'Buyer3');
  const bF = await call('/api/market/buy', { token: tk.Buyer4, playerId: mine, maxPrice: val });
  check('BUY: listings sold out → system card again', bF.ok && bF.source === 'system');
  const r6 = { token: tk.Buyer4 };
  const buy3 = bF;
  // cancel
  const lsC = await call('/api/market/sell', { token: r6.token, playerId: mine, price: val });
  const cc = await call('/api/market/cancel', { token: r6.token, listingId: lsC.listing.id });
  check('CANCEL LISTING: the player returns to MY PLAYERS, no fee', cc.ok && cc.owned.includes(mine) && !cc.listed.includes(mine) && cc.mp === buy3.mp);
  // two buyers race for one listing → exactly one wins
  await call('/api/market/sell', { token: r6.token, playerId: mine, price: val });
  const race = await Promise.all([call('/api/market/buy', { token: r2.token, playerId: mine, maxPrice: val }), call('/api/market/buy', { token: tk.Buyer3, playerId: mine, maxPrice: val })]);
  const lstate = await call('/api/market/state', {});
  check('BUY race: one listing sold once — the other buyer gets the system card or an error, never both from the listing', race.filter((x) => x.ok && x.source === 'user').length === 1 && !lstate.listings[mine]);
}
console.log(fails ? `${fails} ACCOUNT CHECKS FAILED` : 'ALL ACCOUNT CHECKS PASSED');
process.exit(fails ? 1 : 0);
