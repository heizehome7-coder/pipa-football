import { VersionBadge } from '../components/VersionBadge';
import { useEffect } from 'react';
import type { DuelMode, LobbyClient, LobbySnapshot, PlayerView } from '../online/LobbyClient';

const STATUS_TEXT: Record<PlayerView['status'], string> = {
  online: '접속 중',
  in_lobby: '로비에서 대기 중',
  pending: '응답 대기 중',
  in_match: '대결 중',
};

function unavailableText(backend: LobbySnapshot['backend']) {
  if (backend === 'artifact')
    return '공개 링크로 열었거나 claude.ai에 로그인하지 않은 상태에서는 온라인에 접속할 수 없어요. 게임 주인에게 이메일로 초대를 받은 뒤, 그 계정으로 로그인해서 다시 열어주세요.';
  if (backend === 'websocket') return 'PIPA 실시간 서버에 연결할 수 없습니다. 서버가 잠에서 깨는 중일 수 있으니(최대 1분) 잠시 뒤 새로고침해주세요.';
  return '이 방식으로 연 게임에서는 온라인 기능을 쓸 수 없어요. 서버로 실행하거나 claude.ai에서 공유된 페이지로 열어주세요.';
}

export const DUEL_NAME: Record<DuelMode, string> = { penalty: 'PENALTY SHOOTOUT', freekick: 'FREE KICK DUEL' };

export function OnlineLobbyScreen({ lobby, snap, mode = 'penalty', onBack }: { lobby: LobbyClient; snap: LobbySnapshot; mode?: DuelMode; onBack: () => void }) {
  // presence says "in_lobby" only while this screen is open
  useEffect(() => {
    lobby.enterLobby();
    return () => lobby.leaveLobby();
  }, [lobby]);

  const { connection, outgoing, players } = snap;
  const live = connection === 'online';
  const pill = live ? '' : connection === 'unavailable' ? 'off' : 'wait';
  const pillText = live ? 'ONLINE' : connection === 'unavailable' ? 'OFFLINE' : connection === 'reconnecting' ? '재연결 중' : '연결 중';

  return (
    <div className="screen lobby" data-testid="lobby">
      <header className="lobby-top">
        <button className="hud-back lobby-back" onClick={onBack} aria-label="플레이 방식 선택으로">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="lobby-brand">
          <span className="mini-logo">PIPA</span>
          <span className="lobby-tag">ONLINE</span>
          <span className={`lobby-mode ${mode}`} data-testid="lobby-mode">
            {DUEL_NAME[mode]}
          </span>
        </div>
        <span className="lobby-spacer">
          <VersionBadge />
        </span>
      </header>

      <section className="me-card" data-testid="me-card">
        <span className={`status-pill ${pill}`}>
          <i aria-hidden />
          {pillText}
        </span>
        <b className="me-name">{snap.me.nickname}</b>
        <span className="me-sub">
          {connection === 'unavailable' ? unavailableText(snap.backend) : live ? '다른 플레이어에게 대결을 신청해보세요' : '실시간 서버에 연결하는 중…'}
        </span>
      </section>

      {outgoing && (
        <div className="outgoing" data-testid="outgoing">
          <div>
            <b>{outgoing.receiverNickname}님에게 대결을 신청했습니다.</b>
            <span>응답 대기 중 · {outgoing.secondsLeft}초</span>
          </div>
          <button className="btn-ghost" onClick={() => lobby.cancelChallenge()}>
            신청 취소
          </button>
          <i className="outgoing-bar" style={{ transform: `scaleX(${outgoing.secondsLeft / 30})` }} aria-hidden />
        </div>
      )}

      {connection !== 'unavailable' && (
        <section className="players">
          <div className="players-head">
            <p className="eyebrow">접속 중인 플레이어</p>
            <span className="players-count">{players.length}명</span>
          </div>
          {players.length === 0 ? (
            <p className="players-empty" data-testid="players-empty">
              아직 접속한 다른 플레이어가 없어요.
              <br />
              다른 기기나 브라우저에서 PIPA에 로그인하면 여기에 바로 표시됩니다.
              {snap.backend === 'artifact' && (
                <span className="players-diag">
                  {snap.pageViewers > 0
                    ? `지금 이 페이지를 연 사람 ${snap.pageViewers}명 · 아직 PIPA 로그인 전이에요`
                    : '지금 이 페이지에 접속한 다른 사람이 없어요 · 친구는 이메일로 초대받은 계정으로 열어야 접속돼요'}
                </span>
              )}
            </p>
          ) : (
            <ul className="player-list" data-testid="player-list">
              {players.map((p) => (
                <li key={p.peer} className="player-row" data-testid="player-row" data-nick={p.nickname}>
                  <span className={`dot ${p.status === 'in_match' ? 'busy' : p.status === 'pending' ? 'wait' : ''}`} aria-hidden />
                  <div className="player-text">
                    <b>{p.nickname}</b>
                    <span>{STATUS_TEXT[p.status]}</span>
                  </div>
                  <button
                    className={`btn-challenge ${p.requestedByMe ? 'sent' : ''}`}
                    disabled={!p.canChallenge}
                    onClick={() => lobby.challenge(p.peer, mode)}
                  >
                    {p.requestedByMe ? '신청 중...' : p.busyLabel ?? '대결 신청'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
