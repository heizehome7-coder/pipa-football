import { useEffect, useState } from 'react';
import type { PlayerDef } from '../players/players';

/**
 * UPDATE 4: "CRISTIANO RONALDO" lower-third when a player steps up; fades out
 * after ~1.6 s. `show` changes (a new key) re-trigger it.
 */
export function NameBanner({ player, label, show, sub, evo = 0 }: { player: PlayerDef | null; label?: string; show: string; sub?: string | null; /** UPDATE 10 */ evo?: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!player || !show) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 1700);
    return () => window.clearTimeout(t);
  }, [show, player]);
  if (!player || !visible) return null;
  return (
    <div className="name-banner" key={show} data-testid="name-banner" data-player={player.id}>
      {label && <span className="nb-label">{label}</span>}
      <b>
        <em>{player.number}</em> {player.nameKo}
        {evo > 0 && <i className={`nb-evo ${evo >= 10 ? 'high' : ''}`} data-testid="nb-evo">+{evo}</i>}
      </b>
      {sub && <span className="nb-sub">{sub}</span>}
    </div>
  );
}
