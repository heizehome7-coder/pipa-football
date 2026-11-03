import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { VersionBadge } from '../components/VersionBadge';
import { AccountError, accountsAvailable, devApi, type DevSquadUser, type DevStats, type DevUser } from '../online/account';
import { formatMP } from '../players/ownership';
import { PlayerCard } from '../components/PlayerArt';
import { getPlayer, SPECIALS, type PlayerDef } from '../players/players';
import { PACK_CONFIG } from '../progress/packs';

/**
 * UPDATE 6 patch — DEVELOPER MODE.
 * The code is sent to the server (/api/dev/auth); only the server knows it (env
 * DEVELOPER_CODE). Every dashboard call carries the short-lived developer token and is
 * checked again by the server — this screen never changes MP by itself.
 */
export function DeveloperScreen({ onBack }: { onBack: () => void }) {
  const [devToken, setDevToken] = useState<string | null>(null);
  if (!devToken) return <DevAccess onOk={setDevToken} onBack={onBack} />;
  return <DevDashboard devToken={devToken} onExpired={() => setDevToken(null)} onBack={onBack} />;
}

// ── 2–3. 개발자 코드 입력 ────────────────────────────────────────────────
function DevAccess({ onOk, onBack }: { onOk: (t: string) => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const [busy, setBusy] = useState(false);
  const online = accountsAvailable();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !code) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await devApi.auth(code);
      setMsg({ text: '인증되었습니다.', tone: 'good' });
      window.setTimeout(() => onOk(r.devToken!), 900);
    } catch (err) {
      const offline = err instanceof AccountError && err.code === 'offline';
      setMsg({ text: offline ? err.message : err instanceof AccountError && err.code === 'rate' ? err.message : '인증이 되지 않았습니다.', tone: 'bad' });
      setBusy(false);
    }
  };

  return (
    <div className="screen dev dev-access" data-testid="dev-access">
      <header className="modes-top">
        <button className="btn-ghost" onClick={onBack}>
          ‹ 뒤로
        </button>
        <VersionBadge />
      </header>
      <div className="dev-access-body">
        <span className="mini-logo dev-logo">PIPA</span>
        <h2 className="dev-title">DEVELOPER ACCESS</h2>
        {online ? (
          <form className="login-card dev-form" onSubmit={submit} noValidate>
            <label className="field">
              <span>개발자 코드를 입력하세요.</span>
              <input
                type="password"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setMsg(null);
                }}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="go"
                data-testid="dev-code"
              />
            </label>
            <p className={`dev-msg ${msg?.tone ?? ''}`} role="alert" data-testid="dev-msg">
              {msg?.text ?? ' '}
            </p>
            <button type="submit" className="btn-primary" disabled={busy || !code} data-testid="dev-submit">
              {busy && !msg ? '확인 중…' : '인증'}
            </button>
          </form>
        ) : (
          <p className="dev-msg bad">개발자 모드는 Render 서버 버전에서만 사용할 수 있어요.</p>
        )}
      </div>
    </div>
  );
}

// ── 5. DEVELOPER DASHBOARD ──────────────────────────────────────────────
type Tab = 'recent' | 'records' | 'mp' | 'packs' | 'squads';
type RecMode = 'total' | 'penalty' | 'freekick';

