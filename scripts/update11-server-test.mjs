// UPDATE 11 — server checks: evolution rates by material grade (server = screen), 조현선 20억,
// 32 new players in the catalogue, DEVELOPER 재화 회수 (MP / FV, never below 0, logged, needs the
// developer token), SUBSTITUTES saved on the account (owned only, no duplicates, max 5).
// MATCH SYSTEM EXPANSION: MATCH SQUAD saved apart (owned only, 4-3-3H, 11 + 4), defenders
// for sale again (buy / sell) but never a penalty / free-kick kicker, the weekday ACCESS LOCK
// (server clock, PIPA_CLOCK_OVERRIDE in tests only), developer OPEN / AUTO kept after a restart,
// online matches refused while locked.
//   node scripts/update11-server-test.mjs      (needs `npm run build` first — uses server/judge.gen.mjs)
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import * as judge from '../server/judge.gen.mjs';

const PORT = 8911;
const DEV = 'unit-test-dev-code';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipa-u11-'));
let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra !== '' ? `  — ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
  if (!ok) fails++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const M = 1_000_000;

// ── 1. shared rules (the same module the phone uses) ──────────────────────
{
  const grades = [130, 135, 140, 145, 150];
  let mono = true;
  for (let lv = 0; lv < 12; lv++)
    for (const pOvr of [80, 95, 120, 133, 140, 147, 152]) {
      const r = grades.map((g) => judge.evoSuccessRate(lv, g, pOvr));
      for (let i = 1; i < 5; i++) if (!(r[i] > r[i - 1])) mono = false;
    }
  check('same player, same step: OVR 130 < 135 < 140 < 145 < 150 (every step, every player OVR)', mono);
  check('+11 → +12 stays very hard even with OVR 150 (< 1.25 %)', judge.evoSuccessRate(11, 150, 100) < 0.0125 && judge.evoSuccessRate(11, 150, 100) > 0.0075);
  check('+9 → +10 with OVR 150 < 8 % · +0 → +1 never reaches 95 %', judge.evoSuccessRate(9, 150, 100) < 0.08 && judge.evoSuccessRate(0, 150, 60) < 0.95);
  check('lower material than the player ×0.70, higher ×1.12 (OVR 140 at +3: 0.6 × 0.9 × …)', Math.abs(judge.evoSuccessRate(3, 140, 141) - 0.6 * 0.9 * 0.7) < 1e-6 && Math.abs(judge.evoSuccessRate(3, 140, 140) - 0.6 * 0.9) < 1e-6 && Math.abs(judge.evoSuccessRate(3, 140, 139) - Math.round(0.6 * 0.9 * 1.12 * 1e7) / 1e7) < 1e-6);
  check('조현선 2,000,000,000 MP, POWER 99, THUNDER STRIKE', judge.marketPrice('chohyunsun') === 2000 * M && judge.getPlayer('chohyunsun').stats.power === 99 && judge.getPlayer('chohyunsun').special === 'THUNDER_STRIKE');
  check('other prices unchanged (송인우 3.6억 · 김태인 11.5억 · 메시 free)', judge.marketPrice('songinwoo') === 360 * M && judge.marketPrice('kimtaein') === 1150 * M);
  const ids = ['kimtaei', 'kimdongmin', 'grealish', 'trossard', 'ferrantorres', 'ansufati', 'malen', 'diaby', 'brennanjohnson', 'nicogonzalez', 'correa', 'depaul', 'locelso', 'nkunku', 'morata', 'asensio', 'pedrogoncalves', 'isco', 'zaha', 'aubameyang', 'haller', 'dimaria', 'unaisimon', 'ramsdale', 'petrovic', 'pope', 'leno', 'puskas', 'gerdmuller', 'zico', 'platini', 'davidsilva'];
  check('32 new players in the server catalogue, buyable (none a defender)', ids.length === 32 && ids.every((id) => judge.getPlayer(id) && judge.isBuyable(id)));
  check('ICON prices: 푸스카스 18억 · 뮐러 14.5억 · 지쿠 12.5억 · 플라티니 13.5억 · 실바 10.5억', judge.marketPrice('puskas') === 1800 * M && judge.marketPrice('gerdmuller') === 1450 * M && judge.marketPrice('zico') === 1250 * M && judge.marketPrice('platini') === 1350 * M && judge.marketPrice('davidsilva') === 1050 * M);
}

// ── 2. the server ─────────────────────────────────────────────────────────
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const acct = (nick, token, data) => ({ key: nick.toLowerCase(), nickname: nick, salt: 'aa', hash: 'x', tokens: [sha(token)], createdAt: '2026-01-01', data: { v6: true, season: 1, mp: 0, owned: [], rewards: [], ...data } });
const PT = 'player01-token-0123456789';
const PT2 = 'player02-token-0123456789';
const PT3 = 'player03-token-0123456789';
fs.writeFileSync(path.join(dir, 'accounts.json'), JSON.stringify({
  player02: acct('PLAYER02', PT2, { mp: 3000 * M, owned: ['vandijk', 'saliba', 'davies', 'hakimi', 'kimtaei', 'hanyujun'], squad: { penaltyOrder: ['mbappe', 'messi', 'ronaldo', 'neymar', 'yamal'], goalkeeperId: 'courtois', freeKickTakerId: 'messi' } }),
  player03: acct('PLAYER03', PT3, { mp: 0 }),
  player01: acct('PLAYER01', PT, { mp: 500 * M, fv: 2500, owned: ['kimtaei', 'puskas'], squad: { penaltyOrder: ['mbappe', 'messi', 'ronaldo', 'neymar', 'yamal'], goalkeeperId: 'courtois', freeKickTakerId: 'messi' } }),
}));
const SAT = '2026-11-07T12:00:00+09:00';
const MON = '2026-11-09T10:00:00+09:00';
const start = (clock = SAT) =>
  new Promise((res) => {
    const p = spawn('node', ['server/realtime-server.mjs'], { env: { ...process.env, PORT: String(PORT), PIPA_DATA_DIR: dir, DATABASE_URL: '', DEVELOPER_CODE: DEV, PIPA_CLOCK_OVERRIDE: clock } });
    p.stdout.on('data', (d) => String(d).includes('PIPA realtime server') && res(p));
  });
const api = async (p, body) => {
  const r = await fetch(`http://localhost:${PORT}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};
