import { SoundToggle } from './SoundToggle';
export function GameHUD({
  label,
  goals,
  shots,
  nickname,
  onBack,
}: {
  label: string;
  goals: number;
  shots: number;
  nickname: string;
  onBack: () => void;
}) {
  return (
    <div className="hud">
      <button className="hud-back" onClick={onBack} aria-label="모드 선택으로 돌아가기">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className="hud-score" data-testid="hud">
        <span className="hud-mode">{label}</span>
        <span className="hud-count">
          {goals}/{shots}
        </span>
        <span className="hud-name">{nickname}</span>
      </div>
      <div className="hud-spacer hud-sound">
        <SoundToggle compact />
      </div>
    </div>
  );
}
