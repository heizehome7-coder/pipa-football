import { useEffect, useMemo, useRef, useState } from 'react';
import { VersionBadge } from '../components/VersionBadge';
import { Flag, PlayerAvatar, PlayerCard } from '../components/PlayerArt';
import { AccountError, accountApi, accountsAvailable, type AccountReply, type PackPull } from '../online/account';
import { COUNTRY_NAME, getPlayer, ovr, SPECIALS, type PlayerDef } from '../players/players';
import type { Wallet } from '../players/ownership';
import { PACK_CONFIG, type PackTier } from '../progress/packs';

/**
 * UPDATE 8 — PLAYER PACKS.
 * The phone never picks the player: OPEN asks the server, which takes one pack, draws the
 * player (crypto random) and saves the card BEFORE it answers. The scene below only
 * reveals that answer: COUNTRY → POSITION → CLUB / ICON → PLAYER CARD. No sound.
 */
export function PacksScreen({ wallet, token, onReply, onBack }: { wallet: Wallet; token: string | null; onReply: (r: AccountReply) => void; onBack: () => void }) {
  const packs = wallet.progress?.packs ?? 0;
  const online = accountsAvailable() && !!token;
  const [opening, setOpening] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const recent = useMemo(() => (wallet.cards ?? []).filter((c) => c.source === 'pack').slice(-6).reverse(), [wallet.cards]);

  return (
    <div className="screen packs" data-testid="packs">
      <header className="modes-top">
        <button className="btn-ghost" onClick={onBack} data-testid="packs-back">
          ‹ 홈
        </button>
        <VersionBadge />
      </header>
      <div className="dev-head">
        <span className="mini-logo dev-logo">PIPA</span>
        <h2 className="dev-title">PACKS</h2>
        <p className="dev-sub">{online ? '팩 1개 = 선수 카드 1장 · 이적시장의 모든 거래 가능 선수가 나올 수 있어요' : '팩은 Render 서버 버전에서 열 수 있어요'}</p>
      </div>

      <div className="pack-slot" data-testid="pack-slot">
        <PackArt />
        <div className="pack-info">
          <b>PLAYER PACK</b>
          <span data-testid="pack-available" data-count={packs}>
            AVAILABLE ×{packs}
          </span>
          <em>선수 카드 1장</em>
        </div>
        <button
          className="btn-primary pack-open-btn"
          disabled={!online || packs <= 0 || opening}
          onClick={() => {
            setErr(null);
            setOpening(true);
          }}
          data-testid="pack-open"
        >
          OPEN
        </button>
      </div>
      {!packs && online && <p className="pack-hint">출석 DAY 6 · DAY 7 보상으로 PLAYER PACK을 받을 수 있어요</p>}
      {err && (
        <p className="dev-msg bad" data-testid="pack-msg">
          {err}
        </p>
      )}

      <details className="pack-odds">
        <summary>확률 안내</summary>
        <ul>
          {PACK_CONFIG.tiers.map((t, i) => {
            const lo = i === 0 ? 10_000_000 : PACK_CONFIG.tiers[i - 1].max;
            return (
              <li key={t.tier} className={`tier-${t.tier}`}>
                <span>{TIER_LABEL[t.tier]}</span>
                <em>{t.max === Infinity ? `${short(lo)} 초과 · 최고 ICON` : `${i === 0 ? short(lo) : `${short(lo)} 초과`} ~ ${short(t.max)}`}</em>
                <b>{t.weight}%</b>
              </li>
            );
          })}
        </ul>
      </details>

      {!!recent.length && (
        <div className="pack-recent">
          <p className="dev-sq-title">최근 팩에서 나온 선수</p>
          <div className="pack-recent-row">
            {recent.map((c) => {
              const p = getPlayer(c.playerId);
              return p ? (
                <span key={c.id} className="pack-recent-item">
                  <PlayerAvatar player={p} size={40} />
                  <em>{p.last}</em>
                </span>
              ) : null;
            })}
          </div>
        </div>
      )}

      {opening && token && (
        <PackOpening
          token={token}
          onReply={onReply}
          onError={(m) => {
            setErr(m);
            setOpening(false);
          }}
          onClose={() => setOpening(false)}
        />
      )}
    </div>
  );
}

