import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { VersionBadge } from '../components/VersionBadge';
import { AccountError, accountApi, accountsAvailable, devApi, type AccessState, type DevItem, type DevSquadUser, type DevStats, type DevUser } from '../online/account';
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
type Tab = 'recent' | 'records' | 'mp' | 'remove' | 'packs' | 'items' | 'squads' | 'access';
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
            ['mp', 'MP 지급'],
            ['remove', '재화 회수'],
            ['packs', 'PACK 지급'],
            ['items', 'FV · 토큰 · 팩'],
            ['squads', 'USER SQUADS'],
            ['access', 'SERVER ACCESS'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} className={`chip ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)} role="tab" aria-selected={tab === t} data-testid={`dev-tab-${t}`}>
            {label}
          </button>
        ))}
      </div>
      {tab !== 'squads' && tab !== 'access' && <input className="dev-search" placeholder="닉네임 검색" value={q} onChange={(e) => setQ(e.target.value)} data-testid="dev-search" />}
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
      {tab === 'remove' && <CurrencyRemove users={users} devToken={devToken} onExpired={onExpired} onDone={() => void load()} />}
      {tab === 'packs' && <PackGrant users={users} devToken={devToken} onExpired={onExpired} onGranted={() => void load()} />}
      {tab === 'items' && <ItemGrant users={users} devToken={devToken} onExpired={onExpired} onGranted={() => void load()} />}
      {tab === 'squads' && <UserSquads devToken={devToken} onExpired={onExpired} />}
      {tab === 'access' && <AccessControl devToken={devToken} onExpired={onExpired} />}
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

// ── UPDATE 9.5 — FV · 홍 토큰 · GOOD / LEGEND PACK 지급 (server-checked, logged) ─────
const ITEMS: { id: DevItem; label: string; unit: string; max: number }[] = [
  { id: 'fv', label: 'FV', unit: 'FV', max: 100000 },
  { id: 'bronze', label: '동 토큰', unit: '개', max: 100 },
  { id: 'silver', label: '은 토큰', unit: '개', max: 100 },
  { id: 'gold', label: '금 토큰', unit: '개', max: 100 },
  { id: 'red', label: '홍 토큰', unit: '개', max: 100 },
  { id: 'good', label: 'GOOD PLAYER PACK', unit: '개', max: 100 },
  { id: 'legend', label: 'LEGEND PACK', unit: '개', max: 100 },
];
const itemOf = (u: DevUser, id: DevItem) =>
  id === 'fv' ? u.fv ?? 0 : id === 'good' ? u.goodPacks ?? 0 : id === 'legend' ? u.legendPacks ?? 0 : u.hong?.[id] ?? 0;
const fmt = (n: number) => n.toLocaleString('en-US');

function ItemGrant({ users, devToken, onExpired, onGranted }: { users: DevUser[]; devToken: string; onExpired: () => void; onGranted: () => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const [item, setItem] = useState<DevItem>('fv');
  const [raw, setRaw] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const user = useMemo(() => users.find((u) => u.nickname === sel) ?? null, [users, sel]);
  const it = ITEMS.find((x) => x.id === item)!;
  const count = /^[0-9]+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  const valid = Number.isSafeInteger(count) && count >= 1 && count <= it.max;
  const cur = user ? itemOf(user, item) : 0;

  const grant = async () => {
    if (!user || !valid || busy) return;
    setBusy(true);
    try {
      const r = await devApi.grantItems(devToken, user.nickname, item, count);
      setMsg({ text: `${it.unit === 'FV' ? `${fmt(r.granted ?? count)} FV` : `${it.label} ${fmt(r.granted ?? count)}개`} 지급 완료 (보유 ${fmt(r.after ?? cur + count)})`, tone: 'good' });
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
    <div className="dev-mp" data-testid="dev-items">
      <ul className="dev-list dev-pick">
        {users.map((u) => (
          <li key={u.nickname}>
            <button className={`dev-row pick ${sel === u.nickname ? 'on' : ''}`} onClick={() => (setSel(u.nickname), setMsg(null))} data-testid="dev-item-pick" data-nick={u.nickname}>
              <b>{u.nickname}</b>
              <span className="dev-time">
                FV {fmt(u.fv ?? 0)} · 동{u.hong?.bronze ?? 0} 은{u.hong?.silver ?? 0} 금{u.hong?.gold ?? 0} 홍{u.hong?.red ?? 0} · GOOD {u.goodPacks ?? 0} · LEGEND {u.legendPacks ?? 0}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {user && (
        <div className="dev-grant" data-testid="dev-item-grant">
          <div className="dev-grant-row">
            <span>유저</span>
            <b>{user.nickname}</b>
          </div>
          <div className="dev-subtabs" role="radiogroup">
            {ITEMS.map((x) => (
              <button key={x.id} className={`chip ${item === x.id ? 'on' : ''}`} onClick={() => (setItem(x.id), setMsg(null))} data-testid={`dev-item-${x.id}`} role="radio" aria-checked={item === x.id}>
                {x.label}
              </button>
            ))}
          </div>
          <div className="dev-grant-row">
            <span>현재 보유</span>
            <b data-testid="dev-item-current">
              {fmt(cur)}
              {it.unit === 'FV' ? ' FV' : '개'}
            </b>
          </div>
          <label className="field">
            <span>
              지급할 {it.label} (1 ~ {fmt(it.max)})
            </span>
            <input inputMode="numeric" value={raw} onChange={(e) => (setRaw(e.target.value), setMsg(null))} placeholder="예: 10" data-testid="dev-item-count" />
          </label>
          {raw && !valid && <p className="dev-msg bad">1 ~ {fmt(it.max)} 사이의 정수만 입력할 수 있어요</p>}
          <button className="btn-primary" disabled={!valid || busy} onClick={() => setConfirm(true)} data-testid="dev-item-btn">
            지급
          </button>
        </div>
      )}
      {msg && (
        <p className={`dev-msg ${msg.tone}`} data-testid="dev-item-msg">
          {msg.text}
        </p>
      )}
      {confirm && user && valid && (
        <div className="detail-backdrop confirm" data-testid="dev-item-confirm">
          <div className="detail-card confirm-card">
            <p className="confirm-q">
              {user.nickname}에게
              <br />
              <b className="confirm-name">{it.unit === 'FV' ? `${fmt(count)} FV` : `${it.label} ${fmt(count)}개`}</b>
              를 지급하시겠습니까?
            </p>
            <dl className="confirm-rows">
              <dt>현재</dt>
              <dd>{fmt(cur)}</dd>
              <dt>지급 후</dt>
              <dd className="after">{fmt(cur + count)}</dd>
            </dl>
            <div className="detail-actions">
              <button className="btn-primary" onClick={grant} disabled={busy} data-testid="dev-item-ok">
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

/** UPDATE 11 — 재화 회수: MP or FV back from a user, only up to what he has (the server checks too) */
function CurrencyRemove({ users, devToken, onExpired, onDone }: { users: DevUser[]; devToken: string; onExpired: () => void; onDone: () => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const [cur, setCur] = useState<'mp' | 'fv'>('mp');
  const [raw, setRaw] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const user = useMemo(() => users.find((u) => u.nickname === sel) ?? null, [users, sel]);
  const unit = cur === 'mp' ? 'MP' : 'FV';
  const have = user ? (cur === 'mp' ? user.mp ?? 0 : user.fv ?? 0) : 0;
  const clean = raw.replace(/,/g, '').trim();
  const amount = /^[0-9]+$/.test(clean) ? Number(clean) : NaN;
  const valid = Number.isSafeInteger(amount) && amount >= 1;
  const tooMuch = valid && amount > have;

  const remove = async () => {
    if (!user || !valid || tooMuch || busy) return;
    setBusy(true);
    try {
      const r = await devApi.removeCurrency(devToken, user.nickname, cur, amount);
      setMsg({ text: `재화 회수 완료 — ${fmt(r.removed ?? amount)} ${unit} (남은 ${unit} ${fmt(r.after ?? have - amount)})`, tone: 'good' });
      setRaw('');
      onDone();
    } catch (e) {
      if (e instanceof AccountError && e.code === 'dev') return onExpired();
      setMsg({ text: e instanceof Error ? e.message : '회수하지 못했어요', tone: 'bad' });
      onDone();
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <div className="dev-mp" data-testid="dev-remove">
      <ul className="dev-list dev-pick">
        {users.map((u) => (
          <li key={u.nickname}>
            <button className={`dev-row pick ${sel === u.nickname ? 'on' : ''}`} onClick={() => (setSel(u.nickname), setMsg(null))} data-testid="dev-remove-pick" data-nick={u.nickname}>
              <b>{u.nickname}</b>
              <span className="dev-time">
                MP {fmt(u.mp ?? 0)} · FV {fmt(u.fv ?? 0)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {user && (
        <div className="dev-grant" data-testid="dev-remove-form">
          <div className="dev-grant-row">
            <span>유저</span>
            <b>{user.nickname}</b>
          </div>
          <div className="dev-grant-row">
            <span>MP</span>
            <b data-testid="dev-remove-mp">{fmt(user.mp ?? 0)}</b>
          </div>
          <div className="dev-grant-row">
            <span>FV</span>
            <b data-testid="dev-remove-fv">{fmt(user.fv ?? 0)}</b>
          </div>
          <div className="dev-subtabs" role="radiogroup">
            {(['mp', 'fv'] as const).map((c) => (
              <button key={c} className={`chip ${cur === c ? 'on' : ''}`} onClick={() => (setCur(c), setMsg(null))} data-testid={`dev-remove-${c}-tab`} role="radio" aria-checked={cur === c}>
                {c.toUpperCase()}
              </button>
            ))}
          </div>
          <label className="field">
            <span>회수 금액 ({unit})</span>
            <input inputMode="numeric" value={raw} onChange={(e) => (setRaw(e.target.value), setMsg(null))} placeholder="예: 100000000" data-testid="dev-remove-amount" />
          </label>
          {raw && !valid && <p className="dev-msg bad">1 이상의 정수만 입력할 수 있어요</p>}
          {tooMuch && (
            <p className="dev-msg bad" data-testid="dev-remove-toomuch">
              보유량({fmt(have)} {unit})보다 많이 회수할 수 없어요
            </p>
          )}
          <button className="btn-primary danger" disabled={!valid || tooMuch || busy} onClick={() => setConfirm(true)} data-testid="dev-remove-btn">
            재화 회수
          </button>
        </div>
      )}
      {msg && (
        <p className={`dev-msg ${msg.tone}`} data-testid="dev-remove-msg">
          {msg.text}
        </p>
      )}
      {confirm && user && valid && !tooMuch && (
        <div className="detail-backdrop confirm" data-testid="dev-remove-confirm">
          <div className="detail-card confirm-card">
            <p className="confirm-q">
              {user.nickname}에게서
              <br />
              <b className="confirm-name">
                {fmt(amount)} {unit}
              </b>
              를 회수하시겠습니까?
            </p>
            <dl className="confirm-rows">
              <dt>현재 {unit}</dt>
              <dd>{fmt(have)}</dd>
              <dt>회수 후 {unit}</dt>
              <dd className="after">{fmt(have - amount)}</dd>
            </dl>
            <div className="detail-actions">
              <button className="btn-primary" onClick={remove} disabled={busy} data-testid="dev-remove-ok">
                {busy ? '회수 중…' : '확인'}
              </button>
              <button className="btn-ghost" onClick={() => setConfirm(false)} disabled={busy} data-testid="dev-remove-cancel">
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * UPDATE 11 patch — SERVER ACCESS CONTROL: the weekday limit (MON–FRI 08:35–15:00 KST,
 * decided by the server clock). [전체 게임 열기] opens the game for everyone even inside the
 * window; [자동 시간 제한 복구] goes back to the automatic limit. Saved on the server.
 */
function AccessControl({ devToken, onExpired }: { devToken: string; onExpired: () => void }) {
  const [st, setSt] = useState<AccessState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const load = async () => {
    try {
      setSt(await accountApi.access());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '상태를 불러오지 못했어요');
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const set = async (mode: 'open' | 'auto') => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await devApi.access(devToken, mode);
      setSt(r);
      setMsg(mode === 'open' ? '전체 게임을 열었어요 (시간 제한 없음)' : '자동 시간 제한을 복구했어요');
    } catch (e) {
      if (e instanceof AccountError && e.code === 'dev') return onExpired();
      setMsg(e instanceof Error ? e.message : '변경하지 못했어요');
    } finally {
      setBusy(false);
    }
  };
  const kst = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '-');
  return (
    <div className="dev-grant" data-testid="dev-access-ctl">
      <p className="eyebrow">SERVER ACCESS CONTROL</p>
      <p className="ms-sub">평일(월–금) 08:35–15:00 (서울 시간)에는 게임 이용이 제한돼요. 서버 시간 기준이에요.</p>
      <div className="dev-grant-row">
        <span>현재 모드</span>
        <b data-testid="dev-access-mode">{st ? (st.mode === 'open' ? '전체 열림 (OPEN)' : '자동 시간 제한 (AUTO)') : '…'}</b>
      </div>
      <div className="dev-grant-row">
        <span>지금 상태</span>
        <b data-testid="dev-access-state">{st ? (st.locked ? '이용 제한 중' : '이용 가능') : '…'}</b>
      </div>
      <div className="dev-grant-row">
        <span>서버 시간 (KST)</span>
        <b>{kst(st?.serverTime)}</b>
      </div>
      <div className="dev-grant-row">
        <span>제한 시간대</span>
        <b>{st ? (st.window ? '지금 제한 시간대' : '제한 시간대 아님') : '…'}</b>
      </div>
      <button className="btn-primary" disabled={busy || st?.mode === 'open'} onClick={() => void set('open')} data-testid="dev-access-open">
        전체 게임 열기
      </button>
      <button className="btn-ghost" disabled={busy || st?.mode === 'auto'} onClick={() => void set('auto')} data-testid="dev-access-auto">
        자동 시간 제한 복구
      </button>
      {msg && (
        <p className="dev-msg" data-testid="dev-access-msg">
          {msg}
        </p>
      )}
    </div>
  );
}
