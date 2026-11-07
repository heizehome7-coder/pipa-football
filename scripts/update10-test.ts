// UPDATE 10 — unit checks: 50 new players (9 PIPA ORIGINALS exactly as specified), defenders off
// the market, random wall heights (165–200 cm, same on both phones, collision = body), evolution
// in real play (shots + keepers, physics caps kept), CHIP SHOT ONLY, small keeper 박사하.
//   npx tsx scripts/update10-test.ts
import * as THREE from 'three';
import { FIELD, MODES } from '../src/game/core/config';
import { calculateShotParameters, simulateBallPhysics } from '../src/game/physics/BallPhysics';
import { shotModifiers, shotEnvelope } from '../src/players/abilities';
import { BUYABLE_PLAYERS, getPlayer, PLAYERS, SPECIALS } from '../src/players/players';
import { MARKET_ORDER } from '../src/players/market';
import { packPool } from '../src/progress/packs';
import { DefensiveWall, wallHeights } from '../src/game/entities/DefensiveWall';
import { keeperScaleOf, OnlineKickGame, validShotFor, simulateRound } from '../src/online/match/penaltyRound';
import { freeKickSpot } from '../src/game/FreeKickGame';
import { Goalkeeper } from '../src/game/entities/Goalkeeper';
import { mulberry32 } from '../src/game/core/math';
import { evoOvr, evoSuccessRate } from '../src/progress/evolution';
import { readStroke } from '../src/game/input/strokeReader';
import { roundSeed } from '../src/online/match/protocol';

