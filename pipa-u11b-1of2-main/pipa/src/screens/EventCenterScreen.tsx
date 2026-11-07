import { useEffect, useMemo, useRef, useState } from 'react';
import { VersionBadge } from '../components/VersionBadge';
import { AccountError, accountApi, accountsAvailable, newNonce, type AccountReply, type HongGradeId, type PackPull, type PotatoSessionView, type PotatoStats } from '../online/account';
import { formatFV, formatMP, type Wallet } from '../players/ownership';
import { HONG, HONG_GRADES, POTATO, potatoScore, type PotatoKind } from '../progress/events';
import { TOP_LEGENDS } from '../progress/packs';
import { getPlayer } from '../players/players';
import { PackOpening } from './PacksScreen';

/**
 * UPDATE 9 — EVENT CENTER: 홍 나와라 뚝딱 · 감자의 제왕.
 * The phone only SHOWS what the server decided: every draw, every potato, every score and
 * every reward comes from the server (FV is charged there, in the same write as the result).
 * No sound — visual effects only.
 */
type View = 'center' | 'hong' | 'potato';

export function EventCenterScreen({ wallet, token, onReply, onBack }: { wallet: Wallet; token: string | null; onReply: (r: AccountReply) => void; onBack: () => void }) {
  const [view, setView] = useState<View>('center');
  const online = accountsAvailable() && !!token;
  if (view === 'hong') return <HongScreen wallet={wallet} token={token} online={online} onReply={onReply} onBack={() => setView('center')} />;
  if (view === 'potato') return <PotatoScreen wallet={wallet} token={token} online={online} onReply={onReply} onBack={() => setView('center')} />;
  return (
    <div className="screen events" data-testid="events">
      <header className="modes-top">
        <button className="btn-ghost" onClick={onBack} data-testid="events-back">
          ‹ 홈
        </button>
        <VersionBadge />
      </header>
      <div className="dev-head">
        <span className="mini-logo dev-logo">PIPA</span>
        <h2 className="dev-title">EVENT CENTER</h2>
        <p className="dev-sub">이벤트 센터 · {online ? `보유 ${formatFV(wallet.progress?.fv ?? 0)}` : '이벤트는 Render 서버 버전에서 참여할 수 있어요'}</p>
      </div>
      <button className="event-card hong-card" onClick={() => setView('hong')} data-testid="event-hong">
        <div className="event-art">
          <Gourd state="idle" grade={null} small />
        </div>
        <div className="event-text">
          <strong>홍 나와라 뚝딱</strong>
          <span>박을 열어 동 · 은 · 금 · 홍 토큰 획득</span>
          <em>1회 {HONG.costOne} FV · 10회 {HONG.costTen} FV</em>
        </div>
        <span className="mode-arrow" aria-hidden>
          ›
        </span>
      </button>
      <button className="event-card potato-card" onClick={() => setView('potato')} data-testid="event-potato">
        <div className="event-art potato-art">
          <Potato kind="normal" />
        </div>
        <div className="event-text">
          <strong>감자의 제왕</strong>
          <span>{POTATO.rounds}라운드 감자 잡기 · 10점 이상 GOOD PACK</span>
          <em>1회 {POTATO.cost} FV</em>
        </div>
        <span className="mode-arrow" aria-hidden>
          ›
        </span>
      </button>
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────
const GRADE_KO = HONG.label;
const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

function TokenChip({ grade, n }: { grade: HongGradeId; n: number }) {
  return (
    <span className={`hong-chip g-${grade}`} data-testid={`hong-token-${grade}`} data-count={n}>
      <i>{GRADE_KO[grade]}</i>
      <b>{n}</b>
    </span>
  );
}

/**
 * The 박 (a Korean gourd) — our own drawing. States: idle (bobs), shake, open (the two halves
 * part and light pours out in the grade's colour).
 */
export function Gourd({ state, grade, small }: { state: 'idle' | 'shake' | 'open'; grade: HongGradeId | null; small?: boolean }) {
  return (
    <div className={`gourd gourd-${state} ${grade ? `g-${grade}` : ''} ${small ? 'gourd-small' : ''}`} data-testid={small ? undefined : 'gourd'} data-state={state} aria-hidden>
      <div className="gourd-light" />
      <svg viewBox="0 0 200 200">
        <defs>
          <radialGradient id="gd-body" cx="0.38" cy="0.32" r="0.75">
            <stop offset="0" stopColor="#fbf5dc" />
            <stop offset="0.55" stopColor="#e6d9a4" />
            <stop offset="1" stopColor="#a8955a" />
          </radialGradient>
          <linearGradient id="gd-leaf" x1="0" x2="1">
            <stop offset="0" stopColor="#4f8f2a" />
            <stop offset="1" stopColor="#9bd14a" />
          </linearGradient>
        </defs>
        {/* left half */}
        <g className="gourd-half gourd-l">
          <path d="M100 52 C 56 52 30 88 30 124 C 30 160 62 182 100 182 Z" fill="url(#gd-body)" stroke="#7a6a36" strokeWidth="3" />
          <path d="M62 82 C 48 104 48 138 64 160" fill="none" stroke="rgba(120,100,50,0.35)" strokeWidth="3" strokeLinecap="round" />
        </g>
        {/* right half */}
        <g className="gourd-half gourd-r">
          <path d="M100 52 C 144 52 170 88 170 124 C 170 160 138 182 100 182 Z" fill="url(#gd-body)" stroke="#7a6a36" strokeWidth="3" />
          <path d="M138 82 C 152 104 152 138 136 160" fill="none" stroke="rgba(120,100,50,0.35)" strokeWidth="3" strokeLinecap="round" />
        </g>
        <path className="gourd-seam" d="M100 54 L100 180" stroke="#5a4a1c" strokeWidth="2.5" strokeDasharray="6 5" />
        {/* stem + leaf + a small knot of red thread (금줄) */}
        <path d="M100 54 C 98 40 102 30 112 22" fill="none" stroke="#5e4a1a" strokeWidth="6" strokeLinecap="round" />
        <path d="M110 30 C 132 14 160 22 166 40 C 146 46 124 44 110 30 Z" fill="url(#gd-leaf)" stroke="#2f5d16" strokeWidth="2" />
        <path d="M86 58 Q100 66 114 58" fill="none" stroke="#d6332a" strokeWidth="4" strokeLinecap="round" />
        <text x="100" y="134" textAnchor="middle" fontFamily="var(--display)" fontWeight="900" fontStyle="italic" fontSize="30" fill="rgba(90,70,20,0.5)">
          PIPA
        </text>
      </svg>
    </div>
  );
}

/** a grade medallion (dong / eun / geum / hong) */
function Medal({ grade, i = 0, big }: { grade: HongGradeId; i?: number; big?: boolean }) {
  return (
    <span className={`hong-medal g-${grade} ${big ? 'big' : ''}`} style={{ animationDelay: `${i * 0.12}s` }} data-testid="hong-medal" data-grade={grade}>
      <i>{GRADE_KO[grade]}</i>
    </span>
  );
}

// ── 홍 나와라 뚝딱 ─────────────────────────────────────────────────────────
type DrawPhase = 'shake' | 'open' | 'done';
const BEST: Record<HongGradeId, number> = { bronze: 0, silver: 1, gold: 2, red: 3 };

function HongScreen({ wallet, token, online, onReply, onBack }: { wallet: Wallet; token: string | null; online: boolean; onReply: (r: AccountReply) => void; onBack: () => void }) {
  const fv = wallet.progress?.fv ?? 0;
  const tokens = wallet.progress?.hong ?? { bronze: 0, silver: 0, gold: 0, red: 0 };
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const [draw, setDraw] = useState<{ results: HongGradeId[]; phase: DrawPhase } | null>(null);
  const [reveal, setReveal] = useState<PackPull | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const busyRef = useRef(false);
  const speed = useMemo(() => {
    try {
      return Number((window as unknown as { __PIPA_PACK_SPEED?: number }).__PIPA_PACK_SPEED) || 1;
    } catch {
      return 1;
    }
  }, []);

  useEffect(() => {
    if (!token || !online) return;
    accountApi.eventsState(token).then(onReply).catch(() => {});
  }, [token, online]); // eslint-disable-line react-hooks/exhaustive-deps

  // the 박 animation: shake → open → results (SKIP jumps to the results)
  useEffect(() => {
    if (!draw || draw.phase === 'done') return;
    const t = window.setTimeout(() => setDraw((d) => d && { ...d, phase: d.phase === 'shake' ? 'open' : 'done' }), (draw.phase === 'shake' ? 1100 : 750) / speed);
    return () => window.clearTimeout(t);
  }, [draw, speed]);

  const doDraw = async (count: 1 | 10) => {
    if (!token || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const r = await accountApi.hongDraw(token, count, newNonce());
      onReply(r);
      setDraw({ results: r.results ?? [], phase: 'shake' });
    } catch (e) {
      if (e instanceof AccountError && e.reply) onReply(e.reply);
      setMsg({ text: errMsg(e, '뽑기에 실패했어요'), tone: 'bad' });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const exchange = async (grade: HongGradeId) => {
    if (!token || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const r = await accountApi.hongExchange(token, grade, newNonce());
      onReply(r);
      const rw = r.reward;
      if (rw?.mp) setMsg({ text: `${GRADE_KO[grade]} 1개 교환 완료! +${formatMP(rw.mp)}`, tone: 'good' });
      else if (rw?.pack === 'legend') setMsg({ text: '금 1개 교환 완료! LEGEND PACK ×1 지급', tone: 'good' });
      else if (rw?.pull) setReveal(rw.pull);
    } catch (e) {
      if (e instanceof AccountError && e.reply) onReply(e.reply);
      setMsg({ text: errMsg(e, '교환에 실패했어요'), tone: 'bad' });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const best = draw ? draw.results.reduce<HongGradeId>((a, g) => (BEST[g] > BEST[a] ? g : a), 'bronze') : null;
  const legendPacks = wallet.progress?.legendPacks ?? 0;

  return (
    <div className="screen events hong" data-testid="hong">
      <header className="modes-top">
        <button className="btn-ghost" onClick={onBack} data-testid="hong-back">
          ‹ EVENT CENTER
        </button>
        <VersionBadge />
      </header>
      <div className="hong-head">
        <h2 className="hong-title">홍 나와라 뚝딱</h2>
        <span className="hong-fv" data-testid="hong-fv">
          {formatFV(fv)}
        </span>
      </div>
      <div className="hong-stage">
        <Gourd state={draw && draw.phase !== 'done' ? draw.phase : 'idle'} grade={draw && draw.phase === 'open' ? best : null} />
      </div>
      <div className="hong-buttons">
        <button className="btn-primary" disabled={!online || busy || fv < HONG.costOne || (!!draw && draw.phase !== 'done')} onClick={() => doDraw(1)} data-testid="hong-draw-1">
          1회 뽑기 <small>{HONG.costOne} FV</small>
        </button>
        <button className="btn-primary hong-ten" disabled={!online || busy || fv < HONG.costTen || (!!draw && draw.phase !== 'done')} onClick={() => doDraw(10)} data-testid="hong-draw-10">
          10회 뽑기 <small>{HONG.costTen} FV</small>
        </button>
      </div>
      {msg && (
        <p className={`dev-msg ${msg.tone}`} data-testid="hong-msg">
          {msg.text}
        </p>
      )}
      <div className="hong-tokens" data-testid="hong-tokens">
        {HONG_GRADES.map((g) => (
          <TokenChip key={g} grade={g} n={tokens[g]} />
        ))}
      </div>

      <section className="hong-shop" data-testid="hong-shop">
        <p className="dev-sq-title">EXCHANGE SHOP · 교환소</p>
        {HONG_GRADES.map((g) => (
          <div className={`hong-shop-row g-${g}`} key={g}>
            <Medal grade={g} />
            <div className="hong-shop-text">
              <b>{GRADE_KO[g]} 1개</b>
              <span>{g === 'bronze' ? formatMP(HONG.exchange.bronze.mp!) : g === 'silver' ? formatMP(HONG.exchange.silver.mp!) : g === 'gold' ? 'LEGEND PACK ×1' : 'TOP LEGEND 확정 ×1'}</span>
              {g === 'gold' && <em>12억 ~ 20억 MP 선수 · 낮은 몸값일수록 자주</em>}
              {g === 'red' && <em>{TOP_LEGENDS.map((id) => getPlayer(id)?.koLast ?? id).join(' · ')} 중 1명</em>}
            </div>
            <button className="btn-primary hong-ex" disabled={!online || busy || tokens[g] <= 0} onClick={() => exchange(g)} data-testid={`hong-exchange-${g}`}>
              교환
            </button>
          </div>
        ))}
        {legendPacks > 0 && (
          <button className="btn-ghost hong-legend-open" onClick={() => setLegendOpen(true)} data-testid="hong-open-legend">
            LEGEND PACK ×{legendPacks} 지금 열기 ›
          </button>
        )}
      </section>

      <details className="pack-odds">
        <summary>확률 안내</summary>
        <ul>
          {HONG.odds.map((o) => (
            <li key={o.grade} className={`g-${o.grade}`}>
              <span>{GRADE_KO[o.grade]}</span>
              <em>{o.grade === 'red' ? '가장 화려한 등급' : ''}</em>
              <b>{o.weight}%</b>
            </li>
          ))}
        </ul>
        <p className="pack-odds-note">1회 · 10회 모두 같은 확률 · 10회 = 10번의 독립 추첨 · 확정 보정 없음 · 모든 결과는 서버에서 결정</p>
      </details>

      {draw && draw.phase !== 'done' && (
        <button className="pack-skip hong-skip" onClick={() => setDraw((d) => d && { ...d, phase: 'done' })} data-testid="hong-skip">
          SKIP ›
        </button>
      )}
      {draw && draw.phase === 'done' && (
        <div className={`hong-result g-${best}`} data-testid="hong-result" data-count={draw.results.length} data-results={draw.results.join(',')} onClick={() => setDraw(null)}>
          <div className="hong-result-card" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">{draw.results.length === 10 ? '10회 뽑기 결과' : '뽑기 결과'}</p>
            <div className={`hong-result-grid n${draw.results.length}`}>
              {draw.results.map((g, i) => (
                <Medal key={i} grade={g} i={i} big={draw.results.length === 1} />
              ))}
            </div>
            <p className="hong-result-sum">
              {HONG_GRADES.filter((g) => draw.results.includes(g))
                .map((g) => `${GRADE_KO[g]} ×${draw.results.filter((x) => x === g).length}`)
                .join(' · ')}
            </p>
            <button className="btn-primary" onClick={() => setDraw(null)} data-testid="hong-result-ok">
              확인
            </button>
          </div>
        </div>
      )}
      {reveal && token && <PackOpening token={token} preset={reveal} onReply={onReply} onError={(m) => (setReveal(null), setMsg({ text: m, tone: 'bad' }))} onClose={() => setReveal(null)} />}
      {legendOpen && token && <PackOpening token={token} kind="legend" onReply={onReply} onError={(m) => (setLegendOpen(false), setMsg({ text: m, tone: 'bad' }))} onClose={() => setLegendOpen(false)} />}
    </div>
  );
}

// ── 감자의 제왕 ────────────────────────────────────────────────────────────
/** cute, clearly different potatoes (our own drawings): normal · red (danger) · rotten */
export function Potato({ kind }: { kind: PotatoKind }) {
  if (kind === 'red')
    return (
      <svg className="potato potato-red" viewBox="0 0 100 100" aria-hidden>
        <ellipse cx="50" cy="56" rx="34" ry="30" fill="#e2412f" stroke="#7d140c" strokeWidth="3" />
        <ellipse cx="38" cy="44" rx="9" ry="5" fill="rgba(255,255,255,0.35)" />
        <path d="M30 46 L44 52 M70 46 L56 52" stroke="#3a0703" strokeWidth="4" strokeLinecap="round" />
        <circle cx="40" cy="58" r="4" fill="#3a0703" />
        <circle cx="60" cy="58" r="4" fill="#3a0703" />
        <path d="M40 72 Q50 66 60 72" fill="none" stroke="#3a0703" strokeWidth="3.5" strokeLinecap="round" />
        {/* danger badge */}
        <path d="M76 8 L94 38 L58 38 Z" fill="#ffd23a" stroke="#3a0703" strokeWidth="3" strokeLinejoin="round" />
        <path d="M76 18 L76 28" stroke="#3a0703" strokeWidth="4" strokeLinecap="round" />
        <circle cx="76" cy="33" r="2.2" fill="#3a0703" />
      </svg>
    );
  if (kind === 'rotten')
    return (
      <svg className="potato potato-rotten" viewBox="0 0 100 100" aria-hidden>
        <path d="M18 58 C 16 34 36 24 52 26 C 72 26 86 40 84 60 C 82 80 64 88 48 86 C 30 86 20 76 18 58 Z" fill="#5b5a2a" stroke="#22200a" strokeWidth="3" />
        <circle cx="36" cy="40" r="6" fill="#8bbf3a" />
        <circle cx="68" cy="70" r="7" fill="#8bbf3a" />
        <circle cx="30" cy="70" r="4" fill="#3d3c14" />
        {/* dizzy X eyes */}
        <path d="M36 50 l10 10 M46 50 l-10 10 M56 50 l10 10 M66 50 l-10 10" stroke="#e8f5c0" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M38 74 Q44 68 50 74 Q56 80 62 74" fill="none" stroke="#e8f5c0" strokeWidth="3" strokeLinecap="round" />
        {/* stink lines */}
        <path d="M30 18 q-6 -6 0 -12 M50 14 q-6 -6 0 -12 M70 18 q-6 -6 0 -12" fill="none" stroke="#9fd94a" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg className="potato potato-normal" viewBox="0 0 100 100" aria-hidden>
      <path d="M16 56 C 14 32 34 20 52 22 C 74 22 88 38 86 58 C 84 80 66 90 48 88 C 28 88 18 76 16 56 Z" fill="#d9a85c" stroke="#7a5320" strokeWidth="3" />
      <ellipse cx="38" cy="38" rx="10" ry="5" fill="rgba(255,255,255,0.35)" />
      <circle cx="30" cy="68" r="2.5" fill="#9b6c2e" />
      <circle cx="72" cy="44" r="2.5" fill="#9b6c2e" />
      <circle cx="40" cy="54" r="5" fill="#2b1a08" />
      <circle cx="62" cy="54" r="5" fill="#2b1a08" />
      <circle cx="42" cy="52" r="1.6" fill="#fff" />
      <circle cx="64" cy="52" r="1.6" fill="#fff" />
      <ellipse cx="32" cy="64" rx="6" ry="3.5" fill="rgba(255,120,120,0.45)" />
      <ellipse cx="70" cy="64" rx="6" ry="3.5" fill="rgba(255,120,120,0.45)" />
      <path d="M42 68 Q51 76 60 68" fill="none" stroke="#2b1a08" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

/** "11/04 23:41" in Korea time */
function shortTime(iso: string) {
  try {
    const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  } catch {
    return '';
  }
}

const KIND_KO: Record<PotatoKind, string> = { normal: '일반 감자 +1', red: '빨간 감자 −1', rotten: '썩은 감자 −2' };

function PotatoScreen({ wallet, token, online, onReply, onBack }: { wallet: Wallet; token: string | null; online: boolean; onReply: (r: AccountReply) => void; onBack: () => void }) {
  const fv = wallet.progress?.fv ?? 0;
  const [sess, setSess] = useState<PotatoSessionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [score, setScore] = useState(0);
  const [tapped, setTapped] = useState<Set<string>>(new Set());
  const [pops, setPops] = useState<{ key: string; hole: number; text: string; kind: PotatoKind | 'miss' }[]>([]);
  const [openGood, setOpenGood] = useState(false);
  const [stats, setStats] = useState<PotatoStats | null>(null);
  const offset = useRef(0); // server clock − phone clock
  const seq = useRef(0);
  const lastApplied = useRef(0);
  const finishing = useRef(false);

  const sync = (serverNow: number | undefined, t0: number, t1: number) => {
    if (typeof serverNow === 'number') offset.current = serverNow - (t0 + t1) / 2;
  };
  const adopt = (p: PotatoSessionView | null | undefined) => {
    if (!p) return;
    setSess(p);
    setScore(p.score);
    setTapped(new Set(p.clicked));
  };

  // load: tokens / a game still running on the server (reload → it continues where it is)
  useEffect(() => {
    if (!token || !online) return;
    const t0 = Date.now();
    accountApi
      .eventsState(token)
      .then((r) => {
        sync(r.serverNow, t0, Date.now());
        onReply(r);
        if (r.potatoStats) setStats(r.potatoStats);
        if (r.potato?.status === 'playing') adopt(r.potato);
        else if (r.potato) setSess(null);
      })
      .catch(() => {});
  }, [token, online]); // eslint-disable-line react-hooks/exhaustive-deps

  const playing = sess?.status === 'playing';
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const serverNow = now + offset.current;
  const elapsed = sess ? serverNow - sess.startAt : 0;
  const round = sess && playing ? Math.floor(elapsed / POTATO.roundMs) + 1 : 0;
  const inRound = round >= 1 && round <= POTATO.rounds;
  const countdown = sess && playing && elapsed < 0 ? Math.ceil(-elapsed / 1000) : 0;
  const roundLeft = inRound ? 1 - (elapsed - (round - 1) * POTATO.roundMs) / POTATO.roundMs : 0;
  const spawns = inRound && sess ? sess.rounds[round - 1] : [];

  // the game is over on the server clock → settle once (the server pays exactly once)
  useEffect(() => {
    if (!sess || !playing || !token || finishing.current) return;
    if (serverNow < sess.endAt + POTATO.graceMs + 150) return;
    finishing.current = true;
    const t0 = Date.now();
    accountApi
      .potatoFinish(token, sess.sessionId)
      .then((r) => {
        sync(r.serverNow, t0, Date.now());
        onReply(r);
        if (r.potatoStats) setStats(r.potatoStats);
        adopt(r.potato ?? null);
      })
      .catch((e) => {
        if (e instanceof AccountError && e.reply?.potato) adopt(e.reply.potato);
        window.setTimeout(() => (finishing.current = false), 400);
      })
      .finally(() => {
        if (sess) window.setTimeout(() => (finishing.current = false), 400);
      });
  }, [serverNow, sess, playing, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    if (!token || busy) return;
    setBusy(true);
    setMsg(null);
    const t0 = Date.now();
    try {
      const r = await accountApi.potatoStart(token, newNonce());
      sync(r.serverNow, t0, Date.now());
      onReply(r);
      seq.current = 0;
      lastApplied.current = 0;
      setPops([]);
      adopt(r.potato ?? null);
    } catch (e) {
      if (e instanceof AccountError && e.reply) {
        onReply(e.reply);
        if (e.reply.potato?.status === 'playing') adopt(e.reply.potato);
      }
      setMsg(errMsg(e, '게임을 시작하지 못했어요'));
    } finally {
      setBusy(false);
    }
  };

  const tap = (hole: number) => {
    if (!sess || !token || !inRound) return;
    const r = round;
    const key = `${r}:${hole}`;
    const sp = spawns.find((x) => x.hole === hole);
    if (!sp || tapped.has(key)) return;
    // instant feedback; the server's answer is the real score
    setTapped((t) => new Set(t).add(key));
    setScore((s) => potatoScore(s, sp.kind));
    const id = `${key}:${Date.now()}`;
    setPops((p) => [...p.slice(-8), { key: id, hole, text: sp.kind === 'normal' ? '+1' : sp.kind === 'red' ? '−1' : '−2', kind: sp.kind }]);
    window.setTimeout(() => setPops((p) => p.filter((x) => x.key !== id)), 700);
    const n = ++seq.current;
    accountApi
      .potatoTap(token, sess.sessionId, r, hole)
      .then((res) => {
        if (n < lastApplied.current) return;
        lastApplied.current = n;
        if (typeof res.score === 'number') setScore(res.score);
      })
      .catch(() => {});
  };

  const done = sess?.status === 'done' ? sess : null;
  const goodPacks = wallet.progress?.goodPacks ?? 0;

  return (
    <div className="screen events potato-screen" data-testid="potato">
      <header className="modes-top">
        <button className="btn-ghost" onClick={onBack} disabled={playing} data-testid="potato-back">
          ‹ EVENT CENTER
        </button>
        <VersionBadge />
      </header>
      <div className="hong-head">
        <h2 className="hong-title potato-title">감자의 제왕</h2>
        <span className="hong-fv" data-testid="potato-fv">
          {formatFV(fv)}
        </span>
      </div>
      <div className="potato-hud" data-testid="potato-hud">
        <span data-testid="potato-round" data-round={Math.min(POTATO.rounds, Math.max(0, round))}>
          ROUND <b>{playing ? Math.min(POTATO.rounds, Math.max(1, round)) : done ? POTATO.rounds : 0}</b>/{POTATO.rounds}
        </span>
        <span data-testid="potato-score" data-score={score}>
          SCORE <b>{score}</b>
        </span>
      </div>
      <div className="potato-timer" aria-hidden>
        <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, roundLeft))})` }} />
      </div>
      <div className="potato-board" data-testid="potato-board">
        {Array.from({ length: POTATO.holes }, (_, h) => {
          const sp = spawns.find((x) => x.hole === h);
          const hit = sp && tapped.has(`${round}:${h}`);
          return (
            <button
              key={h}
              className={`potato-hole ${sp && !hit ? 'up' : ''} ${hit ? 'hit' : ''}`}
              onPointerDown={(e) => {
                e.preventDefault();
                tap(h);
              }}
              data-testid={`potato-hole-${h}`}
              data-kind={sp && !hit ? sp.kind : ''}
              aria-label={sp && !hit ? KIND_KO[sp.kind] : '빈 구멍'}
            >
              <span className="potato-pit" />
              {sp && !hit && (
                <span className="potato-pop" key={`${round}-${h}`}>
                  <Potato kind={sp.kind} />
                </span>
              )}
              {pops
                .filter((p) => p.hole === h)
                .map((p) => (
                  <em key={p.key} className={`potato-float k-${p.kind}`}>
                    {p.text}
                  </em>
                ))}
            </button>
          );
        })}
        {countdown > 0 && (
          <div className="potato-count" data-testid="potato-countdown">
            {countdown}
          </div>
        )}
      </div>
      <div className="potato-legend">
        {(['normal', 'red', 'rotten'] as PotatoKind[]).map((k) => (
          <span key={k}>
            <Potato kind={k} />
            {KIND_KO[k]}
          </span>
        ))}
      </div>
      {!playing && (
        <button className="btn-primary potato-start" disabled={!online || busy || fv < POTATO.cost} onClick={start} data-testid="potato-start">
          START <small>{POTATO.cost} FV</small>
        </button>
      )}
      {msg && (
        <p className="dev-msg bad" data-testid="potato-msg">
          {msg}
        </p>
      )}
      {/* UPDATE 9.5: my best score + recent games (from the server) */}
      {!playing && stats && (
        <section className="potato-stats" data-testid="potato-stats" data-best={stats.best} data-played={stats.played}>
          <div className="potato-best">
            <span>내 최고 점수</span>
            <b data-testid="potato-best">{stats.best}점</b>
            <em>플레이 {stats.played}회</em>
          </div>
          {stats.recent.length > 0 && (
            <ol className="potato-recent" data-testid="potato-recent">
              {stats.recent.slice(0, 5).map((g) => (
                <li key={g.id} className={g.score === stats.best ? 'best' : ''}>
                  <b>{g.score}점</b>
                  <span>{g.reward?.pack === 'good' ? 'GOOD PACK' : g.reward?.mp ? formatMP(g.reward.mp) : ''}</span>
                  <em>{shortTime(g.at)}</em>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
      <p className="pack-hint">5라운드부터 빨간 감자, 8라운드부터 썩은 감자! 점수는 0점 아래로 내려가지 않아요 · 10점 이상 GOOD PACK · 6~9점 3,000만 MP · 0~5점 1,000만 MP</p>
      {done && (
        <div className="hong-result potato-result" data-testid="potato-result" data-score={done.score}>
          <div className="hong-result-card">
            <p className="eyebrow">GAME OVER</p>
            <p className="potato-final">
              <b>{done.score}</b>점
            </p>
            {done.newBest && (
              <p className="potato-newbest" data-testid="potato-newbest">
                🏆 최고 기록 경신!
              </p>
            )}
            <p className="potato-reward" data-testid="potato-reward">
              {done.reward?.pack === 'good' ? 'GOOD PLAYER PACK ×1 획득!' : done.reward?.mp ? `${formatMP(done.reward.mp)} 획득!` : ''}
            </p>
            {done.reward?.pack === 'good' && goodPacks > 0 && (
              <button className="btn-primary" onClick={() => setOpenGood(true)} data-testid="potato-open-good">
                GOOD PACK 지금 열기
              </button>
            )}
            <button className="btn-ghost" onClick={() => setSess(null)} data-testid="potato-result-ok">
              확인
            </button>
          </div>
        </div>
      )}
      {openGood && token && <PackOpening token={token} kind="good" onReply={onReply} onError={(m) => (setOpenGood(false), setMsg(m))} onClose={() => (setOpenGood(false), setSess(null))} />}
    </div>
  );
}
