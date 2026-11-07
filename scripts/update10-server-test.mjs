// UPDATE 10 — server checks: SEASON 1 (records reset exactly once, nothing else touched), MATCH
// STATISTICS, defenders off the market (owned cards kept, open listings returned), EVOLUTION
// MATERIAL SHOP, EVOLUTION (server roll, material used, +12 cap, no duplicates), WEEKLY MISSIONS,
// online evolution sync + emotes, and the four bug fixes.
//   node scripts/update10-server-test.mjs      (needs `npm run build` first — uses server/judge.gen.mjs)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import * as judge from '../server/judge.gen.mjs';

const PORT = 8903;
const DEV = 'unit-test-dev-code';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipa-u10-'));
let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra !== '' ? `  — ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
  if (!ok) fails++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const M = 1_000_000;

// ── 1. shared rules ───────────────────────────────────────────────────────
{
  const base = [0.9, 0.8, 0.7, 0.6, 0.5, 0.38, 0.28, 0.18, 0.1, 0.05, 0.02, 0.0075];
  // UPDATE 11: grade × (0.65 … 1.15) · vs player × (0.7 / 1 / 1.12), soft cap per step
  check('evolution base rates +0→+1 90 % … +11→+12 0.75 % (equal OVR 140 material ×0.9 → below the soft knee)', base.every((b, l) => l < 2 || Math.abs(judge.evoSuccessRate(l, 140, 140) - Math.round(b * 0.9 * 1e7) / 1e7) < 1e-9 || b * 0.9 > [0.95, 0.95, 0.9, 0.85, 0.75, 0.6, 0.45, 0.3, 0.18, 0.08, 0.03, 0.0125][l] * 0.8));
  const lower = judge.evoSuccessRate(3, 130, 140);
  const equal = judge.evoSuccessRate(3, 140, 140);
  const higher = judge.evoSuccessRate(3, 150, 140);
  check('material lower / equal / higher than the player', Math.abs(lower - 0.6 * 0.65 * 0.7) < 1e-6 && Math.abs(equal - 0.6 * 0.9) < 1e-6 && higher > equal && higher < 0.85, { lower, equal, higher });
  check('never above the cap (95 %)', judge.evoSuccessRate(0, 150, 90) < 0.95);
  check('+11 → +12 stays very hard even with OVR 150 (< 1.25 %)', judge.evoSuccessRate(11, 150, 100) < 0.0125 && judge.evoSuccessRate(9, 150, 100) < 0.08);
  check('+12 cannot evolve', judge.evoSuccessRate(12, 150, 100) === 0);
  const p = judge.getPlayer('messi');
  check('OVR +3 per step to +9, +6 for +10…+12 (90 → +12 = 135)', judge.evoOvr(p, 1) === judge.evoOvr(p, 0) + 3 && judge.evoOvr(p, 9) === judge.evoOvr(p, 0) + 27 && judge.evoOvr(p, 12) === judge.evoOvr(p, 0) + 45);
  check('materials 130/135/140/145/150 · 50M/120M/250M/500M/900M · 150/300/600/1200/2200 FV',
    JSON.stringify(judge.MATERIALS.map((m) => [m.ovr, m.mp / M, m.fv])) === JSON.stringify([[130, 50, 150], [135, 120, 300], [140, 250, 600], [145, 500, 1200], [150, 900, 2200]]));
  check('weekly key = Monday KST (Sun 23:59 KST still last week, Mon 00:00 KST new week)',
    judge.weekKey(Date.parse('2026-11-08T23:59:00+09:00')) === '2026-11-02' && judge.weekKey(Date.parse('2026-11-09T00:00:00+09:00')) === '2026-11-09');
  check('season = 1', judge.SEASON === 1);
  // UPDATE 11 patch: defenders are back on the market and in packs
  check('defenders buyable again (UPDATE 11 patch), free starters never', judge.isBuyable('vandijk') && judge.isBuyable('maldini') && judge.isBuyable('kimminjae') && judge.isBuyable('modric') && judge.isBuyable('parksaha') && !judge.isBuyable('messi'));
  check('packs: defenders back in the pool', judge.packPool().some((x) => x.defender));
  check('9 emotes', judge.EMOTES.length === 9 && judge.EMOTES.includes('동') && judge.EMOTES.includes('EZ'));
}

// ── 2. the server, with pre-UPDATE-10 data ────────────────────────────────
const salt = 'aa';
const acct = (nick, data) => ({ key: nick.toLowerCase(), nickname: nick, salt, hash: 'x', tokens: [], createdAt: '2026-01-01', data: { v6: true, mp: 0, owned: [], rewards: [], ...data } });
fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify({
  veteran: acct('Veteran', { mp: 777 * M, fv: 999, level: 14, xp: 50, owned: ['vandijk', 'modric'], cards: [{ id: 'cvdj', playerId: 'vandijk', source: 'market' }, { id: 'cmod', playerId: 'modric', source: 'market' }],
    stats: { penalty: { wins: 9, losses: 3, draws: 1 }, freekick: { wins: 4, losses: 2, draws: 0 } }, hong: { bronze: 2, silver: 0, gold: 0, red: 0 }, unopenedPacks: 3, lastDailyClaim: '2026-11-01',
    squad: { penaltyOrder: ['vandijk', 'messi', 'son', 'kane', 'salah'], goalkeeperId: 'courtois', freeKickTakerId: 'messi' } }),
  seller: acct('Seller', { owned: ['saliba'], cards: [], listed: ['saliba'], listedCards: [{ id: 'csal', playerId: 'saliba', source: 'market', listingId: 'L1' }] }),
}));
fs.writeFileSync(path.join(dir, 'listings.json'), JSON.stringify({ L1: { id: 'L1', playerId: 'saliba', seller: 'seller', sellerName: 'Seller', price: 600 * M, createdAt: '2026-10-01' } }));
const start = () =>
  new Promise((res) => {
    const p = spawn('node', ['server/realtime-server.mjs'], { env: { ...process.env, PORT: String(PORT), PIPA_DATA_DIR: dir, DATABASE_URL: '', DEVELOPER_CODE: DEV } });
    p.stdout.on('data', (d) => String(d).includes('PIPA realtime server') && res(p));
  });
const api = async (p, body) => {
  const r = await fetch(`http://localhost:${PORT}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};