const TIER_LABEL: Record<PackTier, string> = { base: 'BASE', rare: 'RARE', epic: 'EPIC', elite: 'ELITE', icon: 'ICON / LEGEND' };
const short = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(1).replace(/\.0$/, '')}B` : `${Math.round(v / 1e6)}M`);

/** the PIPA pack: a dark card with a neon lime seam (our own design) */
function PackArt({ glow }: { glow?: PackTier | null }) {
  return (
    <div className={`pack-art ${glow ? `glow-${glow}` : ''}`} aria-hidden>
      <svg viewBox="0 0 120 170">
        <defs>
          <linearGradient id="pk-body" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#123526" />
            <stop offset="1" stopColor="#050d0a" />
          </linearGradient>
        </defs>
        <rect x="6" y="6" width="108" height="158" rx="14" fill="url(#pk-body)" stroke="rgba(200,255,90,0.55)" strokeWidth="2" />
        <path d="M6 48 H114" stroke="var(--lime)" strokeWidth="2.5" strokeDasharray="4 3" />
        <text x="60" y="34" textAnchor="middle" fontFamily="var(--display)" fontWeight="900" fontStyle="italic" fontSize="22" fill="var(--lime)">
          PIPA
        </text>
        <circle cx="60" cy="104" r="30" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />
        <path d="M60 80 l7 15 16 2 -12 11 3 16 -14 -8 -14 8 3 -16 -12 -11 16 -2z" fill="rgba(200,255,90,0.9)" />
        <text x="60" y="152" textAnchor="middle" fontFamily="var(--display)" fontWeight="800" fontSize="11" letterSpacing="2" fill="rgba(255,255,255,0.75)">
          PLAYER PACK
        </text>
      </svg>
    </div>
  );
}

type Phase = 'charge' | 'country' | 'position' | 'club' | 'flash' | 'card';
const ORDER: Phase[] = ['charge', 'country', 'position', 'club', 'flash', 'card'];
/** seconds each step stays on screen (charge: at least this long, and until the server answered) */
const DUR: Record<Phase, number> = { charge: 1.0, country: 0.9, position: 0.9, club: 1.0, flash: 0.45, card: 0 };

/** fullscreen pack opening (no sound — visual effects only) */
function PackOpening({ token, onReply, onError, onClose }: { token: string; onReply: (r: AccountReply) => void; onError: (m: string) => void; onClose: () => void }) {
  const [pull, setPull] = useState<PackPull | null>(null);
  const [phase, setPhase] = useState<Phase>('charge');
  const [canSkip, setCanSkip] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const started = useRef(0);
  const speed = (() => {
    try {
      return Number((window as unknown as { __PIPA_PACK_SPEED?: number }).__PIPA_PACK_SPEED) || 1;
    } catch {
      return 1;
    }
  })();

  // 1) ask the server (once)
  useEffect(() => {
    started.current = performance.now();
    let live = true;
    accountApi
      .openPack(token)
      .then((r) => {
        if (!live) return;
        onReply(r);
        setLeft(r.unopenedPacks ?? 0);
        setPull(r.pull ?? null);
        if (!r.pull) onError('팩을 열지 못했어요');
      })
      .catch((e) => {
        if (!live) return;
        if (e instanceof AccountError && e.reply && typeof e.reply.mp === 'number') onReply(e.reply);
        onError(e instanceof Error ? e.message : '팩을 열지 못했어요');
      });
    const t = window.setTimeout(() => setCanSkip(true), 500 / speed);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 2) step through the reveal once the result is in
  useEffect(() => {
    if (!pull || phase === 'card') return;
    const i = ORDER.indexOf(phase);
    const wait = phase === 'charge' ? Math.max(0, DUR.charge * 1000 - (performance.now() - started.current)) : DUR[phase] * 1000;
    const t = window.setTimeout(() => setPhase(ORDER[i + 1]), wait / speed);
    return () => window.clearTimeout(t);
  }, [pull, phase, speed]);

  const p = pull ? getPlayer(pull.playerId) : null;
  const tier = pull?.tier ?? null;
  // glow builds up with the tier, but never names the player early
  const glow = phase === 'charge' ? null : tier;
  const skip = () => pull && canSkip && setPhase('card');

  return (
    <div className={`pack-scene ${glow ? `tier-${glow}` : ''} phase-${phase}`} data-testid="pack-scene" data-phase={phase} data-tier={tier ?? ''} data-player={phase === 'card' ? pull?.playerId ?? '' : ''}>
      <Particles tier={glow} burst={phase === 'flash' || phase === 'card'} />
      {phase !== 'card' && (
        <button className="pack-skip" onClick={skip} disabled={!canSkip || !pull} data-testid="pack-skip">
          SKIP ›
        </button>
      )}
      <div className="pack-stage">
        {phase === 'charge' && (
          <div className="pack-charge">
            <PackArt glow={tier && performance.now() - started.current > 600 ? tier : null} />
            <span className="pack-charge-text">OPENING…</span>
          </div>
        )}
        {p && phase === 'country' && (
          <div className="reveal-step" key="country" data-testid="reveal-country" data-value={p.country}>
            <Flag code={p.country} size={78} />
            <b>{COUNTRY_NAME[p.country]}</b>
          </div>
        )}
        {p && phase === 'position' && (
          <div className="reveal-step" key="position" data-testid="reveal-position" data-value={p.primaryPosition}>
            <span className="reveal-pos">{p.primaryPosition}</span>
          </div>
        )}
        {p && phase === 'club' && (
          <div className="reveal-step" key="club" data-testid="reveal-club" data-value={p.isIcon ? 'ICON' : p.club ?? ''}>
            {p.isIcon ? <IconEmblem /> : <ClubShield name={p.club ?? 'CLUB'} />}
            <b>{p.isIcon ? 'ICON' : p.club}</b>
          </div>
        )}
        {phase === 'flash' && <div className="reveal-flash" />}
        {p && phase === 'card' && <PlayerCardPackReveal player={p} tier={tier!} />}
      </div>
      {p && phase === 'card' && (
        <div className="pack-actions">
          <button className="btn-primary" onClick={onClose} data-testid="pack-add">
            ADD TO CLUB
          </button>
          <span className="pack-left" data-testid="pack-left">
            남은 팩 {left ?? 0}개
          </span>
        </div>
      )}
    </div>
  );
}

/** light CSS particles (cheap on phones) */
function Particles({ tier, burst }: { tier: PackTier | null; burst: boolean }) {
  const n = tier === 'icon' ? 34 : tier === 'elite' ? 26 : 18;
  const dots = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => {
        const a = (i * 137.5 * Math.PI) / 180;
        const r = 30 + ((i * 53) % 70);
        return { x: Math.cos(a) * r, y: Math.sin(a) * r, d: (i % 7) * 0.18, s: 3 + (i % 4) };
      }),
    [],
  );
  return (
    <div className={`pack-particles ${burst ? 'burst' : ''}`} aria-hidden>
      {dots.slice(0, n).map((d, i) => (
        <i key={i} style={{ ['--x' as string]: `${d.x}vmin`, ['--y' as string]: `${d.y}vmin`, ['--d' as string]: `${d.d}s`, width: d.s, height: d.s }} />
      ))}
    </div>
  );
}

/** PIPA's own ICON emblem (metallic gold) — not any real logo */
function IconEmblem() {
  return (
    <svg className="icon-emblem" viewBox="0 0 120 120" aria-hidden>
      <defs>
        <linearGradient id="ic-gold" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fff2b8" />
          <stop offset="0.45" stopColor="#e0b04a" />
          <stop offset="1" stopColor="#8a5a12" />
        </linearGradient>
      </defs>
      <polygon points="60,6 112,36 112,84 60,114 8,84 8,36" fill="url(#ic-gold)" stroke="#fff6d0" strokeWidth="2" />
      <polygon points="60,20 99,42 99,78 60,100 21,78 21,42" fill="#0c1a12" />
      <path d="M60 32 l8 17 18 2 -13 12 4 18 -17 -9 -17 9 4 -18 -13 -12 18 -2z" fill="url(#ic-gold)" />
    </svg>
  );
}

/** generic PIPA club shield (text only, no club crest) */
function ClubShield({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => w.length > 1 || /[A-Z]/.test(w))
    .slice(0, 3)
    .map((w) => w[0])
    .join('');
  return (
    <svg className="club-shield" viewBox="0 0 100 116" aria-hidden>
      <path d="M50 4 L94 18 V58 C94 84 74 102 50 112 C26 102 6 84 6 58 V18 Z" fill="#0e2a1e" stroke="rgba(200,255,90,0.8)" strokeWidth="3" />
      <path d="M50 16 L82 26 V58 C82 77 68 91 50 99 C32 91 18 77 18 58 V26 Z" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
      <text x="50" y="68" textAnchor="middle" fontFamily="var(--display)" fontWeight="900" fontSize="30" fill="#ffffff">
        {initials}
      </text>
    </svg>
  );
}

/** the big final card: the shared PlayerCard design + club/ICON, main abilities and special */
export function PlayerCardPackReveal({ player, tier }: { player: PlayerDef; tier: PackTier }) {
  const sp = SPECIALS[player.special];
  const rows: [string, number][] = player.gk
    ? [
        ['REFLEX', player.gk.reflex],
        ['DIVING', player.gk.diving],
        ['REACH', player.gk.reach],
        ['POSITIONING', player.gk.positioning],
      ]
    : player.stats
      ? [
          ['POWER', player.stats.power],
          ['ACC', player.stats.accuracy],
          ['CURVE', player.stats.curve],
          ['FK', player.stats.freeKick],
        ]
      : [];
  return (
    <div className={`pack-reveal tier-${tier}`} data-testid="pack-card" data-id={player.id}>
      <div className="pack-reveal-card">
        <PlayerCard player={player} selected={false} />
      </div>
      <div className="pack-reveal-info">
        <div className="pack-reveal-top">
          <b className="pr-ovr">{ovr(player)}</b>
          <span className="pr-name">{player.last}</span>
        </div>
        <div className="pack-reveal-meta">
          <span>{player.primaryPosition}</span>
          <span>
            <Flag code={player.country} size={12} /> {COUNTRY_NAME[player.country]}
          </span>
          <span className={player.isIcon ? 'pr-icon' : ''} data-testid="pack-card-club">
            {player.isIcon ? 'ICON' : player.club}
          </span>
        </div>
        <div className="pack-reveal-stats">
          {rows.map(([k, v]) => (
            <span key={k}>
              <em>{k}</em>
              <b>{v}</b>
            </span>
          ))}
        </div>
        <div className="pack-reveal-special" data-testid="pack-card-special">
          ⚡ {sp.name}
        </div>
      </div>
    </div>
  );
}
