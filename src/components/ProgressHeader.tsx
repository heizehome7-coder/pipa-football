import { useState } from 'react';
import { AccountError, accountApi, type AccountReply } from '../online/account';
import { PROGRESSION } from '../progress/progression';
import { formatFV, formatMP, type Progress } from '../players/ownership';
import { SoundToggle } from './SoundToggle';

/** LV. 14 + a small XP bar (740 / 895 XP) — MAX LEVEL at 50 */
export function XpBar({ progress, big, onClick }: { progress: Progress; big?: boolean; onClick?: () => void }) {
  const max = progress.level >= PROGRESSION.maxLevel;
  const pct = max ? 100 : progress.xpNext ? Math.min(100, (100 * progress.xp) / progress.xpNext) : 0;
  const body = (
    <>
      <span className="xp-lv" data-testid="level-label">
        LV. {progress.level}
      </span>
      <span className="xp-track">
        <i style={{ transform: `scaleX(${pct / 100})` }} />
      </span>
      <span className="xp-num" data-testid="xp-label">
        {max ? 'MAX LEVEL' : `${progress.xp.toLocaleString('en-US')} / ${progress.xpNext.toLocaleString('en-US')} XP`}
      </span>
    </>
  );
  if (onClick)
    return (
      <button className={`xpbar ${big ? 'big' : ''}`} onClick={onClick} data-testid="xpbar">
        {body}
      </button>
    );
  return <div className={`xpbar ${big ? 'big' : ''}`}>{body}</div>;
}

/** HOME header: nickname · LEVEL / XP · MP · FV · SOUND */
export function ProgressHeader({ nickname, mp, progress, onLevels }: { nickname: string; mp: number | null; progress: Progress | null | undefined; onLevels: () => void }) {
  const rewards = progress ? Object.keys(PROGRESSION.fvRewards).map(Number).filter((l) => l <= progress.level && !progress.claimed.includes(l)).length : 0;
  return (
    <div className="phead" data-testid="progress-header">
      <div className="phead-row">
        <b className="phead-name">{nickname}</b>
        <SoundToggle />
      </div>
      {progress && (
        <div className="phead-row">
          <XpBar progress={progress} onClick={onLevels} />
          {rewards > 0 && (
            <button className="reward-dot" onClick={onLevels} data-testid="reward-available">
              REWARD {rewards}
            </button>
          )}
        </div>
      )}
      {mp !== null && (
        <div className="phead-row phead-money">
          <span className="mp-badge" data-testid="mp-badge" data-mp={mp}>
            <i aria-hidden>MP</i>
            {Math.round(mp).toLocaleString('en-US')}
          </span>
          {progress && (
            <span className="fv-badge" data-testid="fv-badge" data-fv={progress.fv}>
              <i aria-hidden>FV</i>
              {progress.fv.toLocaleString('en-US')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** UPDATE 7 — DAILY LOGIN: 7-day cycle (server date). PLAYER PACKs are only stored for now. */
export function DailyRewardModal({ token, progress, onReply, onClose }: { token: string; progress: Progress; onReply: (r: AccountReply) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<AccountReply | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const next = progress.daily?.nextDay ?? 1;
  const claim = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await accountApi.claimDaily(token);
      setGot(r);
      onReply(r);
    } catch (e) {
      if (e instanceof AccountError && e.reply) onReply(e.reply);
      setErr(e instanceof Error ? e.message : '받지 못했어요');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="detail-backdrop" data-testid="daily">
      <div className="detail-card daily-card">
        <p className="eyebrow">DAILY LOGIN</p>
        <h3 className="daily-title">오늘의 출석 보상</h3>
        <ol className="daily-track">
          {PROGRESSION.daily.map((d) => {
            const state = got ? (d.day <= (got.day ?? 0) ? 'done' : '') : d.day < next ? 'done' : d.day === next ? 'today' : '';
            return (
              <li key={d.day} className={`daily-day ${state} ${d.packs ? 'pack' : ''}`} data-testid="daily-day" data-day={d.day} data-state={state}>
                <em>DAY {d.day}</em>
                <b>{d.mp ? `${(d.mp / 1_000_000).toLocaleString('en-US')}M` : 'PACK'}</b>
                <span>{d.mp ? 'MP' : '×1'}</span>
              </li>
            );
          })}
        </ol>
        {got ? (
          <p className="daily-got" data-testid="daily-got">
            DAY {got.day} 보상 받음 · {got.rewardMp ? `+${formatMP(got.rewardMp)}` : `PLAYER PACK ×${got.rewardPacks} — COMING NEXT UPDATE`}
          </p>
        ) : (
          err && <p className="dev-msg bad">{err}</p>
        )}
        <div className="detail-actions">
          {!got ? (
            <button className="btn-primary" onClick={claim} disabled={busy} data-testid="daily-claim">
              {busy ? '받는 중…' : `DAY ${next} 보상 받기`}
            </button>
          ) : (
            <button className="btn-primary" onClick={onClose} data-testid="daily-close">
              확인
            </button>
          )}
          {!got && (
            <button className="btn-ghost" onClick={onClose}>
              나중에
            </button>
          )}
        </div>
        {progress.packs > 0 && !got && <p className="daily-packs">보유 PLAYER PACK ×{progress.packs} · COMING NEXT UPDATE</p>}
      </div>
    </div>
  );
}

export { formatFV };
