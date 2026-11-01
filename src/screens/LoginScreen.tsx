import { VersionBadge } from '../components/VersionBadge';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PlayerProfile } from '../game/core/types';
import { AccountError, accountApi, accountsAvailable, loadSession, storeSession } from '../online/account';

const NICK_KEY = 'pipa.nickname';

function loadNick() {
  try {
    return loadSession()?.nickname ?? localStorage.getItem(NICK_KEY) ?? '';
  } catch {
    return '';
  }
}

export function LoginScreen({ onLogin }: { onLogin: (p: PlayerProfile) => void }) {
  const online = accountsAvailable();
  const [nickname, setNickname] = useState(loadNick);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'auto' | 'login'>(() => (online && loadSession() ? 'auto' : null));
  const [slow, setSlow] = useState(false);
  const started = useRef(false);

  // a free Render server sleeps when idle — the first request can take up to ~a minute
  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), 3500);
    return () => clearTimeout(t);
  }, [busy]);

  // saved login on this device → straight in
  useEffect(() => {
    if (started.current || busy !== 'auto') return;
    started.current = true;
    const saved = loadSession();
    if (!saved) return setBusy(null);
    accountApi
      .session(saved.token)
      .then((r) => onLogin({ nickname: r.nickname ?? saved.nickname, token: saved.token, savedSquad: r.squad }))
      .catch((e: unknown) => {
        if (e instanceof AccountError && e.code === 'session') {
          storeSession(null);
          setError('로그인이 만료됐어요. 비밀번호를 다시 입력해주세요');
        } else setError(e instanceof Error ? e.message : '서버에 연결할 수 없어요');
        setBusy(null);
      });
  }, [busy, onLogin]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const nick = nickname.trim();
    if (!nick) return setError('닉네임을 입력해주세요');
    if ([...nick].length > 12) return setError('닉네임은 12자 이하로 입력해주세요');
    if (!password) return setError('비밀번호를 입력해주세요');
    if (online && password.length < 4) return setError('비밀번호는 4자 이상으로 입력해주세요');
    try {
      localStorage.setItem(NICK_KEY, nick);
    } catch {
      /* private mode */
    }
    if (!online) {
      // claude.ai / offline copy: no server to hold accounts — device-only login
      onLogin({ nickname: nick });
      return;
    }
    setBusy('login');
    try {
      const r = await accountApi.auth(nick, password);
      storeSession({ token: r.token!, nickname: r.nickname ?? nick });
      onLogin({ nickname: r.nickname ?? nick, token: r.token, savedSquad: r.squad });
    } catch (err) {
      setError(err instanceof Error ? err.message : '잠시 후 다시 시도해주세요');
      setBusy(null);
    }
  };

  return (
    <div className="screen login">
      <VersionBadge floating />
      <svg className="pitch-art" viewBox="0 0 400 700" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <g fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="40" y="-2" width="320" height="704" />
          <rect x="110" y="-2" width="180" height="120" />
          <rect x="160" y="-2" width="80" height="44" />
          <path d="M150 118 A70 70 0 0 0 250 118" />
          <circle cx="200" cy="80" r="3" fill="currentColor" />
          <line x1="40" y1="560" x2="360" y2="560" />
          <circle cx="200" cy="560" r="70" />
        </g>
      </svg>
      <div className="login-glow" aria-hidden />

      <header className="brand">
        <div className="brand-ball" aria-hidden />
        <h1 className="logo">PIPA</h1>
        <p className="logo-sub">FOOTBALL GAME</p>
      </header>

      <form className="login-card" onSubmit={submit} noValidate>
        <label className="field">
          <span>닉네임</span>
          <input
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              setError(null);
            }}
            placeholder="닉네임 입력"
            autoComplete="username"
            maxLength={20}
            enterKeyHint="next"
          />
        </label>
        <label className="field">
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            placeholder="비밀번호 입력"
            autoComplete="current-password"
            enterKeyHint="go"
          />
        </label>
        <p className="form-error" role="alert" data-testid="login-error">
          {error ?? '\u00a0'}
        </p>
        <button type="submit" className="btn-primary" disabled={!!busy} data-testid="login-submit">
          {busy === 'auto' ? '자동 로그인 중…' : busy ? '접속 중…' : '게임 시작'}
        </button>
        {busy && slow && <p className="login-wait">서버를 깨우는 중이에요 · 최대 1분 정도 걸릴 수 있어요</p>}
      </form>
      <p className="login-foot">
        {online
          ? '처음 쓰는 닉네임이면 새 계정이 만들어져요 · 닉네임은 한 사람만 쓸 수 있어요'
          : '이 버전은 계정이 이 기기에만 저장돼요'}
      </p>
    </div>
  );
}
