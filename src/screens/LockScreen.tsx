import { VersionBadge } from '../components/VersionBadge';
import type { AccessState } from '../online/account';
import { ACCESS_TEXT } from '../progress/access';

/**
 * UPDATE 11 patch — the weekday limit screen (MON–FRI 08:35–15:00 KST, the server decides).
 * Login works; the developer can still open DEVELOPER MODE (and open the game for everyone).
 */
export function LockScreen({ access, onDeveloper, onLogout, onRetry }: { access: AccessState; onDeveloper: () => void; onLogout: () => void; onRetry: () => void }) {
  return (
    <div className="screen lock-screen" data-testid="lock-screen" data-mode={access.mode}>
      <div className="lock-card">
        <div className="lock-icon" aria-hidden>
          <i />
        </div>
        <h2 data-testid="lock-title">{ACCESS_TEXT.title}</h2>
        <p data-testid="lock-body">{ACCESS_TEXT.body}</p>
        <p className="lock-after" data-testid="lock-after">
          {ACCESS_TEXT.after}
        </p>
        <button className="btn-primary" onClick={onRetry} data-testid="lock-retry">
          다시 확인
        </button>
        <div className="lock-actions">
          <button className="btn-ghost" onClick={onLogout} data-testid="lock-logout">
            로그아웃
          </button>
          <button className="btn-ghost" onClick={onDeveloper} data-testid="lock-dev">
            DEVELOPER MODE
          </button>
        </div>
      </div>
      <VersionBadge />
    </div>
  );
}
