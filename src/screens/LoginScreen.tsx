import { VersionBadge } from '../components/VersionBadge';
import { useState, type FormEvent } from 'react';
import type { PlayerProfile } from '../game/core/types';

const NICK_KEY = 'pipa.nickname';

function loadNick() {
  try {
    return localStorage.getItem(NICK_KEY) ?? '';
  } catch {
    return '';
  }
}

export function LoginScreen({ onLogin }: { onLogin: (p: PlayerProfile) => void }) {
  const [nickname, setNickname] = useState(loadNick);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const nick = nickname.trim();
    if (!nick) return setError('닉네임을 입력해주세요');
    if (nick.length > 12) return setError('닉네임은 12자 이하로 입력해주세요');
    if (!password) return setError('비밀번호를 입력해주세요');
    try {
      localStorage.setItem(NICK_KEY, nick);
    } catch {
      /* private mode */
    }
    // Prototype: no account DB — any nickname + password enters the game.
    onLogin({ nickname: nick });
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
        <p className="form-error" role="alert">
          {error ?? ' '}
        </p>
        <button type="submit" className="btn-primary">
          게임 시작
        </button>
      </form>
      <p className="login-foot">프로토타입 · 계정 정보는 서버에 저장되지 않습니다</p>
    </div>
  );
}
