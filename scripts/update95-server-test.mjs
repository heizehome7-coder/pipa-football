// UPDATE 9.5 — server checks: 관심 선수 (favourites), developer grant of FV / 홍 tokens / GOOD & LEGEND
// packs, 감자의 제왕 best score + recent games.
//   node scripts/update95-server-test.mjs      (needs `npm run build` first)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 8901;
const DEV = 'unit-test-dev-code';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipa-u95-'));
let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra !== '' ? `  — ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
  if (!ok) fails++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const start = () =>
  new Promise((res) => {
    const p = spawn('node', ['server/realtime-server.mjs'], { env: { ...process.env, PORT: String(PORT), PIPA_DATA_DIR: dir, DATABASE_URL: '', DEVELOPER_CODE: DEV } });
    p.stdout.on('data', (d) => String(d).includes('PIPA realtime server') && res(p));
  });
const api = async (p, body) => {
  const r = await fetch(`http://localhost:${PORT}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
};

let srv = await start();
try {
  const u = await api('/api/auth', { nickname: 'FavKid', password: 'pass1234' });
  const tok = u.token;
  check('new account: no favourites', Array.isArray(u.favorites) && u.favorites.length === 0);
  check('favourite needs a login', (await api('/api/favorites', { playerId: 'modric', on: true })).status === 401);
  const f1 = await api('/api/favorites', { token: tok, playerId: 'modric', on: true });
  const f2 = await api('/api/favorites', { token: tok, playerId: 'yashin', on: true });
  const f3 = await api('/api/favorites', { token: tok, playerId: 'yashin', on: true });
  check('★ modric, yashin (twice = once)', f1.ok && f2.ok && JSON.stringify(f3.favorites) === '["modric","yashin"]', f3.favorites);
  const f4 = await api('/api/favorites', { token: tok, playerId: 'modric', on: false });
  check('☆ modric off', JSON.stringify(f4.favorites) === '["yashin"]');
  check('unknown player refused', (await api('/api/favorites', { token: tok, playerId: 'nobody', on: true })).status === 400);
  check('favourites come back on every login (/api/me)', JSON.stringify((await api('/api/me', { token: tok })).favorites) === '["yashin"]');

  // developer grants
  const dt = (await api('/api/dev/auth', { code: DEV })).devToken;
  check('grant needs the developer token', (await api('/api/dev/grant-items', { nickname: 'FavKid', item: 'fv', count: 10 })).status === 401);
  for (const [item, count, why] of [['fv', 0, 'zero'], ['fv', 100001, 'over 100,000 FV'], ['red', 101, 'over 100 tokens'], ['good', 2.5, 'fraction'], ['mp', 5, 'unknown item'], ['legend', '3', 'text']]) {
    check(`grant refuses ${why}`, (await api('/api/dev/grant-items', { devToken: dt, nickname: 'FavKid', item, count })).status === 400);
  }
  check('unknown user → 404', (await api('/api/dev/grant-items', { devToken: dt, nickname: 'nobody_here', item: 'fv', count: 5 })).status === 404);
  const grants = [['fv', 1500], ['bronze', 3], ['silver', 2], ['gold', 1], ['red', 4], ['good', 5], ['legend', 6]];
  for (const [item, count] of grants) {
    const r = await api('/api/dev/grant-items', { devToken: dt, nickname: 'favkid', item, count });
    check(`grant ${item} +${count}`, r.ok && r.granted === count && r.after === r.before + count, r);
  }
  const me = await api('/api/me', { token: tok });
  check('the user really has them (FV · 동/은/금/홍 · GOOD · LEGEND)', me.fv === 1500 && JSON.stringify(me.hong) === '{"bronze":3,"silver":2,"gold":1,"red":4}' && me.goodPacks === 5 && me.legendPacks === 6, { fv: me.fv, hong: me.hong, good: me.goodPacks, legend: me.legendPacks });
  const users = await api('/api/dev/users', { devToken: dt });
  const row = users.users.find((x) => x.nickname === 'FavKid');
  check('developer user list shows FV, tokens and both packs', row && row.fv === 1500 && row.hong.red === 4 && row.goodPacks === 5 && row.legendPacks === 6, row);
  const logs = await api('/api/dev/log', { devToken: dt });
  check('every grant is in the developer log (GRANT_FV … GRANT_LEGEND)', grants.every(([item, count]) => logs.actions.some((a) => a.action === `GRANT_${item.toUpperCase()}` && a.target === 'FavKid' && a.amount === count)));
  const op = await api('/api/packs/open', { token: tok, kind: 'legend' });
  check('a granted LEGEND PACK opens normally', op.ok && op.legendPacks === 5);

  // 감자의 제왕: best + recent (fake finished games written in the save file)
  await sleep(500);
  srv.kill();
  await sleep(400);
  const file = path.join(dir, 'accounts.json');
  const all = JSON.parse(fs.readFileSync(file, 'utf8'));
  const now = Date.now();
  all.favkid.data.potatoLog = [
    { id: 'g1', score: 4, reward: { mp: 10e6 }, finishedAt: new Date(now - 300000).toISOString() },
    { id: 'g2', score: 9, reward: { mp: 30e6 }, finishedAt: new Date(now - 200000).toISOString() },
  ];
  all.favkid.data.potato = { id: 'g3', userId: 'favkid', status: 'playing', round: 12, score: 11, startAt: now - 20000, endAt: now - 8000, rounds: [], clicked: [] };
  fs.writeFileSync(file, JSON.stringify(all));
  srv = await start();
  const st = await api('/api/events/state', { token: tok });
  check('a finished game with 11 points → new best (11), shown with the reward', st.potatoStats.best === 11 && st.potato.newBest === true && st.potatoStats.recent[0].id === 'g3' && st.potatoStats.recent[0].reward.pack === 'good', st.potatoStats);
  check('recent games newest first, games played counted', st.potatoStats.recent.map((g) => g.score).join(',') === '11,9,4' && st.potatoStats.played === 3, st.potatoStats);
  await sleep(500);
  srv.kill();
  await sleep(400);
  const all2 = JSON.parse(fs.readFileSync(file, 'utf8'));
  all2.favkid.data.potato = { id: 'g4', userId: 'favkid', status: 'playing', round: 12, score: 7, startAt: now - 20000, endAt: now - 8000, rounds: [], clicked: [] };
  fs.writeFileSync(file, JSON.stringify(all2));
  srv = await start();
  const st2 = await api('/api/events/state', { token: tok });
  check('a lower score keeps the best (11) and is not a new best', st2.potatoStats.best === 11 && st2.potato.newBest === false && st2.potatoStats.played === 4 && st2.potatoStats.recent[0].score === 7);
  const st3 = await api('/api/events/state', { token: tok });
  check('reloading does not count the game twice', st3.potatoStats.played === 4 && st3.potatoStats.recent.length === 4);
} catch (e) {
  console.error(e);
  fails++;
} finally {
  srv.kill();
}
console.log(fails ? `${fails} UPDATE 9.5 SERVER CHECK(S) FAILED` : 'ALL UPDATE 9.5 SERVER CHECKS PASSED');
process.exit(fails ? 1 : 0);