/** server ISO time → "YYYY-MM-DD HH:mm" in Korean time */
export function kstTime(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const k = new Date(d.getTime() + 9 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

const rate = (s: DevStats) => {
  const n = s.wins + s.losses + s.draws;
  return n ? `${((100 * s.wins) / n).toFixed(1)}%` : '-';
};

function DevDashboard({ devToken, onExpired, onBack }: { devToken: string; onExpired: () => void; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('recent');
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<DevUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recMode, setRecMode] = useState<RecMode>('total');

  const load = async (query = q) => {
    setLoading(true);
    try {
      const r = await devApi.users(devToken, query.trim());
      setUsers(r.users ?? []);
      setTotal(r.total ?? 0);
      setErr(null);
    } catch (e) {
      if (e instanceof AccountError && e.code === 'dev') return onExpired();
      setErr(e instanceof Error ? e.message : '불러오지 못했어요');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load('');
    const t = window.setInterval(() => void load(), 20_000); // keep ONLINE / OFFLINE fresh
    return () => window.clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // search as you type (small debounce)
  useEffect(() => {
    const t = window.setTimeout(() => void load(q), 250);
    return () => window.clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const onlineCount = users.filter((u) => u.online).length;

  return (
    <div className="screen dev dev-dash" data-testid="dev-dashboard">
      <header className="modes-top">
        <button className="btn-ghost" onClick={onBack} data-testid="dev-back">
          ‹ 홈
        </button>
        <VersionBadge />
      </header>
      <div className="dev-head">
        <span className="mini-logo dev-logo">PIPA</span>
        <h2 className="dev-title">DEVELOPER DASHBOARD</h2>
        <p className="dev-sub">
          유저 {total}명 · 지금 접속 {onlineCount}명
        </p>
      </div>
      <div className="dev-tabs" role="tablist">
        {(
          [
            ['recent', '최근 접속자'],
            ['records', '유저 전적'],
            ['mp', 'MP 관리'],
            ['packs', 'PACK 지급'],
            ['squads', 'USER SQUADS'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} className={`chip ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)} role="tab" aria-selected={tab === t} data-testid={`dev-tab-${t}`}>
            {label}
          </button>
        ))}
      </div>
      {tab !== 'squads' && <input className="dev-search" placeholder="닉네임 검색" value={q} onChange={(e) => setQ(e.target.value)} data-testid="dev-search" />}
      {err && <p className="dev-msg bad">{err}</p>}

      {tab === 'recent' && (
        <ul className="dev-list" data-testid="dev-recent">
          {users.map((u) => (
            <li key={u.nickname} className="dev-row" data-testid="dev-user" data-nick={u.nickname} data-online={u.online ? '1' : '0'}>
              <b>{u.nickname}</b>
              <span className="dev-time">{kstTime(u.lastSeenAt)}</span>
              <span className={`dev-status ${u.online ? 'on' : ''}`}>{u.online ? 'ONLINE' : 'OFFLINE'}</span>
              {/* UPDATE 7 */}
              <span className="dev-extra" data-testid="dev-extra">
                LV {u.level ?? 0} · XP {u.xp ?? 0} · {formatMP(u.mp)} · FV {(u.fv ?? 0).toLocaleString('en-US')} · PK {u.stats.penalty.wins}W · FK {u.stats.freekick.wins}W · STREAK {u.dailyStreak ?? 0}
              </span>
            </li>
          ))}
          {!users.length && <li className="dev-empty">{loading ? '불러오는 중…' : '유저가 없어요'}</li>}
        </ul>
      )}

      {tab === 'records' && (
        <>
          <div className="dev-subtabs">
            {(
              [
                ['total', 'TOTAL'],
                ['penalty', 'PENALTY'],
                ['freekick', 'FREE KICK'],
              ] as [RecMode, string][]
            ).map(([m, label]) => (
              <button key={m} className={`chip small ${recMode === m ? 'on' : ''}`} onClick={() => setRecMode(m)} data-testid={`dev-rec-${m}`}>
                {label}
              </button>
            ))}
          </div>
          <ul className="dev-list" data-testid="dev-records">
            {users.map((u) => {
              const s = u.stats[recMode];
              const n = s.wins + s.losses + s.draws;
              return (
                <li key={u.nickname} className="dev-rec" data-testid="dev-record" data-nick={u.nickname} data-w={s.wins} data-l={s.losses} data-d={s.draws}>
                  <b>{u.nickname}</b>
                  <span>
                    승리 <em>{s.wins}</em> · 패배 <em>{s.losses}</em> · 무승부 <em>{s.draws}</em>
                  </span>
                  <span className="dev-rec-sum">
                    {n} MATCHES · WIN RATE {rate(s)}
                  </span>
                </li>
              );
            })}
            {!users.length && <li className="dev-empty">{loading ? '불러오는 중…' : '유저가 없어요'}</li>}
          </ul>
        </>
      )}

      {tab === 'mp' && <MpManager users={users} devToken={devToken} onExpired={onExpired} onGranted={() => void load()} />}
      {tab === 'packs' && <PackGrant users={users} devToken={devToken} onExpired={onExpired} onGranted={() => void load()} />}
      {tab === 'squads' && <UserSquads devToken={devToken} onExpired={onExpired} />}
    </div>
  );
}

// ── 12–16. MP 관리 ──────────────────────────────────────────────────────
function MpManager({ users, devToken, onExpired, onGranted }: { users: DevUser[]; devToken: string; onExpired: () => void; onGranted: () => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const [raw, setRaw] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const user = useMemo(() => users.find((u) => u.nickname === sel) ?? null, [users, sel]);
  // digits only (commas allowed while typing); the server checks again
  const amount = /^[0-9,]+$/.test(raw.trim()) ? Number(raw.replace(/,/g, '')) : NaN;
  const valid = Number.isSafeInteger(amount) && amount > 0;

  const grant = async () => {
    if (!user || !valid || busy) return;
    setBusy(true);
    try {
      const r = await devApi.grant(devToken, user.nickname, amount);
      setMsg({ text: `${(r.granted ?? amount).toLocaleString('en-US')} MP 지급 완료`, tone: 'good' });
      setRaw('');
      onGranted();
    } catch (e) {
      if (e instanceof AccountError && e.code === 'dev') return onExpired();
      setMsg({ text: e instanceof Error ? e.message : '지급하지 못했어요', tone: 'bad' });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <div className="dev-mp" data-testid="dev-mp">
      <ul className="dev-list dev-pick">
        {users.map((u) => (
          <li key={u.nickname}>
            <button className={`dev-row pick ${sel === u.nickname ? 'on' : ''}`} onClick={() => (setSel(u.nickname), setMsg(null))} data-testid="dev-pick" data-nick={u.nickname}>
              <b>{u.nickname}</b>
              <span className="dev-time">{formatMP(u.mp)}</span>
            </button>
          </li>
        ))}
      </ul>
      {user && (
        <div className="dev-grant" data-testid="dev-grant">
          <div className="dev-grant-row">
            <span>유저</span>
            <b>{user.nickname}</b>
          </div>
          <div className="dev-grant-row">
            <span>현재 MP</span>
            <b data-testid="dev-current-mp">{formatMP(user.mp)}</b>
          </div>
          <label className="field">
            <span>지급할 MP</span>
            <input inputMode="numeric" value={raw} onChange={(e) => (setRaw(e.target.value), setMsg(null))} placeholder="예: 500,000,000" data-testid="dev-amount" />
          </label>
          {raw && !valid && <p className="dev-msg bad">1 이상의 정수만 입력할 수 있어요</p>}
          <button className="btn-primary" disabled={!valid || busy} onClick={() => setConfirm(true)} data-testid="dev-grant-btn">
            MP 지급
          </button>
        </div>
      )}
      {msg && (
        <p className={`dev-msg ${msg.tone}`} data-testid="dev-grant-msg">
          {msg.text}
        </p>
      )}
      {confirm && user && valid && (
        <div className="detail-backdrop confirm" data-testid="dev-confirm">
          <div className="detail-card confirm-card">
            <p className="confirm-q">
              {user.nickname}에게
              <br />
              <b className="confirm-name">{formatMP(amount)}</b>를 지급하시겠습니까?
            </p>
            <dl className="confirm-rows">
              <dt>현재</dt>
              <dd>{formatMP(user.mp)}</dd>
              <dt>지급 후</dt>
              <dd className="after">{formatMP(user.mp + amount)}</dd>
            </dl>
            <div className="detail-actions">
              <button className="btn-primary" onClick={grant} disabled={busy} data-testid="dev-confirm-ok">
                {busy ? '지급 중…' : '확인'}
              </button>
              <button className="btn-ghost" onClick={() => setConfirm(false)} disabled={busy}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── UPDATE 7 hotfix — USER SQUADS (read-only) ─────────────────────────────
/**
 * The squad a user plays with, exactly as the SERVER stores it (never this phone's
 * localStorage): penalty order 1–5, goalkeeper and free-kick taker as player cards,
 * plus the players the account owns. Every call carries the developer token.
 */
function UserSquads({ devToken, onExpired }: { devToken: string; onExpired: () => void }) {
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [user, setUser] = useState<DevSquadUser | null>(null);
  const [matches, setMatches] = useState<{ nickname: string; online: boolean; level: number }[]>([]);
  const [showOwned, setShowOwned] = useState(false);

  const look = async (name: string) => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await devApi.squad(devToken, name.trim());
      setUser(r.user ?? null);
      setMatches(r.user ? [] : r.matches ?? []);
      setShowOwned(false);
    } catch (e) {
      if (e instanceof AccountError && e.code === 'dev') return onExpired();
      setUser(null);
      setMatches([]);
      setErr(e instanceof Error ? e.message : '불러오지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  const sq = user?.squad ?? null;
  const card = (id: string | undefined, label?: { order?: number; fk?: boolean }) => {
    const p = getPlayer(id);
    if (!p) return <div className="dev-sq-missing">{id ?? '-'}</div>;
    return <SquadCard key={`${p.id}-${label?.order ?? ''}`} player={p} order={label?.order} fk={label?.fk} />;
  };

  return (
    <div className="dev-squads" data-testid="dev-squads">
      <form
        className="dev-sq-search"
        onSubmit={(e) => {
          e.preventDefault();
          void look(nick);
        }}
      >
        <input className="dev-search" placeholder="닉네임으로 스쿼드 조회" value={nick} onChange={(e) => setNick(e.target.value)} data-testid="dev-sq-input" />
        <button type="submit" className="btn-primary small" disabled={busy || !nick.trim()} data-testid="dev-sq-go">
          {busy ? '조회 중…' : '조회'}
        </button>
      </form>
      {err && <p className="dev-msg bad" data-testid="dev-sq-msg">{err}</p>}
      {!!matches.length && (
        <ul className="dev-list dev-pick" data-testid="dev-sq-matches">
          {matches.map((m) => (
            <li key={m.nickname}>
              <button className="dev-row pick" onClick={() => (setNick(m.nickname), void look(m.nickname))} data-testid="dev-sq-match" data-nick={m.nickname}>
                <b>{m.nickname}</b>
                <span className="dev-time">LV {m.level}</span>
                <span className={`dev-status ${m.online ? 'on' : ''}`}>{m.online ? 'ONLINE' : 'OFFLINE'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {user && (
        <div className="dev-sq-user" data-testid="dev-sq-user" data-nick={user.nickname}>
          <div className="dev-sq-head">
            <b>{user.nickname}</b>
            <span className={`dev-status ${user.online ? 'on' : ''}`}>{user.online ? 'ONLINE' : 'OFFLINE'}</span>
            <em>
              LV {user.level} · {formatMP(user.mp)} · 보유 {user.ownedAll.length}명
            </em>
          </div>
          {!sq ? (
            <p className="dev-empty" data-testid="dev-sq-none">서버에 저장된 스쿼드가 없어요</p>
          ) : (
            <>
              {!user.squadUsable && <p className="dev-msg bad">보유하지 않은 선수가 있어 온라인에서는 이 스쿼드를 쓸 수 없어요</p>}
              <h4 className="dev-sq-title">PENALTY ORDER</h4>
              <div className="dev-sq-row" data-testid="dev-sq-order">
                {sq.penaltyOrder.map((id, i) => card(id, { order: i + 1 }))}
              </div>
              <div className="dev-sq-pair">
                <div>
                  <h4 className="dev-sq-title">GOALKEEPER</h4>
                  <div className="dev-sq-row" data-testid="dev-sq-gk">{card(sq.goalkeeperId)}</div>
                </div>
                <div>
                  <h4 className="dev-sq-title">FREE KICK TAKER</h4>
                  <div className="dev-sq-row" data-testid="dev-sq-fk">{card(sq.freeKickTakerId, { fk: true })}</div>
                </div>
              </div>
            </>
          )}
          <button className="btn-ghost dev-sq-owned-btn" onClick={() => setShowOwned((v) => !v)} data-testid="dev-sq-owned-btn">
            {showOwned ? '보유 선수 닫기' : `보유 선수 보기 (${user.ownedAll.length})`}
          </button>
          {showOwned && (
            <div className="dev-sq-row wrap" data-testid="dev-sq-owned">
              {user.ownedAll.map((id) => card(id))}
              {user.listed.map((id) => (
                <div key={`l-${id}`} className="dev-sq-listed">
                  {card(id)}
                  <span>판매 등록 중</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** a read-only player card + its special ability (name, OVR, position, special) */
function SquadCard({ player, order, fk }: { player: PlayerDef; order?: number; fk?: boolean }) {
  return (
    <div className="dev-sq-card" data-testid="dev-sq-card" data-id={player.id}>
      <PlayerCard player={player} selected={false} order={order} freeKick={fk} compact />
      <span className="dev-sq-special">⚡ {SPECIALS[player.special].name}</span>
    </div>
  );
}

// ── UPDATE 8 — PACK 지급 (server-checked: developer token, 1 … 100 packs) ─────
function PackGrant({ users, devToken, onExpired, onGranted }: { users: DevUser[]; devToken: string; onExpired: () => void; onGranted: () => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const [raw, setRaw] = useState('1');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const user = useMemo(() => users.find((u) => u.nickname === sel) ?? null, [users, sel]);
  const count = /^[0-9]+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  const valid = Number.isSafeInteger(count) && count >= 1 && count <= PACK_CONFIG.maxDevGrant;

  const grant = async () => {
    if (!user || !valid || busy) return;
    setBusy(true);
    try {
      const r = await devApi.grantPacks(devToken, user.nickname, count);
      setMsg({ text: `PLAYER PACK ${r.granted ?? count}개 지급 완료 (보유 ${r.unopenedPacks ?? '-'}개)`, tone: 'good' });
      onGranted();
    } catch (e) {
      if (e instanceof AccountError && e.code === 'dev') return onExpired();
      setMsg({ text: e instanceof Error ? e.message : '지급하지 못했어요', tone: 'bad' });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <div className="dev-mp" data-testid="dev-packs">
      <ul className="dev-list dev-pick">
        {users.map((u) => (
          <li key={u.nickname}>
            <button className={`dev-row pick ${sel === u.nickname ? 'on' : ''}`} onClick={() => (setSel(u.nickname), setMsg(null))} data-testid="dev-pack-pick" data-nick={u.nickname}>
              <b>{u.nickname}</b>
              <span className="dev-time">PACK {u.unopenedPacks ?? 0}</span>
            </button>
          </li>
        ))}
      </ul>
      {user && (
        <div className="dev-grant" data-testid="dev-pack-grant">
          <div className="dev-grant-row">
            <span>유저</span>
            <b>{user.nickname}</b>
          </div>
          <div className="dev-grant-row">
            <span>보유 팩</span>
            <b data-testid="dev-current-packs">{user.unopenedPacks ?? 0}개</b>
          </div>
          <label className="field">
            <span>지급할 PLAYER PACK 개수 (1 ~ {PACK_CONFIG.maxDevGrant})</span>
            <input inputMode="numeric" value={raw} onChange={(e) => (setRaw(e.target.value), setMsg(null))} placeholder="예: 10" data-testid="dev-pack-count" />
          </label>
          {raw && !valid && <p className="dev-msg bad">1 ~ {PACK_CONFIG.maxDevGrant} 사이의 정수만 입력할 수 있어요</p>}
          <button className="btn-primary" disabled={!valid || busy} onClick={() => setConfirm(true)} data-testid="dev-pack-btn">
            PACK 지급
          </button>
        </div>
      )}
      {msg && (
        <p className={`dev-msg ${msg.tone}`} data-testid="dev-pack-msg">
          {msg.text}
        </p>
      )}
      {confirm && user && valid && (
        <div className="detail-backdrop confirm" data-testid="dev-pack-confirm">
          <div className="detail-card confirm-card">
            <p className="confirm-q">
              {user.nickname}에게
              <br />
              <b className="confirm-name">PLAYER PACK {count}개</b>를 지급하시겠습니까?
            </p>
            <dl className="confirm-rows">
              <dt>현재</dt>
              <dd>{user.unopenedPacks ?? 0}개</dd>
              <dt>지급 후</dt>
              <dd className="after">{(user.unopenedPacks ?? 0) + count}개</dd>
            </dl>
            <div className="detail-actions">
              <button className="btn-primary" onClick={grant} disabled={busy} data-testid="dev-pack-ok">
                {busy ? '지급 중…' : '확인'}
              </button>
              <button className="btn-ghost" onClick={() => setConfirm(false)} disabled={busy}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
