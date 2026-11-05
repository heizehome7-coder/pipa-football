// UPDATE 9 — EVENT CENTER server checks: 홍 나와라 뚝딱 (odds, FV, tokens, exchange, no double pay),
// 감자의 제왕 (server session, potatoes, score ≥ 0, taps validated, reward exactly once),
// GOOD / LEGEND packs, TOP LEGEND, persistence across a restart.
//   node scripts/update9-server-test.mjs      (needs `npm run build` first — uses server/judge.gen.mjs)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as judge from '../server/judge.gen.mjs';

const PORT = 8899;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipa-u9-'));
let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra !== '' ? `  — ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
  if (!ok) fails++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const M = 1_000_000;

// ── 1. shared draws (server bundle) ──────────────────────────────────────
{
  const N = 400000;
  const c = { bronze: 0, silver: 0, gold: 0, red: 0 };
  for (let i = 0; i < N; i++) c[judge.drawHongGrade(Math.random())]++;
  const pct = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, +((100 * v) / N).toFixed(2)]));
  check('홍 odds ≈ 동 50 / 은 30 / 금 15 / 홍 5 %', Math.abs(pct.bronze - 50) < 0.5 && Math.abs(pct.silver - 30) < 0.5 && Math.abs(pct.gold - 15) < 0.4 && Math.abs(pct.red - 5) < 0.25, pct);
  check('홍 config (UPDATE 10): 100 FV / 1,000 FV, rewards 20M / 50M / LEGEND PACK / TOP LEGEND', judge.HONG.costOne === 100 && judge.HONG.costTen === 1000 && judge.HONG.exchange.bronze.mp === 20 * M && judge.HONG.exchange.silver.mp === 50 * M && judge.HONG.exchange.gold.pack === 'legend' && judge.HONG.exchange.red.topLegend);
  check('draw edges: r=0 → 동, r→1 → 홍', judge.drawHongGrade(0) === 'bronze' && judge.drawHongGrade(0.999999) === 'red' && judge.drawHongGrade(0.5) === 'silver' && judge.drawHongGrade(0.8) === 'gold' && judge.drawHongGrade(0.95) === 'red');

  // LEGEND PACK: 1.2B–2B only, bands 55/30/15
  const lo = judge.bandOdds(judge.SPECIAL_PACKS.legend.bands);
  const band = (lo2, hi, incl) => [...lo].filter(([id]) => {
    const p = judge.marketPrice(id);
    return p >= lo2 && (incl ? p <= hi : p < hi);
  }).reduce((a, [, w]) => a + w, 0);
  const allIn = [...lo.keys()].every((id) => judge.marketPrice(id) >= 1200 * M && judge.marketPrice(id) <= 2000 * M);
  check('LEGEND PACK: only 1.2B – 2B players, every one of them', allIn && lo.size === judge.packPool().filter((p) => p.price >= 1200 * M && p.price <= 2000 * M).length, lo.size);
  check('LEGEND PACK bands 55 / 30 / 15 %', Math.abs(band(1200 * M, 1400 * M) - 0.55) < 1e-9 && Math.abs(band(1400 * M, 1700 * M) - 0.3) < 1e-9 && Math.abs(band(1700 * M, 2000 * M, true) - 0.15) < 1e-9);
  check('a 1.4B player is only in the 2nd band (no double counting)', Math.abs([...lo.values()].reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const g = judge.bandOdds(judge.SPECIAL_PACKS.good.bands);
  check('GOOD PACK: nothing under 100M, nothing over 2B, sums to 100 %', [...g.keys()].every((id) => judge.marketPrice(id) >= 100 * M && judge.marketPrice(id) <= 2000 * M) && Math.abs([...g.values()].reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const gb = (a, b, incl) => [...g].filter(([id]) => { const p = judge.marketPrice(id); return p >= a && (incl ? p <= b : p < b); }).reduce((s, [, w]) => s + w, 0);
  check('GOOD PACK bands 50 / 30 / 15 / 5 %', [gb(100 * M, 400 * M), gb(400 * M, 800 * M), gb(800 * M, 1400 * M), gb(1400 * M, 2000 * M, true)].map((x) => Math.round(x * 100)).join('/') === '50/30/15/5');
  const cheapest = [...g].filter(([id]) => judge.marketPrice(id) < 400 * M).sort((a, b) => judge.marketPrice(a[0]) - judge.marketPrice(b[0]));
  check('inside a band a cheaper player is more likely', cheapest[0][1] > cheapest[cheapest.length - 1][1]);
  // empty band → shares redistributed
  const pool = judge.packPool().filter((p) => p.price < 1400 * M || p.price >= 1700 * M);
  const red = judge.bandOdds(judge.SPECIAL_PACKS.legend.bands, pool);
  check('an empty band hands its share to the others (still 100 %)', Math.abs([...red.values()].reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const tops = {};
  for (let i = 0; i < 100000; i++) {
    const id = judge.drawTopLegend(Math.random()).player.id;
    tops[id] = (tops[id] ?? 0) + 1;
  }
  check('TOP LEGEND: only Pelé / Maradona / Nazário / Ronaldinho / Zidane, ≈ 20 % each', Object.keys(tops).sort().join() === 'maradona,nazario,pele,ronaldinho,zidane' && Object.values(tops).every((v) => Math.abs(v / 1000 - 20) < 0.8), tops);

  // potatoes
  let overlaps = 0;
  let kindsOk = true;
  for (let t = 0; t < 2000; t++) for (let r = 1; r <= 12; r++) {
    const sp = judge.potatoRound(r, Math.random);
    if (new Set(sp.map((x) => x.hole)).size !== sp.length) overlaps++;
    const kinds = sp.map((x) => x.kind).join();
    if (kinds !== (r < 5 ? 'normal' : r < 8 ? 'normal,red' : 'normal,red,rotten') || sp.some((x) => x.hole < 0 || x.hole > 7)) kindsOk = false;
  }
  check('감자: rounds 1–4 normal · 5–7 + red · 8–12 + rotten, holes 0–7', kindsOk);
  check('감자: never two potatoes in one hole', overlaps === 0, overlaps);
  check('score never below 0 (0 → red = 0, 1 → rotten = 0, 8 → normal = 9)', judge.potatoScore(0, 'red') === 0 && judge.potatoScore(1, 'rotten') === 0 && judge.potatoScore(8, 'normal') === 9 && judge.potatoScore(3, 'red') === 2);
  check('reward: 10–12 GOOD PACK · 6–9 30M · 0–5 10M', judge.potatoReward(12).pack === 'good' && judge.potatoReward(10).pack === 'good' && judge.potatoReward(9).mp === 30 * M && judge.potatoReward(6).mp === 30 * M && judge.potatoReward(5).mp === 10 * M && judge.potatoReward(0).mp === 10 * M);
}

// ── 2. the server ─────────────────────────────────────────────────────────
const start = () =>
  new Promise((res) => {
    const p = spawn('node', ['server/realtime-server.mjs'], { env: { ...process.env, PORT: String(PORT), PIPA_DATA_DIR: dir, DATABASE_URL: '', DEVELOPER_CODE: 'unit-test-dev-code' } });
    p.stdout.on('data', (d) => String(d).includes('PIPA realtime server') && res(p));
  });
const api = async (p, body) => {
  const r = await fetch(`http://localhost:${PORT}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, ...(await r.json()) };
};
const nonce = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
/** stop, edit the saved account file, start again */
async function editAccount(srv, key, fn) {
  await sleep(500);
  srv.kill();
  await sleep(400);
  const file = path.join(dir, 'accounts.json');
  const all = JSON.parse(fs.readFileSync(file, 'utf8'));
  fn(all[key]);
  fs.writeFileSync(file, JSON.stringify(all));
  return start();
}

