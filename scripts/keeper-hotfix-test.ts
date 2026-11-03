// UPDATE 7 hotfix — goalkeeper dive rework checks (headless).   npx tsx scripts/keeper-hotfix-test.ts
import * as THREE from 'three';
import { FIELD, MODES } from '../src/game/core/config';
import { calculateShotParameters } from '../src/game/physics/BallPhysics';
import { simulateRound, diveCommand, OnlineKickGame, PENALTY_CONTACT_TIME } from '../src/online/match/penaltyRound';
import { mulberry32 } from '../src/game/core/math';
import { Goalkeeper } from '../src/game/entities/Goalkeeper';
import { getPlayer, SPECIALS, ovr } from '../src/players/players';
import type { DiveDir } from '../src/online/match/protocol';

let failed = 0;
const check = (name: string, ok: boolean, info: unknown = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== '' ? `  — ${typeof info === 'string' ? info : JSON.stringify(info)}` : ''}`);
};

const keeper = (id: string | null) => {
  const p = getPlayer(id);
  return new Goalkeeper(undefined, p?.gk, p?.gk ? p.special : null);
};

/** one dive: reach along x, hips height over time, collider vs visible glove */
function dive(id: string | null, dir: DiveDir) {
  const k = keeper(id);
  k.prepare(MODES.penalty.keeper, mulberry32(1));
  for (let i = 0; i < 30; i++) k.update(1 / 120);
  const c = diveCommand({ dir, at: 0 });
  k.diveTo(c.x, c.y);
  const hipsX: number[] = [];
  const hipsY: number[] = [];
  let best = 0;
  let ground = -1;
  let maxOff = 0;
  const glove = new THREE.Vector3();
  for (let i = 1; i <= 150; i++) {
    k.update(1 / 120);
    k.updateColliders();
    const hp = k.body.joints.hips.position;
    hipsX.push(hp.x);
    hipsY.push(hp.y);
    for (const h of [0, 1]) {
      const pos = k.colliders[h].pos;
      best = Math.max(best, Math.abs(pos.x) + k.colliders[h].r);
      k.body.markerWorld(h === 0 ? 'lHand' : 'rHand', glove);
      maxOff = Math.max(maxOff, pos.distanceTo(glove));
    }
    if (ground < 0 && i > 24 && hp.y < 0.42) ground = i / 120;
  }
  return { best, ground, maxOff, hipsX, hipsY, k };
}

// ── 1. the visible gloves ARE the save area ─────────────────────────────
{
  const d = dive('yashin', 'upLeft');
  check('hand colliders sit exactly on the visible gloves (no invisible stretch)', d.maxOff < 1e-6, { maxOffset: d.maxOff });
}

// ── 2. phased dive: push-off first, then a real flight arc, hang, landing ─────
{
  const d = dive(null, 'left');
  const xs = d.hipsX.map(Math.abs);
  const pushMoved = xs[Math.round(0.08 * 120)] - xs[0];
  const flightMoved = xs[Math.round(0.3 * 120)] - xs[Math.round(0.08 * 120)];
  check('dive starts with a weight shift / push (little travel in the first 0.08 s)', pushMoved < 0.2, { pushMoved: +pushMoved.toFixed(2) });
  check('…then takes off fast (most travel in the flight)', flightMoved > 0.7, { flightMoved: +flightMoved.toFixed(2) });
  // no teleport: hip speed stays physical
  let vmax = 0;
  for (let i = 1; i < xs.length; i++) vmax = Math.max(vmax, Math.abs(xs[i] - xs[i - 1]) * 120);
  check('no teleporting (hip speed < 9 m/s)', vmax < 9, { vmax: +vmax.toFixed(1) });
  // decelerating into full stretch, not a linear lerp
  const v1 = (xs[Math.round(0.18 * 120)] - xs[Math.round(0.14 * 120)]) / 0.04;
  const v2 = (xs[Math.round(0.42 * 120)] - xs[Math.round(0.38 * 120)]) / 0.04;
  check('flight is an arc: fast off the ground, slowing at full stretch', v1 > v2 * 1.5, { early: +v1.toFixed(2), late: +v2.toFixed(2) });
  check('longer airtime: hips reach the grass no earlier than ~0.85 s (UPDATE 7: 0.81 s)', d.ground >= 0.85, { ground: d.ground });
  const peak = Math.max(...d.hipsY);
  check('the body rises a little in the air (an arc, not a slide)', peak > 0.85, { peakHipsY: +peak.toFixed(2) });
}

// ── 3. reach buff + tiers ─────────────────────────────────────────────
{
  const std = dive(null, 'left').best;
  const raya = dive('raya', 'left').best;
  const cour = dive('courtois', 'left').best;
  const yas = dive('yashin', 'left').best;
  // UPDATE 7 standard keeper: 2.95 m to the outer glove edge
  check('side reach +8–12 % over UPDATE 7 for the standard keeper', std > 2.95 * 1.08 && std < 2.95 * 1.12, { std: +std.toFixed(2), gain: `${((std / 2.95 - 1) * 100).toFixed(1)}%` });
  check('tiers: Raya < standard < Courtois ≤ Yashin', raya < std && std < cour && cour <= yas + 0.03, { raya: +raya.toFixed(2), std: +std.toFixed(2), courtois: +cour.toFixed(2), yashin: +yas.toFixed(2) });
  check('nobody reaches the inside of the post from the centre (no invincible keeper)', yas < FIELD.goalHalfWidth - 0.05, { yashin: +yas.toFixed(2) });
  const lowStd = dive(null, 'lowLeft').best;
  check('low dive reach +6–10 % (UPDATE 7: 1.74 m)', lowStd > 1.74 * 1.06 && lowStd < 1.74 * 1.11, { low: +lowStd.toFixed(2) });
}

// ── 4. save rates (right guess / wrong guess / late) — never a pure dice roll ───
const W = FIELD.goalHalfWidth;
const H = FIELD.goalHeight;
const ball = new THREE.Vector3(0, FIELD.ballRadius, FIELD.penaltySpot);
const dirFor = (x: number, y: number): DiveDir => {
  const ax = Math.abs(x);
  return (ax < 0.9 ? (y > 1.6 ? 'up' : 'down') : y > 1.5 ? (x < 0 ? 'upLeft' : 'upRight') : y < 0.6 && ax < 2 ? (x < 0 ? 'lowLeft' : 'lowRight') : x < 0 ? 'left' : 'right') as DiveDir;
};
function rate(id: string | null, mode: 'right' | 'wrong' | 'late', n = 360) {
  const r = mulberry32(11);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const x = (r() * 2 - 1) * (W - 0.15);
    const y = 0.15 + r() * (H - 0.35);
    const power = 0.55 + r() * 0.4;
    const inp = calculateShotParameters(ball, { target: new THREE.Vector3(x, y, 0), spin: 0, profile: 'STRAIGHT', curveLevel: 0, apex: null, power }, MODES.penalty);
    const dir = mode === 'wrong' ? dirFor(-x || 2, y) : dirFor(x, y);
    const at = mode === 'late' ? PENALTY_CONTACT_TIME + 0.16 : -1;
    if (simulateRound(500 + i, inp, { dir, at }, id).outcome === 'SAVE') s++;
  }
  return (100 * s) / n;
}
{
  const std = rate(null, 'right');
  const raya = rate('raya', 'right');
  const top = rate('courtois', 'right');
  const yas = rate('yashin', 'right');
  check('right guess: low tier ≤ standard < top tier ≤ Yashin (clear tiers)', raya < std && std < top && top < yas, { raya, std, courtois: top, yashin: yas });
  check('Yashin is strong, never invincible (right guess < 70 %)', yas < 70, { yashin: yas });
  const wrong = rate('yashin', 'wrong');
  check('wrong way = goal for everyone, Yashin too (< 15 % saves)', wrong < 15, { wrong });
  const late = rate(null, 'late');
  check('a late dive saves less than an on-time one', late < std - 8, { late, onTime: std });
}

// ── 5. same input → same result (server = both phones) ──────────────────
{
  const r = mulberry32(3);
  let same = true;
  for (let i = 0; i < 40; i++) {
    const inp = calculateShotParameters(ball, { target: new THREE.Vector3((r() * 2 - 1) * 3, 0.3 + r() * 1.8, 0), spin: 0, profile: 'STRAIGHT', curveLevel: 0, apex: null, power: 0.5 + r() * 0.5 }, MODES.penalty);
    const dirs: DiveDir[] = ['left', 'upRight', 'lowLeft', 'down'];
    const dv = { dir: dirs[i % 4], at: i % 3 ? -1 : PENALTY_CONTACT_TIME + 0.02 };
    const a = simulateRound(77 + i, inp, dv, 'yashin');
    const b = simulateRound(77 + i, inp, dv, 'yashin');
    if (a.outcome !== b.outcome || a.detail !== b.detail || a.decidedAt !== b.decidedAt) same = false;
  }
  check('deterministic: identical replays (server judge = phones)', same);
}

// ── 6. Lev Yashin — BLACK SPIDER ───────────────────────────────────────
{
  const y = getPlayer('yashin')!;
  check('Yashin stats 99/99/99/99/97/99/98 + BLACK SPIDER', JSON.stringify(Object.values(y.gk!)) === JSON.stringify([99, 99, 99, 99, 97, 99, 98]) && y.special === 'BLACK_SPIDER' && !!SPECIALS.BLACK_SPIDER, { gk: y.gk, special: y.special, ovr: ovr(y) });
  check('other keepers keep their identity', getPlayer('courtois')!.special === 'LONG_REACH' && getPlayer('donnarumma')!.special === 'HIGH_REACH' && getPlayer('alisson')!.special === 'LOW_SAVE' && getPlayer('martinez')!.special === 'PENALTY_SPECIALIST' && getPlayer('neuer')!.special === 'POSITION_MASTER');
  // medium pace into the middle of his gloves → held in the air; power → parried
  let caught = 0;
  let parriedPower = 0;
  let catchesPower = 0;
  let otherCatch = 0;
  let firstCatch: [number, number] | null = null;
  const pts: [number, number][] = [[-3.1, 0.9], [-3.2, 1.1], [-3.0, 2.0], [-2.9, 1.0], [-3.0, 1.2], [3.1, 0.9], [3.2, 1.1], [3.0, 2.0], [2.9, 1.0], [3.0, 1.2]];
  for (const [x, yy] of pts) {
    for (const [power, slot] of [[0.2, 'mid'], [0.9, 'power']] as const) {
      const inp = calculateShotParameters(ball, { target: new THREE.Vector3(x, yy, 0), spin: 0, profile: 'STRAIGHT', curveLevel: 0, apex: null, power }, MODES.penalty);
      const dir = dirFor(x, yy);
      const s = simulateRound(9, inp, { dir, at: -1 }, 'yashin');
      if (slot === 'mid' && s.detail.includes('공중 캐치')) (caught++, (firstCatch ??= [x, yy]));
      if (slot === 'power' && s.outcome === 'SAVE' && !s.detail.includes('공중 캐치')) parriedPower++;
      if (slot === 'power' && s.detail.includes('공중 캐치')) catchesPower++;
      const o = simulateRound(9, inp, { dir, at: -1 }, 'courtois');
      if (o.detail.includes('공중 캐치')) otherCatch++;
    }
  }
  check('BLACK SPIDER holds some medium-pace shots in the air', caught >= 3, { caught, of: pts.length });
  check('power shots are parried, never held in the air', catchesPower === 0, { parriedPower, catchesPower });
  check('only BLACK SPIDER makes the aerial catch', otherCatch === 0, { otherCatch });
  // a visible replay of a caught ball: the ball ends in his gloves
  const inp = calculateShotParameters(ball, { target: new THREE.Vector3(...(firstCatch ?? [-3.1, 0.9]), 0), spin: 0, profile: 'STRAIGHT', curveLevel: 0, apex: null, power: 0.2 }, MODES.penalty);
  const g = new OnlineKickGame('K', 9, false, { keeperStats: getPlayer('yashin')!.gk, keeperSpecial: 'BLACK_SPIDER' });
  g.start();
  g.shoot(inp);
  g.setKeeperDive(diveCommand({ dir: dirFor(...(firstCatch ?? [-3.1, 0.9])), at: -1 }));
  for (let t = 0; t < 2.5; t += 1 / 120) g.update(1 / 120);
  const hc = g.keeper.handsCenter(new THREE.Vector3());
  check('caught ball stays in his hands (replayed with visuals off)', g.detail.includes('공중 캐치') && g.ballPos.distanceTo(hc) < 0.25, { detail: g.detail, dist: +g.ballPos.distanceTo(hc).toFixed(2) });
}

// ── 7. perfect timing bonus (internal) ─────────────────────────────────
{
  const k = keeper(null);
  k.prepare(MODES.penalty.keeper, mulberry32(1));
  k.diveTo(-3.4, 0.5, true);
  const perfect = k.diveTimes;
  const k2 = keeper(null);
  k2.prepare(MODES.penalty.keeper, mulberry32(1));
  k2.diveTo(-3.4, 0.5, false);
  check('perfect timing: a quicker push-off (internal bonus)', perfect.perfect && perfect.push < k2.diveTimes.push, { perfect: perfect.push, normal: k2.diveTimes.push });
}

console.log(failed ? `\n${failed} KEEPER CHECK(S) FAILED` : '\nALL KEEPER HOTFIX CHECKS PASSED');
process.exit(failed ? 1 : 0);
