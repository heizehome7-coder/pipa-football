import { useEffect, useState } from 'react';
import { VersionBadge } from '../components/VersionBadge';
import { accountApi, accountsAvailable, type Profile, type RankRow } from '../online/account';
import { formatFV, formatMP } from '../players/ownership';

type Board = 'mp' | 'penalty' | 'freekick';
const TABS: [Board, string][] = [
  ['mp', 'MP RANKING'],
  ['penalty', 'PENALTY WINS'],
  ['freekick', 'FREE KICK WINS'],
];

/**
 * UPDATE 7 — PIPA RANKING. Every number comes from the server (never from this phone).
 * Refreshes by itself when the server says the rankings changed (`tick`), at most every
 * few seconds — no polling loop.
 */
export function RankingScreen({ token, me, tick, onBack }: { token: string | null; me: string; tick: number; onBack: () => void }) {
  const [board, setBoard] = useState<Board>('mp');
  const [data, setData] = useState<{ board: Board; rows: RankRow[] }>({ board: 'mp', rows: [] });
  // a tab only ever shows its own rows (no stale rows from the previous tab while loading)
  const rows = data.board === board ? data.rows : [];
  const [mine, setMine] = useState<RankRow | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const online = accountsAvailable();

  useEffect(() => {
    if (!online) return;
    let live = true;
    setLoading(true);
    accountApi
      .ranking(token, board)
      .then((r) => {
        if (!live) return;
        setData({ board, rows: r.rows ?? [] });
        setMine(r.me ?? null);
        setTotal(r.total ?? 0);
        setErr(null);
      })
      .catch((e) => live && setErr(e instanceof Error ? e.message : '불러오지 못했어요'))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [board, tick, token, online]);

  const value = (r: RankRow) => (board === 'mp' ? formatMP(r.mp) : `${r.wins ?? 0} WINS`);
  const sub = (r: RankRow) => (board === 'mp' ? `LV. ${r.level}` : `${r.wins}W ${r.losses}L ${r.draws}D · ${r.winRate ?? 0}%`);
  const meInTop = mine && mine.rank <= 100;

  return (
    <div className="screen ranking" data-testid="ranking">
      <header className="modes-top">
        <button className="btn-ghost" onClick={onBack} data-testid="ranking-back">
          ‹ 홈
        </button>
        <VersionBadge />
      </header>
      <div className="dev-head">
        <span className="mini-logo dev-logo">PIPA</span>
        <h2 className="dev-title">RANKING</h2>
        <p className="dev-sub">{online ? `전체 ${total}명 · 온라인 경기 기록만 집계` : '랭킹은 Render 서버 버전에서 볼 수 있어요'}</p>
      </div>
      <div className="dev-tabs rank-tabs" role="tablist">
        {TABS.map(([b, label]) => (
          <button key={b} className={`chip ${board === b ? 'on' : ''}`} onClick={() => setBoard(b)} role="tab" aria-selected={board === b} data-testid={`rank-tab-${b}`}>
            {label}
          </button>
        ))}
      </div>
      {err && <p className="dev-msg bad">{err}</p>}
      <ol className="rank-list" data-testid="rank-list">
        {rows.map((r) => (
          <li key={r.nickname}>
            <button className={`rank-row ${r.nickname === me ? 'me' : ''} ${r.rank <= 3 ? `top${r.rank}` : ''}`} onClick={() => setProfile(r.nickname)} data-testid="rank-row" data-nick={r.nickname} data-rank={r.rank}>
              <span className="rank-no">{r.rank}</span>
              <span className="rank-name">
                <b>{r.nickname}</b>
                <em>{sub(r)}</em>
              </span>
              <span className="rank-val">{value(r)}</span>
            </button>
          </li>
        ))}
        {!rows.length && online && <li className="dev-empty">{loading ? '불러오는 중…' : '아직 기록이 없어요'}</li>}
      </ol>
      {mine && data.board === board && (
        <button className={`rank-me ${meInTop ? 'in' : ''}`} onClick={() => setProfile(mine.nickname)} data-testid="my-rank" data-rank={mine.rank}>
          <em>MY RANK</em>
          <b>{mine.rank}위</b>
          <span>{mine.nickname}</span>
          <strong>{value(mine)}</strong>
        </button>
      )}
      {profile && <ProfileModal nickname={profile} onClose={() => setProfile(null)} />}
    </div>
  );
}

/** UPDATE 7 — PLAYER PROFILE (level, MP, FV, online record) */
export function ProfileModal({ nickname, onClose }: { nickname: string; onClose: () => void }) {
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    accountApi
      .profile(nickname)
      .then((r) => setP(r.profile ?? null))
      .catch((e) => setErr(e instanceof Error ? e.message : '불러오지 못했어요'));
  }, [nickname]);
  const rec = (s: { wins: number; losses: number; draws: number }) => `${s.wins}W / ${s.losses}L${s.draws ? ` / ${s.draws}D` : ''}`;
  return (
    <div className="detail-backdrop" onClick={onClose} data-testid="profile">
      <div className="detail-card profile-card" onClick={(e) => e.stopPropagation()}>
        {err && <p className="dev-msg bad">{err}</p>}
        {!p && !err && <p className="dev-empty">불러오는 중…</p>}
        {p && (
          <>
            <div className="profile-head">
              <b data-testid="profile-name">{p.nickname}</b>
              <span className={`dev-status ${p.online ? 'on' : ''}`}>{p.online ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
            <div className="profile-level" data-testid="profile-level">
              LEVEL {p.level}
              {p.level < 50 ? <em> · {p.xp} / {p.xpNext} XP</em> : <em> · MAX LEVEL</em>}
            </div>
            <dl className="confirm-rows profile-rows">
              <dt>MP</dt>
              <dd>{formatMP(p.mp)}</dd>
              <dt>FV</dt>
              <dd className="fv">{formatFV(p.fv)}</dd>
            </dl>
            <p className="profile-sub">ONLINE RECORD</p>
            <dl className="confirm-rows profile-rows">
              <dt>PENALTY</dt>
              <dd data-testid="profile-penalty">{rec(p.stats.penalty)}</dd>
              <dt>FREE KICK</dt>
              <dd data-testid="profile-freekick">{rec(p.stats.freekick)}</dd>
            </dl>
          </>
        )}
        <div className="detail-actions">
          <button className="btn-ghost" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
