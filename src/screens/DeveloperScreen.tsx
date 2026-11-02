import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { VersionBadge } from '../components/VersionBadge';
import { AccountError, accountsAvailable, devApi, type DevStats, type DevUser } from '../online/account';
import { formatMP } from '../players/ownership';

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
type Tab = 'recent' | 'records' | 'mp';
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
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} className={`chip ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)} role="tab" aria-selected={tab === t} data-testid={`dev-tab-${t}`}>
            {label}
          </button>
        ))}
      </div>
      <input className="dev-search" placeholder="닉네임 검색" value={q} onChange={(e) => setQ(e.target.value)} data-testid="dev-search" />
      {err && <p className="dev-msg bad">{err}</p>}

      {tab === 'recent' && (
        <ul className="dev-list" data-testid="dev-recent">
          {users.map((u) => (
            <li key={u.nickname} className="dev-row" data-testid="dev-user" data-nick={u.nickname} data-online={u.online ? '1' : '0'}>
              <b>{u.nickname}</b>
              <span className="dev-time">{kstTime(u.lastSeenAt)}</span>
              <span className={`dev-status ${u.online ? 'on' : ''}`}>{u.online ? 'ONLINE' : 'OFFLINE'}</span>
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
