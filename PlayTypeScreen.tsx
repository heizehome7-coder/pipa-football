import { VersionBadge } from '../components/VersionBadge';
import type { PlayerProfile } from '../game/core/types';
import { PlayerAvatar } from '../components/PlayerArt';
import { getPlayer, type PlayerDef } from '../players/players';
import type { Squad } from '../players/squad';

function SoloIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <path d="M8 46 V14 H56 V46" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
      <circle cx="32" cy="30" r="9" fill="none" stroke="var(--lime)" strokeWidth="3" />
      <circle cx="32" cy="30" r="3.2" fill="var(--lime)" />
      <circle cx="32" cy="56" r="4.5" fill="currentColor" />
    </svg>
  );
}

function OnlineIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <circle cx="17" cy="22" r="7" fill="currentColor" />
      <path d="M6 48 Q17 32 28 48 Z" fill="currentColor" />
      <circle cx="47" cy="22" r="7" fill="var(--lime)" />
      <path d="M36 48 Q47 32 58 48 Z" fill="var(--lime)" />
      <text x="32" y="30" textAnchor="middle" fontFamily="Barlow Condensed, Arial" fontStyle="italic" fontWeight="900" fontSize="12" fill="currentColor">
        VS
      </text>
    </svg>
  );
}

function SquadIcon({ squad }: { squad: Squad | null }) {
  const faces = (squad?.penaltyOrder ?? []).slice(0, 3).map((id) => getPlayer(id)).filter((p): p is PlayerDef => !!p);
  if (!faces.length)
    return (
      <svg viewBox="0 0 64 64" aria-hidden>
        <rect x="10" y="10" width="20" height="28" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
        <rect x="34" y="10" width="20" height="28" rx="4" fill="none" stroke="var(--lime)" strokeWidth="3" />
        <rect x="22" y="26" width="20" height="28" rx="4" fill="var(--bg-2)" stroke="currentColor" strokeWidth="3" />
      </svg>
    );
  return (
    <span className="squad-faces">
      {faces.map((p) => (
        <span key={p.id} className="squad-face">
          <PlayerAvatar player={p} size={30} />
        </span>
      ))}
    </span>
  );
}

export function PlayTypeScreen({
  user,
  squad,
  onSolo,
  onOnline,
  onSquad,
  onLogout,
}: {
  user: PlayerProfile;
  squad: Squad | null;
  onSolo: () => void;
  onOnline: () => void;
  onSquad: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="screen modes">
      <header className="modes-top">
        <div className="mini-logo">PIPA</div>
        <div className="top-right">
          <VersionBadge />
          <button className="btn-ghost" onClick={onLogout}>
          로그아웃
          </button>
        </div>
      </header>
      <div className="modes-head">
        <p className="eyebrow">PLAY TYPE</p>
        <h2>
          <span className="lime">{user.nickname}</span> 선수,
          <br />
          어떻게 플레이할까요?
        </h2>
      </div>
      <div className="mode-list">
        <button className="mode-card play-card" onClick={onSolo} data-testid="play-solo">
          <div className="play-icon">
            <SoloIcon />
          </div>
          <div className="mode-text">
            <strong>혼자서</strong>
            <span className="mode-ko">SOLO</span>
            <span className="mode-desc">혼자 연습하기</span>
          </div>
          <span className="mode-arrow" aria-hidden>
            ›
          </span>
        </button>
        <button className="mode-card play-card" onClick={onOnline} data-testid="play-online">
          <div className="play-icon online">
            <OnlineIcon />
            <span className="live-dot" aria-hidden />
          </div>
          <div className="mode-text">
            <strong>온라인</strong>
            <span className="mode-ko">ONLINE</span>
            <span className="mode-desc">다른 플레이어와 대결</span>
          </div>
          <span className="mode-arrow" aria-hidden>
            ›
          </span>
        </button>
        <button className="mode-card play-card" onClick={onSquad} data-testid="play-squad">
          <div className="play-icon squad-icon">
            <SquadIcon squad={squad} />
          </div>
          <div className="mode-text">
            <strong>SQUAD</strong>
            <span className="mode-ko">MY SQUAD</span>
            <span className="mode-desc">{squad ? `키커 5명 · GK ${getPlayer(squad.goalkeeperId)?.last ?? ''}` : '선수 구성하기'}</span>
          </div>
          <span className="mode-arrow" aria-hidden>
            ›
          </span>
        </button>
      </div>
    </div>
  );
}
