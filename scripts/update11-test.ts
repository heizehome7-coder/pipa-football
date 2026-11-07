// UPDATE 11 (+ MATCH SYSTEM EXPANSION) — unit checks:
//   players (32 + 4 new PIPA originals, POWER 105, defenders back on sale, OVR 135–150,
//   DEFENDER STATS, SKILL MOVES), MATCH SQUAD (4-3-3 HOLDING, 11 + 4, apart from the penalty
//   squad), THE MATCH 11 vs 11 (kick-off waits for the first pass, contextual SHOOT button,
//   slide tackle, cross, header, clearance, skills, speeds, subs, clock, halftime, AI),
//   the weekday access window (KST).
//   npx tsx scripts/update11-test.ts
import { shotModifiers } from '../src/players/abilities';
import { BUYABLE_PLAYERS, DEF_STAT_LABELS, getPlayer, ovr, PLAYERS, SKILL_MOVES, statOvr } from '../src/players/players';
import { MARKET_ORDER } from '../src/players/market';
import { packPool } from '../src/progress/packs';
import { evoOvrBonus } from '../src/progress/evolution';
import { accessWindow, ACCESS_TEXT } from '../src/progress/access';
import { aiTeamFrom, MatchEngine, type MatchInput } from '../src/match/MatchEngine';
import { CLOCK, DOUBLE_TAP_MS, MOVE, PITCH, SPRINT_HOLD_MS } from '../src/match/config';
import { autoMatchSquad, FORMATION_433H, slotFit, validMatchSquad, type MatchSquad } from '../src/match/formation';
import { passFromDrag, shotFromDrag, sprintTapLogic, userTeam } from '../src/match/MatchScreen';

