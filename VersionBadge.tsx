import { GAME_VERSION } from '../version';

/** Small "UPDATE n" pill for the top-right of the main screens. */
export function VersionBadge({ floating = false }: { floating?: boolean }) {
  return (
    <span className={`version-badge ${floating ? 'floating' : ''}`} data-testid="version-badge">
      UPDATE {GAME_VERSION}
    </span>
  );
}
