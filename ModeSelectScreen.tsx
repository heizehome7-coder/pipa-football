import { VersionBadge } from '../components/VersionBadge';
import type { GameMode, PlayerProfile } from '../game/core/types';

function PenaltyIcon() {
  return (
    <svg viewBox="0 0 120 80" aria-hidden>
      <path d="M14 62 V18 H106 V62" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
      <path d="M22 26 H98 M22 38 H98 M22 50 H98 M34 18 V62 M50 18 V62 M66 18 V62 M82 18 V62" stroke="currentColor" strokeOpacity=".28" strokeWidth="1.5" />
      <circle cx="60" cy="72" r="6" fill="var(--lime)" />
      <path d="M60 64 Q66 44 86 30" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function FreeKickIcon() {
  return (
    <svg viewBox="0 0 120 80" aria-hidden>
      <path d="M30 34 V12 H90 V34" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
      {[44, 54, 64, 74].map((x) => (
        <g key={x} fill="#e94b3c">
          <circle cx={x} cy="44" r="4" />
          <rect x={x - 4} y="48" width="8" height="12" rx="3" />
        </g>
      ))}
      <circle cx="40" cy="73" r="5.5" fill="var(--lime)" />
      <path d="M40 66 Q26 40 56 20" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function ModeSelectScreen({
  user,
  onSelect,
  onLogout,
  topActionLabel = '로그아웃',
}: {
  user: PlayerProfile;
  onSelect: (m: GameMode) => void;
  onLogout: () => void;
  topActionLabel?: string;
}) {
  return (
    <div className="screen modes">
      <header className="modes-top">
        <div className="mini-logo">PIPA</div>
        <div className="top-right">
          <VersionBadge />
          <button className="btn-ghost" onClick={onLogout}>
          {topActionLabel}
          </button>
        </div>
      </header>
      <div className="modes-head">
        <p className="eyebrow">MODE SELECT</p>
        <h2>
          <span className="lime">{user.nickname}</span> 선수,
          <br />
          어떤 승부를 할까요?
        </h2>
      </div>
      <div className="mode-list">
        <button className="mode-card" onClick={() => onSelect('penalty')}>
          <div className="mode-icon">
            <PenaltyIcon />
          </div>
          <div className="mode-text">
            <strong>PENALTY KICK</strong>
            <span className="mode-ko">페널티킥</span>
            <span className="mode-desc">11m 거리, 골키퍼와 1:1 승부</span>
          </div>
          <span className="mode-arrow" aria-hidden>
            ›
          </span>
        </button>
        <button className="mode-card" onClick={() => onSelect('freekick')}>
          <div className="mode-icon">
            <FreeKickIcon />
          </div>
          <div className="mode-text">
            <strong>FREE KICK</strong>
            <span className="mode-ko">프리킥</span>
            <span className="mode-desc">수비벽을 넘기거나 감아서 골문으로</span>
          </div>
          <span className="mode-arrow" aria-hidden>
            ›
          </span>
        </button>
      </div>
      <div className="how">
        <p className="eyebrow">HOW TO PLAY</p>
        <ul>
          <li>공을 누른 채 원하는 슛 경로를 직접 그리기</li>
          <li>공은 그린 경로 그대로 날아가요 (휘면 감아차기, 높게 그리면 로빙)</li>
          <li>빠르게 그릴수록 강한 슛</li>
        </ul>
      </div>
    </div>
  );
}
