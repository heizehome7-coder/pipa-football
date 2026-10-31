import type { LobbyClient, MatchInfo } from '../online/LobbyClient';

export function MatchFoundScreen({ lobby, match, onLeave }: { lobby: LobbyClient; match: MatchInfo; onLeave: () => void }) {
  const ended = match.ended === 'opponent_left';
  const bothReady = match.ready && match.opponentReady;
  return (
    <div className={`screen matchfound ${ended ? 'ended' : ''}`} data-testid="match-found" data-match-id={match.matchId}>
      <div className="mf-glow" aria-hidden />
      <p className="eyebrow mf-eyebrow">ONLINE MATCH</p>
      <h1 className="mf-title">MATCH FOUND</h1>

      <div className="mf-versus">
        <div className="mf-player me">
          <span className="mf-badge">YOU</span>
          <strong data-testid="mf-me">{match.me.nickname}</strong>
          <span className={`mf-ready ${match.ready ? 'on' : ''}`}>{match.ready ? '준비 완료' : '준비 전'}</span>
        </div>
        <span className="mf-vs">VS</span>
        <div className={`mf-player opp ${ended ? 'gone' : ''}`}>
          <span className="mf-badge">OPPONENT</span>
          <strong data-testid="mf-opp">{match.opponent.nickname}</strong>
          <span className={`mf-ready ${match.opponentReady ? 'on' : ''}`}>
            {ended ? '연결 끊김' : match.opponentReady ? '준비 완료' : match.opponentJoined ? '준비 전' : '접속 확인 중'}
          </span>
        </div>
      </div>

      <p className="mf-sub" data-testid="mf-sub">
        {ended ? '상대방의 연결이 종료되었습니다.' : match.role === 'sender' ? '상대방이 대결을 수락했습니다.' : '대결을 수락했습니다.'}
      </p>
      {!ended && bothReady && <p className="mf-note">두 선수 모두 준비 완료! 온라인 경기는 다음 단계에서 열립니다.</p>}
      {!ended && !bothReady && match.ready && <p className="mf-note">상대방의 준비를 기다리는 중…</p>}

      <div className="mf-actions">
        {!ended && (
          <button className="btn-primary" onClick={() => lobby.setReady(!match.ready)} data-testid="mf-ready">
            {match.ready ? '준비 완료 ✓' : '경기 준비'}
          </button>
        )}
        <button className="btn-ghost mf-leave" onClick={onLeave}>
          온라인 로비로 돌아가기
        </button>
      </div>
      <p className="mf-id" data-testid="match-id">
        MATCH ID · {match.matchId}
      </p>
    </div>
  );
}
