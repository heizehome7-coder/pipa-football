import { useEffect, useState } from 'react';
import { VersionBadge } from '../components/VersionBadge';
import { accountApi, accountsAvailable, type StatRow } from '../online/account';
import { SEASON_LABEL } from '../progress/season';

type Board = 'total' | 'penalty' | 'freekick';
const BOARDS: [Board, string][] = [
  ['total', 'TOTAL'],
  ['penalty', 'PENALTY'],
  ['freekick', 'FREE KICK'],
];

/** UPDATE 10 — MATCH STATISTICS: everyone's online records this season (read-only for everyone) */
export function StatsScreen({ me, onBack }: { me: string; onBack: () => void }) {
  const [board, setBoard] = useState<Board>('total');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<StatRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!accountsAvailable()) return setErr('경기 통계는 Render 서버 버전에서 볼 수 있어요');
    let live = true;
    const t = window.setTimeout(() => {
      accountApi
        .stats(q, board)
        .then((r) => live && (setRows(r.rows ?? []), setErr(null)))
        .catch((e) => live && setErr(e instanceof Error ? e.message : '불러오지 못했어요'));
    }, 220);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [board, q]);
  return (
    <div className="screen stats" data-testid="stats">
      <header className="modes-top">
        <button className="btn-ghost" onClick={onBack} data-testid="stats-back">
          ‹ 홈
        </button>
        <VersionBadge />
      </header>
      <div className="dev-head">
        <span className="mini-logo dev-logo">PIPA</span>
        <h2 className="dev-title" data-testid="stats-title">
          {SEASON_LABEL} STATISTICS
        </h2>
        <p className="dev-sub">경기 통계 · 모든 유저의 이번 시즌 온라인 전적 (조회 전용)</p>
      </div>
      <div className="squad-filters" role="tablist">
        {BOARDS.map(([b, label]) => (
          <button key={b} className={`chip ${board === b ? 'on' : ''}`} onClick={() => setBoard(b)} data-testid={`stats-tab-${b}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="market-search">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="닉네임 검색" data-testid="stats-search" />
      </div>
      {err && <p className="dev-msg bad">{err}</p>}
      {rows && !rows.length && (
        <p className="dev-empty" data-testid="stats-empty">
          {q ? '그런 유저가 없어요' : '아직 이번 시즌 경기가 없어요'}
        </p>
      )}
      {rows && rows.length > 0 && (
        <div className="stats-table" data-testid="stats-table">
          <div className="stats-row head">
            <span>닉네임</span>
            <span>경기</span>
            <span>승</span>
            <span>패</span>
            <span>무</span>
            <span>승률</span>
          </div>
          {rows.map((r) => (
            <div className={`stats-row ${r.nickname === me ? 'me' : ''}`} key={r.nickname} data-testid="stats-row" data-nick={r.nickname} data-games={r.games} data-wins={r.wins}>
              <b>{r.nickname}</b>
              <span>{r.games}</span>
              <span>{r.wins}</span>
              <span>{r.losses}</span>
              <span>{r.draws}</span>
              <span>{r.games ? `${r.rate.toFixed(1)}%` : '-'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
