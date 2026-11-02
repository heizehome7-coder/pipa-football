// UPDATE 7: the listing / sale transaction on PostgreSQL (PIPA_TEST_DB=postgres://…)
import { EventEmitter } from 'node:events';
import { createAccounts } from '../server/accounts.mjs';
import * as judge from '../server/judge.gen.mjs';
const acc = await createAccounts({ databaseUrl: process.env.PIPA_TEST_DB, catalog: judge });
let fails = 0;
const check = (n, ok, i = '') => (console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok ? '' : ' ' + i}`), ok || fails++);
const call = (route, body) => new Promise((res) => {
  const req = new EventEmitter(); req.method = 'POST'; req.headers = {}; req.socket = { remoteAddress: '1' };
  const out = { writeHead: (s) => ((out.status = s), out), end: (b) => res({ status: out.status, ...JSON.parse(b) }) };
  acc.handleHttp(req, out, route); req.emit('data', JSON.stringify(body)); req.emit('end');
});
const t = {};
const sfx = Math.random().toString(36).slice(2, 6); // fresh accounts on every run of the same test database
const N = { A: `PgA${sfx}`, B: `PgB${sfx}`, C: `PgC${sfx}` };
for (const n of [N.A, N.B, N.C]) {
  t[n] = (await call('/api/auth', { nickname: n, password: 'pass1234' })).token;
  for (let i = 0; i < 100; i++) await acc.grantReward(n, `pg${n}${i}`, 10_000_000);
}
const v = judge.marketPrice('coman');
const b1 = await call('/api/market/buy', { token: t[N.A], playerId: 'coman' });
const l1 = await call('/api/market/sell', { token: t[N.A], playerId: 'coman', price: v });
check('pg: list', l1.ok && l1.listed.includes('coman'));
const aMp = (await call('/api/me', { token: t[N.A] })).mp;
const race = await Promise.all([call('/api/market/buy', { token: t[N.B], playerId: 'coman', maxPrice: v }), call('/api/market/buy', { token: t[N.C], playerId: 'coman', maxPrice: v })]);
const after = await call('/api/me', { token: t[N.A] });
check('pg: one buyer gets the listing, seller +70 % once, transaction committed', race.filter((r) => r.source === 'user').length === 1 && after.mp === aMp + v - Math.round(v * 0.3) && after.listed.length === 0, JSON.stringify(race.map((r) => [r.status, r.source])));
const st = await call('/api/market/state', {});
check('pg: listing gone', !st.listings.coman);
const w = race.find((r) => r.source === 'user') === race[0] ? t[N.B] : t[N.C];
const l2 = await call('/api/market/sell', { token: w, playerId: 'coman', price: v });
const c2 = await call('/api/market/cancel', { token: w, listingId: l2.listing.id });
check('pg: cancel returns the player', c2.ok && c2.owned.includes('coman'));
const rec = await acc.recordResult(N.A, `pgm${sfx}#1`, 'penalty', 'win');
check('pg: XP + record', rec.after.level === 1);
// UPDATE 7 hotfix: USER SQUADS reads the squad from PostgreSQL (developer token required)
const sq = { penaltyOrder: ['ronaldo', 'messi', 'son', 'mbappe', 'salah'], goalkeeperId: 'courtois', freeKickTakerId: 'son' };
await call('/api/squad', { token: t[N.A], squad: sq });
const noDev = await call('/api/dev/squad', { nickname: N.A });
const dt = (await call('/api/dev/auth', { code: process.env.DEVELOPER_CODE })).devToken;
const ds = await call('/api/dev/squad', { devToken: dt, nickname: N.A.toLowerCase() });
check('pg: USER SQUADS — dev token required, server squad returned', !noDev.user && ds.user?.squad?.penaltyOrder?.join() === sq.penaltyOrder.join() && ds.user.squad.goalkeeperId === sq.goalkeeperId && ds.user.squad.freeKickTakerId === sq.freeKickTakerId, JSON.stringify(ds.user?.squad));
console.log(fails ? `${fails} FAILED` : 'ALL PG MARKET CHECKS PASSED');
process.exit(fails ? 1 : 0);