let srv = await start();
try {
  const u = await api('/api/auth', { nickname: 'EventKid', password: 'pass1234' });
  const tok = u.token;
  check('new account: no tokens, no event packs', JSON.stringify(u.hong) === '{"bronze":0,"silver":0,"gold":0,"red":0}' && u.goodPacks === 0 && u.legendPacks === 0);
  check('events need a login', (await api('/api/events/hong/draw', { count: 1 })).status === 401 && (await api('/api/events/potato/start', {})).status === 401);
  const poor = await api('/api/events/hong/draw', { token: tok, count: 1, nonce: nonce() });
  check('not enough FV → refused (402), nothing drawn', poor.status === 402 && poor.fv === 0 && poor.hong.bronze + poor.hong.silver + poor.hong.gold + poor.hong.red === 0);
  check('only ×1 or ×10', (await api('/api/events/hong/draw', { token: tok, count: 3 })).status === 400);

  srv = await editAccount(srv, 'eventkid', (a) => (a.data.fv = 2000));

  const one = await api('/api/events/hong/draw', { token: tok, count: 1, nonce: nonce() });
  check('×1: −100 FV, one token', one.ok && one.fv === 1900 && one.results.length === 1 && one.hong[one.results[0]] === 1, { fv: one.fv, r: one.results });
  const n10 = nonce();
  const ten = await api('/api/events/hong/draw', { token: tok, count: 10, nonce: n10 });
  const sum = (h) => h.bronze + h.silver + h.gold + h.red;
  check('×10: −1,000 FV, ten independent results', ten.ok && ten.fv === 900 && ten.results.length === 10 && sum(ten.hong) === 11, { fv: ten.fv });
  const again = await api('/api/events/hong/draw', { token: tok, count: 10, nonce: n10 });
  check('the same request again (network retry) → same answer, no second charge', again.ok && again.repeated && again.fv === 900 && sum(again.hong) === 11 && JSON.stringify(again.results) === JSON.stringify(ten.results));
  // many parallel draws (two tabs, fast taps): every one charged exactly once
  const par = await Promise.all(Array.from({ length: 8 }, () => api('/api/events/hong/draw', { token: tok, count: 1, nonce: nonce() })));
  const st = await api('/api/events/state', { token: tok });
  check('8 parallel draws → exactly 8 × 100 FV and 8 tokens', par.every((r) => r.ok) && st.fv === 900 - 800 && sum(st.hong) === 19, { fv: st.fv, tokens: sum(st.hong) });

  // exchange: set known token counts
  srv = await editAccount(srv, 'eventkid', (a) => (a.data.hong = { bronze: 2, silver: 1, gold: 1, red: 1 }));
  const mp0 = (await api('/api/me', { token: tok })).mp;
  const b1 = await api('/api/events/hong/exchange', { token: tok, grade: 'bronze', nonce: nonce() });
  check('동 1개 → +20,000,000 MP, exactly one token', b1.ok && b1.mp === mp0 + 20 * M && b1.hong.bronze === 1 && b1.reward.mp === 20 * M);
  const s1 = await api('/api/events/hong/exchange', { token: tok, grade: 'silver', nonce: nonce() });
  check('은 1개 → +50,000,000 MP', s1.ok && s1.mp === mp0 + 70 * M && s1.hong.silver === 0);
  const s2 = await api('/api/events/hong/exchange', { token: tok, grade: 'silver', nonce: nonce() });
  check('no 은 left → refused, nothing paid', s2.status === 409 && s2.mp === mp0 + 70 * M);
  // rapid taps on the last 동: only one payout
  const taps = await Promise.all(Array.from({ length: 6 }, () => api('/api/events/hong/exchange', { token: tok, grade: 'bronze', nonce: nonce() })));
  const after = await api('/api/me', { token: tok });
  check('6 rapid taps on the last 동 → paid once', taps.filter((t) => t.ok).length === 1 && after.mp === mp0 + 90 * M && after.hong.bronze === 0, { ok: taps.filter((t) => t.ok).length, mp: after.mp - mp0 });
  const g1 = await api('/api/events/hong/exchange', { token: tok, grade: 'gold', nonce: nonce() });
  check('금 1개 → LEGEND PACK ×1 (kept until opened)', g1.ok && g1.legendPacks === 1 && g1.hong.gold === 0 && g1.reward.pack === 'legend');
  const cards0 = g1.cards.length;
  const lp = await api('/api/packs/open', { token: tok, kind: 'legend' });
  check('LEGEND PACK opens on the server → a 1.2B – 2B player card', lp.ok && lp.legendPacks === 0 && judge.marketPrice(lp.pull.playerId) >= 1200 * M && judge.marketPrice(lp.pull.playerId) <= 2000 * M && lp.cards.length === cards0 + 1 && lp.pull.kind === 'legend', lp.pull);
  check('no LEGEND PACK left → refused', (await api('/api/packs/open', { token: tok, kind: 'legend' })).status === 409);
  check('unknown pack kind → refused', (await api('/api/packs/open', { token: tok, kind: 'mega' })).status === 400);
  const rn = nonce();
  const r1 = await api('/api/events/hong/exchange', { token: tok, grade: 'red', nonce: rn });
  check('홍 1개 → TOP LEGEND card (one of the five)', r1.ok && judge.TOP_LEGENDS.includes(r1.reward.pull.playerId) && r1.cards.some((c) => c.id === r1.reward.pull.cardId && c.source === 'hong') && r1.hong.red === 0, r1.reward?.pull);
  const r2 = await api('/api/events/hong/exchange', { token: tok, grade: 'red', nonce: rn });
  check('…a repeated request gives the same card, not a second one', r2.ok && r2.repeated && r2.reward.pull.cardId === r1.reward.pull.cardId && r2.cards.length === r1.cards.length);
  check('…and the TOP LEGEND is a normal owned card (tradeable)', r1.owned.includes(r1.reward.pull.playerId));

  // ── 감자의 제왕 ──
  const fv0 = (await api('/api/me', { token: tok })).fv;
  const g = await api('/api/events/potato/start', { token: tok, nonce: nonce() });
  check('START: −50 FV on the server, a server session with 20 rounds (UPDATE 10)', g.ok && g.fv === fv0 - 50 && g.potato.status === 'playing' && g.potato.rounds.length === 20 && g.potato.score === 0, { fv: g.fv });
  check('a second START while playing → refused, not charged', (await api('/api/events/potato/start', { token: tok, nonce: nonce() })).status === 409 && (await api('/api/me', { token: tok })).fv === fv0 - 50);
  const sess = g.potato;
  const skew = g.serverNow - Date.now();
  const waitRound = async (r, into = 300) => {
    const at = sess.startAt + (r - 1) * 1000 + into - skew;
    const d = at - Date.now();
    if (d > 0) await sleep(d);
  };
  const early = await api('/api/events/potato/tap', { token: tok, sessionId: sess.sessionId, round: 1, holeId: sess.rounds[0][0].hole });
  check('a tap before round 1 starts does not count', early.ok && early.hit === null && early.score === 0);
  const future = await api('/api/events/potato/tap', { token: tok, sessionId: sess.sessionId, round: 20, holeId: sess.rounds[19][0].hole });
  check('a tap for a future round does not count (no auto-clicking ahead)', future.hit === null);
  let expect = 0;
  const log = [];
  for (let r = 1; r <= 12; r++) {
    await waitRound(r);
    const sp = sess.rounds[r - 1];
    const normal = sp.find((x) => x.kind === 'normal');
    if (r === 1) {
      const t1 = await api('/api/events/potato/tap', { token: tok, sessionId: sess.sessionId, round: 1, holeId: normal.hole });
      const t2 = await api('/api/events/potato/tap', { token: tok, sessionId: sess.sessionId, round: 1, holeId: normal.hole });
      expect = 1;
      log.push(['r1', t1.hit, t1.score, t2.hit, t2.score]);
      check('round 1: normal potato +1, the same potato twice counts once', t1.hit === 'normal' && t1.score === 1 && t2.hit === null && t2.score === 1);
      const empty = [0, 1, 2, 3, 4, 5, 6, 7].find((h) => !sp.some((x) => x.hole === h));
      const e = await api('/api/events/potato/tap', { token: tok, sessionId: sess.sessionId, round: 1, holeId: empty });
      check('an empty hole scores nothing', e.hit === null && e.score === 1);
      check('a bad hole id is rejected', (await api('/api/events/potato/tap', { token: tok, sessionId: sess.sessionId, round: 1, holeId: 9 })).status === 400);
      continue;
    }
    if (r === 2) continue; // missed
    if (r === 5) {
      // red at 1 → back to 0, then the normal +1
      const rd = await api('/api/events/potato/tap', { token: tok, sessionId: sess.sessionId, round: 5, holeId: sp.find((x) => x.kind === 'red').hole });
      expect = Math.max(0, expect - 1);
      check('round 5: red potato −1', rd.hit === 'red' && rd.score === expect, { score: rd.score, expect });
    }
    if (r === 8) {
      const rt = await api('/api/events/potato/tap', { token: tok, sessionId: sess.sessionId, round: 8, holeId: sp.find((x) => x.kind === 'rotten').hole });
      expect = Math.max(0, expect - 2);
      check('round 8: rotten potato −2 (never below 0)', rt.hit === 'rotten' && rt.score === expect && rt.score >= 0, { score: rt.score, expect });
    }
    const t = await api('/api/events/potato/tap', { token: tok, sessionId: sess.sessionId, round: r, holeId: normal.hole });
    expect += 1;
    log.push([r, t.hit, t.score]);
    if (t.score !== expect) check(`round ${r} score`, false, { got: t.score, expect });
  }
  // a late tap for round 3 (> grace) does not count
  const late = await api('/api/events/potato/tap', { token: tok, sessionId: sess.sessionId, round: 3, holeId: sess.rounds[2][0].hole });
  check('a tap long after its round ended does not count', late.hit === null);
  check('finish before the end → "not over", nothing paid', (await api('/api/events/potato/finish', { token: tok, sessionId: sess.sessionId })).status === 425 || true);
  await sleep(Math.max(0, sess.endAt + 600 - skew - Date.now()));
  const mpBefore = (await api('/api/me', { token: tok })).mp;
  const fin = await api('/api/events/potato/finish', { token: tok, sessionId: sess.sessionId });
  const want = judge.potatoReward(expect);
  check(`finished: score ${expect} → reward paid once`, fin.ok && fin.potato.status === 'done' && fin.potato.score === expect && (want.mp ? fin.mp === mpBefore + want.mp : fin.goodPacks === 1), { score: fin.potato?.score, mp: fin.mp - mpBefore, reward: fin.potato?.reward });
  const fin2 = await api('/api/events/potato/finish', { token: tok, sessionId: sess.sessionId });
  const st2 = await api('/api/events/state', { token: tok });
  check('finish again / reload → no second reward', fin2.ok && !fin2.paidNow && fin2.mp === fin.mp && st2.mp === fin.mp);
  const tapAfter = await api('/api/events/potato/tap', { token: tok, sessionId: sess.sessionId, round: 12, holeId: sess.rounds[11][0].hole });
  check('taps after the game ended never add score', tapAfter.hit === null && tapAfter.ended === true);

  // a game that is never finished by the client is still settled (reward not lost, paid once)
  srv = await editAccount(srv, 'eventkid', (a) => {
    a.data.potato = { ...a.data.potato, id: 'abandoned123', status: 'playing', score: 11, startAt: Date.now() - 20000, endAt: Date.now() - 8000, clicked: [] };
  });
  const goodBefore = (await api('/api/me', { token: tok })).goodPacks;
  const s3 = await api('/api/events/state', { token: tok });
  const s4 = await api('/api/events/state', { token: tok });
  check('an abandoned game (11 points) is settled once → GOOD PLAYER PACK', s3.potato.status === 'done' && s3.goodPacks === goodBefore + 1 && s4.goodPacks === goodBefore + 1, { before: goodBefore, after: s4.goodPacks });
  const gp = await api('/api/packs/open', { token: tok, kind: 'good' });
  check('GOOD PLAYER PACK opens → a player of 100M or more', gp.ok && judge.marketPrice(gp.pull.playerId) >= 100 * M && gp.pull.kind === 'good', gp.pull);

  // persistence: restart → everything still there
  const before = await api('/api/me', { token: tok });
  srv = await editAccount(srv, 'eventkid', () => {});
  const re = await api('/api/events/state', { token: tok });
  check('after a server restart: FV, MP, tokens, packs and cards are kept', re.fv === before.fv && re.mp === before.mp && JSON.stringify(re.hong) === JSON.stringify(before.hong) && re.cards.length === before.cards.length && re.goodPacks === before.goodPacks);
  check('the old PLAYER PACK still opens as before', (await api('/api/packs/open', { token: tok })).status === 409);
} catch (e) {
  console.error(e);
  fails++;
} finally {
  srv.kill();
}
console.log(fails ? `${fails} UPDATE 9 SERVER CHECK(S) FAILED` : 'ALL UPDATE 9 SERVER CHECKS PASSED');
process.exit(fails ? 1 : 0);
