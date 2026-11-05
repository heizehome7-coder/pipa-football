import { evoOvrBonus } from '../progress/evolution';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Flag, PlayerAvatar } from './PlayerArt';
import { ovr, SPECIALS, type PlayerDef, type SpecialId } from '../players/players';

/**
 * UPDATE 6 patch — the scorer's big PLAYER CARD (GOAL only), sliding in from the left
 * while he celebrates. Same player data as the SQUAD / TRANSFER MARKET cards
 * (PlayerCard): avatar, OVR, positions, abilities, SPECIAL — this is the
 * "goal overlay" variant of that card. PIPA's own design: dark green, black, neon lime,
 * metallic edge; the frame accent follows the player's SPECIAL (or gold for LEGENDs).
 * transform/opacity animation only (60 fps on phones).
 */
type Theme = 'finesse' | 'power' | 'flair' | 'speed' | 'legend' | 'classic';

const THEME_OF: Partial<Record<SpecialId, Theme>> = {
  FINESSE_MASTER: 'finesse',
  LEFT_FINESSE: 'finesse',
  LEFT_CURL: 'finesse',
  TWO_FOOT_FINESSE: 'finesse',
  DRIVEN_CURVE: 'finesse',
  KNUCKLE_DRIVE: 'power',
  POWER_FINISH: 'power',
  CONTROLLED_DRIVE: 'power',
  LOW_DISGUISE: 'flair',
  QUICK_LOW_CURL: 'flair',
  POWER_BURST: 'speed',
};
export const goalCardTheme = (p: PlayerDef): Theme => (p.legend ? 'legend' : THEME_OF[p.special] ?? 'classic');

/** the 4 key numbers on the goal card */
function keyStats(p: PlayerDef): [string, number][] {
  if (p.stats) return [['POWER', p.stats.power], ['ACC', p.stats.accuracy], ['CURVE', p.stats.curve], ['FK', p.stats.freeKick]];
  if (p.gk) return [['REFLEX', p.gk.reflex], ['DIVING', p.gk.diving], ['REACH', p.gk.reach], ['POS', p.gk.positioning]];
  return [];
}

function Pattern({ theme }: { theme: Theme }) {
  // light decorative layer per theme (a few SVG strokes — cheap on phones)
  if (theme === 'finesse')
    return (
      <svg className="gcard-pattern" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <path key={i} d={`M-10 ${118 - i * 14} C 30 ${70 - i * 12}, 70 ${150 - i * 18}, 112 ${60 - i * 10}`} fill="none" strokeWidth="0.8" />
        ))}
      </svg>
    );
  if (theme === 'speed')
    return (
      <svg className="gcard-pattern" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path key={i} d={`M${-20 + i * 22} 140 L${30 + i * 22} 0`} strokeWidth={i % 2 ? 0.6 : 1.4} />
        ))}
      </svg>
    );
  if (theme === 'flair')
    return (
      <svg className="gcard-pattern" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
        {Array.from({ length: 18 }, (_, i) => {
          const x = (i % 6) * 18 + (Math.floor(i / 6) % 2) * 9;
          const y = 12 + Math.floor(i / 6) * 22;
          return <path key={i} d={`M${x} ${y - 4} L${x + 4} ${y} L${x} ${y + 4} L${x - 4} ${y} Z`} strokeWidth="0.7" fill="none" />;
        })}
      </svg>
    );
  if (theme === 'power' || theme === 'legend')
    return (
      <svg className="gcard-pattern" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
        <path d="M0 26 L100 6 M0 40 L100 20" strokeWidth="1.6" />
        <path d="M0 132 L100 112" strokeWidth="1" />
      </svg>
    );
  return null;
}

export function PlayerCardGoalOverlay({ player, evo = 0 }: { player: PlayerDef; evo?: number }) {
  const theme = goalCardTheme(player);
  const sp = SPECIALS[player.special];
  return (
    <div className={`gcard gcard-${theme}`} data-testid="goal-card" data-id={player.id} data-theme={theme} aria-live="polite">
      <div className="gcard-frame">
        <Pattern theme={theme} />
        <div className="gcard-top">
          <span className="gcard-ovr">
            <b>{ovr(player) + evoOvrBonus(evo)}</b>
            <em>OVR</em>
          </span>
          <span className="gcard-pos">{player.positions.join(' / ')}</span>
          <span className="gcard-flag">
            <Flag code={player.country} size={13} />
          </span>
        </div>
        {player.legend && <span className="gcard-legend-tag">LEGEND</span>}
        {evo > 0 && <span className={`gcard-evo ${evo >= 10 ? 'high' : ''}`} data-testid="gcard-evo">+{evo}{evo >= 12 ? ' MAX' : ''}</span>}
        <div className="gcard-art">
          <PlayerAvatar player={player} size={118} />
        </div>
        <div className="gcard-name">
          <span>{player.koFirst || '\u00a0'}</span>
          <b>{player.koLast}</b>
        </div>
        <div className="gcard-stats">
          {keyStats(player).map(([k, v]) => (
            <span key={k}>
              <em>{k}</em>
              <b>{v}</b>
            </span>
          ))}
        </div>
        <div className="gcard-special">
          <em>SPECIAL</em>
          <b>{sp.name}</b>
        </div>
      </div>
      <span className="gcard-goal">GOAL</span>
    </div>
  );
}

/** total time on screen (slide-in · hold · slide-out) — the CSS animation matches */
export const GOAL_CARD_MS = 2900;

/** show the scorer's card for one goal; a new key restarts it */
export function useGoalCard() {
  const [shown, setShown] = useState<{ key: string; player: PlayerDef; evo: number } | null>(null);
  const timer = useRef(0);
  const last = useRef('');
  const show = useCallback((key: string, player: PlayerDef | null | undefined, evo = 0) => {
    if (!player || last.current === key) return;
    last.current = key;
    window.clearTimeout(timer.current);
    setShown({ key, player, evo });
    timer.current = window.setTimeout(() => setShown(null), GOAL_CARD_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { show, el: shown ? <PlayerCardGoalOverlay key={shown.key} player={shown.player} evo={shown.evo} /> : null };
}
