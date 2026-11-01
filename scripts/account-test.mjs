// Accounts: unique nicknames, password check, session, squad save, persistence, presence pinning.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

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
srv.kill();
console.log(fails ? `${fails} ACCOUNT CHECKS FAILED` : 'ALL ACCOUNT CHECKS PASSED');
process.exit(fails ? 1 : 0);
