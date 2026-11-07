import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useGoalCard } from '../components/GoalCard';
import { PlayerAvatar } from '../components/PlayerArt';
import { getPlayer, ovr, PLAYERS, SKILL_MOVES, SPECIALS, statOvr, type PlayerDef } from '../players/players';
import { evoOvrBonus } from '../progress/evolution';
import { CLOCK, DOUBLE_TAP_MS, MATCH_WARNING, MOVE, SHOOT_MODE_LABEL, SHOT_LABEL, SPRINT_HOLD_MS, type ShootMode, type ShotType } from './config';
import { FORMATION_433H, type MatchSquad } from './formation';
import { aiTeamFrom, MatchEngine, type Action, type GoalEvent, type MatchInput, type MatchPhase, type TeamSetup } from './MatchEngine';
import { MatchView } from './MatchView';
import { isPortrait, releaseLandscape } from './orientation';

/** UPDATE 11 — the warning before the MATCH: big X · [계속하기] */
export function MatchWarning({ onClose, onContinue }: { onClose: () => void; onContinue: () => void }) {
  return (
    <div className="detail-backdrop confirm match-warn" data-testid="match-warning" role="dialog" aria-modal="true">
      <div className="detail-card confirm-card match-warn-card">
        <button className="match-warn-x" onClick={onClose} aria-label="닫기" data-testid="match-warning-x">
          ✕
        </button>
        <span className="match-warn-tag">MATCH · BETA</span>
        <p className="match-warn-text" data-testid="match-warning-text">
          {MATCH_WARNING}
        </p>
        <button className="btn-primary" onClick={onContinue} data-testid="match-warning-continue">
          계속하기
        </button>
      </div>
    </div>
  );
}

/** the MATCH squad → engine line-up (10 field in formation order + GK, 4 subs) */
export function userTeam(ms: MatchSquad, evo: Record<string, number>, name = 'PIPA FC'): TeamSetup {
  const get = (id: string) => getPlayer(id)!;
  return {
    name,
    field: FORMATION_433H.slice(1).map((f) => ({ def: get(ms.xi[f.id]), evo: evo[ms.xi[f.id]] ?? 0 })),
    keeper: { def: get(ms.xi.GK), evo: evo[ms.xi.GK] ?? 0 },
    bench: ms.subs.map((id) => ({ def: get(id), evo: evo[id] ?? 0 })).filter((b) => !!b.def),
  };
}

const recKey = (nick: string) => `pipa.match5.v1.${nick.trim().toLowerCase()}`;
/** MATCH records are kept apart (no rewards, not the online record) — structure for later */
function saveRecord(nick: string, r: { at: string; home: number; away: number; result: string; opponent: string; mode: string }) {
  try {
    const list = JSON.parse(localStorage.getItem(recKey(nick)) || '[]');
    list.unshift(r);
    localStorage.setItem(recKey(nick), JSON.stringify(list.slice(0, 30)));
  } catch {
    /* private mode */
  }
}

type Hud = { clock: string; half: 1 | 2; phase: MatchPhase; home: number; away: number; htLeft: number; subsLeft: number; mode: ShootMode; kickoffMine: boolean; started: boolean };

