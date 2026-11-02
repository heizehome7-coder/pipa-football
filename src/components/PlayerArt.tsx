import type { CountryCode, PlayerDef } from '../players/players';
import { accentHue, COUNTRY_NAME, FIELD_STAT_LABELS, GK_STAT_LABELS, ovr, SPECIALS } from '../players/players';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Small drawn flags (emoji flags don't render on every phone/PC). */
export function Flag({ code, size = 18 }: { code: CountryCode; size?: number }) {
  const w = size * 1.45;
  const h = size;
  const stripesV = (a: string, b: string, c: string) => (
    <>
      <rect width="10" height="10" x="0" fill={a} />
      <rect width="10" height="10" x="10" fill={b} />
      <rect width="10" height="10" x="20" fill={c} />
    </>
  );
  const stripesH = (a: string, b: string, c: string, mid = 1) => {
    const m = (20 / 3) * mid;
    const e = (20 - m) / 2;
    return (
      <>
        <rect width="30" height={e} y="0" fill={a} />
        <rect width="30" height={m} y={e} fill={b} />
        <rect width="30" height={e} y={e + m} fill={c} />
      </>
    );
  };
  let body: JSX.Element;
  switch (code) {
    case 'FRA':
      body = stripesV('#1f3fa8', '#ffffff', '#e1293b');
      break;
    case 'ITA':
      body = stripesV('#11924a', '#ffffff', '#d72a35');
      break;
    case 'BEL':
      body = stripesV('#151515', '#f7d41d', '#e2273b');
      break;
    case 'GER':
      body = stripesH('#151515', '#d9232e', '#f5c518');
      break;
    case 'ESP':
      body = stripesH('#c8102e', '#ffc400', '#c8102e', 1.5);
      break;
    case 'ARG':
      body = (
        <>
          {stripesH('#74acdf', '#ffffff', '#74acdf')}
          <circle cx="15" cy="10" r="2.2" fill="#f6b40e" />
        </>
      );
      break;
    case 'EGY':
      body = (
        <>
          {stripesH('#ce1126', '#ffffff', '#151515')}
          <circle cx="15" cy="10" r="1.8" fill="#c09300" />
        </>
      );
      break;
    case 'POL':
      body = (
        <>
          <rect width="30" height="10" fill="#ffffff" />
          <rect width="30" height="10" y="10" fill="#dc143c" />
        </>
      );
      break;
    case 'POR':
      body = (
        <>
          <rect width="12" height="20" fill="#046a38" />
          <rect width="18" height="20" x="12" fill="#da291c" />
          <circle cx="12" cy="10" r="3.4" fill="#ffe900" />
        </>
      );
      break;
    case 'BRA':
      body = (
        <>
          <rect width="30" height="20" fill="#009c3b" />
          <path d="M15 2.5 L27 10 L15 17.5 L3 10 Z" fill="#ffdf00" />
          <circle cx="15" cy="10" r="4" fill="#002776" />
        </>
      );
      break;
    case 'KOR':
      body = (
        <>
          <rect width="30" height="20" fill="#ffffff" />
          <path d="M11 10 A4 4 0 0 1 19 10 Z" fill="#cd2e3a" />
          <path d="M11 10 A4 4 0 0 0 19 10 Z" fill="#0047a0" />
          {[[5, 5], [25, 5], [5, 15], [25, 15]].map(([x, y]) => (
            <rect key={`${x}${y}`} x={x - 2} y={y - 1.2} width="4" height="2.4" fill="#151515" transform={`rotate(${x < 15 === y < 10 ? 34 : -34} ${x} ${y})`} />
          ))}
        </>
      );
      break;
    case 'ENG':
      body = (
        <>
          <rect width="30" height="20" fill="#ffffff" />
          <rect x="12.5" width="5" height="20" fill="#ce1124" />
          <rect y="7.5" width="30" height="5" fill="#ce1124" />
        </>
      );
      break;
    case 'NOR':
      body = (
        <>
          <rect width="30" height="20" fill="#ba0c2f" />
          <rect x="8" width="6" height="20" fill="#ffffff" />
          <rect y="7" width="30" height="6" fill="#ffffff" />
          <rect x="9.5" width="3" height="20" fill="#00205b" />
          <rect y="8.5" width="30" height="3" fill="#00205b" />
        </>
      );
      break;
    // ── UPDATE 6 market countries ──
    case 'NED':
      body = stripesH('#ae1c28', '#ffffff', '#21468b');
      break;
    case 'HUN':
      body = stripesH('#ce2939', '#ffffff', '#477050');
      break;
    case 'SVN':
      body = stripesH('#ffffff', '#0000ff', '#ff0000');
      break;
    case 'COL':
      body = (
        <>
          <rect width="30" height="10" fill="#fcd116" />
          <rect width="30" height="5" y="10" fill="#003893" />
          <rect width="30" height="5" y="15" fill="#ce1126" />
        </>
      );
      break;
    case 'ECU':
      body = (
        <>
          <rect width="30" height="10" fill="#ffdd00" />
          <rect width="30" height="5" y="10" fill="#034ea2" />
          <rect width="30" height="5" y="15" fill="#ed1c24" />
          <circle cx="15" cy="10" r="2.4" fill="#7a5b2a" />
        </>
      );
      break;
    case 'CRO':
      body = (
        <>
          {stripesH('#ff0000', '#ffffff', '#171796')}
          <rect x="12" y="5" width="6" height="7" fill="#ffffff" stroke="#ff0000" strokeWidth="0.6" />
          <rect x="12" y="5" width="3" height="3.5" fill="#ff0000" />
          <rect x="15" y="8.5" width="3" height="3.5" fill="#ff0000" />
        </>
      );
      break;
    case 'NGA':
      body = stripesV('#008751', '#ffffff', '#008751');
      break;
    case 'CIV':
      body = stripesV('#f77f00', '#ffffff', '#009e60');
      break;
    case 'CMR':
      body = (
        <>
          {stripesV('#007a5e', '#ce1126', '#fcd116')}
          <path d="M15 7.2l.9 2.6h2.7l-2.2 1.6.8 2.6-2.2-1.6-2.2 1.6.8-2.6-2.2-1.6h2.7z" fill="#fcd116" />
        </>
      );
      break;
    case 'CAN':
      body = (
        <>
          <rect width="30" height="20" fill="#ffffff" />
          <rect width="7.5" height="20" fill="#d80621" />
          <rect x="22.5" width="7.5" height="20" fill="#d80621" />
          <path d="M15 4.5l1.2 2.6 1.6-.6-.5 3.2 2-1.6.3 1.4 1.5-.3-.8 2.2.8.6-3.4 2.4.3 1.2-2.4-.4V17h-1.2v-1.8l-2.4.4.3-1.2-3.4-2.4.8-.6-.8-2.2 1.5.3.3-1.4 2 1.6-.5-3.2 1.6.6z" fill="#d80621" />
        </>
      );
      break;
    case 'URU':
      body = (
        <>
          <rect width="30" height="20" fill="#ffffff" />
          {[2.2, 6.6, 11, 15.4].map((y) => (
            <rect key={y} y={y} width="30" height="2.2" fill="#0038a8" />
          ))}
          <rect width="12" height="11" fill="#ffffff" />
          <circle cx="6" cy="5.5" r="2.8" fill="#fcd116" />
        </>
      );
      break;
    case 'SWE':
      body = (
        <>
          <rect width="30" height="20" fill="#006aa7" />
          <rect x="8.5" width="4" height="20" fill="#fecc00" />
          <rect y="8" width="30" height="4" fill="#fecc00" />
        </>
      );
      break;
    case 'DEN':
      body = (
        <>
          <rect width="30" height="20" fill="#c8102e" />
          <rect x="9" width="3.5" height="20" fill="#ffffff" />
          <rect y="8.25" width="30" height="3.5" fill="#ffffff" />
        </>
      );
      break;
    case 'GEO':
      body = (
        <>
          <rect width="30" height="20" fill="#ffffff" />
          <rect x="13" width="4" height="20" fill="#ff0000" />
          <rect y="8" width="30" height="4" fill="#ff0000" />
          {[[6.5, 4], [23.5, 4], [6.5, 16], [23.5, 16]].map(([x, y]) => (
            <g key={`${x}${y}`} fill="#ff0000">
              <rect x={x - 0.6} y={y - 2} width="1.2" height="4" />
              <rect x={x - 2} y={y - 0.6} width="4" height="1.2" />
            </g>
          ))}
        </>
      );
      break;
    case 'SUI':
      body = (
        <>
          <rect width="30" height="20" fill="#da291c" />
          <rect x="13" y="4" width="4" height="12" fill="#ffffff" />
          <rect x="9" y="8" width="12" height="4" fill="#ffffff" />
        </>
      );
      break;
    case 'MAR':
      body = (
        <>
          <rect width="30" height="20" fill="#c1272d" />
          <path d="M15 5.5l1.3 3.9h4.1l-3.3 2.4 1.3 3.9-3.4-2.4-3.4 2.4 1.3-3.9-3.3-2.4h4.1z" fill="none" stroke="#006233" strokeWidth="0.9" />
        </>
      );
      break;
    case 'CZE':
      body = (
        <>
          <rect width="30" height="10" fill="#ffffff" />
          <rect width="30" height="10" y="10" fill="#d7141a" />
          <path d="M0 0 L14 10 L0 20 Z" fill="#11457e" />
        </>
      );
      break;
    case 'URS':
      body = (
        <>
          <rect width="30" height="20" fill="#cc0000" />
          <path d="M5 3l.6 1.6h1.7l-1.4 1 .5 1.6L5 6.2 3.6 7.2l.5-1.6-1.4-1h1.7z" fill="#ffd700" />
          <path d="M3.5 12.5l4-4M4 9.5c1.5 0 3 1.5 3 3" fill="none" stroke="#ffd700" strokeWidth="0.9" />
        </>
      );
      break;
    case 'NIR':
      body = (
        <>
          <rect width="30" height="20" fill="#ffffff" />
          <rect x="12.5" width="5" height="20" fill="#ce1124" />
          <rect y="7.5" width="30" height="5" fill="#ce1124" />
          <circle cx="15" cy="10" r="2.2" fill="#ffffff" />
          <circle cx="15" cy="10" r="1.2" fill="#ce1124" />
        </>
      );
      break;
    default:
      body = <rect width="30" height="20" fill="#2a3a34" />;
  }
  return (
    <svg className="flag" viewBox="0 0 30 20" width={w} height={h} aria-label={COUNTRY_NAME[code]} role="img">
      {body}
      <rect width="30" height="20" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="1" />
    </svg>
  );
}

/** Stylised portrait: skin, hair style, beard and the PIPA shirt with the player's number. */
export function PlayerAvatar({ player, size = 110 }: { player: PlayerDef; size?: number }) {
  const l = player.look;
  const skin = hex(l.skin);
  const hair = hex(l.hair);
  const gk = player.role === 'GK';
  const shirt = gk ? '#ff8a1f' : '#13294b';
  const trim = gk ? '#161616' : '#c8ff3d';
  const hue = accentHue(player.id);
  const headRx = 17 * (0.94 + (l.build - 1) * 0.6);
  const hairEl = (() => {
    switch (l.hairStyle) {
      case 'bald':
        return <ellipse cx="50" cy="31" rx={headRx - 3} ry="6" fill="#fff" opacity=".12" />;
      case 'buzz':
        return <path d={`M${50 - headRx} 38 Q50 14 ${50 + headRx} 38 Q50 25 ${50 - headRx} 38 Z`} fill={hair} opacity=".9" />;
      case 'short':
        return <path d={`M${50 - headRx - 1} 40 Q48 10 ${50 + headRx + 1} 40 Q58 26 50 27 Q40 26 ${50 - headRx - 1} 40 Z`} fill={hair} />;
      case 'sidepart':
      case 'swept':
        return <path d={`M${50 - headRx - 1} 42 Q40 8 ${50 + headRx + 3} 32 Q66 22 56 22 Q40 22 ${50 - headRx - 1} 42 Z`} fill={hair} />;
      case 'fringe':
        return <path d={`M${50 - headRx - 1} 44 Q50 6 ${50 + headRx + 1} 44 L${50 + headRx - 2} 36 Q50 40 ${50 - headRx + 2} 36 Z`} fill={hair} />;
      case 'quiff':
        return <path d={`M${50 - headRx} 38 Q44 4 62 12 Q${50 + headRx + 4} 20 ${50 + headRx} 38 Q50 22 ${50 - headRx} 38 Z`} fill={hair} />;
      case 'spiky':
        return <path d={`M${50 - headRx} 38 L36 16 L42 24 L46 10 L51 22 L56 9 L59 22 L65 14 L${50 + headRx} 38 Q50 26 ${50 - headRx} 38 Z`} fill={hair} />;
      case 'twists':
        return (
          <g fill={hair}>
            <path d={`M${50 - headRx} 38 Q50 14 ${50 + headRx} 38 Q50 24 ${50 - headRx} 38 Z`} />
            {[36, 43, 50, 57, 64].map((x, i) => (
              <ellipse key={x} cx={x} cy={i % 2 ? 16 : 19} rx="3.4" ry="6" />
            ))}
          </g>
        );
      case 'curly':
        return (
          <g fill={hair}>
            {[34, 40, 46, 52, 58, 64, 37, 49, 61].map((x, i) => (
              <circle key={i} cx={x} cy={i > 5 ? 15 : 22} r="6" />
            ))}
          </g>
        );
      case 'afro':
        return <ellipse cx="50" cy="26" rx={headRx + 10} ry="20" fill={hair} />;
      case 'bun':
        return (
          <g fill={hair}>
            <circle cx="50" cy="12" r="6" />
            <path d={`M${50 - headRx - 2} 50 Q46 6 ${50 + headRx + 2} 50 L${50 + headRx} 34 Q50 22 ${50 - headRx} 34 Z`} />
          </g>
        );
    }
  })();
  return (
    <svg className="avatar" viewBox="0 0 100 110" width={size} height={size * 1.1} aria-hidden>
      <defs>
        <radialGradient id={`ag-${player.id}`} cx="50%" cy="38%" r="60%">
          <stop offset="0" stopColor={`hsl(${hue} 70% 55% / .45)`} />
          <stop offset="1" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="48" r="46" fill={`url(#ag-${player.id})`} />
      {/* shoulders + shirt */}
      <path d={`M${12 - (l.build - 1) * 30} 110 Q14 74 50 70 Q86 74 ${88 + (l.build - 1) * 30} 110 Z`} fill={shirt} />
      <path d="M40 71 L50 82 L60 71" fill="none" stroke={trim} strokeWidth="3" />
      <text x="50" y="102" textAnchor="middle" fontFamily="Barlow Condensed, Arial Narrow, Arial" fontWeight="800" fontSize="17" fill={trim}>
        {player.number}
      </text>
      {/* neck + head */}
      <rect x="44" y="56" width="12" height="16" rx="4" fill={skin} />
      {l.hairStyle === 'bun' || l.hairStyle === 'afro' ? hairEl : null}
      <ellipse cx="50" cy="42" rx={headRx} ry="20" fill={skin} />
      {l.beard !== 'none' && (
        <path d={`M${50 - headRx + 1} 44 Q50 ${l.beard === 'full' ? 70 : 64} ${50 + headRx - 1} 44 Q50 ${l.beard === 'full' ? 52 : 50} ${50 - headRx + 1} 44 Z`} fill={hair} opacity={l.beard === 'full' ? 0.95 : 0.55} />
      )}
      <ellipse cx="43" cy="42" rx="1.9" ry="2.3" fill="#1a1410" />
      <ellipse cx="57" cy="42" rx="1.9" ry="2.3" fill="#1a1410" />
      <path d="M45 52 Q50 55 55 52" fill="none" stroke="#5a2f22" strokeWidth="1.4" strokeLinecap="round" opacity=".7" />
      {l.hairStyle === 'bun' || l.hairStyle === 'afro' ? null : hairEl}
    </svg>
  );
}

/** UPDATE 5: all seven abilities + the special, for the detail view */
export function StatSheet({ player }: { player: PlayerDef }) {
  const rows: [string, number][] = player.stats
    ? FIELD_STAT_LABELS.map(([k, l]) => [l, player.stats![k]])
    : player.gk
      ? GK_STAT_LABELS.map(([k, l]) => [l, player.gk![k]])
      : [];
  const sp = SPECIALS[player.special];
  return (
    <div className="stat-sheet" data-testid="stat-sheet">
      {rows.map(([l, v]) => (
        <div key={l} className="stat-row">
          <span>{l}</span>
          <i>
            <s style={{ width: `${Math.max(0, (v - 60) / 39) * 100}%` }} className={v >= 95 ? 'elite' : ''} />
          </i>
          <b>{v}</b>
        </div>
      ))}
      <div className="special" data-testid="special">
        <em>SPECIAL ABILITY</em>
        <b>{sp.name}</b>
        <span>{sp.desc}</span>
      </div>
    </div>
  );
}

export function PlayerCard({
  player,
  selected,
  freeKick,
  order,
  onToggle,
  onInfo,
  compact,
  market,
}: {
  player: PlayerDef;
  selected: boolean;
  freeKick?: boolean;
  order?: number;
  onToggle?: () => void;
  onInfo?: () => void;
  compact?: boolean;
  /** UPDATE 6: TRANSFER MARKET card (price or OWNED instead of SELECT) */
  market?: { price: number; owned: boolean; listed?: boolean; userOffers?: number };
}) {
  const hue = accentHue(player.id);
  return (
    <div
      className={`pcard ${selected ? 'selected' : ''} ${player.role === 'GK' ? 'gk' : ''} ${compact ? 'compact' : ''} ${player.legend ? 'legend' : ''} ${market ? 'market' : ''} ${market?.owned ? 'owned' : ''}`}
      style={{ ['--hue' as string]: hue }}
      data-testid="player-card"
      data-id={player.id}
      data-selected={selected ? '1' : '0'}
    >
      <button className="pcard-hit" onClick={onToggle} aria-pressed={selected} aria-label={`${player.name} ${selected ? '선택 해제' : '선택'}`} />
      <div className="pcard-top">
        <span className="pcard-ovr" data-testid="card-ovr">
          <b>{ovr(player)}</b>
          <em>OVR</em>
        </span>
        <span className="pcard-topr">
          <Flag code={player.country} size={14} />
          <span className="pcard-num">#{player.number}</span>
        </span>
      </div>
      {order !== undefined && <span className="pcard-order">{order}</span>}
      {freeKick && <span className="pcard-fk">⭐ FREE KICK</span>}
      {player.legend && <span className="pcard-legend">LEGEND</span>}
      <div className="pcard-art">
        <PlayerAvatar player={player} size={compact ? 74 : 92} />
      </div>
      <div className="pcard-name">
        <span>{player.first}</span>
        <b>{player.last}</b>
      </div>
      <div className="pcard-meta">
        <span className="pcard-pos">{player.positions.join(' / ')}</span>
        <span className="pcard-country">{COUNTRY_NAME[player.country]}</span>
      </div>
      <div className="pcard-stats">
        {(player.stats
          ? ([['PWR', player.stats.power], ['ACC', player.stats.accuracy], ['CUR', player.stats.curve]] as const)
          : player.gk
            ? ([['REF', player.gk.reflex], ['DIV', player.gk.diving], ['RCH', player.gk.reach]] as const)
            : []
        ).map(([k, v]) => (
          <span key={k}>
            <em>{k}</em>
            <b>{v}</b>
          </span>
        ))}
      </div>
      {market && !!market.userOffers && !market.owned && !market.listed && (
        <span className="pcard-user" data-testid="card-user">
          USER ×{market.userOffers}
        </span>
      )}
      {market ? (
        <div className={`pcard-state pcard-price ${market.owned || market.listed ? 'owned' : ''}`} data-testid="card-price">
          {market.owned ? '✓ OWNED' : market.listed ? 'LISTED' : `${market.price.toLocaleString('en-US')} MP`}
        </div>
      ) : (
        <div className="pcard-state">{selected ? '✓ SELECTED' : 'SELECT'}</div>
      )}
      {onInfo && (
        <button className="pcard-info" onClick={onInfo} aria-label={`${player.name} 상세`}>
          i
        </button>
      )}
    </div>
  );
}
