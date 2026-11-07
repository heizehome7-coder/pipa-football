import { useState } from 'react';
import { VersionBadge } from '../components/VersionBadge';
import { AccountError, accountApi, type AccountReply } from '../online/account';
import { FV_LEVELS, PROGRESSION } from '../progress/progression';
import { formatFV, type Progress } from '../players/ownership';
import { XpBar } from '../components/ProgressHeader';

/**
 * UPDATE 7 — LEVEL REWARDS: an FV reward every 5 levels, taken with CLAIM (never
 * automatic). The server keeps claimedLevelRewards, so a reward can only be taken once.
 */
export function LevelRewardsScreen({ token, progress, onReply, onBack }: { token: string | null; progress: Progress | null; onReply: (r: AccountReply) => void; onBack: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const level = progress?.level ?? 0;
  const claimed = progress?.claimed ?? [];

  const claim = async (l: number) => {
    if (!token || busy) return;
    setBusy(l);
    try {
      const r = await accountApi.claimLevel(token, l);
      onReply(r);
      setMsg({ text: `LV ${l} 보상 ${formatFV(r.fvGained ?? 0)} 획득!`, tone: 'good' });
    } catch (e) {
      if (e instanceof AccountError && e.reply) onReply(e.reply);
      setMsg({ text: e instanceof Error ? e.message : '받지 못했어요', tone: 'bad' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="screen levels" data-testid="level-rewards">
      <header className="modes-top">
        <button className="btn-ghost" onClick={onBack} data-testid="levels-back">
          ‹ 홈
        </button>
        <VersionBadge />
      </header>
      <div className="dev-head">
        <span className="mini-logo dev-logo">PIPA</span>
        <h2 className="dev-title">LEVEL REWARDS</h2>
        {progress ? (
          <>
            <XpBar progress={progress} big />
            <p className="dev-sub">
              보유 <b className="fv">{formatFV(progress.fv)}</b> · 온라인 경기 승리 +{PROGRESSION.xp.win} / 무승부 +{PROGRESSION.xp.draw} / 패배 +{PROGRESSION.xp.loss} XP
            </p>
          </>
        ) : (
          <p className="dev-sub">레벨은 Render 서버 버전에서 쌓여요</p>
        )}
      </div>
      {msg && (
        <p className={`dev-msg ${msg.tone}`} data-testid="level-msg">
          {msg.text}
        </p>
      )}
      <ol className="reward-track" data-testid="reward-track">
        {FV_LEVELS.map((l) => {
          const state = claimed.includes(l) ? 'claimed' : l <= level ? 'claim' : 'locked';
          return (
            <li key={l} className={`reward-row ${state}`} data-testid="reward-row" data-level={l} data-state={state}>
              <span className="reward-lv">LV {l}</span>
              <span className="reward-fv">{formatFV(PROGRESSION.fvRewards[l])}</span>
              {state === 'claim' ? (
                <button className="btn-primary reward-btn" onClick={() => claim(l)} disabled={!!busy} data-testid="claim">
                  {busy === l ? '…' : 'CLAIM'}
                </button>
              ) : (
                <span className="reward-state">{state === 'claimed' ? 'CLAIMED' : 'LOCKED'}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