export function MatchScreen({ matchSquad, evo, nickname, onHome }: { matchSquad: MatchSquad; evo: Record<string, number>; nickname: string; onHome: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const nameTag = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MatchEngine | null>(null);
  const input = useRef<MatchInput>({ move: { x: 0, z: 0 }, sprint: false, actions: [] });
  const joy = useRef({ x: 0, z: 0 });
  const keys = useRef(new Set<string>());
  const [hud, setHud] = useState<Hud | null>(null);
  const [goal, setGoal] = useState<GoalEvent | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [subOpen, setSubOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [portrait, setPortrait] = useState(isPortrait());
  const [round, setRound] = useState(0);
  const goalCard = useGoalCard();
  const saved = useRef(false);
  const lastHud = useRef('');

  const flash = useCallback((t: string) => {
    setToast(t);
    window.setTimeout(() => setToast((x) => (x === t ? null : x)), 1600);
  }, []);

  // landscape: watch the phone turning; leave full screen / the lock when the match ends
  useEffect(() => {
    const on = () => setPortrait(isPortrait());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
      releaseLandscape();
    };
  }, []);
  // a paused match while the phone is upright / the SUB screen / the menu is open
  useEffect(() => {
    const e = engineRef.current;
    if (e) e.paused = portrait || subOpen || menu;
  }, [portrait, subOpen, menu, round]);

  useEffect(() => {
    if (!host.current) return;
    const mine = userTeam(matchSquad, evo);
    const ids = new Set([...mine.field, ...mine.bench, mine.keeper].map((x) => x.def.id));
    const avg = mine.field.reduce((a, b) => a + statOvr(b.def), 0) / Math.max(1, mine.field.length);
    const ai = aiTeamFrom(PLAYERS, avg, (Date.now() + round * 7919) & 0x7fffffff, ids);
    const engine = new MatchEngine(mine, ai);
    engineRef.current = engine;
    engine.paused = isPortrait();
    saved.current = false;
    engine.events = {
      onStart: () => {
        setBanner('MATCH START');
        window.setTimeout(() => setBanner((b) => (b === 'MATCH START' ? null : b)), 1500);
      },
      onGoal: (e) => {
        setGoal(e);
        window.setTimeout(() => goalCard.show(`m11:${round}:${engine.goals.length}`, e.scorer, e.evo), 900);
        window.setTimeout(() => setGoal((g) => (g === e ? null : g)), CLOCK.goalPause * 1000 - 300);
      },
      onSave: (_t, k) => flash(`SAVE! ${k.nameKo}`),
      onOut: (k) => flash(k === 'throw' ? 'THROW-IN' : 'GOAL KICK'),
      onSub: (t, o, i) => flash(`${t === 'home' ? '' : 'AI FC '}교체 · ${o.nameKo} → ${i.nameKo}`),
      onSkill: (p, m) => flash(`${p.nameKo} · ${SKILL_MOVES[m].name}`),
      onTackle: (p, won) => p && engine.allPlayers().some((q) => q.def === p && q.team === 'home') && flash(won ? `${p.nameKo} 태클 성공!` : '태클 실패'),
      onCross: () => flash('CROSS!'),
    };
    const v = new MatchView(
      host.current,
      engine,
      () => {
        const k = keys.current;
        let x = joy.current.x;
        let z = joy.current.z;
        const kx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
        const kz = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
        if (kx || kz) {
          const l = Math.hypot(kx, kz);
          x = kx / l;
          z = kz / l;
        }
        const cur = input.current;
        const out: MatchInput = { move: { x, z }, sprint: cur.sprint || k.has('shift'), actions: cur.actions };
        cur.actions = [];
        return out;
      },
      () => {
        const e = engine;
        const h: Hud = {
          clock: e.clockText,
          half: e.half,
          phase: e.phase,
          home: e.score.home,
          away: e.score.away,
          htLeft: e.phase === 'halftime' ? Math.max(0, Math.ceil(CLOCK.halfTimeRealSeconds - e.phaseT)) : 0,
          subsLeft: MOVE.maxSubs - e.home.subsUsed,
          mode: e.shootMode(),
          kickoffMine: e.phase === 'kickoff' && e.kickoffTeam === 'home',
          started: e.started,
        };
        const key = JSON.stringify(h);
        if (key !== lastHud.current) {
          lastHud.current = key;
          setHud(h);
        }
        // the controlled player's name under him (like a TV broadcast)
        const tag = nameTag.current;
        if (tag) {
          const c = e.controlled;
          const pt = v.project(c.pos);
          tag.style.transform = `translate(${Math.round(pt.x)}px, ${Math.round(pt.y + 8)}px) translateX(-50%)`;
          tag.textContent = c.def.nameKo;
          tag.style.opacity = e.phase === 'play' || e.phase === 'kickoff' ? '1' : '0';
        }
        if (e.phase === 'fulltime' && !saved.current) {
          saved.current = true;
          saveRecord(nickname, { at: new Date().toISOString(), home: e.score.home, away: e.score.away, result: e.result, opponent: ai.name, mode: '11v11' });
        }
      },
    );
    (window as unknown as { __PIPA_MATCH5?: unknown }).__PIPA_MATCH5 = {
      engine,
      view: v,
      act: (a: Action) => input.current.actions.push(a),
      setMove: (x: number, z: number) => (joy.current = { x, z }),
      setSprint: (s: boolean) => (input.current.sprint = s),
    };
    return () => {
      v.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  // PC: WASD / arrows · Shift sprint · J pass · K through · C cross · L shoot (or clear / tackle / header) · 1–5 shots · E/Space skill
  useEffect(() => {
    const shotKeys: Record<string, ShotType> = { '1': 'normal', '2': 'chip', '3': 'power', '4': 'curl', '5': 'outside' };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (e.repeat) return;
      keys.current.add(k);
      const q = input.current.actions;
      if (k === 'j') q.push({ kind: 'pass' });
      else if (k === 'k') q.push({ kind: 'through' });
      else if (k === 'c') q.push({ kind: 'cross' });
      else if (k === 'l') q.push({ kind: 'shot', type: 'normal' });
      else if (shotKeys[k]) q.push({ kind: 'shot', type: shotKeys[k] });
      else if (k === ' ' || k === 'e') q.push({ kind: 'skill' });
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const home = () => {
    releaseLandscape();
    onHome();
  };
  const e = engineRef.current;
  const result = e && hud?.phase === 'fulltime' ? e.result : null;
  const mode = hud?.mode ?? 'shoot';
  return (
    <div className="screen match5 m11" data-testid="match5" data-phase={hud?.phase ?? 'kickoff'} data-mode={mode}>
      <div className="match5-stage" ref={host} />
      <div className="m11-name" ref={nameTag} data-testid="m11-name" />
      {/* scoreboard (top-left, broadcast style) */}
      <div className="m11-score" data-testid="m5-score">
        <span className="m11-team home">PIPA FC</span>
        <b className="m11-goals" data-testid="m5-goals">
          <em data-testid="m5-home">{hud?.home ?? 0}</em>
          <i aria-hidden>▾</i>
          <em data-testid="m5-away">{hud?.away ?? 0}</em>
        </b>
        <span className="m11-team away">AI FC</span>
        <span className="m11-clock" data-testid="m5-clock">
          {hud?.clock ?? '00:00'}
        </span>
        <span className="m11-half" data-testid="m5-half">
          {hud?.phase === 'halftime' ? 'HALF TIME' : hud?.phase === 'fulltime' ? 'FULL TIME' : hud?.half === 2 ? '2ND HALF' : '1ST HALF'}
        </span>
      </div>
      <button className="m11-menu-btn" onClick={() => setMenu(true)} data-testid="m11-menu" aria-label="메뉴">
        <i />
        <i />
        <i />
      </button>
      {menu && (
        <div className="m11-menu" data-testid="m11-menu-panel">
          <button onClick={() => (setMenu(false), setSubOpen(true))} disabled={!hud || hud.phase === 'fulltime'} data-testid="m5-sub-btn">
            SUB · 선수 교체 <em>{hud?.subsLeft ?? MOVE.maxSubs}</em>
          </button>
          <button onClick={home} data-testid="m5-home-btn">
            ‹ HOME
          </button>
          <button onClick={() => setMenu(false)} data-testid="m11-menu-close">
            계속하기
          </button>
        </div>
      )}
      {hud?.kickoffMine && (
        <div className="m11-hint" data-testid="m11-kickoff-hint">
          KICK OFF · 패스로 경기를 시작하세요
        </div>
      )}
      {banner && (
        <div className="m11-banner" data-testid="m11-banner">
          {banner}
        </div>
      )}
      {mode === 'header' && (
        <div className="m11-header-on" data-testid="m11-header">
          HEADER AVAILABLE
        </div>
      )}

      <Joystick onMove={(x, z) => (joy.current = { x, z })} />
      <div className="m11-buttons" onContextMenu={(ev) => ev.preventDefault()}>
        <ShotButton mode={mode} onShot={(t) => input.current.actions.push({ kind: 'shot', type: t })} />
        <TapButton cls="m11-through" label="스루" testid="m5-through" onTap={() => input.current.actions.push({ kind: 'through' })} />
        <PassButton onPass={() => input.current.actions.push({ kind: 'pass' })} onCross={() => input.current.actions.push({ kind: 'cross' })} />
        <SprintButton onSprint={(s) => (input.current.sprint = s)} onSkill={() => input.current.actions.push({ kind: 'skill' })} />
      </div>

      {toast && (
        <div className="m5-toast" data-testid="m5-toast">
          {toast}
        </div>
      )}
      {goal && (
        <div className="m5-goal" data-testid="m5-goal">
          <b>GOAL!</b>
          <span data-testid="m5-scorer">
            {goal.scorer.nameKo} {goal.minute}'{goal.ownGoal ? ' (자책골)' : ''}
          </span>
        </div>
      )}
      {goalCard.el}
      {hud?.phase === 'halftime' && (
        <div className="m5-banner" data-testid="m5-halftime">
          <b>HALF TIME</b>
          <span>
            PIPA FC {hud.home} : {hud.away} AI FC
          </span>
          <em>{subOpen ? '교체 선택 중 · 타이머 정지' : `후반전 ${hud.htLeft}초 뒤 시작`}</em>
        </div>
      )}
      {result && hud && (
        <div className="detail-backdrop m5-full" data-testid="m5-fulltime" data-result={result}>
          <div className="detail-card m5-full-card">
            <span className="m5-full-tag">FULL TIME</span>
            <div className="m5-full-score">
              <span>PIPA FC</span>
              <b>{hud.home}</b>
              <i>:</i>
              <b>{hud.away}</b>
              <span>AI FC</span>
            </div>
            <strong className={`m5-result ${result.toLowerCase()}`} data-testid="m5-result">
              {result}
            </strong>
            <p className="m5-full-note">경기 모드는 보상과 온라인 시즌 전적에 포함되지 않아요</p>
            <div className="detail-actions">
              <button className="btn-primary" onClick={() => (setGoal(null), setRound((r) => r + 1))} data-testid="m5-again">
                다시 경기
              </button>
              <button className="btn-ghost" onClick={home} data-testid="m5-home">
                HOME
              </button>
            </div>
          </div>
        </div>
      )}
      {subOpen && e && <SubScreen engine={e} onClose={() => setSubOpen(false)} onDone={(t) => (flash(t), setSubOpen(false))} />}
      {portrait && (
        <div className="m11-rotate" data-testid="m11-rotate">
          <div className="m11-rotate-phone" aria-hidden />
          <b>휴대폰을 가로로 돌려주세요.</b>
          <span>MATCH는 가로 화면으로 플레이해요</span>
          <button className="btn-ghost" onClick={home} data-testid="m11-rotate-home">
            HOME
          </button>
        </div>
      )}
    </div>
  );
}

function SubRow({ def, evo, gk, on, onPick, testid, slot, off }: { def: PlayerDef; evo: number; gk: boolean; on: boolean; onPick: () => void; testid: string; slot?: string; off?: boolean }) {
  return (
    <li>
      <button className={`m5-sub-row ${on ? 'on' : ''}`} onClick={onPick} data-testid={testid} data-id={def.id}>
        <PlayerAvatar player={def} size={30} />
        <span className="m5-sub-text">
          <b>
            {slot ? <i className="m11-slot">{slot}</i> : null}
            {def.nameKo}
            {off ? ' ⚠' : ''}
          </b>
          <em>
            {gk ? 'GK' : def.positions[0]} · OVR {ovr(def) + evoOvrBonus(evo)}
            {evo ? ` · +${evo}` : ''} · {def.stats ? `PWR ${def.stats.power} ACC ${def.stats.accuracy}` : def.gk ? `REF ${def.gk.reflex}` : ''} · {SPECIALS[def.special]?.name}
          </em>
        </span>
      </button>
    </li>
  );
}

/** SUB: OUT (on the pitch) ↔ IN (bench) · [교체 확정] · max 3 per match */
function SubScreen({ engine, onClose, onDone }: { engine: MatchEngine; onClose: () => void; onDone: (t: string) => void }) {
  const [out, setOut] = useState<number | null>(null);
  const [inn, setInn] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const lu = useMemo(() => engine.lineup('home'), [engine]);
  const ok = out !== null && inn !== null && lu.left > 0;
  const confirm = () => {
    if (out === null || inn === null) return;
    const o = lu.onPitch[out].def;
    const i = lu.bench[inn].def;
    const r = engine.substitute('home', out, inn);
    if (!r.ok) return setMsg(r.message ?? '교체할 수 없어요');
    onDone(`교체 완료 · ${o.nameKo} OUT → ${i.nameKo} IN`);
  };
  return (
    <div className="detail-backdrop m5-sub" data-testid="m5-sub">
      <div className="detail-card m5-sub-card">
        <div className="m5-sub-head">
          <b>SUBSTITUTION</b>
          <span data-testid="m5-sub-left">
            남은 교체 {lu.left}/{MOVE.maxSubs}
          </span>
        </div>
        <div className="m5-sub-cols">
          <div>
            <p className="eyebrow">OUT · 출전 중</p>
            <ul>
              {lu.onPitch.map((p, i) => (
                <SubRow key={p.def.id + i} def={p.def} evo={p.evo} gk={p.gk} slot={p.slot} off={p.offPos} on={out === i} onPick={() => (setOut(i), setMsg(null))} testid="m5-sub-out" />
              ))}
            </ul>
          </div>
          <div>
            <p className="eyebrow">IN · 벤치</p>
            <ul>
              {lu.bench.map((p, i) => (
                <SubRow key={p.def.id + i} def={p.def} evo={p.evo} gk={p.gk} on={inn === i} onPick={() => (setInn(i), setMsg(null))} testid="m5-sub-in" />
              ))}
              {!lu.bench.length && <li className="dev-empty">벤치에 선수가 없어요 · MATCH SQUAD SETUP</li>}
            </ul>
          </div>
        </div>
        {lu.left <= 0 && <p className="dev-msg bad">교체를 모두 사용했어요 (최대 {MOVE.maxSubs}회)</p>}
        {msg && (
          <p className="dev-msg bad" data-testid="m5-sub-msg">
            {msg}
          </p>
        )}
        <div className="detail-actions">
          <button className="btn-primary" disabled={!ok} onClick={confirm} data-testid="m5-sub-confirm">
            교체 확정
          </button>
          <button className="btn-ghost" onClick={onClose} data-testid="m5-sub-cancel">
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

/** left joystick (FC style: a gold ring with a gold knob), analog, pointer capture */
function Joystick({ onMove }: { onMove: (x: number, z: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [on, setOn] = useState(false);
  const id = useRef<number | null>(null);
  const R = 44;
  const set = (ev: RPointerEvent<HTMLDivElement>) => {
    const r = base.current!.getBoundingClientRect();
    let dx = ev.clientX - (r.left + r.width / 2);
    let dy = ev.clientY - (r.top + r.height / 2);
    const l = Math.hypot(dx, dy);
    if (l > R) (dx *= R / l), (dy *= R / l);
    setKnob({ x: dx, y: dy });
    const m = Math.hypot(dx, dy) / R;
    // screen right = along the pitch (+x), screen down = towards the camera (+z)
    onMove(m < 0.15 ? 0 : dx / R, m < 0.15 ? 0 : dy / R);
  };
  const end = () => {
    id.current = null;
    setOn(false);
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };
  return (
    <div
      className={`m5-joy m11-joy ${on ? 'on' : ''}`}
      ref={base}
      data-testid="m5-joystick"
      onPointerDown={(ev) => {
        id.current = ev.pointerId;
        capture(ev);
        setOn(true);
        set(ev);
      }}
      onPointerMove={(ev) => id.current === ev.pointerId && set(ev)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="m5-joy-knob m11-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  );
}

/** pointer capture (a finger sliding off the button still counts); never fatal */
function capture(ev: RPointerEvent<HTMLElement>) {
  try {
    ev.currentTarget.setPointerCapture(ev.pointerId);
  } catch {
    /* an old browser / a synthetic event */
  }
}

function Chevrons({ dirs }: { dirs: ('u' | 'd' | 'l' | 'r')[] }) {
  return (
    <span className="m11-chev" aria-hidden>
      {dirs.map((d) => (
        <i key={d} className={d} />
      ))}
    </span>
  );
}

function TapButton({ cls, label, testid, onTap }: { cls: string; label: string; testid: string; onTap: () => void }) {
  return (
    <button
      className={`m11-btn ${cls}`}
      onPointerDown={(ev) => {
        ev.preventDefault();
        onTap();
      }}
      data-testid={testid}
    >
      <Chevrons dirs={['u', 'd']} />
      <b>{label}</b>
    </button>
  );
}

/** PASS: tap = pass · swipe → = CROSS */
export function passFromDrag(dx: number, dy: number, minPx = 26): 'pass' | 'cross' {
  return dx > minPx && Math.abs(dx) > Math.abs(dy) ? 'cross' : 'pass';
}
function PassButton({ onPass, onCross }: { onPass: () => void; onCross: () => void }) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const [drag, setDrag] = useState(false);
  return (
    <button
      className={`m11-btn m11-pass ${drag ? 'dragging' : ''}`}
      data-testid="m5-pass"
      onPointerDown={(ev) => {
        ev.preventDefault();
        capture(ev);
        start.current = { x: ev.clientX, y: ev.clientY, id: ev.pointerId };
      }}
      onPointerMove={(ev) => {
        const s = start.current;
        if (s && s.id === ev.pointerId) setDrag(passFromDrag(ev.clientX - s.x, ev.clientY - s.y) === 'cross');
      }}
      onPointerUp={(ev) => {
        const s = start.current;
        start.current = null;
        setDrag(false);
        if (!s || s.id !== ev.pointerId) return;
        if (passFromDrag(ev.clientX - s.x, ev.clientY - s.y) === 'cross') onCross();
        else onPass();
      }}
      onPointerCancel={() => ((start.current = null), setDrag(false))}
    >
      <Chevrons dirs={['u', 'd', 'l', 'r']} />
      <b>{drag ? '크로스' : '패스'}</b>
    </button>
  );
}

/**
 * 질주 & 개인기: hold = sprint · two quick taps (≤ 320 ms) = the skill move. The second tap of
 * a double tap never starts a sprint (the classic bug).
 */
export function sprintTapLogic() {
  let lastTap = -1e9;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let downAt = 0;
  let skillPress = false;
  return {
    down(now: number, onSprint: (s: boolean) => void, onSkill: () => void) {
      downAt = now;
      if (now - lastTap <= DOUBLE_TAP_MS) {
        skillPress = true;
        lastTap = -1e9;
        onSkill();
        return;
      }
      skillPress = false;
      holdTimer = setTimeout(() => onSprint(true), SPRINT_HOLD_MS);
    },
    up(now: number, onSprint: (s: boolean) => void) {
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = null;
      if (!skillPress && now - downAt < SPRINT_HOLD_MS) lastTap = now;
      skillPress = false;
      onSprint(false);
    },
  };
}
function SprintButton({ onSprint, onSkill }: { onSprint: (s: boolean) => void; onSkill: () => void }) {
  const logic = useRef(sprintTapLogic());
  const [on, setOn] = useState(false);
  const sprint = (s: boolean) => (onSprint(s), setOn(s));
  return (
    <button
      className={`m11-btn m11-sprint ${on ? 'on' : ''}`}
      data-testid="m5-sprint"
      onPointerDown={(ev) => {
        ev.preventDefault();
        capture(ev);
        logic.current.down(performance.now(), sprint, onSkill);
      }}
      onPointerUp={() => logic.current.up(performance.now(), sprint)}
      onPointerCancel={() => logic.current.up(performance.now(), sprint)}
    >
      <Chevrons dirs={['u', 'd', 'l', 'r']} />
      <b>
        질주
        <small>&amp;</small>
        개인기
      </b>
    </button>
  );
}

/** the gesture of the SHOOT button: tap = shot · ↑ chip · → power · ↓ curl · ← outside */
export function shotFromDrag(dx: number, dy: number, minPx = 18): Exclude<ShotType, 'header'> {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < minPx) return 'normal';
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'power' : 'outside';
  return dy < 0 ? 'chip' : 'curl';
}

function ShotButton({ mode, onShot }: { mode: ShootMode; onShot: (t: ShotType) => void }) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const [drag, setDrag] = useState<ShotType | null>(null);
  const gest = mode === 'shoot';
  return (
    <button
      className={`m11-btn m11-shot mode-${mode} ${drag ? 'dragging' : ''}`}
      data-testid="m5-shot"
      data-mode={mode}
      data-drag={drag ?? ''}
      onPointerDown={(ev) => {
        ev.preventDefault();
        capture(ev);
        start.current = { x: ev.clientX, y: ev.clientY, id: ev.pointerId };
        setDrag('normal');
      }}
      onPointerMove={(ev) => {
        const s = start.current;
        if (!s || s.id !== ev.pointerId || !gest) return;
        setDrag(shotFromDrag(ev.clientX - s.x, ev.clientY - s.y));
      }}
      onPointerUp={(ev) => {
        const s = start.current;
        start.current = null;
        setDrag(null);
        if (!s || s.id !== ev.pointerId) return;
        onShot(gest ? shotFromDrag(ev.clientX - s.x, ev.clientY - s.y) : 'normal');
      }}
      onPointerCancel={() => ((start.current = null), setDrag(null))}
    >
      <Chevrons dirs={['u', 'd', 'l', 'r']} />
      <b data-testid="m11-shoot-label">{gest && drag && drag !== 'normal' ? SHOT_LABEL[drag] : SHOOT_MODE_LABEL[mode]}</b>
      {gest && (
        <span className="m5-shot-hints" aria-hidden>
          <i className="u">칩</i>
          <i className="r">파워</i>
          <i className="d">감아</i>
          <i className="l">아웃</i>
        </span>
      )}
    </button>
  );
}
