import { PlayerCard } from '../components/PlayerArt';
import { VersionBadge } from '../components/VersionBadge';
import { getPlayer, type PlayerDef } from '../players/players';
import type { Squad } from '../players/squad';

/** UPDATE 4: PENALTY practice — pick which of my 5 takers steps up. */
export function SelectKickerScreen({ squad, onPick, onBack }: { squad: Squad; onPick: (p: PlayerDef) => void; onBack: () => void }) {
  const players = squad.penaltyOrder.map((id) => getPlayer(id)).filter((p): p is PlayerDef => !!p);
  return (
    <div className="screen squad" data-testid="select-kicker">
      <header className="squad-top">
        <button className="btn-ghost squad-back" onClick={onBack}>
          ‹ 뒤로
        </button>
        <VersionBadge />
      </header>
      <div className="squad-head">
        <p className="eyebrow">PENALTY</p>
        <h2 className="squad-title">SELECT KICKER</h2>
        <p className="squad-sub">이번 연습에서 찰 선수를 고르세요</p>
      </div>
      <div className="card-grid">
        {players.map((p, i) => (
          <PlayerCard key={p.id} player={p} selected={false} order={i + 1} freeKick={squad.freeKickTakerId === p.id} onToggle={() => onPick(p)} />
        ))}
      </div>
    </div>
  );
}
