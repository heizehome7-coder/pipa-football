import { useEffect, useState } from 'react';
import { SPECIALS, type SpecialId } from '../players/players';

/** UPDATE 5: "⚡ KNUCKLE DRIVE" when a player's special fires on a shot */
export function useSpecialPop() {
  const [pop, setPop] = useState<{ id: SpecialId; key: number } | null>(null);
  useEffect(() => {
    if (!pop) return;
    const t = window.setTimeout(() => setPop(null), 1600);
    return () => window.clearTimeout(t);
  }, [pop]);
  const show = (id: string) => {
    if (id in SPECIALS) setPop({ id: id as SpecialId, key: Date.now() });
  };
  const el = pop ? (
    <div className="special-pop" key={pop.key} data-testid="special-pop" data-special={pop.id}>
      ⚡ {SPECIALS[pop.id].name}
    </div>
  ) : null;
  return { show, el };
}
