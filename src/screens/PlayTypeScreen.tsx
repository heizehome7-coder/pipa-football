import { VersionBadge } from '../components/VersionBadge';
import type { PlayerProfile } from '../game/core/types';
import { PlayerAvatar } from '../components/PlayerArt';
import { getPlayer, type PlayerDef } from '../players/players';
import type { Squad } from '../players/squad';
import { ProgressHeader } from '../components/ProgressHeader';
import type { Progress } from '../players/ownership';

function MarketIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <rect x="9" y="14" width="22" height="32" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
      <rect x="33" y="18" width="22" height="32" rx="4" fill="none" stroke="var(--lime)" strokeWidth="3" />
      <text x="44" y="39" textAnchor="middle" fontFamily="Barlow Condensed, Arial" fontWeight="900" fontSize="11" fill="var(--lime)">
        MP
      </text>
    </svg>
  );
}

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
  onMarket,
  onPacks,
  onDeveloper,
  onRanking,
  onLevels,
  mp,
  progress,
  onLogout,
}: {
  user: PlayerProfile;
  squad: Squad | null;
  onSolo: () => void;
  onOnline: () => void;
  onSquad: () => void;
  onMarket: () => void;
  /** UPDATE 8: PLAYER PACKS */
  onPacks: () => void;
  /** UPDATE 6 patch: DEVELOPER MODE (server-checked code) */
  onDeveloper: () => void;
  /** UPDATE 7 */
  onRanking: () => void;
  onLevels: () => void;
  progress?: Progress | null;
  /** UPDATE 6: current MP (null = no account server) */
  mp: number | null;
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
      <ProgressHeader nickname={user.nickname} mp={mp} progress={progress} onLevels={onLevels} />
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
        <button className="mode-card play-card" onClick={onMarket} data-testid="play-market">
          <div className="play-icon">
            <MarketIcon />
          </div>
          <div className="mode-text">
            <strong>TRANSFER MARKET</strong>
            <span className="mode-ko">이적시장</span>
            <span className="mode-desc">MP로 새 선수 · 레전드 영입</span>
          </div>
          <span className="mode-arrow" aria-hidden>
            ›
          </span>
        </button>
        <button className="mode-card play-card packs-card" onClick={onPacks} data-testid="play-packs">
          <div className="play-icon">
            <svg viewBox="0 0 64 64" aria-hidden>
              <rect x="16" y="8" width="32" height="48" rx="5" fill="none" stroke="currentColor" strokeWidth="3" />
              <path d="M16 22 H48" stroke="currentColor" strokeWidth="3" />
              <path d="M32 30 l4 8 8 1 -6 5 2 8 -8 -4 -8 4 2 -8 -6 -5 8 -1z" fill="var(--lime)" />
            </svg>
            {!!progress?.packs && <span className="pack-count" data-testid="home-pack-count">{progress.packs}</span>}
          </div>
          <div className="mode-text">
            <strong>PACKS</strong>
            <span className="mode-ko">플레이어 팩</span>
            <span className="mode-desc">{progress?.packs ? `열 수 있는 팩 ${progress.packs}개` : '팩을 열어 새 선수 획득'}</span>
          </div>
          <span className="mode-arrow" aria-hidden>
            ›
          </span>
        </button>
        <button className="mode-card play-card" onClick={onRanking} data-testid="play-ranking">
          <div className="play-icon">
            <svg viewBox="0 0 64 64" aria-hidden>
              <rect x="8" y="30" width="14" height="22" rx="2" fill="none" stroke="currentColor" strokeWidth="3" />
              <rect x="25" y="16" width="14" height="36" rx="2" fill="none" stroke="var(--lime)" strokeWidth="3" />
              <rect x="42" y="38" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="3" />
            </svg>
          </div>
          <div className="mode-text">
            <strong>RANKING</strong>
            <span className="mode-ko">랭킹</span>
            <span className="mode-desc">MP · 승부차기 · 프리킥 승리 순위</span>
          </div>
          <span className="mode-arrow" aria-hidden>
            ›
          </span>
        </button>
        <button className="mode-card play-card dev-card" onClick={onDeveloper} data-testid="play-developer">
          <div className="play-icon">
            <svg viewBox="0 0 64 64" aria-hidden>
              <path d="M22 22 L10 32 L22 42 M42 22 L54 32 L42 42" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M36 16 L28 48" stroke="var(--lime)" strokeWidth="3.5" strokeLinecap="round" />
            </svg>
          </div>
          <div className="mode-text">
            <strong>개발자 모드</strong>
            <span className="mode-ko">DEVELOPER MODE</span>
            <span className="mode-desc">접속자 · 전적 · MP · 팩 관리</span>
          </div>
          <span className="mode-arrow" aria-hidden>
            ›
          </span>
        </button>
      </div>
    </div>
  );
}
