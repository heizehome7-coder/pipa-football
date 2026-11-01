/**
 * PIPA realtime server — presence over WebSocket + static hosting of the built game.
 *
 *   npm run build && npm run server        → http://localhost:8787  (game + /ws)
 *   PORT=9000 npm run server
 *
 * Protocol (JSON messages):
 *   server → client  {t:'welcome', peer}
 *                    {t:'peers', room?, peers:[{peer, p}]}     full list on every change
 *   client → server  {t:'presence', p}                          replace my lobby presence
 *                    {t:'join', room} / {t:'leave', room}        named rooms (one per match)
 *                    {t:'rpresence', room, p}                    presence inside a named room
 * A client that stops answering pings for ~20 s is dropped and disappears from
 * everyone's list (the "heartbeat").
 *
 * Accounts (unique nicknames, saved squad): ./accounts.mjs — POST /api/auth|session|squad|logout.
 * The WebSocket may carry ?token=… ; a verified token pins that connection's lobby nickname.
 *
 * Online penalty matches (match:*, shot:*, keeper:*, time:ping) are handled by
 * ./matches.mjs — the server is the authority for rounds, roles, score and results.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createMatchManager } from './matches.mjs';
import { createAccounts } from './accounts.mjs';

const PORT = Number(process.env.PORT || 8787);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', process.env.PIPA_STATIC || 'dist');
const MAX_PRESENCE = 4096;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const accounts = await createAccounts({
  databaseUrl: process.env.DATABASE_URL,
  dataDir: process.env.PIPA_DATA_DIR,
  log: (line) => console.log(line),
});

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, clients: clients.size, matches: matches.matches.size, accounts: accounts.kind }));
    return;
  }
  if (url.pathname.startsWith('/api/') && accounts.handleHttp(req, res, url.pathname)) return;
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Build the game first: npm run build');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

/** room name ('' = lobby) → Map(peer → presence) */
const rooms = new Map([['', new Map()]]);
/** peer → { ws, rooms:Set } */
const clients = new Map();

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

// the same penalty simulation the phones run, bundled by `npm run build`
let judge;
try {
  judge = await import('./judge.gen.mjs');
} catch {
  console.error('server/judge.gen.mjs is missing — run `npm run build` first');
  process.exit(1);
}
const matches = createMatchManager({
  judge,
  log: (line) => console.log(line),
  // PIPA_SLOW_TEST=1: longer timers for automated browser tests on slow machines
  rules: process.env.PIPA_SLOW_TEST ? { aimTimeoutMs: 180_000, resultShowMs: 7000, countdownMs: 6000 } : undefined,
  send(peer, msg) {
    const c = clients.get(peer);
    if (c && c.ws.readyState === 1) c.ws.send(JSON.stringify(msg));
  },
});

function list(room) {
  const m = rooms.get(room);
  return m ? [...m.entries()].map(([peer, p]) => ({ peer, p })) : [];
}
function broadcast(room) {
  const msg = JSON.stringify(room ? { t: 'peers', room, peers: list(room) } : { t: 'peers', peers: list('') });
  const members = rooms.get(room);
  if (!members) return;
  for (const peer of members.keys()) {
    const c = clients.get(peer);
    if (c && c.ws.readyState === 1) c.ws.send(msg);
  }
}
function setPresence(room, peer, p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return;
  if (JSON.stringify(p).length > MAX_PRESENCE) return;
  if (!rooms.has(room)) rooms.set(room, new Map());
  rooms.get(room).set(peer, p);
  broadcast(room);
}
function leave(room, peer) {
  const m = rooms.get(room);
  if (!m || !m.has(peer)) return;
  m.delete(peer);
  if (room && m.size === 0) rooms.delete(room);
  else broadcast(room);
}
const validRoom = (r) => typeof r === 'string' && /^[a-z0-9][a-z0-9_.-]{0,47}$/.test(r);

/**
 * Lobby presence: a logged-in connection always shows its account nickname; a
 * connection without a valid token may not show a nickname that belongs to an account.
 */
async function lobbyPresence(client, peer, p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return;
  const nick = await client.auth;
  if (!clients.has(peer)) return;
  if (typeof p.nickname === 'string') {
    if (nick) p = { ...p, nickname: nick };
    else if (await accounts.isRegistered(p.nickname).catch(() => false)) return;
  }
  setPresence('', peer, p);
}

wss.on('connection', (ws, req) => {
  const peer = crypto.randomBytes(8).toString('hex');
  const token = new URL(req.url || '/', 'http://x').searchParams.get('token');
  const client = { ws, rooms: new Set(), alive: true, auth: token ? accounts.nicknameFor(token).catch(() => null) : Promise.resolve(null), chain: Promise.resolve() };
  clients.set(peer, client);
  rooms.get('').set(peer, {});
  ws.send(JSON.stringify({ t: 'welcome', peer }));
  broadcast('');

  ws.on('pong', () => (client.alive = true));
  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (matches.handle(peer, m)) return;
    // chained so presence updates keep their order even while the token check is pending
    if (m.t === 'presence') client.chain = client.chain.then(() => lobbyPresence(client, peer, m.p)).catch(() => {});
    else if (m.t === 'join' && validRoom(m.room)) {
      client.rooms.add(m.room);
      setPresence(m.room, peer, {});
    } else if (m.t === 'leave' && validRoom(m.room)) {
      client.rooms.delete(m.room);
      leave(m.room, peer);
    } else if (m.t === 'rpresence' && validRoom(m.room) && client.rooms.has(m.room)) setPresence(m.room, peer, m.p);
  });
  ws.on('close', () => {
    matches.disconnect(peer);
    clients.delete(peer);
    for (const r of client.rooms) leave(r, peer);
    leave('', peer);
  });
});

// heartbeat: drop clients that stop answering
setInterval(() => {
  for (const [, c] of clients) {
    if (!c.alive) {
      c.ws.terminate();
      continue;
    }
    c.alive = false;
    try {
      c.ws.ping();
    } catch {
      /* ignore */
    }
  }
}, 10_000);

server.listen(PORT, () => console.log(`PIPA realtime server on http://localhost:${PORT}  (ws: /ws, static: ${ROOT})`));
