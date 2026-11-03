// UPDATE 8 — FREE KICK balance checks: early curl, no late hook, preview = flight, knuckle
// untouched, penalty untouched, wall +4 %, online free-kick dive starts later (same reach).
//   npx tsx scripts/update8-physics-test.ts
import * as THREE from 'three';
import { MODES } from '../src/game/core/config';
import { calculateShotParameters } from '../src/game/physics/BallPhysics';
import { buildShotPlan, samplePlan, shotPositionAt, shotVelocityAt } from '../src/game/physics/ShotModel';
import { freeKickSpot } from '../src/game/FreeKickGame';
import { DefensiveWall, WALL_SCALE } from '../src/game/entities/DefensiveWall';
import { OnlineKickGame, diveCommand } from '../src/online/match/penaltyRound';
import { FK_DIVE_DELAY } from '../src/game/KickGame';

let failed = 0;
const check = (name: string, ok: boolean, info: unknown = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== '' ? `  — ${JSON.stringify(info)}` : ''}`);
};
const fk = MODES.freekick;
const pen = MODES.penalty;

// ── 1. curl shows early and never hooks back ──────────────────────────
{
  let h60 = 0;
  let h70 = 0;
  let n = 0;
  let reversals = 0;
  let lateMax = 0;
  for (let s = 0; s < 5; s++) {
    const spot = freeKickSpot(s);
    for (const tx of [-2.6, -1.5, 1.5, 2.6]) for (const sign of [-1, 1]) {
      const inp = calculateShotParameters(spot.ball, { target: new THREE.Vector3(tx, 1.6, 0), spin: sign * 0.5, profile: 'CURLED', curveLevel: 2, apex: null, power: 0.7 }, fk);
      const plan = buildShotPlan(spot.ball, inp, fk);
      const T = plan.duration;
      const v0 = shotVelocityAt(plan, 0);
      const h0 = Math.atan2(v0.x, -v0.z);
      const head = (t: number) => {
        const v = shotVelocityAt(plan, t);
        return Math.atan2(v.x, -v.z) - h0;
      };
      const H = head(T);
      if (Math.abs(H) < 0.02) continue;
      n++;
      h60 += head(0.6 * T) / H;
      h70 += head(0.7 * T) / H;
      // one direction only: the heading never turns back
      let prev = 0;
      for (let k = 1; k <= 40; k++) {
        const hk = head((k / 40) * T);
        if (Math.sign(H) * (hk - prev) < -1e-4) reversals++;
        prev = hk;
      }
      lateMax = Math.max(lateMax, Math.abs(H - head(0.85 * T)) / Math.abs(H));
    }
  }
  h60 /= n;
  h70 /= n;
  // UPDATE 7 measured 66 % / 75 % with a constant side force (most of the hook near the goal)
  check('curl: most of the bend forms early (≥ 70 % of the turn by 60 % of the flight)', h60 >= 0.7 && h60 <= 0.85, { h60: +h60.toFixed(3), h70: +h70.toFixed(3) });
  check('curl: one direction only, never hooks back', reversals === 0, { reversals });
  check('curl: little left for the last 15 % of the flight (keeps its line into the goal)', lateMax < 0.12, { lateMax: +lateMax.toFixed(3) });
}

// ── 2. the dashed preview is exactly the flight ────────────────────────
{
  const spot = freeKickSpot(2);
  const inp = calculateShotParameters(spot.ball, { target: new THREE.Vector3(2.2, 1.8, 0), spin: 0.55, profile: 'CURLED', curveLevel: 2, apex: 2.8, power: 0.75 }, fk);
  const g = new OnlineKickGame('K', 3, false, {}, 'freekick', 2);
  g.start();
  g.shoot(inp);
  const plan = g.planFor(inp);
  const preview = samplePlan(plan, 40);
  let maxErr = 0;
  let t = 0;
  const gg = g as unknown as { ballPos: THREE.Vector3; phase: string; free: boolean; flightT: number; flying: boolean };
  for (let i = 0; i < 600 && !gg.free; i++) {
    g.update(1 / 120);
    t += 1 / 120;
    if (gg.flying && !gg.free) {

      if (gg.flightT > plan.duration) break;
      maxErr = Math.max(maxErr, gg.ballPos.distanceTo(shotPositionAt(plan, gg.flightT)));
    }
  }
  check('dashed preview = the real flight (same physics, same curl timing)', maxErr < 0.12 && preview.length === 41, { maxErr: +maxErr.toFixed(3) });
}

// ── 3. knuckle and penalty are untouched ────────────────────────────────
{
  check('penalty: no curl-onset change (UPDATE 7 physics)', !pen.curveOnset);
  const spot = freeKickSpot(0);
  const a = calculateShotParameters(spot.ball, { target: new THREE.Vector3(1, 1.5, 0), spin: 0, profile: 'KNUCKLE', curveLevel: 0, apex: null, power: 0.9, knuckle: 0.8, kseed: 1234 }, fk);
  const b = calculateShotParameters(spot.ball, { target: new THREE.Vector3(1, 1.5, 0), spin: 0, profile: 'KNUCKLE', curveLevel: 0, apex: null, power: 0.9, knuckle: 0.8, kseed: 1234 }, { ...fk, curveOnset: undefined });
  const pa = buildShotPlan(spot.ball, a, fk);
  const pb = buildShotPlan(spot.ball, b, { ...fk, curveOnset: undefined });
  check('knuckle (no spin) keeps its own physics (identical with / without the curl change)', JSON.stringify(a) === JSON.stringify(b) && pa.target.distanceTo(pb.target) < 1e-9);
}

// ── 4. the wall: a touch bigger, still 4–5 players ───────────────────────
{
  const w = new DefensiveWall(5);
  w.setup(freeKickSpot(1).ball, 5);
  const r = Math.max(...w.colliders.map((c) => c.r));
  check('wall +4 % wide (visual = collision), same player count', Math.abs(WALL_SCALE - 1.04) < 1e-9 && Math.abs(r - 0.25 * 1.04) < 1e-9 && w.players.filter((p) => p.root.visible).length === 5 && Math.abs(w.players[0].root.scale.x - 1.04) < 1e-9, { r });
}

// ── 5. online free-kick dive starts later, reaches as far; penalty unchanged ───
function diveTrace(mode: 'freekick' | 'penalty') {
  const g = new OnlineKickGame('K', 5, false, {}, mode, 0);
  g.start();
  const spot = g.spot.ball;
  // a shot wide of the goal so nothing touches the keeper
  g.shoot(calculateShotParameters(spot, { target: new THREE.Vector3(9, 1, 0), spin: 0, profile: 'STRAIGHT', curveLevel: 0, apex: null, power: 0.8 }, mode === 'freekick' ? fk : pen));
  g.setKeeperDive(diveCommand({ dir: 'left', at: -1 }));
  let t = 0;
  let start = -1;
  let reach = 0;
  let move = -1;
  for (let i = 0; i < 400; i++) {
    g.update(1 / 120);
    t += 1 / 120;
    if (g.keeper.committed && start < 0) start = t;
    g.keeper.updateColliders();
    const hx = Math.max(...[0, 1].map((k) => Math.abs(g.keeper.colliders[k].pos.x)));
    reach = Math.max(reach, hx);
    if (start >= 0 && move < 0 && Math.abs(g.keeper.hipsWorldX()) > 0.4) move = t - start;
  }
  return { reach, move, push: g.keeper.diveTimes.push };
}
{
  const f = diveTrace('freekick');
  const p = diveTrace('penalty');
  // the same free-kick keeper diving with and without the delay → same furthest glove
  const reachOf = (delay: number) => {
    const k = new OnlineKickGame('K', 5, false, {}, 'freekick', 0);
    k.start();
    k.keeper.prepare(fk.keeper, () => 0.5);
    k.keeper.diveTo(-3.48, 0.9, false, undefined, delay);
    let r = 0;
    for (let i = 0; i < 240; i++) {
      k.keeper.update(1 / 120);
      k.keeper.updateColliders();
      r = Math.max(r, ...[0, 1].map((j) => Math.abs(k.keeper.colliders[j].pos.x)));
    }
    return r;
  };
  const rWith = reachOf(FK_DIVE_DELAY);
  const rWithout = reachOf(0);
  const fNo = (() => {
    // same free-kick dive without the delay (what it would be without UPDATE 8)
    const k = new OnlineKickGame('K', 5, false, {}, 'freekick', 0);
    k.start();
    k.keeper.prepare(fk.keeper, () => 0.5);
    k.keeper.diveTo(-3.48, 0.9);
    return k.keeper.diveTimes.push;
  })();
  check('online FREE KICK: the dive starts ~0.14 s later (longer weight shift)', Math.abs(f.push - fNo - FK_DIVE_DELAY) < 0.02 && FK_DIVE_DELAY >= 0.1 && FK_DIVE_DELAY <= 0.18, { push: +f.push.toFixed(3), without: +fNo.toFixed(3) });
  check('…the hips leave later than in the penalty dive', f.move > p.move + 0.08, { fk: +f.move.toFixed(3), pen: +p.move.toFixed(3) });
  check('…but the final reach is the same (with / without the delay)', Math.abs(rWith - rWithout) < 0.02 && f.reach > 2.5, { with: +rWith.toFixed(3), without: +rWithout.toFixed(3) });
}

console.log(failed ? `\n${failed} UPDATE 8 PHYSICS CHECK(S) FAILED` : '\nALL UPDATE 8 PHYSICS CHECKS PASSED');
process.exit(failed ? 1 : 0);
