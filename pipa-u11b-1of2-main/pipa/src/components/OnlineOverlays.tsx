import { useEffect, useState } from 'react';
import type { LobbyClient, LobbySnapshot } from '../online/LobbyClient';

/** Floating request card: right side on desktop, bottom card on phones. */
export function ChallengePanel({ lobby, snap }: { lobby: LobbyClient; snap: LobbySnapshot }) {
  const inc = snap.incoming;
  const [shownAt, setShownAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!inc) return;
    setShownAt(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [inc?.challengeId]);
  if (!inc) return null;
  const left = Math.max(0, 1 - (now - shownAt) / 30000);
  return (
    <aside className="challenge-panel" role="alertdialog" aria-label="대결 신청" data-testid="challenge-panel">
      <div className="cp-head">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <circle cx="12" cy="12" r="10" fill="#fff" />
          <path d="M12 7.2l3.3 2.4-1.3 3.9H10l-1.3-3.9z" fill="#13294b" />
        </svg>
        <span>대결 신청</span>
      </div>
      <p className="cp-text">
        <b>{inc.senderNickname}</b>님이
        <br />
        대결을 신청했습니다.
      </p>
      <p className="cp-mode" data-testid="cp-mode">
        {inc.mode === 'freekick' ? 'FREE KICK DUEL' : 'PENALTY SHOOTOUT'}
      </p>
      <div className="cp-actions">
        <button className="cp-accept" onClick={() => lobby.accept()} data-testid="cp-accept">
          수락
        </button>
        <button className="cp-reject" onClick={() => lobby.reject()} data-testid="cp-reject">
          거절
        </button>
      </div>
      <i className="cp-timer" style={{ transform: `scaleX(${left})` }} />
    </aside>
  );
}

export function NoticeStack({ lobby, snap }: { lobby: LobbyClient; snap: LobbySnapshot }) {
  if (!snap.notices.length) return null;
  return (
    <div className="notice-stack" role="status" aria-live="polite">
      {snap.notices.map((n) => (
        <button key={n.id} className={`notice ${n.tone}`} onClick={() => lobby.dismissNotice(n.id)} data-testid="notice">
          {n.text}
        </button>
      ))}
    </div>
  );
}
