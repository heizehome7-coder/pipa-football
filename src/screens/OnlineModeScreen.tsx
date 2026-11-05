import { SeasonBadge, VersionBadge } from '../components/VersionBadge';
import type { DuelMode } from '../online/LobbyClient';

/** UPDATE 6 — ONLINE: pick the duel first, then challenge someone in the lobby. */
export function OnlineModeScreen({ onPick, onBack }: { onPick: (m: DuelMode) => void; onBack: () => void }) {
  return (
    <div className="screen modes" data-testid="online-modes">
      <header className="modes-top">
        <button className="btn-ghost" onClick={onBack}>
          ‹ 뒤로
        </button>
        <div className="top-right">
          <VersionBadge />
          <SeasonBadge />
        </div>
      </header>
      <div className="modes-head">
        <p className="eyebrow">ONLINE</p>
        <h2>
          어떤 대결을
          <br />
          할까요?
        </h2>
      </div>
      <div className="mode-list">
        <button className="mode-card play-card" onClick={() => onPick('penalty')} data-testid="online-penalty">
          <div className="play-icon">
            <svg viewBox="0 0 64 64" aria-hidden>
              <path d="M8 46 V14 H56 V46" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
              <circle cx="32" cy="54" r="5" fill="var(--lime)" />
            </svg>
          </div>
          <div className="mode-text">
            <strong>PENALTY SHOOTOUT</strong>
            <span className="mode-ko">승부차기 · 5번씩 번갈아</span>
            <span className="mode-desc">승리 +10,000,000 MP</span>
          </div>
          <span className="mode-arrow" aria-hidden>
            ›
          </span>
        </button>
        <button className="mode-card play-card" onClick={() => onPick('freekick')} data-testid="online-freekick">
          <div className="play-icon">
            <svg viewBox="0 0 64 64" aria-hidden>
              <path d="M8 40 V12 H56 V40" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
              {[22, 28, 34, 40].map((x) => (
                <rect key={x} x={x - 2.4} y="34" width="4.8" height="12" rx="2" fill="currentColor" opacity="0.8" />
              ))}
              <circle cx="46" cy="56" r="5" fill="var(--lime)" />
            </svg>
          </div>
          <div className="mode-text">
            <strong>FREE KICK DUEL</strong>
            <span className="mode-ko">프리킥 대결 · 수비벽 + 사람 골키퍼</span>
            <span className="mode-desc">각자의 FREE KICK TAKER로 5번씩</span>
          </div>
          <span className="mode-arrow" aria-hidden>
            ›
          </span>
        </button>
      </div>
    </div>
  );
}