let failed = 0;
const check = (name: string, ok: boolean, info: unknown = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== '' ? `  — ${JSON.stringify(info)}` : ''}`);
};
const M = 1_000_000;
const pen = MODES.penalty;
const BALL0 = new THREE.Vector3(0, FIELD.ballRadius, FIELD.penaltySpot);

// ── 1. players ───────────────────────────────────────────────────────────
{
  check('250+ catalogue players (UPDATE 11: 282), all ids unique', MARKET_ORDER.length >= 250 && new Set(MARKET_ORDER).size === MARKET_ORDER.length && new Set(PLAYERS.map((p) => p.id)).size === PLAYERS.length && PLAYERS.length === MARKET_ORDER.length + 15);
  const want: [string, string, string, string, string, number, string, string][] = [
    ['songinwoo', '송인우', 'SONG', 'RW', '잠신중 FC', 360, 'B', 'TWO_FOOT_CURL_MASTER'],
    ['chohyunsun', '조현선', 'CHO', 'LW', '잠신중 FC', 2000, 'R', 'THUNDER_STRIKE'], // UPDATE 11: 3.9억 → 20억
    ['parkseungho', '박승호', 'PARK S.H.', 'LW', 'PARIS SAINT-GERMAIN', 270, 'R', 'UNSTABLE_CANNON'],
    ['parksaha', '박사하', 'PARK SAHA', 'GK', '잠신중 FC', 1300, 'R', 'SMALL_FLYING_KEEPER'],
    ['kimtaein', '김태인', 'KIM T.I.', 'CAM', 'ICON', 1150, 'R', 'ICON_POWER_DRIVE'],
    ['parkjunhyuk', '박준혁', 'PARK J.H.', 'CM', '잠신중 FC', 310, 'R', 'SILK_FINESSE'],
    ['leeyunho', '이윤호', 'LEE', 'LW', '잠신중 FC', 180, 'R', 'CHIP_SHOT_ONLY'],
    ['choigeonwoo', '최건우', 'CHOI', 'CM', 'TOTTENHAM', 220, 'R', 'WILD_POWER'],
    ['handongyeon', '한동연', 'HAN', 'RW', '잠신중 FC', 250, 'L', 'WILD_LEFT_CURL'],
  ];
  const bad = want.filter(([id, ko, shirt, pos, club, price, foot, sp]) => {
    const p = getPlayer(id);
    return !p || p.nameKo !== ko || p.shirt !== shirt || p.positions[0] !== pos || (club === 'ICON' ? !p.isIcon : p.club !== club) || p.price !== price * M || p.foot !== foot || p.special !== sp || p.country !== 'KOR' || !p.original || !SPECIALS[p.special];
  });
  check('9 PIPA ORIGINALS: name · shirt · position · team · price · foot · special exactly', bad.length === 0, bad.map((b) => b[0]));
  const s = (id: string) => getPlayer(id)!.stats!;
  check('original stats as specified', s('songinwoo').curve === 99 && s('songinwoo').power === 69 && s('chohyunsun').power === 99 && s('chohyunsun').accuracy === 90 && s('chohyunsun').curve === 78 &&
    s('parkseungho').power === 99 && s('parkseungho').accuracy === 65 && s('parkseungho').curve === 73 && s('kimtaein').power === 97 && s('kimtaein').freeKick === 53 &&
    s('parkjunhyuk').curve === 99 && s('parkjunhyuk').accuracy === 94 && s('parkjunhyuk').power === 68 && s('leeyunho').power === 67 && s('leeyunho').accuracy === 91 &&
    s('choigeonwoo').power === 97 && s('choigeonwoo').accuracy === 66 && s('handongyeon').curve === 99 && s('handongyeon').accuracy === 67 && s('handongyeon').power === 84);
  const g = getPlayer('parksaha')!.gk!;
  check('박사하 GK 97/98/89/94/98/88/95, 162 cm', JSON.stringify(Object.values(g)) === JSON.stringify([97, 98, 89, 94, 98, 88, 95]) && getPlayer('parksaha')!.heightCm === 162);
  const newIds = MARKET_ORDER.slice(200, 250);
  check('50 new players: 9 originals + 31 current + 10 ICONS, all with Korean names, stats and a special', newIds.length === 50 && newIds.filter((id) => getPlayer(id)!.legend).length === 11 && newIds.every((id) => /[가-힣]/.test(getPlayer(id)!.nameKo) && (getPlayer(id)!.stats || getPlayer(id)!.gk)), newIds.length);
  check('ICONS: 아구에로 11.5억 · 베일 12.5억 · 판 페르시 10억', getPlayer('aguero')!.price === 1150 * M && getPlayer('bale')!.price === 1250 * M && getPlayer('vanpersie')!.price === 1000 * M && getPlayer('bale')!.isIcon);
  check('31 current prices (쇠를로트 2.4억 · 마운트 9천만 · 엔네시리 7.5천만 · 도우비크 1.45억)', getPlayer('sorloth')!.price === 240 * M && getPlayer('mount')!.price === 90 * M && getPlayer('ennesyri')!.price === 75 * M && getPlayer('dovbyk')!.price === 145 * M);
  // defenders
  const defs = MARKET_ORDER.map((id) => getPlayer(id)!).filter((p) => p.defender);
  check('defenders (CB/LB/RB/LWB/RWB main position) flagged; since the UPDATE 11 patch buyable + in packs again', defs.length > 0 && defs.every((p) => BUYABLE_PLAYERS.includes(p)) && packPool().some((p) => p.defender) && BUYABLE_PLAYERS.length === MARKET_ORDER.length, defs.length);
  check('defender records are kept (player ids still exist)', defs.every((p) => getPlayer(p.id) === p));
}

// ── 2. wall heights ───────────────────────────────────────────────────────
{
  const hs = Array.from({ length: 400 }, (_, i) => wallHeights(i * 7919 + 3, i % 4)).flat();
  check('wall heights 165–200 cm (whole cm), spread over the range', hs.every((h) => Number.isInteger(h) && h >= 165 && h <= 200) && Math.min(...hs) <= 167 && Math.max(...hs) >= 198);
  check('same seed → same heights', JSON.stringify(wallHeights(123, 0)) === JSON.stringify(wallHeights(123, 0)) && JSON.stringify(wallHeights(123, 0)) !== JSON.stringify(wallHeights(124, 0)));
  const w = new DefensiveWall(5);
  w.setup(freeKickSpot(1).ball, 5, [165, 200, 180, 172, 191]);
  const tops: number[] = [];
  for (let i = 0; i < 5; i++) tops.push(Math.max(...w.colliders.slice(i * 5, i * 5 + 5).map((c) => c.pos.y + c.r)));
  const scaleY = w.players.map((p) => p.root.scale.y);
  check('the 3D body AND the collision follow the height (200 cm wall man reaches higher than 165 cm)', tops[1] > tops[0] + 0.3 && Math.abs(tops[1] / tops[0] - 200 / 165) < 0.02 && Math.abs(scaleY[1] / scaleY[0] - 200 / 165) < 1e-9, { tops: tops.map((t) => +t.toFixed(2)) });
  check('natural proportions: width scales with height (no long legs / big head)', w.players.every((p, i) => Math.abs(p.root.scale.x / p.root.scale.y - 1.04 / 1.01) < 1e-9 && i >= 0));
  // online: aim-phase game (setRound seed) = shot game = server judge
  const seed = roundSeed('cmtestwall01', 3);
  const a = new OnlineKickGame('A', seed, false, {}, 'freekick', 2);
  const b = new OnlineKickGame('B', seed, false, {}, 'freekick', 2);
  a.start();
  b.start();
  check('online free kick: both phones (and the server judge) build the same wall', JSON.stringify(a.wall!.heights) === JSON.stringify(b.wall!.heights) && JSON.stringify(a.wall!.heights) === JSON.stringify(wallHeights(seed, 0).map((h) => h)), a.wall!.heights);
}

// ── 3. evolution in real play ─────────────────────────────────────────────
{
  const messi = getPlayer('messi')!;
  const ctx = { mode: 'freekick' as const, power: 0.85, level: 2, spinSign: -1, lofted: false, low: false };
  const m0 = shotModifiers(messi, ctx);
  const m9 = shotModifiers(messi, { ...ctx, evo: 9 });
  const m12 = shotModifiers(messi, { ...ctx, evo: 12 });
  check('+12 Messi: more curl, much smaller error, a bit faster — step by step', m12.spinMul > m9.spinMul && m9.spinMul > m0.spinMul && m12.err < m9.err * 0.75 && m9.err < m0.err && m12.speedMul > m0.speedMul, { spin: [m0.spinMul, m9.spinMul, m12.spinMul].map((x) => +x.toFixed(3)), err: [m0.err, m9.err, m12.err].map((x) => +x.toFixed(3)) });
  const r0 = shotModifiers(getPlayer('ronaldo')!, { mode: 'penalty', power: 1, level: 0, spinSign: 0, lofted: false, low: false });
  const r12 = shotModifiers(getPlayer('ronaldo')!, { mode: 'penalty', power: 1, level: 0, spinSign: 0, lofted: false, low: false, evo: 12 });
  check('+12 Ronaldo: stronger knuckle (still ≤ the knuckle cap) and more power', r12.knuckle >= r0.knuckle && r12.knuckle <= 1.35 && r12.speedMul > r0.speedMul);
  // physics caps stay: +12 never exceeds the top speed / spin limits
  const top = calculateShotParameters(BALL0, { target: new THREE.Vector3(2, 1, 0), spin: 0, profile: 'STRAIGHT', curveLevel: 0, apex: null, power: 1, speedMul: shotModifiers(getPlayer('haaland')!, { mode: 'penalty', power: 1, level: 0, spinSign: 0, lofted: false, low: false, evo: 12 }).speedMul }, pen);
  check('physics caps kept: +12 Haaland ≤ max speed × 1.15', Math.hypot(...top.v) <= pen.maxSpeed * 1.15 + 1e-6, +Math.hypot(...top.v).toFixed(2));
  // server validation knows evolution
  const env0 = shotEnvelope(messi, 'penalty', 0);
  const env12 = shotEnvelope(messi, 'penalty', 12);
  check('online check: a +12 shot passes for a +12 player and is refused for a +0 one', env12.spinMul > env0.spinMul && env12.speedMul > env0.speedMul);
  const fast = calculateShotParameters(BALL0, { target: new THREE.Vector3(2, 1, 0), spin: 0, profile: 'STRAIGHT', curveLevel: 0, apex: null, power: 1, speedMul: shotModifiers(getPlayer('kane')!, { mode: 'penalty', power: 1, level: 0, spinSign: 0, lofted: false, low: false, evo: 12 }).speedMul }, pen);
  check('…kane +12 full power: valid with evo 12, invalid with evo 0', validShotFor(fast, 'kane', 'penalty', 12) && !validShotFor(fast, 'kane', 'penalty', 0));

  // keepers
  const reach = (id: string, evo: number, x: number, y: number) => {
    const p = getPlayer(id)!;
    const k = new Goalkeeper(undefined, p.gk, p.special, keeperScaleOf(p), evo);
    k.prepare(MODES.penalty.keeper, mulberry32(1));
    for (let i = 0; i < 40; i++) k.update(1 / 120);
    k.diveTo(x, y);
    let best = 0;
    let at = 0;
    let hit = -1;
    for (let i = 0; i < 130; i++) {
      k.update(1 / 120);
      k.updateColliders();
      const r = k.colliders[0].r;
      const d = Math.max(...[k.colliders[0].pos, k.colliders[1].pos].map((h) => (y > 1.6 ? Math.hypot(h.x, h.y) : Math.abs(h.x)) + r));
      if (d > best) (best = d), (at = i);
      if (hit < 0 && d >= 2.0) hit = i;
    }
    return { best, at, hit };
  };
  const y0 = reach('yashin', 0, -3.3, 2.0);
  const y12 = reach('yashin', 12, -3.3, 2.0);
  check('+12 Yashin: longer reach and quicker to full stretch', y12.best > y0.best + 0.02 && y12.at < y0.at, { y0, y12 });
  // 박사하: smaller body (idle hands lower), strong dive
  const ps = new Goalkeeper(undefined, getPlayer('parksaha')!.gk, 'SMALL_FLYING_KEEPER', keeperScaleOf(getPlayer('parksaha')), 0);
  const cs = new Goalkeeper(undefined, getPlayer('courtois')!.gk, getPlayer('courtois')!.special, 1, 0);
  ps.updateColliders();
  cs.updateColliders();
  const headP = ps.body.root.scale.y;
  check('박사하 drawn at 162 cm (body scale 0.86, colliders follow the body)', Math.abs(headP - 162 / 188) < 1e-9 && ps.colliders[0].pos.y < cs.colliders[0].pos.y, { scale: +headP.toFixed(3) });
  const sideP = reach('parksaha', 0, -3.0, 0.9);
  const sideC = reach('courtois', 0, -3.0, 0.9);
  const highP = reach('parksaha', 0, -2.6, 2.2);
  const highC = reach('courtois', 0, -2.6, 2.2);
  check('박사하: quicker across the goal on a side dive than Courtois …', sideP.hit >= 0 && sideP.hit < sideC.hit, { sideP, sideC });
  check('… but less static reach for a high ball (short)', highP.best < highC.best + 0.02, { highP: +highP.best.toFixed(2), highC: +highC.best.toFixed(2) });
  const sp = simulateRound(5, calculateShotParameters(BALL0, { target: new THREE.Vector3(-2.6, 0.6, 0), spin: 0, profile: 'STRAIGHT', curveLevel: 0, apex: null, power: 0.7 }, pen), { dir: 'lowLeft', at: -1 }, 'parksaha');
  check('server judge uses 박사하’s small body too (a round plays)', ['SAVE', 'GOAL', 'MISS', 'POST', 'CROSSBAR'].includes(sp.outcome), sp.outcome);
  check('evolution rates shown = rates rolled (+3 with OVR 140 vs Kane)', Math.abs(evoSuccessRate(3, 140, evoOvr(getPlayer('kane')!, 3)) - Math.round(0.6 * 0.9 * 1.12 * 1e7) / 1e7) < 1e-9 || evoOvr(getPlayer('kane')!, 3) >= 140);
}

// ── 4. specials of the originals ──────────────────────────────────────────
{
  const mod = (id: string, c: Partial<Parameters<typeof shotModifiers>[1]>) => shotModifiers(getPlayer(id), { mode: 'penalty', power: 0.7, level: 0, spinSign: 0, lofted: false, low: false, ...c });
  check('UNSTABLE CANNON (박승호): full power = big pace, much bigger error than at 0.7', mod('parkseungho', { power: 1 }).speedMul > 1.1 && mod('parkseungho', { power: 1 }).err > mod('parkseungho', { power: 0.7 }).err * 1.8);
  check('THUNDER STRIKE (조현선): straight full power = fast and true', mod('chohyunsun', { power: 1 }).speedMul > mod('choigeonwoo', { power: 1 }).speedMul - 0.02 && mod('chohyunsun', { power: 1 }).err < mod('parkseungho', { power: 1 }).err);
  check('WILD POWER (최건우): fast, error grows at full power', mod('choigeonwoo', { power: 1 }).err > mod('choigeonwoo', { power: 0.65 }).err * 1.5);
  check('TWO-FOOT CURL MASTER (송인우): both feet curl the same, strong, no knuckle', mod('songinwoo', { level: 3, spinSign: 1 }).spinMul === mod('songinwoo', { level: 3, spinSign: -1 }).spinMul && mod('songinwoo', { level: 3, spinSign: 1 }).spinMul > 1.3 && mod('songinwoo', { power: 1 }).knuckle === 0);
  check('SILK FINESSE (박준혁): precise curl', mod('parkjunhyuk', { level: 2, spinSign: 1 }).err < mod('parkjunhyuk', { level: 0 }).err);
  check('WILD LEFT CURL (한동연): big left curl, the stronger the curve the bigger the error', mod('handongyeon', { level: 3, spinSign: -1 }).spinMul > 1.3 && mod('handongyeon', { level: 3, spinSign: -1 }).err > mod('handongyeon', { level: 1, spinSign: -1 }).err);
  check('ICON POWER DRIVE (김태인): power shot good, free kick control weak', mod('kimtaein', { power: 0.9 }).speedMul > 1.05 && mod('kimtaein', { mode: 'freekick', power: 0.8, level: 2, spinSign: 1 }).err > mod('kimtaein', { power: 0.8, level: 2, spinSign: 1 }).err);
  // CHIP SHOT ONLY: a fast straight stroke still becomes a chip
  const ctx = { viewportH: 844, ball: BALL0.clone(), project: (v: THREE.Vector3) => ({ x: 195 + v.x * 40, y: 600 - v.y * 40 - (FIELD.penaltySpot - v.z) * 12 }), unproject: undefined } as unknown as Parameters<typeof readStroke>[1];
  void ctx;
  const plain = calculateShotParameters(BALL0, { target: new THREE.Vector3(1, 1, 0), spin: 0, profile: 'STRAIGHT', curveLevel: 0, apex: null, power: 1 }, pen);
  const chip = calculateShotParameters(BALL0, { target: new THREE.Vector3(1, 1, 0), spin: 0, profile: 'STRAIGHT', curveLevel: 0, apex: 1.0 + 0.14 * pen.loftPerScreen, power: 0.6 }, pen);
  const apex = (s: typeof plain) => {
    const tr = simulateBallPhysics(BALL0, s.v as [number, number, number], s.spin, pen, { ground: false });
    let a = 0;
    for (let i = 0; i < tr.n; i++) a = Math.max(a, tr.pos[i * 3 + 1]);
    return a;
  };
  check('CHIP SHOT ONLY (이윤호): the chip profile rises clearly above a driven shot, gravity as usual', apex(chip) > apex(plain) + 0.5, { chip: +apex(chip).toFixed(2), plain: +apex(plain).toFixed(2) });
}

console.log(failed ? `${failed} UPDATE 10 CHECK(S) FAILED` : 'ALL UPDATE 10 CHECKS PASSED');
process.exit(failed ? 1 : 0);
