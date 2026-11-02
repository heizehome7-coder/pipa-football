// UPDATE 6 keeper reach experiment: a human keeper who guesses the right side, shots spread over the goal.
import * as THREE from 'three';
import { FIELD, MODES } from '../src/game/core/config';
import { calculateShotParameters } from '../src/game/physics/BallPhysics';
import { simulateRound } from '../src/online/match/penaltyRound';
import { mulberry32 } from '../src/game/core/math';

const W = FIELD.goalHalfWidth;
const H = FIELD.goalHeight;
const ball = new THREE.Vector3(0, FIELD.ballRadius, FIELD.penaltySpot);
const r = mulberry32(7);
const rows: Record<string, [number, number]> = {};
const add = (k: string, saved: boolean) => {
  rows[k] ??= [0, 0];
  rows[k][0]++;
  if (saved) rows[k][1]++;
};
for (let i = 0; i < 1200; i++) {
  const x = (r() * 2 - 1) * (W - 0.15);
  const y = 0.15 + r() * (H - 0.35);
  const power = 0.55 + r() * 0.4;
  const inp = calculateShotParameters(ball, { target: new THREE.Vector3(x, y, 0), spin: 0, profile: 'STRAIGHT', curveLevel: 0, apex: null, power }, MODES.penalty);
  const ax = Math.abs(x);
  const dir = ax < 0.9 ? (y > 1.6 ? 'up' : 'down') : y > 1.5 ? (x < 0 ? 'upLeft' : 'upRight') : y < 0.6 && ax < 2 ? (x < 0 ? 'lowLeft' : 'lowRight') : x < 0 ? 'left' : 'right';
  const sim = simulateRound(1000 + i, inp, { dir: dir as never, at: -1 }, null);
  const saved = sim.outcome === 'SAVE';
  const zone = ax > W - 0.6 ? (y > H - 0.6 ? 'top corner' : y < 0.5 ? 'low corner' : 'side netting') : ax > 1.6 ? 'wide' : 'central';
  add(zone, saved);
  add('ALL', saved);
}
for (const [k, [n, s]] of Object.entries(rows)) console.log(`${k.padEnd(13)} saved ${((100 * s) / n).toFixed(1)}%  (n=${n})`);