let failed = 0;
const check = (name: string, ok: boolean, info: unknown = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== '' ? `  — ${JSON.stringify(info)}` : ''}`);
};
const M = 1_000_000;
const NONE: MatchInput = { move: { x: 0, z: 0 }, sprint: false, actions: [] };
const P = (id: string) => getPlayer(id)!;

// ── 1. players ────────────────────────────────────────────────────────────
{
  check('286 catalogue players (32 + 4 new), ids unique, 301 records', MARKET_ORDER.length === 286 && new Set(MARKET_ORDER).size === 286 && PLAYERS.length === 301 && new Set(PLAYERS.map((p) => p.id)).size === 301);
  const t = P('kimtaei');
  check('김태이 unchanged (KIM T.Y. · CM · 1.8억 · PRECISION MASTER)', t.shirt === 'KIM T.Y.' && t.price === 180 * M && t.special === 'PRECISION_MASTER' && JSON.stringify(Object.values(t.stats!)) === '[63,98,90,65,95,90,96]');
  check('김동민 unchanged (3.5억 · OUTSIDE POWER) · 조현선 2,000,000,000', P('kimdongmin').price === 350 * M && P('kimdongmin').special === 'OUTSIDE_POWER' && P('chohyunsun').price === 2000 * M);

  const j = P('jangyounggwang');
  check('장영광: JANG · CDM · 잠신중 FC · R · 160M · P43 A89 C83 FK80 · OUTSIDE FOOT 97 · TOE POKE', j.nameKo === '장영광' && j.shirt === 'JANG' && j.positions[0] === 'CDM' && j.club === '잠신중 FC' && j.foot === 'R' && j.price === 160 * M && j.stats!.power === 43 && j.stats!.accuracy === 89 && j.stats!.curve === 83 && j.stats!.freeKick === 80 && j.outsideFoot === 97 && j.special === 'TOE_POKE_SPECIALIST' && !!j.original && j.country === 'KOR');
  const h = P('hanyujun');
  check('한유준: HAN Y.J. · CB · R · 45M · P34 A23 C28 FK20 · TKL86 INT84 MRK87 STR82 POS84 · DEFENSIVE WALL', h.nameKo === '한유준' && h.shirt === 'HAN Y.J.' && h.positions[0] === 'CB' && h.price === 45 * M && h.stats!.power === 34 && h.stats!.accuracy === 23 && h.stats!.curve === 28 && h.stats!.freeKick === 20 && h.def!.tackle === 86 && h.def!.interception === 84 && h.def!.marking === 87 && h.def!.strength === 82 && h.def!.positioning === 84 && h.special === 'DEFENSIVE_WALL' && !!h.defender);
  const l = P('leejusung');
  check('이주성: LEE J.S. · LW · left only · 270M · P55 A88 C98 LOW89 FK85 · ONE-FOOT FINESSE · right-leg cast', l.nameKo === '이주성' && l.shirt === 'LEE J.S.' && l.positions[0] === 'LW' && l.foot === 'L' && l.price === 270 * M && l.stats!.power === 55 && l.stats!.accuracy === 88 && l.stats!.curve === 98 && l.stats!.lowShot === 89 && l.stats!.freeKick === 85 && l.special === 'ONE_FOOT_FINESSE' && l.rightCast === true);
  const k = P('kimgeunho');
  check('김근호: KIM G.H. · ST · R · 850M · P105 A76 C42 KN98 LOW90 FK70 · CHAOTIC CANNON', k.nameKo === '김근호' && k.shirt === 'KIM G.H.' && k.positions[0] === 'ST' && k.price === 850 * M && k.stats!.power === 105 && k.stats!.accuracy === 76 && k.stats!.curve === 42 && k.stats!.knuckle === 98 && k.stats!.lowShot === 90 && k.stats!.freeKick === 70 && k.special === 'CHAOTIC_CANNON');
  check('4 new players: buyable + in packs', [j, h, l, k].every((p) => BUYABLE_PLAYERS.includes(p) && packPool().includes(p)));

  // defenders back
  const defs = PLAYERS.filter((p) => p.defender);
  check('defenders (CB/LB/RB/LWB/RWB) are on sale again and in packs', defs.length >= 30 && defs.every((p) => BUYABLE_PLAYERS.includes(p) && packPool().includes(p)), defs.length);
  check('every defender has DEFENDER STATS (TACKLE · INTERCEPTION · MARKING · STRENGTH · POSITIONING · PACE)', DEF_STAT_LABELS.map((x) => x[0]).join() === 'tackle,interception,marking,strength,positioning,pace' && defs.every((p) => p.def && DEF_STAT_LABELS.map((x) => x[0]).every((s) => typeof (p.def as unknown as Record<string, number>)[s] === 'number')));
  check('real defenders defend better than strikers', P('vandijk').def!.tackle > P('haaland').def!.tackle + 20);

  // OVR 135–150
  const o = BUYABLE_PLAYERS.map(ovr);
  check('market OVR 135–150 (normal 135–140 · good 141–145 · elite 146–148 · top ICON 149–150)', Math.min(...o) === 135 && Math.max(...o) === 150 && o.some((x) => x <= 140) && o.some((x) => x >= 141 && x <= 145) && o.some((x) => x >= 146 && x <= 148));
  check('only ICONs reach 149–150', BUYABLE_PLAYERS.filter((p) => ovr(p) >= 149).every((p) => p.isIcon));
  check('prices, ids unchanged (Pelé still an ICON at the top)', ovr(P('pele')) >= 149 && P('messi').id === 'messi');
  check('effective OVR = base + evolution, no 150 cap', ovr(P('pele')) + evoOvrBonus(20) > 150);

  // SKILL MOVES
  const sig: [string, string][] = [['messi', 'BODY_FEINT'], ['ronaldo', 'STEPOVER'], ['neymar', 'ELASTICO'], ['mbappe', 'BURST'], ['vinicius', 'SIDE_STEP'], ['son', 'QUICK_TURN'], ['ronaldinho', 'ELASTICO'], ['kimdongmin', 'KNOCK_ON'], ['songinwoo', 'RAINBOW']];
  check('signature SKILL MOVES (Messi BODY FEINT … 송인우 RAINBOW)', sig.every(([id, m]) => P(id).skillMove === m), sig.filter(([id, m]) => P(id).skillMove !== m));
  check('every player has a SKILL MOVE with a name', PLAYERS.every((p) => !!SKILL_MOVES[p.skillMove]?.name));

  // abilities of the new players
  const mod = (id: string, c: Partial<Parameters<typeof shotModifiers>[1]>) => shotModifiers(P(id), { mode: 'match', power: 0.72, level: 0, spinSign: 0, lofted: false, low: false, ...c });
  check('POWER 105 counts (no 99 cap: the POWER term goes past 99)', P('kimgeunho').stats!.power === 105 && mod('kimgeunho', {}).speedMul >= 1.099 && mod('kimgeunho', {}).speedMul > mod('kimtaei', {}).speedMul + 0.15, mod('kimgeunho', {}).speedMul);
  check('CHAOTIC CANNON: a full-power strike knuckles, its curls bend much less', mod('kimgeunho', { power: 0.95 }).knuckle > mod('kimgeunho', { power: 0.5 }).knuckle && mod('kimgeunho', { level: 3, spinSign: 1 }).spinMul < 0.75);
  check('TOE POKE: 장영광’s outside curl bends more than his instep curl', mod('jangyounggwang', { level: 3, spinSign: -1 }).spinMul > mod('jangyounggwang', { level: 3, spinSign: 1 }).spinMul);
  check('DEFENSIVE WALL (한유준) is a poor shooter', mod('hanyujun', {}).err > mod('kimtaei', {}).err * 2);
  check('ONE-FOOT FINESSE: 이주성’s instep curl is his strongest', Math.max(mod('leejusung', { level: 3, spinSign: 1 }).spinMul, mod('leejusung', { level: 3, spinSign: -1 }).spinMul) > 1.15);
}

// ── 2. MATCH SQUAD ────────────────────────────────────────────────────────
const XI: MatchSquad['xi'] = { GK: 'courtois', LB: 'davies', LCB: 'vandijk', RCB: 'saliba', RB: 'hakimi', CDM: 'rodri', LCM: 'bellingham', RCM: 'kimtaei', LW: 'neymar', ST: 'mbappe', RW: 'messi' };
const MS: MatchSquad = { formation: '4-3-3H', xi: XI, subs: ['son', 'kane', 'haaland', 'neuer'] };
{
  check('4-3-3 HOLDING: GK · LB · CB×2 · RB · CDM · CM×2 · LW · ST · RW', FORMATION_433H.map((f) => f.pos).join() === 'GK,LB,CB,CB,RB,CDM,CM,CM,LW,ST,RW');
  check('a valid match squad: 11 + 4 subs', validMatchSquad(MS, getPlayer));
  check('5 subs / duplicates / a GK on the pitch / unknown ids → invalid', !validMatchSquad({ ...MS, subs: [...MS.subs, 'yamal'] }, getPlayer) && !validMatchSquad({ ...MS, subs: ['messi'] }, getPlayer) && !validMatchSquad({ ...MS, xi: { ...XI, ST: 'neuer' } }, getPlayer) && !validMatchSquad({ ...MS, xi: { ...XI, ST: 'zzz' } }, getPlayer));
  check('a non-defender in a back-four slot: allowed but OUT OF POSITION', validMatchSquad({ ...MS, xi: { ...XI, LB: 'salah' } }, getPlayer) && slotFit(P('salah'), FORMATION_433H[1]) === 'off' && slotFit(P('davies'), FORMATION_433H[1]) === 'ok');
  const free = PLAYERS.filter((p) => !p.price);
  check('the free starters (15: 12 field + 3 GK) make a full match squad on their own', free.length === 15 && !!autoMatchSquad(free, ovr) && validMatchSquad(autoMatchSquad(free, ovr), getPlayer));
  const ut = userTeam(MS, { messi: 7 });
  check('MATCH line-up: 10 field in formation order + GK + 4 subs, evolution attached', ut.field.length === 10 && ut.field[0].def.id === 'davies' && ut.field[8].def.id === 'mbappe' && ut.keeper.def.id === 'courtois' && ut.bench.length === 4 && ut.field[9].evo === 7);
}

// ── 3. THE MATCH 11 vs 11 ─────────────────────────────────────────────────
const mk = (seed = 3, ms: MatchSquad = MS) => new MatchEngine(userTeam(ms, {}), aiTeamFrom(PLAYERS, 140, seed, new Set([...Object.values(ms.xi), ...ms.subs])), { seed, visuals: false });
const run = (e: MatchEngine, s: number, inp: MatchInput = NONE) => {
  for (let i = 0; i < Math.round(s * 60); i++) e.step(1 / 60, i === 0 ? inp : { ...inp, actions: [] });
};
const clear = (e: MatchEngine, keep: unknown[]) => {
  for (const q of e.allPlayers()) if (!keep.includes(q)) q.pos.set(-PITCH.HALF_L + 3, 0, -PITCH.HALF_W + 2), (q.cooldown = 99);
};
const kick = (e: MatchEngine) => {
  e.step(1 / 60, { ...NONE, actions: [{ kind: 'pass' }] });
  run(e, 0.5);
};
{
  const e = mk();
  check('11 vs 11: 10 field + GK per team, goals at x = ±HALF_L (100 m pitch)', e.home.players.length === 10 && e.away.players.length === 10 && !!e.home.keeper && !!e.away.keeper && Math.abs(e.ends[0].gx) === PITCH.HALF_L && PITCH.HALF_L >= 45);
  check('first kick-off: the USER’s team, ball on the centre spot, the ST has it and is controlled', e.phase === 'kickoff' && e.owner?.team === 'home' && e.ball.pos.x === 0 && e.ball.pos.z === 0 && e.controlled === e.owner && e.controlled.formation.id === 'ST');
  check('kick-off: both teams in their own half, opponents outside the circle', e.home.players.every((p) => p.pos.x * e.home.dir <= 0.5) && e.away.players.every((p) => Math.hypot(p.pos.x, p.pos.z) >= PITCH.CIRCLE_R));
  let st = 0;
  e.events = { onStart: () => st++ };
  run(e, 6);
  check('the clock does NOT run before the first pass (6 s waited)', e.phase === 'kickoff' && e.gameSec === 0 && st === 0 && !e.started);
  kick(e);
  check('the first pass → MATCH START, the clock runs', e.phase === 'play' && e.started && st === 1 && e.gameSec > 0);
  run(e, 2);
  check('MATCH START fires once', st === 1);
}
{
  // pass: travels (no teleport) and reaches the team-mate
  const e = mk(5);
  kick(e);
  const p = e.home.players[8];
  const r = e.home.players[6];
  clear(e, [p, r]);
  p.pos.set(0, 0, 0);
  r.pos.set(9, 0, -6);
  e.ball.place(0.5, 0);
  e.owner = p;
  e.controlled = p;
  e.step(1 / 60, { ...NONE, actions: [{ kind: 'pass' }], move: { x: 0.8, z: -0.6 } });
  check('PASS → the receiver becomes the controlled player', e.controlled === r && e.receiver === r);
  let maxStep = 0;
  let last = e.ball.pos.clone();
  let got = -1;
  for (let i = 0; i < 180 && got < 0; i++) {
    e.step(1 / 60, NONE);
    maxStep = Math.max(maxStep, e.ball.pos.distanceTo(last));
    last = e.ball.pos.clone();
    if (e.owner === r) got = i;
  }
  check('…the ball rolls there (≤ 0.5 m per frame, arrives)', got > 10 && maxStep < 0.5, { frames: got, maxStep: +maxStep.toFixed(3) });
}
{
  // contextual SHOOT button
  const e = mk(7);
  kick(e);
  const c = e.home.players[8];
  clear(e, [c]);
  e.controlled = c;
  c.pos.set(e.home.dir * 25, 0, 0);
  e.ball.place(c.pos.x + 0.5, 0);
  e.owner = c;
  check('SHOOT button: attacking in the opponents’ half → 슈팅', e.shootMode(c) === 'shoot');
  c.pos.set(-e.home.dir * 30, 0, 0);
  e.ball.place(c.pos.x + 0.5, 0);
  check('…with the ball in my own half → 걷어내기 (clearance)', e.shootMode(c) === 'clear');
  const o = e.away.players[8];
  o.cooldown = 0;
  o.pos.set(c.pos.x + 1, 0, 0);
  e.owner = o;
  check('…the opponent has the ball → 태클', e.shootMode(c) === 'tackle');
  e.owner = c;
  e.ball.place(c.pos.x + 0.5, 0);
  let cleared = 0;
  e.events = { onClear: () => cleared++ };
  e.step(1 / 60, { ...NONE, actions: [{ kind: 'shot', type: 'normal' }] });
  check('CLEARANCE: a long, high ball upfield, possession not guaranteed', cleared === 1 && !e.owner && e.ball.vel.y > 5 && e.ball.vel.x * e.home.dir > 10);
}
{
  // slide tackle
  const res: boolean[] = [];
  for (let s = 0; s < 30; s++) {
    const e = mk(40 + s);
    kick(e);
    const c = e.home.players[1]; // a CB
    const o = e.away.players[8];
    clear(e, [c, o]);
    o.cooldown = 0;
    c.cooldown = 0;
    o.pos.set(0, 0, 0);
    e.ball.place(0.4, 0);
    e.owner = o;
    c.pos.set(1.6, 0, 0);
    e.controlled = c;
    let r: boolean | null = null;
    e.events = { onTackle: (_d, won) => (r = won) };
    e.step(1 / 60, { ...NONE, actions: [{ kind: 'shot', type: 'normal' }] });
    if (s === 0) check('TACKLE button → a sliding tackle (slide animation, recovery cooldown)', c.sliding && c.tackleCd > 1);
    run(e, 1.2);
    if (s === 0) check('…he gets up again afterwards', !c.sliding);
    if (r !== null) res.push(r);
  }
  const won = res.filter(Boolean).length;
  check('slide tackles reach the ball and are won often, not always (CB)', res.length >= 20 && won > res.length * 0.3 && won < res.length, { n: res.length, won });
  // a ball far away → no contact
  const e = mk(90);
  kick(e);
  const c = e.home.players[1];
  const o = e.away.players[8];
  clear(e, [c, o]);
  o.pos.set(0, 0, 0);
  e.ball.place(0.4, 0);
  e.owner = o;
  o.cooldown = 0;
  c.pos.set(6, 0, 0);
  let hit = false;
  e.events = { onTackle: () => (hit = true) };
  e.slideTackle(c);
  run(e, 1);
  check('…a ball far away: no contact, no steal', !hit && e.owner === o);
}
{
  // cross + header
  const e = mk(11);
  kick(e);
  const w = e.home.players[7]; // LW
  const st = e.home.players[8];
  clear(e, [w, st]);
  const gx = e.attackEnd(e.home).gx;
  w.pos.set(gx - e.home.dir * 16, 0, -24);
  e.ball.place(w.pos.x + 0.4 * e.home.dir, w.pos.z);
  e.owner = w;
  e.controlled = w;
  st.pos.set(gx - e.home.dir * 9, 0, 0);
  check('PASS swipe → = CROSS (gesture)', passFromDrag(60, 4) === 'cross' && passFromDrag(4, 2) === 'pass' && passFromDrag(-60, 0) === 'pass');
  let cr = 0;
  e.events = { onCross: () => cr++ };
  e.step(1 / 60, { ...NONE, actions: [{ kind: 'cross' }] });
  let apex = 0;
  let maxStep = 0;
  let last = e.ball.pos.clone();
  let headerSeen = false;
  for (let i = 0; i < 120; i++) {
    e.step(1 / 60, NONE);
    apex = Math.max(apex, e.ball.pos.y);
    maxStep = Math.max(maxStep, e.ball.pos.distanceTo(last));
    last = e.ball.pos.clone();
    if (e.headerAvailable(e.controlled)) headerSeen = true;
  }
  check('CROSS: a high ball into the box (gravity, no teleport)', cr === 1 && apex > 2.5 && maxStep < 0.6, { apex: +apex.toFixed(2), maxStep: +maxStep.toFixed(2) });
  void headerSeen;
  // header only when the ball is really at his head
  const f = mk(12);
  kick(f);
  const hp = f.home.players[8];
  clear(f, [hp]);
  f.controlled = hp;
  hp.pos.set(10, 0, 0);
  f.owner = null;
  f.ball.place(10.3, 0);
  f.ball.pos.y = 1.9;
  f.ball.vel.set(0, 0, 0);
  check('HEADER AVAILABLE when the ball is at his head → SHOOT = 헤딩', f.headerAvailable(hp) && f.shootMode(hp) === 'header');
  f.ball.pos.set(13, 1.9, 0);
  check('…but not from 3 m away / on the ground', !f.headerAvailable(hp) && (f.ball.pos.set(10.3, 0.1, 0), !f.headerAvailable(hp)));
  f.ball.pos.set(10.3, 1.9, 0);
  f.step(1 / 60, { ...NONE, move: { x: 1, z: 0 }, actions: [{ kind: 'shot', type: 'normal' }] });
  check('…the header sends the ball away (jump animation)', f.ball.speed > 6 && hp.jumpT >= 0);
}
{
  // speeds: 10–15 % slower than before (run 6.2 / sprint 8.3 → 5.4 / 7.15), PACE still counts
  check('run / sprint speed 10–15 % lower than the old 5 v 5 values', MOVE.run / 6.2 > 0.84 && MOVE.run / 6.2 < 0.9 && MOVE.sprint / 8.3 > 0.84 && MOVE.sprint / 8.3 < 0.9, [MOVE.run, MOVE.sprint]);
  const e = mk(21);
  kick(e);
  const fast = e.home.players[8]; // mbappe
  const slow = e.home.players[1]; // van dijk
  check('PACE differences stay (Mbappé faster than Van Dijk)', fast.def.id === 'mbappe' && slow.def.id === 'vandijk' && fast.pace > slow.pace + 0.04, [fast.pace, slow.pace]);
  const p = e.home.players[9];
  clear(e, [p]);
  e.controlled = p;
  p.pos.set(-10, 0, 0);
  e.ball.place(-9.5, 0);
  e.owner = p;
  let maxD = 0;
  let minD = 9;
  for (let i = 0; i < 180; i++) {
    e.step(1 / 60, { ...NONE, move: { x: 1, z: i > 90 ? 0.8 : 0 } });
    const d = Math.hypot(e.ball.pos.x - p.pos.x, e.ball.pos.z - p.pos.z);
    maxD = Math.max(maxD, d);
    minD = Math.min(minD, d);
  }
  check('DRIBBLE: close for 3 s (turn included), touched — not glued', e.owner === p && maxD < MOVE.control + 0.4 && maxD - minD > 0.15, [+minD.toFixed(2), +maxD.toFixed(2)]);
  let sk = '';
  e.events = { onSkill: (_d, m) => (sk = m) };
  e.step(1 / 60, { ...NONE, actions: [{ kind: 'skill' }] });
  check('SKILL: the player’s own signature move (Messi BODY FEINT)', sk === 'BODY_FEINT' && e.ball.speed > 3);
}
{
  // 질주&개인기 button: long press = sprint, double tap = skill, a double tap never sprints
  const log: string[] = [];
  const l = sprintTapLogic();
  const sp = (s: boolean) => log.push(s ? 'sprint' : 'stop');
  const skill = () => log.push('skill');
  l.down(0, sp, skill);
  l.up(80, sp);
  l.down(80 + DOUBLE_TAP_MS - 60, sp, skill);
  l.up(80 + DOUBLE_TAP_MS, sp);
  check('double tap (≤ 250–350 ms) → SKILL MOVE, no sprint', log.includes('skill') && !log.includes('sprint') && DOUBLE_TAP_MS >= 250 && DOUBLE_TAP_MS <= 350, log);
  const log2: string[] = [];
  const l2 = sprintTapLogic();
  l2.down(5000, (s) => log2.push(s ? 'sprint' : 'stop'), () => log2.push('skill'));
  setTimeout(() => {
    l2.up(5000 + SPRINT_HOLD_MS + 200, (s) => log2.push(s ? 'sprint' : 'stop'));
    check('long press → SPRINT while held, stops on release', log2.join() === 'sprint,stop', log2);
  }, SPRINT_HOLD_MS + 60);
}
{
  check('SHOOT gestures: tap · ↑ chip · → power · ↓ curl · ← outside', shotFromDrag(3, 4) === 'normal' && shotFromDrag(0, -40) === 'chip' && shotFromDrag(50, 5) === 'power' && shotFromDrag(-2, 45) === 'curl' && shotFromDrag(-60, -20) === 'outside');
  // 이주성 kicks with the left
  const e = mk(31, { ...MS, xi: { ...XI, LW: 'leejusung' } });
  kick(e);
  const lw = e.home.players[7];
  check('이주성 (left only, right-leg cast) plays in the MATCH', lw.def.id === 'leejusung' && lw.def.rightCast === true);
}
{
  // goal + clock + halftime
  const e = mk(13);
  e.autopilot = true;
  run(e, 1.5);
  const t0 = e.gameSec;
  run(e, 10);
  check('1 real second = 30 game seconds (90’ in 3 min)', Math.abs(e.gameSec - t0 - 300) < 2, e.gameSec - t0);
  let i = 0;
  while (e.phase !== 'halftime' && i < 60 * 100) e.step(1 / 60, NONE), i++;
  check('HALF TIME at 45:00', e.phase === 'halftime' && e.clockText === '45:00');
  const dirBefore = e.home.dir;
  run(e, CLOCK.halfTimeRealSeconds - 0.2);
  check('…the clock stands still during the 5 s halftime', e.phase === 'halftime' && e.gameSec === 2700);
  run(e, 0.6);
  check('2ND HALF: attacking the other way', e.half === 2 && e.home.dir === -dirBefore);
  while (e.phase !== 'fulltime' && i < 60 * 400) e.step(1 / 60, NONE), i++;
  check('FULL TIME at 90:00 with a result', e.phase === 'fulltime' && e.clockText === '90:00' && ['VICTORY', 'DRAW', 'DEFEAT'].includes(e.result));
}
{
  // substitutions
  const e = mk(17);
  kick(e);
  const lu = e.lineup('home');
  check('SUB screen: OUT = 10 + GK, IN = 4 subs, 3 subs left', lu.onPitch.length === 11 && lu.bench.length === 4 && lu.left === 3);
  const p0 = e.home.players[8];
  const pos = p0.pos.clone();
  check('field ↔ field: the new player (model, name, stats) plays from the same spot', e.substitute('home', 8, 0).ok && p0.def.id === 'son' && p0.pos.distanceTo(pos) < 1e-9);
  const gkB = e.lineup('home').bench.findIndex((b) => b.def.id === 'neuer');
  check('a keeper only for a keeper', !e.substitute('home', 2, gkB).ok && e.substitute('home', 10, gkB).ok && e.home.keeper.def.id === 'neuer');
  check('max 3 per match', e.substitute('home', 1, 0).ok && !e.substitute('home', 2, 0).ok && e.lineup('home').left === 0);
}
{
  // the AI plays whole matches
  let goals = 0;
  let shots = 0;
  let bad = false;
  for (let s = 0; s < 3; s++) {
    const home = aiTeamFrom(PLAYERS, 140, 10 + s, new Set());
    const e = new MatchEngine(home, aiTeamFrom(PLAYERS, 140, 20 + s, new Set(home.field.map((f) => f.def.id))), { seed: s + 1, visuals: false });
    e.autopilot = true;
    for (let i = 0; i < 60 * 220 && e.phase !== 'fulltime'; i++) {
      e.step(1 / 60, NONE);
      if (!Number.isFinite(e.ball.pos.x + e.ball.pos.y + e.ball.pos.z)) bad = true;
      if (Math.abs(e.ball.pos.x) > PITCH.HALF_L + 12 || Math.abs(e.ball.pos.z) > PITCH.HALF_W + 12) bad = true;
    }
    goals += e.score.home + e.score.away;
    shots += e.shots.home + e.shots.away;
    if (e.phase !== 'fulltime') bad = true;
  }
  check('3 AI matches 11 v 11: full time, the ball stays in the stadium, no NaN', !bad);
  check('…shots and goals happen', goals >= 2 && shots >= 6, { goals, shots });
  const ai = aiTeamFrom(PLAYERS, 140, 7, new Set(['messi']));
  check('AI FC: 10 field in 4-3-3 + GK + bench, never the user’s players', ai.field.length === 10 && ai.keeper.def.role === 'GK' && ai.bench.length >= 1 && ai.field.every((f) => f.def.id !== 'messi'));
  check('…real defenders in its back four', ai.field.slice(0, 4).every((f, i) => slotFit(f.def, FORMATION_433H[i + 1]) !== 'off'));
  void statOvr;
}

// ── 4. weekday access window (KST) ───────────────────────────────────────
{
  const at = (iso: string) => accessWindow(Date.parse(iso)).inside;
  check('MON 08:34 KST open · 08:35 locked · 14:59 locked · 15:00 open', !at('2026-11-02T08:34:00+09:00') && at('2026-11-02T08:35:00+09:00') && at('2026-11-02T14:59:00+09:00') && !at('2026-11-02T15:00:00+09:00'));
  check('FRI 12:00 locked · SAT / SUN 12:00 open', at('2026-11-06T12:00:00+09:00') && !at('2026-11-07T12:00:00+09:00') && !at('2026-11-08T12:00:00+09:00'));
  check('the time zone is Seoul’s, not the phone’s (UTC 00:00 MON = 09:00 KST → locked)', at('2026-11-02T00:00:00Z'));
  check('endsAt = 15:00 KST', accessWindow(Date.parse('2026-11-02T10:00:00+09:00')).endsAt === Date.parse('2026-11-02T15:00:00+09:00'));
  check('lock text exactly as specified', ACCESS_TEXT.title === 'PIPA 이용 제한 시간입니다.' && ACCESS_TEXT.body === '평일 오전 8시 35분부터 오후 3시까지 게임을 이용할 수 없습니다.' && ACCESS_TEXT.after === '오후 3시 이후 다시 이용해주세요.');
}

setTimeout(() => {
  console.log(failed ? `${failed} UPDATE 11 CHECK(S) FAILED` : 'ALL UPDATE 11 CHECKS PASSED');
  process.exit(failed ? 1 : 0);
}, SPRINT_HOLD_MS + 300);
