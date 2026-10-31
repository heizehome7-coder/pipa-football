/**
 * Headless tests (no browser / WebGL). They run the real game code end to end:
 *   screen stroke (what the finger draws) → strokeReader → 3D path → KickGame → outcome
 * using the same camera framing as the game on a 390×844 phone screen.
 *   npm run sim
 */
import * as THREE from 'three';
import { FIELD } from '../src/game/core/config';
import { mulberry32 } from '../src/game/core/math';
import { FreeKickGame } from '../src/game/FreeKickGame';
import { readStroke, type Pt, type SwipeSample } from '../src/game/input/strokeReader';
import type { KickGame } from '../src/game/KickGame';
import { PenaltyGame } from '../src/game/PenaltyGame';
import { samplePlan, shotPositionAt } from '../src/game/physics/ShotModel';
import { cameraServices, frameCamera } from '../src/game/render/cameraFraming';

const W = 390;
const H = 844;

type Make = (seed: number) => KickGame;
const penalty: Make = (seed) => new PenaltyGame({ visuals: false, nickname: 'TEST', seed });
const freekick: Make = (seed) => new FreeKickGame({ visuals: false, nickname: 'TEST', seed });

function setup(make: Make, seed: number, spot = 0) {
  const game = make(seed);
  game.start();
  for (let k = 0; k < spot; k++) game.next();
  const cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 400);
  frameCamera(cam, game, W, H);
  const svc = cameraServices(cam, W, H);
  const ctx = { viewportH: H, ball: game.ballPos.clone(), ...svc };
  return { game, cam, svc, ctx };
}

/** A stroke as a finger would draw it: screen points + timestamps (dur in ms). */
function timed(pts: Pt[], dur: number): SwipeSample[] {
  return pts.map((p, i) => ({ x: p.x, y: p.y, t: 1000 + (dur * i) / (pts.length - 1) }));
}
/** screen stroke from a to b, bowed sideways by `bend` px (+ = right) */
function screenStroke(a: Pt, b: Pt, bend = 0, n = 40): Pt[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  const nx = -dy / L;
  const ny = dx / L; // right-hand normal for an up-going stroke points to +x
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const k = 4 * t * (1 - t) * bend;
    out.push({ x: a.x + dx * t + nx * k, y: a.y + dy * t + ny * k });
  }
  return out;
}
/** project an intended 3D path into a screen stroke */
function strokeOf3D(svc: ReturnType<typeof cameraServices>, pts: THREE.Vector3[]): Pt[] {
  return pts.map((p) => svc.project(p));
}

function play(game: KickGame, samples: SwipeSample[], ctx: Parameters<typeof readStroke>[1]) {
  const r = readStroke(samples, ctx, game.cfg);
  if (!r) return { outcome: null as string | null, detail: 'no-shot', reading: null, keeperMovedBeforeLaunch: false, phases: [] as string[] };
  const phases: string[] = [];
  game.listener = { onPhase: (p) => phases.push(p) };
  let keeperMovedBeforeLaunch = false;
  game.shoot(r.input);
  for (let i = 0; i < 60 * 7 && !game.outcome; i++) {
    game.update(1 / 60);
    const early = game.kicker.elapsed < game.kicker.contactTime - game.cfg.keeper.leadMax - 0.01;
    if (game.phase === 'runup' && early && (game.keeper.committed || Math.abs(game.keeper.hipsWorldX()) > 0.02)) keeperMovedBeforeLaunch = true;
  }
  for (let i = 0; i < 60; i++) game.update(1 / 60);
  return { outcome: game.outcome as string | null, detail: game.detail, reading: r, keeperMovedBeforeLaunch, phases };
}