const nonce = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
import crypto from 'node:crypto';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
{
  const all = JSON.parse(fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8'));
  all.veteran.tokens = [sha('veteran-token-0123456789')];
  all.seller.tokens = [sha('seller-token-0123456789ab')];
  fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify(all));
}
const VT = 'veteran-token-0123456789';
const ST = 'seller-token-0123456789ab';
let srv = await start();
try {
  await sleep(600); // defender listing sweep
  // ── season 1: records 0, everything else kept
  const before = (await api('/api/ranking', { board: 'penalty' })).rows ?? [];
  check('ranking (penalty) before the account is touched already counts season 1 only (0 wins)', !before.some((r) => r.nickname === 'Veteran' && r.wins > 0), before.slice(0, 3));
  const v = await api('/api/me', { token: VT });
  check('Veteran keeps MP, FV, level, XP, cards, squad, tokens, packs, daily status', v.mp === 777 * M && v.fv === 999 && v.level === 14 && v.xp === 50 && v.cards.length === 2 && v.squad?.penaltyOrder?.[0] === 'vandijk' && v.hong.bronze === 2 && v.unopenedPacks === 3 && v.daily.lastClaim === '2026-11-01', { mp: v.mp, fv: v.fv, level: v.level });
  check('…and is in SEASON 1', v.season === 1);
  const stats = await api('/api/stats', { board: 'penalty', q: 'veteran' });
  check('MATCH STATISTICS: season 1 records start at 0', stats.ok && stats.rows[0]?.nickname === 'Veteran' && stats.rows[0].games === 0, stats.rows?.[0]);
  await sleep(500);
  srv.kill();
  await sleep(400);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8')).veteran.data;
  check('season 0 records archived (9-3-1 penalty), season stored → reset only once', saved.season === 1 && saved.seasonHistory?.[0]?.season === 0 && saved.seasonHistory[0].stats.penalty.wins === 9 && saved.stats.penalty.wins === 0);
  // a season-1 result, then restart: never reset again
  const all = JSON.parse(fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8'));
  all.veteran.data.stats.penalty.wins = 2;
  fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify(all));
  srv = await start();
  await api('/api/me', { token: VT });
  const st2 = await api('/api/stats', { board: 'total', q: 'vet' });
  check('server restart does not reset season 1 again (2 wins kept)', st2.rows?.[0]?.wins === 2, st2.rows?.[0]);
  check('MATCH STATISTICS needs no developer rights · search works · unknown → empty', (await api('/api/stats', { board: 'freekick', q: 'zzzz' })).rows.length === 0);

  // ── defenders
  const sl = await api('/api/me', { token: ST });
  check('UPDATE 11 patch: an open defender listing is left alone (no sweep, user data untouched)', sl.owned.includes('saliba') && sl.listed.includes('saliba'), { owned: sl.owned, listed: sl.listed });
  check('listing a defender who is in the squad → refused (squad member)', (await api('/api/market/sell', { token: VT, playerId: 'vandijk', price: 500 * M, cardId: 'cvdj' })).status >= 400);
  const vv = await api('/api/me', { token: VT });
  check('owned defender card stays owned and in the squad', vv.owned.includes('vandijk') && vv.squad.penaltyOrder.includes('vandijk'));

  // ── materials
  check('material: bad grade → refused', (await api('/api/evo/buy', { token: VT, ovr: 133, currency: 'mp', nonce: nonce() })).status === 400);
  check('material: both currencies at once is not a thing', (await api('/api/evo/buy', { token: VT, ovr: 130, currency: 'both', nonce: nonce() })).status === 400);
  const b1 = await api('/api/evo/buy', { token: VT, ovr: 150, currency: 'mp', nonce: nonce() });
  check('buy OVR 150 with MP: 777M < 900M → refused (402), nothing taken', b1.status === 402 && b1.mp === 777 * M, b1.status);
  const b2 = await api('/api/evo/buy', { token: VT, ovr: 140, currency: 'mp', nonce: nonce() });
  check('buy OVR 140 with MP → −250M only', b2.ok && b2.mp === 527 * M && b2.fv === 999 && b2.materials.length === 1, { mp: b2.mp, fv: b2.fv });
  const nn = nonce();
  const b3 = await api('/api/evo/buy', { token: VT, ovr: 145, currency: 'fv', nonce: nn });
  const b3b = await api('/api/evo/buy', { token: VT, ovr: 145, currency: 'fv', nonce: nn });
  check('buy OVR 145 with FV → −0 MP, too little FV → refused', b3.status === 402 && b3.mp === 527 * M);
  const b4 = await api('/api/evo/buy', { token: VT, ovr: 130, currency: 'fv', nonce: nn });
  check('a repeated nonce never buys twice (and never answers a different request)', b3b.status === 402 && b4.ok && b4.fv === 999 - 150 && b4.materials.length === 2);
  const par = await Promise.all(Array.from({ length: 5 }, () => api('/api/evo/buy', { token: VT, ovr: 130, currency: 'fv', nonce: nonce() })));
  const after = await api('/api/me', { token: VT });
  check('5 parallel FV buys → 5 × 150 FV, 5 materials', par.every((r) => r.ok) && after.fv === 999 - 150 * 6 && after.materials.length === 7, { fv: after.fv, mats: after.materials.length });

  // ── evolution
  const m130 = after.materials.find((m) => m.ovr === 130).id;
  check('evolve someone else’s / unknown card → refused, material kept', (await api('/api/evo/evolve', { token: VT, cardKey: 'nope', materialId: m130, nonce: nonce() })).status === 404 && (await api('/api/me', { token: VT })).materials.length === 7);
  check('evolve a starter you have → ok key "starter:messi"; a non-starter id that way → refused', (await api('/api/evo/evolve', { token: VT, cardKey: 'starter:modric', materialId: m130, nonce: nonce() })).status === 404);
  let level = 0;
  let used = 0;
  let succ = 0;
  let r;
  for (let i = 0; i < 6; i++) {
    const me = await api('/api/me', { token: VT });
    const mat = me.materials[0];
    if (!mat) break;
    r = await api('/api/evo/evolve', { token: VT, cardKey: 'starter:messi', materialId: mat.id, nonce: nonce() });
    used++;
    if (!r.ok) break;
    check(`evolve #${i + 1}: shown rate = the rule (${(r.rate * 100).toFixed(1)} %), material used`, Math.abs(r.rate - judge.evoSuccessRate(r.from, mat.ovr, judge.evoOvr(judge.getPlayer('messi'), r.from))) < 1e-9 && r.materials.length === me.materials.length - 1 && (r.success ? r.evoLevel === r.from + 1 : r.evoLevel === r.from));
    if (r.success) succ++;
    level = r.evoLevel;
  }
  const me2 = await api('/api/me', { token: VT });
  check('the level is saved on the server (starter evolution) and shown in evo map', me2.starterEvo.messi === level && (level ? me2.evo.messi === level : true), { level, starterEvo: me2.starterEvo, succ, used });
  // the same evolve request repeated → no second roll
  const mat2 = me2.materials[0];
  if (mat2) {
    const n2 = nonce();
    const e1 = await api('/api/evo/evolve', { token: VT, cardKey: 'cmod', materialId: mat2.id, nonce: n2 });
    const e2 = await api('/api/evo/evolve', { token: VT, cardKey: 'cmod', materialId: mat2.id, nonce: n2 });
    check('the same evolve request twice → one roll, one material', e2.repeated && e2.success === e1.success && e2.materials.length === e1.materials.length, { e1: e1.success, e2: e2.repeated });
    if (e1.success) check('an evolved card can not be listed for sale', (await api('/api/market/sell', { token: VT, playerId: 'modric', price: 380 * M, cardId: 'cmod' })).status === 403);
  }
  // +12 cap
  await sleep(500);
  srv.kill();
  await sleep(400);
  {
    const a2 = JSON.parse(fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8'));
    a2.veteran.data.starterEvo = { ...(a2.veteran.data.starterEvo ?? {}), kane: 12, son: 11 };
    a2.veteran.data.materials = [{ id: 'mx1', ovr: 150 }, { id: 'mx2', ovr: 150 }];
    fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify(a2));
  }
  srv = await start();
  const cap = await api('/api/evo/evolve', { token: VT, cardKey: 'starter:kane', materialId: 'mx1', nonce: nonce() });
  check('+12 → refused, material kept', cap.status === 409 && (await api('/api/me', { token: VT })).materials.length === 2);
  const s11 = await api('/api/evo/evolve', { token: VT, cardKey: 'starter:son', materialId: 'mx1', nonce: nonce() });
  check('+11 → +12 stays very hard even with an OVR 150 material (UPDATE 11: < 1.25 %, = the shared rule)', s11.ok && s11.rate < 0.0125 && Math.abs(s11.rate - judge.evoSuccessRate(11, 150, s11.ovr - 54 + 48)) < 1 && s11.rate === judge.evoSuccessRate(11, 150, judge.evoOvr(judge.getPlayer(s11.playerId), 11)));

  // ── weekly missions
  const w0 = await api('/api/missions/state', { token: VT });
  check('5 weekly missions, all at 0 this week', w0.ok && w0.missions.length === 5 && w0.missions.every((m) => m.progress === 0 && !m.claimed) && w0.resetInMs > 0);
  check('claiming an unfinished mission → refused', (await api('/api/missions/claim', { token: VT, id: 'online3' })).status === 409);
  const p1 = await api('/api/missions/play', { token: VT, seconds: 500 });
  check('play time: one report counts at most 60 s (the phone can not send 500 s)', p1.ok && p1.missions.find((m) => m.id === 'playtime').progress <= 60);
  const p2 = await api('/api/missions/play', { token: VT, seconds: 60 });
  check('…and never more than the real time since the last report', p2.missions.find((m) => m.id === 'playtime').progress <= 62 + 3);
  await sleep(500);
  srv.kill();
  await sleep(400);
  {
    const a3 = JSON.parse(fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8'));
    a3.veteran.data.weekly.progress = { ...a3.veteran.data.weekly.progress, online3: 3, goals10: 12, playtime: 301 };
    fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify(a3));
  }
  srv = await start();
  const fv0 = (await api('/api/me', { token: VT })).fv;
  const c1 = await api('/api/missions/claim', { token: VT, id: 'online3' });
  const c2 = await api('/api/missions/claim', { token: VT, id: 'online3' });
  check('ONLINE CHALLENGER done → CLAIM +30 FV once (second claim refused)', c1.ok && c1.fv === fv0 + 30 && c2.status === 409);
  const mp0 = c1.mp;
  const c3 = await api('/api/missions/claim', { token: VT, id: 'goals10' });
  check('GOAL MACHINE → +20,000,000 MP', c3.ok && c3.mp === mp0 + 20 * M);
  const c4 = await api('/api/missions/claim', { token: VT, id: 'playtime' });
  check('PLAY FOR 5 MINUTES → +50 FV', c4.ok && c4.fv === c1.fv + 50);
  // a new week → fresh missions
  await sleep(500);
  srv.kill();
  await sleep(400);
  {
    const a4 = JSON.parse(fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8'));
    a4.veteran.data.weekly.week = '2026-01-05';
    fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify(a4));
  }
  srv = await start();
  const w2 = await api('/api/missions/state', { token: VT });
  check('a new week → progress and claims start again', w2.missions.every((m) => m.progress === 0 && !m.claimed));

  // ── online: evolution sync (server data), emotes, mission counting
  const u1 = await api('/api/auth', { nickname: 'Duelist', password: 'pass1234' });
  const sock = (token) =>
    new Promise((res) => {
      const ws = new WebSocket(`ws://localhost:${PORT}/ws?token=${token}`);
      const inbox = [];
      ws.on('message', (raw) => {
        const m = JSON.parse(String(raw));
        inbox.push(m);
        if (m.t === 'welcome') ws.peer = m.peer;
      });
      ws.on('open', () => setTimeout(() => res({ ws, inbox }), 300));
    });
  const A = await sock(VT);
  const B = await sock(u1.token);
  const pa = A.ws.peer;
  const pb = B.ws.peer;
  const id = 'cmtest10abcde';
  A.ws.send(JSON.stringify({ t: 'match:join', matchId: id, opponentPeer: pb, nickname: 'Veteran', userId: 'ua', squad: { penaltyOrder: ['messi', 'son', 'kane', 'salah', 'yamal'], goalkeeperId: 'courtois', freeKickTakerId: 'messi', evo: { messi: 12, courtois: 12 } }, mode: 'penalty' }));
  B.ws.send(JSON.stringify({ t: 'match:join', matchId: id, opponentPeer: pa, nickname: 'Duelist', userId: 'ub', squad: { penaltyOrder: ['messi', 'son', 'kane', 'salah', 'yamal'], goalkeeperId: 'alisson', freeKickTakerId: 'messi', evo: { messi: 12 } }, mode: 'penalty' }));
  await sleep(500);
  const st = [...B.inbox].reverse().find((m) => m.state)?.state;
  const sqA = st?.players.find((p) => p.peer === pa)?.squad;
  const sqB = st?.players.find((p) => p.peer === pb)?.squad;
  check('online: evolution comes from the SERVER (sent levels ignored: Veteran messi = his real level, no courtois +12, Duelist none)', sqA?.evo?.messi === (level || undefined) && !sqA?.evo?.courtois && !sqB?.evo?.messi, { a: sqA?.evo, b: sqB?.evo, real: level });
  check('…both phones get the same evolution data', JSON.stringify([...A.inbox].reverse().find((m) => m.state)?.state.players.map((p) => p.squad?.evo)) === JSON.stringify(st.players.map((p) => p.squad?.evo)));
  A.ws.send(JSON.stringify({ t: 'emote', matchId: id, e: '🔥' }));
  A.ws.send(JSON.stringify({ t: 'emote', matchId: id, e: 'EZ' })); // within 3 s: dropped
  A.ws.send(JSON.stringify({ t: 'emote', matchId: id, e: '<script>' })); // not an emote
  await sleep(400);
  const got = B.inbox.filter((m) => m.t === 'emote');
  check('emote 🔥 reaches the opponent, the 2nd within 3 s and a fake emote are dropped', got.length === 1 && got[0].e === '🔥' && got[0].from === pa, got);
  check('…and the sender sees it too', A.inbox.filter((m) => m.t === 'emote').length === 1);
  A.ws.close();
  B.ws.close();
  // fixed bugs
  check('BUG FIX: nickname "constructor" / "__proto__" → clear error, no 500', (await api('/api/auth', { nickname: 'constructor', password: 'pass1234' })).status === 400 && (await api('/api/auth', { nickname: '__proto__', password: 'pass1234' })).status === 400);
  check('BUG FIX: favourites only take real players', (await api('/api/favorites', { token: VT, playerId: 'constructor', on: true })).status === 400 && (await api('/api/favorites', { token: VT, playerId: 'toString', on: true })).status === 400);
  const ex = await api('/api/events/hong/exchange', { token: VT, grade: 'constructor', nonce: nonce() });
  check('BUG FIX: 홍 exchange with a fake grade → plain error (no code in the message)', ex.status === 400 && !/function|native/.test(ex.message ?? ''), ex.message);
  check('BUG FIX: pack kind "constructor" → unknown pack (400)', (await api('/api/packs/open', { token: VT, kind: 'constructor' })).status === 400);
  const hn = nonce();
  await api('/api/events/hong/draw', { token: VT, count: 1, nonce: hn });
  const ex2 = await api('/api/events/hong/exchange', { token: VT, grade: 'bronze', nonce: hn });
  check('BUG FIX: a draw nonce reused for an exchange is a NEW exchange (not the draw answer)', ex2.ok && !ex2.results && ex2.reward?.grade === 'bronze');
  check('홍 draw now 100 FV / 1,000 FV', judge.HONG.costOne === 100 && judge.HONG.costTen === 1000);
  check('감자의 제왕 now 20 rounds, same rules', judge.POTATO.rounds === 20 && judge.POTATO.cost === 50 && judge.potatoRound(20, Math.random).length === 3);
} catch (e) {
  console.error(e);
  fails++;
} finally {
  srv.kill();
}
console.log(fails ? `${fails} UPDATE 10 SERVER CHECK(S) FAILED` : 'ALL UPDATE 10 SERVER CHECKS PASSED');
process.exit(fails ? 1 : 0);
