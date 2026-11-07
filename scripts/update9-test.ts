// UPDATE 9 — unit checks: Korean names + search, KNUCKLE DRIVE, finesse, Pelé, stronger specials,
// server shot-profile validation, Yashin buff, starter-GK nerf.
//   npx tsx scripts/update9-test.ts
import * as THREE from 'three';
import { FIELD, MODES } from '../src/game/core/config';
import { calculateShotParameters, simulateBallPhysics, KNUCKLE_MAX, type ShotIntent } from '../src/game/physics/BallPhysics';
import { knuckleStroke, shotEnvelope, shotModifiers, KNUCKLE_LIMIT } from '../src/players/abilities';
import { getPlayer, matchesSearch, PLAYERS, SPECIALS } from '../src/players/players';
import { MARKET_ORDER } from '../src/players/market';
import { roundTaker, validShotFor, simulateRound } from '../src/online/match/penaltyRound';
import { Goalkeeper, BLACK_SPIDER } from '../src/game/entities/Goalkeeper';
import { mulberry32 } from '../src/game/core/math';

let failed = 0;
const check = (name: string, ok: boolean, info: unknown = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== '' ? `  — ${JSON.stringify(info)}` : ''}`);
};
const pen = MODES.penalty;
const BALL0 = new THREE.Vector3(0, FIELD.ballRadius, FIELD.penaltySpot);

// ── 1. Korean names everywhere, English shirt; search ─────────────────
{
  const all = MARKET_ORDER.map((id) => getPlayer(id)!).concat(PLAYERS.filter((p) => !MARKET_ORDER.includes(p.id)));
  const hangul = /[가-힣]/;
  check('every player has a Korean name (nameKo) and an English shirt name', all.every((p) => hangul.test(p.nameKo) && /^[A-Z0-9 .'\-ÁÉÍÓÚÃÕÇÜÖİĞŞÑÆØ]+$/i.test(p.shirt)), all.filter((p) => !hangul.test(p.nameKo)).map((p) => p.id));
  check('286 catalogue players (UPDATE 11 patch), unique ids', MARKET_ORDER.length === 286 && new Set(MARKET_ORDER).size === 286);
  const find = (q: string) => all.filter((p) => matchesSearch(p, q)).map((p) => p.id);
  check('search 메시 / messi → Messi', find('메시').includes('messi') && find('messi').includes('messi'));
  check('search 호날두 → Ronaldo (and Ronaldo Nazário 호나우두 not required)', find('호날두').includes('ronaldo'));
  check('search 손흥민 / son heung', find('손흥민').includes('son') && find('heung').includes('son'));
  check('search 야신 / yashin', find('야신').includes('yashin') && find('YASHIN').includes('yashin'));
  check('search ignores accents (gundogan → 귄도안)', find('gundogan').includes('gundogan') && find('귄도안').includes('gundogan'));
  check('search 박지성 / 차범근 (new ICONs)', find('박지성').includes('parkjisung') && find('차범근').includes('chabumkun'));
  check('search nonsense → nothing', find('zzqqxx').length === 0);
}

// ── 2. KNUCKLE DRIVE: easier, stronger, never a 90° turn ───────────────
const ronaldo = getPlayer('ronaldo')!;
const mbappe = getPlayer('mbappe')!;
function flight(intent: ShotIntent) {
  const s = calculateShotParameters(BALL0, intent, pen);
  const tr = simulateBallPhysics(BALL0, s.v as [number, number, number], s.spin, pen, { knuckle: s.knuckle, kseed: s.kseed, ground: false });
  return { s, tr };
}
{
  check('KNUCKLE DRIVE fires from a light-curve fast stroke (read as straight)', knuckleStroke(ronaldo, 1, 0.75, false) && !knuckleStroke(ronaldo, 2, 0.9, false) && !knuckleStroke(mbappe, 1, 0.9, false) && !knuckleStroke(ronaldo, 1, 0.9, true));
  const mr = shotModifiers(ronaldo, { mode: 'penalty', power: 0.66, level: 0, spinSign: 0, lofted: false, low: false });
  const mm = shotModifiers(mbappe, { mode: 'penalty', power: 0.9, level: 0, spinSign: 0, lofted: false, low: false });
  check('Ronaldo: knuckle at power 0.66 (UPDATE 8 needed 0.72), stronger than anyone', mr.special === 'KNUCKLE_DRIVE' && mr.knuckle > 1 && mr.knuckle <= KNUCKLE_LIMIT && mm.knuckle < 0.6, { ronaldo: mr.knuckle, mbappe: mm.knuckle });
  check('knuckle limit shared by physics and abilities', KNUCKLE_MAX === KNUCKLE_LIMIT);
  // wobble: visible, smooth, never a sharp turn
  let maxTurn = 0;
  let maxDev = 0;
  let minDev = 9;
  for (let seed = 1; seed < 40; seed++) {
    const m = shotModifiers(ronaldo, { mode: 'penalty', power: 1, level: 0, spinSign: 0, lofted: false, low: false });
    const { tr } = flight({ target: new THREE.Vector3(1.2, 1.4, 0), spin: 0, profile: 'KNUCKLE', curveLevel: 0, apex: null, power: 1, speedMul: m.speedMul, knuckle: m.knuckle, kseed: seed * 7919 });
    const { tr: base } = flight({ target: new THREE.Vector3(1.2, 1.4, 0), spin: 0, profile: 'STRAIGHT', curveLevel: 0, apex: null, power: 1, speedMul: m.speedMul });
    const n = Math.min(tr.n, base.n);
    let dev = 0;
    for (let i = 0; i < n; i++) dev = Math.max(dev, Math.hypot(tr.pos[i * 3] - base.pos[i * 3], tr.pos[i * 3 + 1] - base.pos[i * 3 + 1]));
    maxDev = Math.max(maxDev, dev);
    minDev = Math.min(minDev, dev);
    for (let i = 12; i < tr.n; i += 12) {
      const a = Math.atan2(tr.vel[(i - 12) * 3], -tr.vel[(i - 12) * 3 + 2]);
      const b = Math.atan2(tr.vel[i * 3], -tr.vel[i * 3 + 2]);
      maxTurn = Math.max(maxTurn, Math.abs(b - a) * (180 / Math.PI));
    }
  }
  check('Ronaldo knuckle: clearly moves in the air, never a 90° turn / U-turn (< 12° per 0.1 s)', maxDev > 0.1 && maxTurn < 12 && maxDev < 1.6, { maxDev: +maxDev.toFixed(2), minDev: +minDev.toFixed(2), maxTurn: +maxTurn.toFixed(1) });
}

// ── 3. finesse: stronger, smooth, ONE direction ─────────────────────────
{
  const ids = ['messi', 'neymar', 'son', 'salah', 'yamal', 'debruyne', 'ronaldinho'];
  const avg = getPlayer('lewandowski')!;
  const spinFor = (id: string) => {
    const p = getPlayer(id)!;
    const sign = p.foot === 'L' ? -1 : 1; // instep
    return shotModifiers(p, { mode: 'freekick', power: 0.8, level: 2, spinSign: sign, lofted: false, low: false }).spinMul;
  };
  const sAvg = shotModifiers(avg, { mode: 'freekick', power: 0.8, level: 2, spinSign: 1, lofted: false, low: false }).spinMul;
  check('finesse players curl clearly more than an average striker', ids.every((id) => spinFor(id) > sAvg * 1.1), Object.fromEntries(ids.map((id) => [id, +spinFor(id).toFixed(2)]).concat([['lewandowski', +sAvg.toFixed(2)]])));
  // one-direction curl: the sideways acceleration never flips sign
  let flips = 0;
  for (const id of ids) {
    const p = getPlayer(id)!;
    const sign = p.foot === 'L' ? -1 : 1;
    const m = shotModifiers(p, { mode: 'penalty', power: 0.8, level: 3, spinSign: sign, lofted: false, low: false });
    const { tr } = flight({ target: new THREE.Vector3(-sign * 2.6, 1.6, 0), spin: sign * 0.9 * 0.62 * pen.curveMultiplier * m.spinMul, profile: 'CURLED', curveLevel: 3, apex: null, power: 0.8, speedMul: m.speedMul });
    let prev = 0;
    for (let i = 2; i < tr.n; i++) {
      const ax = tr.vel[i * 3] - tr.vel[(i - 1) * 3];
      const sg = Math.sign(Math.round(ax * 1e5));
      if (sg && prev && sg !== prev) flips++;
      if (sg) prev = sg;
    }
  }
  check('finesse curl bends one way only (no knuckle-like wobble)', flips === 0, { flips });
}

// ── 4. Pelé — KING OF FOOTBALL ──────────────────────────────────────────
{
  const pele = getPlayer('pele')!;
  check('Pelé 97/99/96/92/98/95/99 + KING OF FOOTBALL', JSON.stringify(Object.values(pele.stats!)) === JSON.stringify([97, 99, 96, 92, 98, 95, 99]) && pele.special === 'KING_OF_FOOTBALL' && !!SPECIALS.KING_OF_FOOTBALL);
  const errAt = (id: string) => shotModifiers(getPlayer(id), { mode: 'penalty', power: 1, level: 0, spinSign: 0, lofted: false, low: false }).err;
  const others = PLAYERS.filter((p) => p.stats && p.id !== 'pele').map((p) => errAt(p.id));
  check('Pelé: the smallest aim error at full power of every outfield player (no auto-aim: err > 0)', errAt('pele') < Math.min(...others) && errAt('pele') > 0, { pele: +errAt('pele').toFixed(3), bestOther: +Math.min(...others).toFixed(3) });
}

// ── 5. online: shot checked against the REAL taker's profile ───────────
{
  const honest = (id: string, intent: Partial<ShotIntent>) => {
    const p = getPlayer(id);
    const m = shotModifiers(p, { mode: 'penalty', power: intent.power ?? 1, level: intent.curveLevel ?? 0, spinSign: Math.sign(intent.spin ?? 0), lofted: false, low: false });
    return calculateShotParameters(BALL0, { target: new THREE.Vector3(1.5, 1.2, 0), profile: 'STRAIGHT', curveLevel: 0, apex: null, spin: 0, power: 1, ...intent, speedMul: m.speedMul, knuckle: (intent.curveLevel ?? 0) === 0 ? m.knuckle : 0, kseed: 99 }, pen);
  };
  const r = honest('ronaldo', { power: 1 });
  check('honest Ronaldo knuckle passes', validShotFor(r, 'ronaldo', 'penalty') && (r.knuckle ?? 0) > 1, r.knuckle);
  check('the same knuckle sent for Neymar is rejected (forced special)', !validShotFor(r, 'neymar', 'penalty'));
  const fast = { ...honest('kane', { power: 1 }) };
  fast.v = fast.v.map((c) => c * 1.1) as [number, number, number];
  check('a faster-than-possible shot is rejected (stats 999)', !validShotFor(fast, 'kane', 'penalty'));
  const ms = honest('messi', { power: 0.8, curveLevel: 3, spin: 0.9 * 0.62 * pen.curveMultiplier * shotModifiers(getPlayer('messi'), { mode: 'penalty', power: 0.8, level: 3, spinSign: -1, lofted: false, low: false }).spinMul * -1, profile: 'CURLED' });
  check('honest Messi curl passes; the same spin for a weak curler is rejected', validShotFor(ms, 'messi', 'penalty') && !validShotFor(ms, 'haaland', 'penalty'), ms.spin);
  const plain = honest('son', { power: 0.7 });
  check('an ordinary shot passes for anyone', validShotFor(plain, 'son', 'penalty') && validShotFor(plain, roundTaker(null, 'penalty', 0), 'penalty'));
  check('roundTaker = the clients\' choice (default squad, wraps, free-kick taker)', roundTaker(null, 'penalty', 0) === roundTaker({}, 'penalty', 0) &&
    roundTaker({ penaltyOrder: ['messi', 'kane', 'son', 'salah', 'yamal'], freeKickTakerId: 'kane' }, 'freekick', 3) === 'kane' &&
    roundTaker({ penaltyOrder: ['messi', 'kane', 'son', 'salah', 'yamal'] }, 'penalty', 6) === 'kane' &&
    roundTaker({ penaltyOrder: ['messi', 'kane', 'son', 'salah', 'yamal'], freeKickTakerId: 'pele' }, 'freekick', 0) === 'messi');
  const env = shotEnvelope(getPlayer('neymar'), 'penalty');
  check('envelope: only KNUCKLE DRIVE goes above knuckle 1', shotEnvelope(ronaldo, 'penalty').knuckle > 1 && env.knuckle <= 1);
}

// ── 6. Yashin really stronger; starter keepers a little weaker ─────────
function reach(id: string | null, x: number, y: number) {
  const p = getPlayer(id);
  const k = new Goalkeeper(undefined, p?.gk, p?.gk ? p.special : null);
  k.prepare(MODES.penalty.keeper, mulberry32(1));
  for (let i = 0; i < 40; i++) k.update(1 / 120);
  k.diveTo(x, y);
  let best = 0;
  let air = 0;
  for (let i = 0; i < 130; i++) {
    k.update(1 / 120);
    k.updateColliders();
    const r = k.colliders[0].r;
    best = Math.max(best, ...[k.colliders[0].pos, k.colliders[1].pos].map((h) => (y > 1.6 ? Math.hypot(h.x, h.y) : Math.abs(h.x)) + r));
    if (k.body.joints.hips.position.y > 0.9) air++;
  }
  return { best, air };
}
{
  const y = reach('yashin', -3.4, 2.1);
  const c = reach('courtois', -3.4, 2.1);
  const d = reach('donnarumma', -3.4, 2.1);
  check('Yashin top-corner reach clearly beyond Courtois / Donnarumma', y.best > c.best + 0.08 && y.best > d.best + 0.05, { yashin: +y.best.toFixed(2), courtois: +c.best.toFixed(2), donnarumma: +d.best.toFixed(2) });
  check('Yashin hangs in the air longer', y.air > c.air, { yashin: y.air, courtois: c.air });
  check('BLACK SPIDER modifiers are real (push, reach, airtime, catch)', BLACK_SPIDER.push < 0.9 && BLACK_SPIDER.stretch >= 0.1 && BLACK_SPIDER.hang > 1.1 && BLACK_SPIDER.catchSpeed >= 1);
  // saves: right guess, corners — Yashin clearly better, still beaten sometimes; wrong way = goal
  const shots: { x: number; y: number }[] = [];
  for (const x of [2.9, 3.1, 3.3]) for (const yy of [0.4, 1.2, 2.0]) shots.push({ x, y: yy });
  const rate = (id: string, wrong = false) => {
    let saves = 0;
    let n = 0;
    for (const sh of shots) for (const sgn of [-1, 1]) for (let s = 0; s < 3; s++) {
      const tx = sgn * sh.x;
      const intent: ShotIntent = { target: new THREE.Vector3(tx, sh.y, 0), spin: 0, profile: 'STRAIGHT', curveLevel: 0, apex: null, power: 0.85 + 0.05 * s };
      const shot = calculateShotParameters(BALL0, intent, pen);
      const side = (tx < 0) !== wrong;
      const dir = sh.y > 1.6 ? (side ? 'upLeft' : 'upRight') : sh.y < 0.7 ? (side ? 'lowLeft' : 'lowRight') : side ? 'left' : 'right';
      const res = simulateRound(1000 + n, shot, { dir, at: -1 }, id);
      if (res.outcome === 'SAVE') saves++;
      n++;
    }
    return Math.round((saves / n) * 100);
  };
  const ry = rate('yashin');
  const rc = rate('courtois');
  const rn = rate('neuer');
  const ra = rate('alisson');
  const rd = rate('donnarumma');
  check('right guess into the corners: Yashin clearly ahead, never invincible', ry >= rd + 8 && ry >= rc + 10 && ry < 95, { yashin: ry, donnarumma: rd, courtois: rc, neuer: rn, alisson: ra });
  check('starter keepers still save shots (good enough to practise)', rc > 5 && rn > 5 && ra > 5, { courtois: rc, neuer: rn, alisson: ra });
  const wy = rate('yashin', true);
  check('wrong way: Yashin concedes too', wy < 15, { wrong: wy });
  const old = { courtois: [96, 96, 99, 96, 93, 99, 92], neuer: [94, 94, 95, 99, 94, 95, 91], alisson: [98, 96, 94, 97, 99, 94, 95] } as Record<string, number[]>;
  const lower = Object.entries(old).every(([id, o]) => {
    const now = Object.values(getPlayer(id)!.gk!);
    return now.every((v, i) => v <= o[i]) && now.reduce((a, b) => a + b, 0) <= o.reduce((a, b) => a + b, 0) - 15;
  });
  check('starter keepers: shown stats lowered (they drive the real dive, so shown = real)', lower, Object.fromEntries(Object.keys(old).map((id) => [id, Object.values(getPlayer(id)!.gk!)])));
}

console.log(failed ? `${failed} UPDATE 9 CHECK(S) FAILED` : 'ALL UPDATE 9 CHECKS PASSED');
process.exit(failed ? 1 : 0);