let srv = await start();
try {
  await sleep(300);
  const dt = (await api('/api/dev/auth', { code: DEV })).devToken;
  check('developer login', typeof dt === 'string' && dt.length > 10);
  // ── 재화 회수
  check('no developer token → refused', (await api('/api/dev/remove-currency', { devToken: 'nope', nickname: 'PLAYER01', currency: 'mp', amount: 1 })).status === 401);
  check('a client cannot change a balance itself (no such field on /api/me)', (await api('/api/me', { token: PT, mp: 9e12 })).mp === 500 * M);
  const r1 = await api('/api/dev/remove-currency', { devToken: dt, nickname: 'PLAYER01', currency: 'mp', amount: 100 * M });
  check('회수 100,000,000 MP: 500,000,000 → 400,000,000', r1.ok && r1.before === 500 * M && r1.after === 400 * M, r1);
  const r2 = await api('/api/dev/remove-currency', { devToken: dt, nickname: 'PLAYER01', currency: 'mp', amount: 400 * M + 1 });
  check('more than the balance → refused, nothing taken (never below 0)', r2.status === 409 && (await api('/api/me', { token: PT })).mp === 400 * M, r2.status);
  for (const bad of [0, -5, 1.5, '100', null, 1e20])
    if ((await api('/api/dev/remove-currency', { devToken: dt, nickname: 'PLAYER01', currency: 'mp', amount: bad })).status !== 400) check(`bad amount ${bad} refused`, false);
  check('amount must be a positive whole number (0, −5, 1.5, "100", null, 1e20 refused)', true);
  check('only MP or FV', (await api('/api/dev/remove-currency', { devToken: dt, nickname: 'PLAYER01', currency: 'tokens', amount: 1 })).status === 400);
  check('unknown user → 404', (await api('/api/dev/remove-currency', { devToken: dt, nickname: 'NOBODY', currency: 'fv', amount: 1 })).status === 404);
  const r3 = await api('/api/dev/remove-currency', { devToken: dt, nickname: 'player01', currency: 'fv', amount: 2500 });
  const me = await api('/api/me', { token: PT });
  check('회수 2,500 FV → 0 FV exactly (nickname in any case)', r3.ok && me.fv === 0 && me.mp === 400 * M, { fv: me.fv });
  const par = await Promise.all(Array.from({ length: 6 }, () => api('/api/dev/remove-currency', { devToken: dt, nickname: 'PLAYER01', currency: 'mp', amount: 100 * M })));
  const me2 = await api('/api/me', { token: PT });
  check('6 parallel 회수 of 100M from 400M → exactly 4 succeed, balance 0', par.filter((r) => r.ok).length === 4 && me2.mp === 0, { ok: par.filter((r) => r.ok).length, mp: me2.mp });
  const lg = await api('/api/dev/log', { devToken: dt });
  const rm = lg.actions.filter((a) => a.action === 'DEVELOPER_REMOVE_CURRENCY');
  check('logged as DEVELOPER_REMOVE_CURRENCY {targetUserId, currency, amount, timestamp}', rm.length === 6 && rm.every((a) => a.targetUserId === 'player01' && ['MP', 'FV'].includes(a.currency) && a.amount > 0 && a.timestamp), rm[0]);

  // ── SUBSTITUTES
  const base = { penaltyOrder: ['mbappe', 'messi', 'ronaldo', 'neymar', 'yamal'], goalkeeperId: 'courtois', freeKickTakerId: 'messi' };
  const ok = await api('/api/squad', { token: PT, squad: { ...base, subs: ['kimtaei', 'puskas', 'son', 'neuer'] } });
  const me3 = await api('/api/me', { token: PT });
  check('SUBSTITUTES saved on the account (owned + starters, a bench keeper too)', ok.ok && JSON.stringify(me3.squad.subs) === JSON.stringify(['kimtaei', 'puskas', 'son', 'neuer']), me3.squad);
  check('…penalty order / free-kick taker unchanged', JSON.stringify(me3.squad.penaltyOrder) === JSON.stringify(base.penaltyOrder) && me3.squad.freeKickTakerId === 'messi');
  check('a player not owned on the bench → refused', (await api('/api/squad', { token: PT, squad: { ...base, subs: ['zico'] } })).status === 403);
  check('the same player twice on the bench → refused', (await api('/api/squad', { token: PT, squad: { ...base, subs: ['son', 'son'] } })).status === 400);
  check('a starter on the bench too → refused', (await api('/api/squad', { token: PT, squad: { ...base, subs: ['messi'] } })).status === 400);
  check('the keeper on the bench too → refused', (await api('/api/squad', { token: PT, squad: { ...base, subs: ['courtois'] } })).status === 400);
  check('more than 5 on the bench → refused', (await api('/api/squad', { token: PT, squad: { ...base, subs: ['son', 'kane', 'haaland', 'vinicius', 'salah', 'rodri'] } })).status === 400);
  check('an old client (no subs) still saves', (await api('/api/squad', { token: PT, squad: base })).ok);
  // a bench player can't be sold (he is in the squad)
  await api('/api/squad', { token: PT, squad: { ...base, subs: ['kimtaei'] } });
  const sell = await api('/api/market/sell', { token: PT, playerId: 'kimtaei', price: 300 * M });
  check('a SUBSTITUTE is part of the squad → cannot be listed', sell.status >= 400, sell.status);

  // ── MATCH SQUAD (apart from the penalty squad)
  const XI = { GK: 'courtois', LB: 'davies', LCB: 'vandijk', RCB: 'saliba', RB: 'hakimi', CDM: 'rodri', LCM: 'bellingham', RCM: 'kimtaei', LW: 'neymar', ST: 'mbappe', RW: 'messi' };
  const MS = { formation: '4-3-3H', xi: XI, subs: ['son', 'kane', 'hanyujun', 'neuer'] };
  const ms1 = await api('/api/match-squad', { token: PT2, matchSquad: MS });
  const me5 = await api('/api/me', { token: PT2 });
  check('MATCH SQUAD saved on the account (4-3-3H, 11 + 4, bought defenders + free starters)', ms1.ok && me5.matchSquad?.xi?.LCB === 'vandijk' && me5.matchSquad.subs.length === 4, ms1.message);
  check('…the penalty squad (order / FK taker) untouched', JSON.stringify(me5.squad.penaltyOrder) === JSON.stringify(['mbappe', 'messi', 'ronaldo', 'neymar', 'yamal']) && me5.squad.freeKickTakerId === 'messi');
  check('a player not owned in the MATCH SQUAD → 403', (await api('/api/match-squad', { token: PT2, matchSquad: { ...MS, xi: { ...XI, ST: 'pele' } } })).status === 403);
  check('5 subs / a duplicate / a GK in the field → 400', (await api('/api/match-squad', { token: PT2, matchSquad: { ...MS, subs: [...MS.subs, 'yamal'] } })).status === 400 && (await api('/api/match-squad', { token: PT2, matchSquad: { ...MS, subs: ['messi'] } })).status === 400 && (await api('/api/match-squad', { token: PT2, matchSquad: { ...MS, xi: { ...XI, ST: 'neuer' } } })).status === 400);
  check('a non-defender in the back four is allowed (out of position)', (await api('/api/match-squad', { token: PT2, matchSquad: { ...MS, xi: { ...XI, LB: 'salah' } } })).ok);
  // ── defenders: for sale again, never a kicker
  const b1 = await api('/api/market/buy', { token: PT2, playerId: 'rudiger' });
  check('a DEFENDER can be bought again (Rüdiger)', b1.ok && (b1.owned ?? (await api('/api/me', { token: PT2 })).owned).includes('rudiger'), b1.message);
  check('the new CB 한유준 is in the catalogue (45,000,000), buyable', judge.marketPrice('hanyujun') === 45 * M && judge.isBuyable('hanyujun'));
  check('4 new PIPA originals on the server (장영광 160M · 이주성 270M · 김근호 850M, POWER 105)', judge.marketPrice('jangyounggwang') === 160 * M && judge.marketPrice('leejusung') === 270 * M && judge.marketPrice('kimgeunho') === 850 * M && judge.getPlayer('kimgeunho').stats.power === 105);
  const kick = await api('/api/squad', { token: PT2, squad: { penaltyOrder: ['vandijk', 'messi', 'ronaldo', 'neymar', 'yamal'], goalkeeperId: 'courtois', freeKickTakerId: 'messi' } });
  check('a defender as a PENALTY kicker → refused (defender_kicker)', kick.status === 400 && kick.error === 'defender_kicker', kick);
  const fk = await api('/api/squad', { token: PT2, squad: { penaltyOrder: ['mbappe', 'messi', 'ronaldo', 'neymar', 'yamal'], goalkeeperId: 'courtois', freeKickTakerId: 'hanyujun' } });
  check('a defender as the FREE-KICK taker → refused', fk.status === 400, fk.status);
  const sd = await api('/api/market/sell', { token: PT2, playerId: 'rudiger', price: judge.marketPrice('rudiger') });
  check('a defender can be listed for sale', sd.ok, sd.message);
  check('weekend (SAT 12:00 KST): the game is open', (await api('/api/access', {})).locked === false && (await api('/api/me', { token: PT2 })).ok);
  srv.kill();
  await sleep(400);

  // ── ACCESS LOCK on a weekday (MON 10:00 KST, server clock)
  srv = await start(MON);
  await sleep(300);
  const a1 = await api('/api/access', {});
  check('MON 10:00 KST: locked (mode auto), ends 15:00 KST', a1.locked === true && a1.mode === 'auto' && Date.parse(a1.endsAt) === Date.parse('2026-11-09T15:00:00+09:00'), a1);
  check('…/api/me still answers (session restore, so the phone can show the lock screen)', (await api('/api/me', { token: PT2 })).ok);
  const lk = await api('/api/squad', { token: PT2, squad: { penaltyOrder: ['mbappe', 'messi', 'ronaldo', 'neymar', 'yamal'], goalkeeperId: 'courtois', freeKickTakerId: 'messi' } });
  check('…game APIs answer 423 locked (+ the access state)', lk.status === 423 && lk.error === 'locked' && lk.access?.locked === true, lk.status);
  check('…market / packs / squads also locked', (await api('/api/market/buy', { token: PT2, playerId: 'kimtaei' })).status === 423 && (await api('/api/match-squad', { token: PT2, matchSquad: MS })).status === 423);
  check('…login still works', (await api('/api/auth', { nickname: 'NEWBIE', password: 'pass1234' })).ok);
  const dt2 = (await api('/api/dev/auth', { code: DEV })).devToken;
  check('…the developer can log in', typeof dt2 === 'string');
  // online match while locked: refused, no endless waiting
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
      ws.on('error', () => res({ ws, inbox }));
    });
  const A = await sock(PT2);
  const B = await sock(PT3);
  const sq = { penaltyOrder: ['messi', 'son', 'kane', 'salah', 'yamal'], goalkeeperId: 'courtois', freeKickTakerId: 'messi' };
  A.ws.send(JSON.stringify({ t: 'match:join', matchId: 'locktest11abc', opponentPeer: B.ws.peer, nickname: 'PLAYER02', userId: 'ua', squad: sq, mode: 'penalty' }));
  await sleep(500);
  const err = A.inbox.find((m) => m.t === 'match:error');
  check('…an online match:join → match:error "locked" at once (no endless waiting)', err?.code === 'locked' && !A.inbox.some((m) => m.state), err);
  A.ws.close();
  B.ws.close();
  check('a fake developer token cannot open the game', (await api('/api/dev/access', { devToken: 'nope', mode: 'open' })).status === 401);
  const op = await api('/api/dev/access', { devToken: dt2, mode: 'open' });
  check('DEVELOPER [전체 게임 열기] → open at once', op.ok && op.mode === 'open' && op.locked === false && (await api('/api/stats', { token: PT2 })).status !== 423, op);
  const lg2 = await api('/api/dev/log', { devToken: dt2 });
  check('…logged as DEVELOPER_ACCESS_CONTROL', lg2.actions.some((a) => a.action === 'DEVELOPER_ACCESS_CONTROL' && a.mode === 'open'));
  srv.kill();
  await sleep(400);
  srv = await start(MON);
  await sleep(300);
  check('…still OPEN after a server restart (saved on the server)', (await api('/api/access', {})).mode === 'open' && (await api('/api/stats', { token: PT2 })).status !== 423);
  const dt3 = (await api('/api/dev/auth', { code: DEV })).devToken;
  const au = await api('/api/dev/access', { devToken: dt3, mode: 'auto' });
  check('DEVELOPER [자동 시간 제한 복구] → locked again inside the window', au.ok && au.mode === 'auto' && au.locked === true && (await api('/api/stats', { token: PT2 })).status === 423);
  check('a bad mode → 400', (await api('/api/dev/access', { devToken: dt3, mode: 'xx' })).status === 400);
  await api('/api/dev/access', { devToken: dt3, mode: 'auto' });
} finally {
  srv.kill();
}
console.log(fails ? `${fails} UPDATE 11 SERVER CHECK(S) FAILED` : 'ALL UPDATE 11 SERVER CHECKS PASSED');
process.exit(fails ? 1 : 0);
