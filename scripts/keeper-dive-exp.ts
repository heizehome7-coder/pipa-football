// UPDATE 7 hotfix — goalkeeper dive measurement (envelope + save rates by keeper / timing).
//   npx tsx scripts/keeper-dive-exp.ts            → table
//   npx tsx scripts/keeper-dive-exp.ts --json     → machine-readable
import * as THREE from 'three';
import { FIELD, MODES } from '../src/game/core/config';
import { calculateShotParameters } from '../src/game/physics/BallPhysics';
import { simulateRound, PENALTY_CONTACT_TIME, diveCommand } from '../src/online/match/penaltyRound';
import { mulberry32 } from '../src/game/core/math';
import { Goalkeeper } from '../src/game/entities/Goalkeeper';
import { getPlayer } from '../src/players/players';
import type { DiveDir } from '../src/online/match/protocol';

const json = process.argv.includes('--json');
const KEEPERS: (string | null)[] = process.env.KEEPERS ? process.env.KEEPERS.split(',').map((s) => (s === 'null' ? null : s)) : [null, 'raya', 'maignan', 'courtois', 'neuer', 'alisson', 'donnarumma', 'yashin'];

/** reach envelope of one dive: furthest glove x / highest glove y, airtime and when the hips hit the grass */
function envelope(id: string | null, x: number, y: number) {
  const p = getPlayer(id);
  const k = new Goalkeeper(undefined, p?.gk, p?.gk ? p.special : null);
  k.prepare(MODES.penalty.keeper, mulberry32(1));
  for (let i = 0; i < 40; i++) k.update(1 / 120);
  k.diveTo(x, y);
  const ext: number[] = [];
  const hy: number[] = [];
  let ground = -1;
  for (let i = 0; i < 150; i++) {
    const t = (i + 1) / 120;
    k.update(1 / 120);
    k.updateColliders();
    const hands = [k.colliders[0].pos, k.colliders[1].pos];
    const r = k.colliders[0].r;
    const hx = Math.max(...hands.map((h) => Math.abs(h.x) + r));
    const hyy = Math.max(...hands.map((h) => h.y + r));
    ext.push(Math.abs(x) > 0.5 ? hx : hyy);
    hy.push(hyy);
    if (ground < 0 && t > 0.2 && k.body.joints.hips.position.y < 0.42) ground = t;
  }
  const until = ground > 0 ? Math.round(ground * 120) : ext.length;
  const pre = ext.slice(0, until);
  const best = Math.max(...pre);
  const air = pre.filter((e) => e >= best - 0.06).length / 120;
  const at = (s: number) => +ext[Math.round(s * 120) - 1].toFixed(2);
  return { best: +best.toFixed(3), t35: at(0.35), t45: at(0.45), t55: at(0.55), t70: at(0.7), air: +air.toFixed(3), ground: +ground.toFixed(3), handY: +Math.max(...hy.slice(0, until)).toFixed(2) };
}

const W = FIELD.goalHalfWidth;
const H = FIELD.goalHeight;
const ball = new THREE.Vector3(0, FIELD.ballRadius, FIELD.penaltySpot);
function dirFor(x: number, y: number): DiveDir {
  const ax = Math.abs(x);
  return (ax < 0.9 ? (y > 1.6 ? 'up' : 'down') : y > 1.5 ? (x < 0 ? 'upLeft' : 'upRight') : y < 0.6 && ax < 2 ? (x < 0 ? 'lowLeft' : 'lowRight') : x < 0 ? 'left' : 'right') as DiveDir;
}

/** save % with the right guess; `at` = dive time (−1 = picked before the shot) */
function saves(id: string | null, at: number | ((c: number) => number), n = 700, seed = 7, wrong = false) {
  const r = mulberry32(seed);
  const rows: Record<string, [number, number]> = {};
  const add = (k: string, s: boolean) => {
    rows[k] ??= [0, 0];
    rows[k][0]++;
    if (s) rows[k][1]++;
  };
  for (let i = 0; i < n; i++) {
    const x = (r() * 2 - 1) * (W - 0.15);
    const y = 0.15 + r() * (H - 0.35);
    const power = 0.55 + r() * 0.4;
    const inp = calculateShotParameters(ball, { target: new THREE.Vector3(x, y, 0), spin: 0, profile: 'STRAIGHT', curveLevel: 0, apex: null, power }, MODES.penalty);
    let dir = dirFor(x, y);
    if (wrong) dir = dirFor(-x || 2, y);
    const when = typeof at === 'number' ? at : at(PENALTY_CONTACT_TIME);
    const sim = simulateRound(1000 + i, inp, { dir, at: when }, id);
    const s = sim.outcome === 'SAVE';
    const ax = Math.abs(x);
    const zone = ax > W - 0.6 ? (y > H - 0.6 ? 'top' : y < 0.5 ? 'lowc' : 'side') : ax > 1.6 ? 'wide' : 'central';
    add(zone, s);
    add('ALL', s);
    if (zone === 'side' || zone === 'top' || zone === 'lowc') add(power > 0.82 ? 'cornerPower' : 'cornerSoft', s);
  }
  return Object.fromEntries(Object.entries(rows).map(([k, [m, s]]) => [k, +((100 * s) / m).toFixed(1)]));
}

const out: Record<string, unknown> = {};
for (const id of KEEPERS) {
  const name = id ?? 'standard';
  out[name] = {
    side: envelope(id, diveCommand({ dir: 'left', at: 0 }).x, diveCommand({ dir: 'left', at: 0 }).y),
    high: envelope(id, diveCommand({ dir: 'upLeft', at: 0 }).x, diveCommand({ dir: 'upLeft', at: 0 }).y),
    low: envelope(id, diveCommand({ dir: 'lowLeft', at: 0 }).x, diveCommand({ dir: 'lowLeft', at: 0 }).y),
    pre: saves(id, -1),
    perfect: saves(id, (c) => c),
    late: saves(id, (c) => c + 0.16),
  };
}
out.wrongGuessYashin = saves('yashin', -1, 400, 9, true).ALL;
out.wrongGuessStandard = saves(null, -1, 400, 9, true).ALL;

if (json) console.log(JSON.stringify(out));
else {
  for (const id of KEEPERS) {
    const o = out[id ?? 'standard'] as Record<string, Record<string, number>>;
    console.log(`\n${(id ?? 'standard').toUpperCase()}`);
    for (const k of ['side', 'high', 'low']) console.log(`  ${k.padEnd(5)} best ${o[k].best} (@.35 ${o[k].t35} @.45 ${o[k].t45} @.55 ${o[k].t55} @.70 ${o[k].t70})  handY ${o[k].handY}  stretch-air ${o[k].air}s  grass@${o[k].ground}s`);
    for (const k of ['pre', 'perfect', 'late']) console.log(`  ${k.padEnd(8)} ${Object.entries(o[k]).map(([z, v]) => `${z} ${v}%`).join(' · ')}`);
  }
  console.log(`\nwrong guess saves: standard ${out.wrongGuessStandard}% · yashin ${out.wrongGuessYashin}%`);
}