let failures = 0;
function check(name: string, ok: boolean, info: unknown = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`);
  if (!ok) failures++;
}
const tally = (list: (string | null)[]) => {
  const c: Record<string, number> = {};
  for (const o of list) c[o ?? 'none'] = (c[o ?? 'none'] ?? 0) + 1;
  return c;
};
const pct = (c: Record<string, number>, n: number) =>
  Object.entries(c).map(([k, v]) => `${k} ${Math.round((v / n) * 100)}%`).join(' · ');

// screen geometry of the penalty view
const P = setup(penalty, 1);
const ballS = P.svc.project(P.game.ballPos);
const gl = P.svc.project(new THREE.Vector3(-FIELD.goalHalfWidth, 0, 0));
const gr = P.svc.project(new THREE.Vector3(FIELD.goalHalfWidth, 0, 0));
const gt = P.svc.project(new THREE.Vector3(0, FIELD.goalHeight, 0));
const goalPt = (fx: number, fy: number): Pt => ({ x: gl.x + (gr.x - gl.x) * fx, y: gl.y + (gt.y - gl.y) * fy });

// ── 1. stroke → 3D path fidelity ─────────────────────────────────────────
{
  // the 3D path must project exactly under the finger's stroke
  const stroke = screenStroke(ballS, goalPt(0.8, 0.6), 60);
  const r = readStroke(timed(stroke, 200), P.ctx, P.game.cfg)!;
  const plan = P.game.planFor(r.input);
  const proj = samplePlan(plan, 80).map((p) => P.svc.project(p));
  let worst = 0;
  for (const s of stroke) worst = Math.max(worst, Math.min(...proj.map((q) => Math.hypot(q.x - s.x, q.y - s.y))));
  check('3D ball path projects onto the drawn stroke (max gap < 8 px)', worst < 8, `${worst.toFixed(1)} px`);

  // intended 3D shapes survive a draw → read round trip
  const B = P.game.ballPos.clone();
  const mk = (T: THREE.Vector3, side: number, lift: number) => {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const s = i / 40;
      const p = new THREE.Vector3().lerpVectors(B, T, s);
      p.x += side * 4 * s * (1 - s);
      p.y += lift * 4 * s * (1 - s);
      out.push(p);
    }
    return out;
  };
  const cases: [string, THREE.Vector3, number, number][] = [
    ['straight low to right corner', new THREE.Vector3(2.8, 0.5, 0), 0, 0],
    ['curl bending left', new THREE.Vector3(-2.2, 1.4, 0), 1.6, 0.4],
    ['curl bending right', new THREE.Vector3(2.4, 1.6, 0), -1.6, 0.4],
    ['high lob', new THREE.Vector3(0.8, 2.0, 0), 0, 3.2],
  ];
  for (const [name, T, side, lift] of cases) {
    const intended = mk(T, side, lift);
    const rr = readStroke(timed(strokeOf3D(P.svc, intended), 220), P.ctx, P.game.cfg)!;
    const pl = P.game.planFor(rr.input);
    let err = 0;
    for (const q of intended) {
      let best = Infinity;
      for (const p of samplePlan(pl, 120)) best = Math.min(best, p.distanceTo(q));
      err = Math.max(err, best);
    }
    const apexWant = Math.max(...intended.map((p) => p.y));
    check(`round trip: ${name} (3D error ${err.toFixed(2)} m, apex ${pl.apex.toFixed(2)}/${apexWant.toFixed(2)} m, end x ${pl.target.x.toFixed(2)}/${T.x})`,
      err < 0.6 && Math.abs(pl.target.x - T.x) < 0.15 && Math.abs(pl.apex - apexWant) < 0.5);
  }
}

// ── 2. shape vs stroke direction, speed independent of shape ───────────────
{
  const straight = readStroke(timed(screenStroke(ballS, goalPt(0.3, 0.5), 0), 180), P.ctx, P.game.cfg)!;
  const sp = P.game.planFor(straight.input);
  check('straight stroke → straight shot (no curl, no lob)', Math.abs(sp.curve) < 0.08 && sp.apex < 1.4, { curve: +sp.curve.toFixed(3), apex: +sp.apex.toFixed(2) });
  const left = P.game.planFor(readStroke(timed(screenStroke(ballS, goalPt(0.5, 0.5), -70), 200), P.ctx, P.game.cfg)!.input);
  const right = P.game.planFor(readStroke(timed(screenStroke(ballS, goalPt(0.5, 0.5), 70), 200), P.ctx, P.game.cfg)!.input);
  const mid = (pl: typeof left) => shotPositionAt(pl, pl.duration * 0.55).x;
  check('left-bending stroke → ball bends left', left.curve < -0.3 && mid(left) < -0.6, { curve: +left.curve.toFixed(2), midX: +mid(left).toFixed(2) });
  check('right-bending stroke → ball bends right', right.curve > 0.3 && mid(right) > 0.6, { curve: +right.curve.toFixed(2), midX: +mid(right).toFixed(2) });

  const shape = screenStroke(ballS, goalPt(0.7, 0.4), 40);
  const fast = readStroke(timed(shape, 100), P.ctx, P.game.cfg)!;
  const slow = readStroke(timed(shape, 700), P.ctx, P.game.cfg)!;
  const pf = P.game.planFor(fast.input);
  const ps = P.game.planFor(slow.input);
  check('fast stroke → fast shot, slow stroke → slow shot', pf.speed > ps.speed * 1.8, `${ps.speed.toFixed(1)} → ${pf.speed.toFixed(1)} m/s`);
  check('speed does not change the path shape', JSON.stringify(fast.input.points) === JSON.stringify(slow.input.points));

  const short = readStroke(timed(screenStroke(ballS, { x: ballS.x + 20, y: ballS.y - 110 }, 0), 90), P.ctx, P.game.cfg)!;
  const pshort = P.game.planFor(short.input);
  check('short quick flick → low, fast shot continued to the goal', pshort.target.y < 0.6 && pshort.apex < 0.8 && pshort.speed > 20,
    { endY: +pshort.target.y.toFixed(2), apex: +pshort.apex.toFixed(2), speed: +pshort.speed.toFixed(1) });
  check('tiny / downward strokes are ignored', !readStroke(timed(screenStroke(ballS, { x: ballS.x, y: ballS.y - 15 }), 80), P.ctx, P.game.cfg) &&
    !readStroke(timed(screenStroke(ballS, { x: ballS.x, y: ballS.y + 80 }), 80), P.ctx, P.game.cfg));
}

// ── 3. penalty game flow + outcomes ────────────────────────────────────────
{
  const s = setup(penalty, 7);
  const res = play(s.game, timed(screenStroke(ballS, goalPt(0.85, 0.5), 0), 150), s.ctx);
  check('state machine aim→runup→flight→result', res.phases.join(',') === 'runup,flight,result', res.phases.join(','));
  check('penalty keeper does not move before the kicker reaches the ball', !res.keeperMovedBeforeLaunch);
  check('result can be dismissed → next attempt', s.game.canContinue());
  s.game.next();
  check('reset puts game back to aim', s.game.phase === 'aim' && s.game.outcome === null);
}
function penaltyBatch(n: number, gen: (r: () => number, i: number) => SwipeSample[]) {
  const r = mulberry32(42);
  const out: (string | null)[] = [];
  for (let i = 0; i < n; i++) {
    const s = setup(penalty, 100 + i);
    out.push(play(s.game, gen(r, i), s.ctx).outcome);
  }
  return tally(out);
}
const N = 200;
const rand = penaltyBatch(N, (r) =>
  timed(screenStroke(ballS, goalPt(-0.05 + r() * 1.1, r() * 1.1), (r() * 2 - 1) * 60), 90 + r() * 600));
console.log('penalty · random strokes:', pct(rand, N));
check('penalty: mix of goals, saves and misses', (rand.GOAL ?? 0) > N * 0.3 && (rand.SAVE ?? 0) > N * 0.08 && (rand.MISS ?? 0) > N * 0.08);
const slowC = penaltyBatch(100, () => timed(screenStroke(ballS, goalPt(0.52, 0.4)), 800));
console.log('penalty · slow, central:', pct(slowC, 100));
check('slow central shots are mostly saved (beaten only when he has already dived)', (slowC.SAVE ?? 0) >= 55);
const fastC = penaltyBatch(100, (_r, i) => timed(screenStroke(ballS, goalPt(i % 2 ? 0.95 : 0.05, 0.15)), 95));
console.log('penalty · fast, low corner:', pct(fastC, 100));
check('fast low-corner shots mostly score', (fastC.GOAL ?? 0) >= 70);
const wide = penaltyBatch(40, () => timed(screenStroke(ballS, goalPt(1.25, 0.5)), 150));
check('stroke ending wide of the post → MISS', (wide.MISS ?? 0) === 40, pct(wide, 40));
const over = penaltyBatch(40, () => timed(screenStroke(ballS, goalPt(0.6, 1.45)), 150));
check('stroke ending above the bar → MISS', (over.MISS ?? 0) === 40, pct(over, 40));

// ── 4. free kick: drawn path decides whether the wall is beaten ─────────────
{
  const res = { low: [] as (string | null)[], over: [] as (string | null)[], around: [] as (string | null)[] };
  for (let spot = 0; spot < 5; spot++) {
    for (let i = 0; i < 24; i++) {
      const s = setup(freekick, 300 + i, spot);
      const g = s.game;
      const B = g.ballPos.clone();
      const wallPos = g.wall!.players.filter((p) => p.root.visible).map((p) => p.root.position);
      const wallC = wallPos.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(wallPos.length);
      const farX = B.x > 0 ? -2.9 : 2.9;
      const mk = (fn: (s: number) => THREE.Vector3) => strokeOf3D(s.svc, Array.from({ length: 41 }, (_, k) => fn(k / 40)));
      // (a) hard drive straight through the middle of the wall (body height)
      const wallDir = new THREE.Vector3(wallC.x - B.x, 0, wallC.z - B.z);
      const Tlow = B.clone().addScaledVector(wallDir, (B.z) / -wallDir.z).setY(1.6);
      Tlow.z = 0;
      const low = mk((t) => new THREE.Vector3().lerpVectors(B, Tlow, t));
      // (b) arched over the wall, dropping into the far top area
      const Tover = new THREE.Vector3(farX * 0.75, 1.9, 0);
      const overS = mk((t) => new THREE.Vector3().lerpVectors(B, Tover, t).add(new THREE.Vector3(0, 2.4 * 4 * t * (1 - t), 0)));
      // (c) curled around the outside of the wall into the near post side
      const nearX = B.x > 0 ? 3.0 : -3.0;
      const Tar = new THREE.Vector3(Math.abs(B.x) < 2 ? 3 : nearX, 1.1, 0);
      const outward = Math.sign(Tar.x) * 2.6;
      const around = mk((t) => new THREE.Vector3().lerpVectors(B, Tar, t).add(new THREE.Vector3(outward * 4 * t * (1 - t), 0.3 * 4 * t * (1 - t), 0)));
      res.low.push(play(g, timed(low, 110), s.ctx).outcome);
      const s2 = setup(freekick, 300 + i, spot);
      res.over.push(play(s2.game, timed(overS, 260), s2.ctx).outcome);
      const s3 = setup(freekick, 300 + i, spot);
      res.around.push(play(s3.game, timed(around, 220), s3.ctx).outcome);
    }
  }
  const n = res.low.length;
  const low = tally(res.low);
  const ov = tally(res.over);
  const ar = tally(res.around);
  console.log('freekick · drive into wall:', pct(low, n));
  console.log('freekick · drawn over the wall:', pct(ov, n));
  console.log('freekick · curled around the wall:', pct(ar, n));
  check('free kick: a drive straight into the wall is BLOCKED', (low.BLOCKED ?? 0) > n * 0.85);
  check('free kick: a path drawn over the wall clears it', (ov.BLOCKED ?? 0) < n * 0.1);
  check('free kick: a path curled around the wall clears it', (ar.BLOCKED ?? 0) < n * 0.15);
  check('free kick: drawn paths over/around the wall can score', (ov.GOAL ?? 0) + (ar.GOAL ?? 0) > n * 0.4);
}

// ── 5. goalkeeper AI ────────────────────────────────────────────────────────
{
  // PENALTY: commits at/just before contact from the kicker read; often right, sometimes not
  const STEP = 1 / 120;
  const guesses: Record<string, number> = {};
  let rightWay = 0;
  let sided = 0;
  let earlyMoves = 0;
  let lateCommits = 0;
  let pg = 0;
  const pr = mulberry32(5);
  for (let i = 0; i < 300; i++) {
    const s = setup(penalty, 900 + i);
    const g = s.game;
    const end = goalPt(pr() < 0.5 ? 0.1 + pr() * 0.25 : 0.65 + pr() * 0.25, 0.1 + pr() * 0.8);
    const rd = readStroke(timed(screenStroke(ballS, end, (pr() * 2 - 1) * 40), 120 + pr() * 300), s.ctx, g.cfg)!;
    g.shoot(rd.input);
    const ct = g.kicker.contactTime;
    let commitAt = -1;
    for (let k = 0; k < 600 && !g.outcome; k++) {
      g.update(STEP);
      if (commitAt < 0 && g.keeper.committed) commitAt = g.kicker.elapsed;
      if (!g.keeper.committed && Math.abs(g.keeper.hipsWorldX()) > 0.02) earlyMoves++;
    }
    if (commitAt < ct - g.cfg.keeper.leadMax - 0.01) earlyMoves++;
    if (commitAt > ct + 0.02) lateCommits++;
    guesses[g.keeper.guess ?? '?'] = (guesses[g.keeper.guess ?? '?'] ?? 0) + 1;
    const bx = g.plan!.target.x;
    if (Math.abs(bx) > 1.2) {
      sided++;
      if (Math.sign(g.keeper.predicted.x) === Math.sign(bx) && Math.abs(g.keeper.predicted.x) > 0.6) rightWay++;
    }
    if (g.outcome === 'GOAL') pg++;
  }
  console.log('penalty keeper · guesses:', guesses, `· dived the right way ${Math.round((rightWay / sided) * 100)}% of side shots · goals ${Math.round((pg / 300) * 100)}%`);
  check('penalty keeper never moves before the strike and commits at/just before contact', earlyMoves === 0 && lateCommits === 0, { earlyMoves, lateCommits });
  const rw = rightWay / sided;
  check('penalty keeper guesses the right side ~70–80% (not always)', rw >= 0.68 && rw <= 0.82, `${Math.round(rw * 100)}%`);
  check('penalty keeper sometimes goes the wrong way or stays central', (guesses.wrong ?? 0) + (guesses.centre ?? 0) > 300 * 0.18);

  // FREE KICK: waits for the strike + human reaction, then reads the real ball
  const reactFast: number[] = [];
  const reactSlow: number[] = [];
  let movedBeforeLaunch = 0;
  let movedInsideReaction = 0;
  let fkSaves = 0;
  let fkOnTarget = 0;
  const fr = mulberry32(9);
  for (let i = 0; i < 150; i++) {
    const s = setup(freekick, 700 + i, i % 5);
    const g = s.game;
    const B = g.ballPos.clone();
    const tx = (fr() * 2 - 1) * 3.0;
    const T = new THREE.Vector3(tx, 0.6 + fr() * 1.6, 0);
    const lift = 2.0 + fr() * 1.2;
    const side = (fr() * 2 - 1) * 2.2;
    const pts = Array.from({ length: 41 }, (_, k) => {
      const t = k / 40;
      return s.svc.project(new THREE.Vector3().lerpVectors(B, T, t).add(new THREE.Vector3(side * 4 * t * (1 - t), lift * 4 * t * (1 - t), 0)));
    });
    const fast = i % 2 === 0;
    const rd = readStroke(timed(pts, fast ? 110 : 520), s.ctx, g.cfg)!;
    g.shoot(rd.input);
    let launchedAt = -1;
    let t = 0;
    for (let k = 0; k < 900 && !g.outcome; k++) {
      g.update(STEP);
      t += STEP;
      if (launchedAt < 0 && g.phase === 'flight') launchedAt = t;
      const moved = Math.abs(g.keeper.feetX) > 0.01 || g.keeper.committed;
      if (launchedAt < 0 && moved) movedBeforeLaunch++;
      if (launchedAt >= 0 && moved && t - launchedAt < g.keeper.reaction - 0.01) movedInsideReaction++;
    }
    (fast ? reactFast : reactSlow).push(g.keeper.reaction);
    if (g.outcome === 'GOAL' || g.outcome === 'SAVE') fkOnTarget++;
    if (g.outcome === 'SAVE') fkSaves++;
  }
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const all = [...reactFast, ...reactSlow];
  console.log(`free-kick keeper · reaction fast ${Math.round(avg(reactFast) * 1000)}ms / slow ${Math.round(avg(reactSlow) * 1000)}ms (range ${Math.round(Math.min(...all) * 1000)}–${Math.round(Math.max(...all) * 1000)}ms) · saves ${Math.round((fkSaves / fkOnTarget) * 100)}% of on-target`);
  check('free-kick keeper never moves before the ball is struck', movedBeforeLaunch === 0, movedBeforeLaunch);
  check('free-kick keeper never moves inside his reaction delay', movedInsideReaction === 0, movedInsideReaction);
  check('free-kick reaction 180–350 ms, quicker for fast shots', Math.min(...all) >= 0.18 && Math.max(...all) <= 0.35 && avg(reactFast) < avg(reactSlow) - 0.04);
  check('free-kick keeper saves some but not all on-target shots', fkSaves / fkOnTarget > 0.2 && fkSaves / fkOnTarget < 0.5, `${fkSaves}/${fkOnTarget}`);

  // reads the ball, not the drawn path: a late in-swinger fools his first estimate
  {
    const s = setup(freekick, 77, 1);
    const g = s.game;
    const B = g.ballPos.clone();
    const T = new THREE.Vector3(2.6, 1.3, 0);
    // heads left first, then curls hard back to the right post
    const pts = Array.from({ length: 41 }, (_, k) => {
      const t = k / 40;
      return s.svc.project(new THREE.Vector3().lerpVectors(B, T, t).add(new THREE.Vector3(-3.4 * 4 * t * (1 - t), 2.2 * 4 * t * (1 - t), 0)));
    });
    g.shoot(readStroke(timed(pts, 300), s.ctx, g.cfg)!.input);
    const estimates: number[] = [];
    let lastPred = NaN;
    for (let k = 0; k < 900 && !g.outcome; k++) {
      g.update(STEP);
      if (g.phase === 'flight' && g.keeper.stage === 'watch' && g.keeper.predicted.x !== lastPred) {
        lastPred = g.keeper.predicted.x;
        estimates.push(lastPred);
      }
      if (g.keeper.committed && estimates.length && estimates[estimates.length - 1] !== g.keeper.predicted.x) estimates.push(g.keeper.predicted.x);
    }
    const first = estimates[0];
    const final = g.keeper.predicted.x;
    console.log(`  curler: keeper's first read x=${first?.toFixed(2)} → final ${final.toFixed(2)} (ball crosses at ${T.x})`);
    check('free-kick keeper updates his read as the ball bends (first read ≠ final)', estimates.length > 2 && final - first > 0.8);
  }
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll simulation checks passed');
process.exit(failures ? 1 : 0);
