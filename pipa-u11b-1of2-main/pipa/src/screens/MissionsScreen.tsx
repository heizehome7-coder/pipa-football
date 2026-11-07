import { useEffect, useRef, useState } from 'react';
import { VersionBadge } from '../components/VersionBadge';
import { AccountError, accountApi, accountsAvailable, type AccountReply, type MissionView } from '../online/account';
import { formatFV, formatMP } from '../players/ownership';

/** UPDATE 10 — WEEKLY MISSIONS (server progress, reset Monday 00:00 KST, each reward once a week) */
export function MissionsScreen({ token, onReply, onBack }: { token: string | null; onReply: (r: AccountReply) => void; onBack: () => void }) {
  const online = accountsAvailable() && !!token;
  const [list, setList] = useState<MissionView[]>([]);
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const busyRef = useRef(false);
  const apply = (r: AccountReply) => {
    if (r.missions) setList(r.missions);
    if (typeof r.resetInMs === 'number') setReset(Date.now() + r.resetInMs);
  };
  useEffect(() => {
    if (!token || !online) return;
    accountApi
      .missions(token)
      .then((r) => (apply(r), onReply(r)))
      .catch(() => {});
  }, [token, online]); // eslint-disable-line react-hooks/exhaustive-deps
  const claim = async (id: string) => {
    if (!token || busyRef.current) return;
    busyRef.current = true;
    setBusy(id);
    setMsg(null);
    try {
      const r = await accountApi.missionClaim(token, id);
      apply(r);
      onReply(r);
      const rw = r.reward;
      setMsg({ text: `보상 수령! ${rw && 'fv' in rw && rw.fv ? `+${formatFV(rw.fv as number)}` : rw && 'mp' in rw && rw.mp ? `+${formatMP(rw.mp as number)}` : ''}`, tone: 'good' });
    } catch (e) {
      if (e instanceof AccountError && e.reply) (apply(e.reply), onReply(e.reply));
      setMsg({ text: e instanceof Error ? e.message : '보상을 받지 못했어요', tone: 'bad' });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };
  const left = Math.max(0, reset - Date.now());
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  return (
    <div className="screen missions" data-testid="missions">
      <header className="modes-top">
        <button className="btn-ghost" onClick={onBack} data-testid="missions-back">
          ‹ 홈
        </button>
        <VersionBadge />
      </header>
      <div className="dev-head">
        <span className="mini-logo dev-logo">PIPA</span>
        <h2 className="dev-title">WEEKLY MISSIONS</h2>
        <p className="dev-sub">{online ? `매주 월요일 0시(KST) 초기화 · ${reset ? `${d}일 ${h}시간 남음` : ''}` : '주간 미션은 Render 서버 버전에서 할 수 있어요'}</p>
      </div>
      {msg && (
        <p className={`dev-msg ${msg.tone}`} data-testid="missions-msg">
          {msg.text}
        </p>
      )}
      <div className="mission-list">
        {list.map((m) => {
          const pct = Math.min(100, (m.progress / m.goal) * 100);
          const val = m.id === 'playtime' ? `${Math.floor(m.progress / 60)}분 ${m.progress % 60}초 / 5분` : `${m.progress} / ${m.goal}${m.unit}`;
          return (
            <div className={`mission ${m.done ? 'done' : ''} ${m.claimed ? 'claimed' : ''}`} key={m.id} data-testid={`mission-${m.id}`} data-done={m.done ? '1' : '0'} data-claimed={m.claimed ? '1' : '0'}>
              <div className="mission-text">
                <b>{m.title}</b>
                <span>{m.desc}</span>
                <div className="mission-bar">
                  <i style={{ width: `${pct}%` }} />
                </div>
                <em data-testid={`mission-progress-${m.id}`}>{val}</em>
              </div>
              <div className="mission-side">
                <span className="mission-reward">{m.reward.fv ? formatFV(m.reward.fv) : formatMP(m.reward.mp ?? 0)}</span>
                {m.claimed ? (
                  <span className="mission-claimed">✓ 받음</span>
                ) : m.done ? (
                  <>
                    <span className="mission-complete">MISSION COMPLETE!</span>
                    <button className="btn-primary" disabled={!!busy} onClick={() => claim(m.id)} data-testid={`mission-claim-${m.id}`}>
                      CLAIM
                    </button>
                  </>
                ) : (
                  <span className="mission-todo">진행 중</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
