import { GAME_VERSION } from '../version';
import { SEASON_LABEL } from '../progress/season';

/** Small "UPDATE n" pill for the top-right of the main screens. */
export function VersionBadge({ floating = false }: { floating?: boolean }) {
  return (
    <span className={`version-badge ${floating ? 'floating' : ''}`} data-testid="version-badge">
      UPDATE {GAME_VERSION}
    </span>
  );
}

/** UPDATE 10: "SEASON 1" — the season is separate from the update number */
export function SeasonBadge() {
  return (
    <span className="season-badge" data-testid="season-badge">
      {SEASON_LABEL}
    </span>
  );
}
