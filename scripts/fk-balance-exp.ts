// UPDATE 8 — FREE KICK balance measurement: curl onset (how early the bend shows), wall blocks,
// keeper dive timing.   npx tsx scripts/fk-balance-exp.ts [--json]
import * as THREE from 'three';
import { MODES } from '../src/game/core/config';
import { calculateShotParameters } from '../src/game/physics/BallPhysics';
import { buildShotPlan, shotPositionAt, shotVelocityAt } from '../src/game/physics/ShotModel';
import { freeKickSpot } from '../src/game/FreeKickGame';
import { simulateRound } from '../src/online/match/penaltyRound';
import { mulberry32 } from '../src/game/core/math';
import type { DiveDir } from '../src/online/match/protocol';

const cfg = MODES.freekick;
const out: Record<string, unknown> = {};

// 1) curl onset: for curled shots, share of the total sideways heading change and of the
//    sideways offset (from the launch line) already there at 60 % / 70 % of the flight
{
  const rows: number[][] = [];
  for (let s = 0; s < 5; s++) {
    const spot = freeKickSpot(s);
    for (const tx of [-2.6, -1.5, 1.5, 2.6]) for (const sign of [-1, 1]) {
      const intent = { target: new THREE.Vector3(tx, 1.6, 0), spin: sign * 0.5, profile: 'CURLED' as const, curveLevel: 2, apex: null, power: 0.7 };
      const inp = calculateShotParameters(spot.ball, intent, cfg);
      const plan = buildShotPlan(spot.ball, inp, cfg);
      const T = plan.duration;
      const v0 = shotVelocityAt(plan, 0);
      const h0 = Math.atan2(v0.x, -v0.z);
      const head = (t: number) => {
        const v = shotVelocityAt(plan, t);
        return Math.atan2(v.x, -v.z) - h0;
      };
      const dir = new THREE.Vector3(v0.x, 0, v0.z).normalize();
      const side = (t: number) => {
        const p = shotPositionAt(plan, t).sub(spot.ball);
        return p.x * -dir.z + p.z * dir.x; // offset from the launch line
      };
      const H = head(T);
      const D = side(T);
      if (Math.abs(H) < 0.02) continue;
      rows.push([head(0.6 * T) / H, head(0.7 * T) / H, side(0.6 * T) / D, side(0.7 * T) / D, Math.abs(D), T]);
    }
  }
  const avg = (i: number) => +(rows.reduce((a, r) => a + r[i], 0) / rows.length).toFixed(3);
  out.curl = { n: rows.length, heading60: avg(0), heading70: avg(1), offset60: avg(2), offset70: avg(3), totalOffset: avg(4), flight: avg(5) };
}

// 2) online FREE KICK duel: blocks / saves / goals for low, mid and lofted shots with no dive / right dive
{
  const r = mulberry32(5);
  const res: Record<string, Record<string, number>> = {};
  const add = (k: string, o: string) => {
    res[k] ??= {};
    res[k][o] = (res[k][o] ?? 0) + 1;
  };
  for (let i = 0; i < 300; i++) {
    const spot = i % 5;
    const sp = freeKickSpot(spot);
    const tx = (r() * 2 - 1) * 3.2;
    const kind = i % 3 === 0 ? 'low' : i % 3 === 1 ? 'mid' : 'over';
    const ty = kind === 'low' ? 0.4 + r() * 0.5 : kind === 'mid' ? 1.0 + r() * 0.6 : 1.4 + r() * 0.9;
    const intent = { target: new THREE.Vector3(tx, ty, 0), spin: (r() * 2 - 1) * 0.5, profile: 'CURLED' as const, curveLevel: 1, apex: kind === 'over' ? 2.6 + r() * 1.2 : null, power: 0.55 + r() * 0.4 };
    const inp = calculateShotParameters(sp.ball, intent, cfg);
    const dir: DiveDir = Math.abs(tx) < 0.9 ? (ty > 1.6 ? 'up' : 'down') : ty > 1.5 ? (tx < 0 ? 'upLeft' : 'upRight') : tx < 0 ? 'left' : 'right';
    try {
      add(`${kind}·nodive`, simulateRound(7000 + i, inp, null, null, { mode: 'freekick', spot }).outcome);
      add(`${kind}·rightdive`, simulateRound(7000 + i, inp, { dir, at: -1 }, null, { mode: 'freekick', spot }).outcome);
    } catch {
      /* invalid */
    }
  }
  out.duel = res;
}

if (process.argv.includes('--json')) console.log(JSON.stringify(out));
else console.log(JSON.stringify(out, null, 1));
