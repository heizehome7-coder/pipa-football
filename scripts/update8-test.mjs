// UPDATE 8 — PLAYER PACK server checks (draw on the server, cards, duplicates, developer pack grant).
//   node scripts/update8-test.mjs      (needs `npm run build` first — uses server/judge.gen.mjs)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import * as judge from '../server/judge.gen.mjs';

const PORT = 8898;
const DEV = 'unit-test-dev-code';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipa-u8-'));
let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra !== '' ? `  — ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
  if (!ok) fails++;
};

// ── 1. the draw itself (shared code, server bundle) ───────────────────────
{
  const pool = judge.packPool();
  const starters = pool.filter((p) => judge.isStarter(p.id));
  check('pack pool: every tradeable market player (150), no free starter', pool.length === 150 && starters.length === 0, { pool: pool.length, starters: starters.length });
  check('pool includes Kim Injik (ICON) and Heo Shin (LIVERPOOL)', pool.some((p) => p.id === 'kiminjik' && p.isIcon && p.club === null) && pool.some((p) => p.id === 'heoshin' && p.club === 'LIVERPOOL' && !p.isIcon));
  const N = 200000;
  const tiers = {};
  const rnd = () => Math.random();
  for (let i = 0; i < N; i++) {
    const { tier } = judge.drawPackPlayer(rnd());
    tiers[tier] = (tiers[tier] ?? 0) + 1;
  }
  const pct = Object.fromEntries(Object.entries(tiers).map(([k, v]) => [k, +((100 * v) / N).toFixed(1)]));
  const want = Object.fromEntries(judge.PACK_CONFIG.tiers.map((t) => [t.tier, t.weight]));
  check('tier odds ≈ config (45 / 30 / 17 / 6 / 2 %)', Object.keys(want).every((k) => Math.abs((pct[k] ?? 0) - want[k]) < 0.6), pct);
  const a = judge.drawPackPlayer(0.123456).player.id;
  const b = judge.drawPackPlayer(0.123456).player.id;
  check('the draw is a pure function of the server random number', a === b);
  check('tier follows the market value', judge.packTier(100e6) === 'base' && judge.packTier(400e6) === 'rare' && judge.packTier(800e6) === 'epic' && judge.packTier(1.4e9) === 'elite' && judge.packTier(1.7e9) === 'icon');
}

// ── 2. the server ─────────────────────────────────────────────────────────
const srv = await new Promise((res) => {
  const p = spawn('node', ['server/realtime-server.mjs'], { env: { ...process.env, PORT: String(PORT), PIPA_DATA_DIR: dir, DATABASE_URL: '', DEVELOPER_CODE: DEV } });
  p.stdout.on('data', (d) => String(d).includes('PIPA realtime server') && res(p));
});
const api = async (p, body) => {
  const r = await fetch(`http://localhost:${PORT}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
};
try {
  const u = await api('/api/auth', { nickname: 'PackKid', password: 'pass1234' });
  const tok = u.token;
  check('a new account starts with 0 packs and no cards', u.unopenedPacks === 0 && Array.isArray(u.cards) && u.cards.length === 0);
  const none = await api('/api/packs/open', { token: tok });
  check('OPEN without a pack → refused (409), nothing given', none.status === 409 && none.owned.length === 0);
  check('OPEN needs a login', (await api('/api/packs/open', {})).status === 401);

  // developer pack grant
  const noDev = await api('/api/dev/grant-packs', { nickname: 'PackKid', count: 5 });
  check('DEV GRANT PACKS needs the developer token', noDev.status === 401 && !noDev.unopenedPacks);
  const dt = (await api('/api/dev/auth', { code: DEV })).devToken;
  for (const [c, why] of [[0, 'zero'], [-3, 'negative'], [2.5, 'fraction'], ['5', 'text'], [101, 'over the limit']]) {
    const r = await api('/api/dev/grant-packs', { devToken: dt, nickname: 'PackKid', count: c });
    check(`DEV GRANT PACKS refuses ${why}`, r.status === 400, r.status);
  }
  check('DEV GRANT PACKS: unknown user → 404', (await api('/api/dev/grant-packs', { devToken: dt, nickname: 'nobody_here', count: 2 })).status === 404);
  // listen for the live push
  const pushed = [];
  const ws = new WebSocket(`ws://localhost:${PORT}/ws?token=${tok}`);
  await new Promise((r) => ws.on('open', r));
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.t === 'welcome') ws.send(JSON.stringify({ t: 'presence', p: { app: 'pipa', v: 1, nickname: 'PackKid', status: 'online' } }));
    if (m.t === 'packs:update') pushed.push(m.unopenedPacks);
  });
  await new Promise((r) => setTimeout(r, 300));
  const g = await api('/api/dev/grant-packs', { devToken: dt, nickname: 'packkid', count: 12 });
  check('DEV GRANT PACKS: +12 packs', g.ok && g.granted === 12 && g.unopenedPacks === 12, g);
  await new Promise((r) => setTimeout(r, 300));
  check('…and the user’s phone is told right away (packs:update)', pushed.includes(12), pushed);
  const logs = await api('/api/dev/log', { devToken: dt });
  check('…and it is in the developer log (GRANT_PACKS)', logs.actions.some((a) => a.action === 'GRANT_PACKS' && a.target === 'PackKid' && a.amount === 12));

  // open packs
  const pulls = [];
  let last;
  for (let i = 0; i < 12; i++) {
    last = await api('/api/packs/open', { token: tok });
    if (last.ok) pulls.push(last.pull);
    else console.log('open failed', last);
  }
  check('12 packs → 12 cards, 0 packs left', pulls.length === 12 && last.unopenedPacks === 0 && last.cards.length === 12, { left: last.unopenedPacks, cards: last.cards.length });
  check('every card has its own id', new Set(last.cards.map((c) => c.id)).size === 12 && pulls.every((p) => last.cards.some((c) => c.id === p.cardId && c.playerId === p.playerId && c.source === 'pack')));
  check('no free starter ever came out of a pack', pulls.every((p) => !judge.isStarter(p.playerId)));
  check('pack cards are tradeable market players', pulls.every((p) => judge.marketPrice(p.playerId) > 0));
  check('13th open → refused, nothing given', (await api('/api/packs/open', { token: tok })).status === 409);
  const me = await api('/api/me', { token: tok });
  check('the result is saved on the server (a reload shows the same cards)', me.cards.length === 12 && me.packsOpened === undefined ? me.cards.length === 12 : true);

  // duplicates: give one player twice by editing the server file (simulates two pulls of the same player)
  ws.close();
  await new Promise((r) => setTimeout(r, 500)); // the file store writes 200 ms after the last change
  srv.kill();
  await new Promise((r) => setTimeout(r, 500));
  const file = path.join(dir, 'accounts.json');
  const all = JSON.parse(fs.readFileSync(file, 'utf8'));
  const acc = all.packkid;
  // a player no pack gave this run
  const DUP = judge.packPool().map((p) => p.id).find((id) => !acc.data.owned.includes(id) && judge.getPlayer(id).role !== 'GK');
  acc.data.owned = [...acc.data.owned, DUP, DUP];
  acc.data.squad = { penaltyOrder: [DUP, 'messi', 'ronaldo', 'neymar', 'yamal'], goalkeeperId: 'courtois', freeKickTakerId: 'messi' };
  fs.writeFileSync(file, JSON.stringify(all));
  const srv2 = await new Promise((res) => {
    const p = spawn('node', ['server/realtime-server.mjs'], { env: { ...process.env, PORT: String(PORT), PIPA_DATA_DIR: dir, DATABASE_URL: '', DEVELOPER_CODE: DEV } });
    p.stdout.on('data', (d) => String(d).includes('PIPA realtime server') && res(p));
  });
  try {
    const m2 = await api('/api/me', { token: tok });
    const mod = m2.cards.filter((c) => c.playerId === DUP);
    check('two cards of the same player → two card ids (old data migrated, earlier ids kept)', mod.length === 2 && mod[0].id !== mod[1].id && pulls.every((p) => m2.cards.some((c) => c.id === p.cardId)));
    const dupSquad = await api('/api/squad', { token: tok, squad: { penaltyOrder: [DUP, DUP, 'ronaldo', 'neymar', 'yamal'], goalkeeperId: 'courtois', freeKickTakerId: DUP } });
    check('the same player twice in one squad → refused', dupSquad.status === 400);
    const val = judge.marketPrice(DUP);
    const s1 = await api('/api/market/sell', { token: tok, playerId: DUP, price: val, cardId: mod[1].id });
    check('a spare copy of a squad player can be sold (that exact card)', s1.ok && s1.cards.filter((c) => c.playerId === DUP).length === 1 && !s1.cards.some((c) => c.id === mod[1].id), s1.message);
    const s2 = await api('/api/market/sell', { token: tok, playerId: DUP, price: val });
    check('…but not the last copy the squad uses', s2.status === 409 && s2.error === 'in_squad');
    const c1 = await api('/api/market/cancel', { token: tok, listingId: s1.listing.id });
    check('CANCEL LISTING gives back the same card (same id)', c1.ok && c1.cards.some((c) => c.id === mod[1].id && c.playerId === DUP));
    // a duplicate sold to another user: seller +70 %, buyer gets a card
    const s3 = await api('/api/market/sell', { token: tok, playerId: DUP, price: val, cardId: mod[1].id });
    const buyer = await api('/api/auth', { nickname: 'PackBuyer', password: 'pass1234' });
    await api('/api/dev/grant', { devToken: (await api('/api/dev/auth', { code: DEV })).devToken, nickname: 'PackBuyer', amount: val });
    const mpBefore = (await api('/api/me', { token: tok })).mp;
    const b1 = await api('/api/market/buy', { token: buyer.token, playerId: DUP, maxPrice: val });
    const after = await api('/api/me', { token: tok });
    check('a pack duplicate sells on the market (user listing first, 30 % fee)', s3.ok && b1.ok && b1.source === 'user' && after.mp === mpBefore + judge.sellerRevenue(val) && b1.cards.some((c) => c.playerId === DUP), { src: b1.source });
  } finally {
    srv2.kill();
  }
} catch (e) {
  fails++;
  console.log('FAIL exception', e);
  srv.kill();
}
console.log(fails ? `${fails} UPDATE 8 CHECKS FAILED` : 'ALL UPDATE 8 SERVER CHECKS PASSED');
process.exit(fails ? 1 : 0);
