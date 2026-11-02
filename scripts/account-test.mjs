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
  const acc = await createAccounts({ dataDir: dir2, catalog: { marketPrice: judge.marketPrice, isStarter: judge.isStarter, getPlayer: judge.getPlayer }, developerCode: 'unit-test-dev-code' });
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
}
console.log(fails ? `${fails} ACCOUNT CHECKS FAILED` : 'ALL ACCOUNT CHECKS PASSED');
process.exit(fails ? 1 : 0);
