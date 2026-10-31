import type { ShotOutcome } from '../game/core/types';

const TEXT: Record<ShotOutcome, string> = {
  GOAL: 'GOAL!',
  SAVE: 'SAVE!',
  MISS: 'MISS',
  BLOCKED: 'BLOCKED',
};

export function ResultBanner({ outcome, detail }: { outcome: ShotOutcome; detail: string }) {
  return (
    <div className={`result result-${outcome.toLowerCase()}`} data-testid="result">
      <div className="result-word">{TEXT[outcome]}</div>
      <div className="result-detail">{detail}</div>
      <div className="result-tap">화면을 탭하면 다음 슛</div>
    </div>
  );
}
