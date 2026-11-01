import { useEffect, useState } from 'react';
import { Flag, PlayerAvatar, PlayerCard, StatSheet } from '../components/PlayerArt';
import { VersionBadge } from '../components/VersionBadge';
import { COUNTRY_NAME, getPlayer, ovr, PLAYERS, type PlayerDef } from '../players/players';
import { SQUAD_SIZE, type Squad } from '../players/squad';

type Filter = 'ALL' | 'FORWARD' | 'MIDFIELDER' | 'GOALKEEPER';
const FILTERS: Filter[] = ['ALL', 'FORWARD', 'MIDFIELDER', 'GOALKEEPER'];
const inFilter = (p: PlayerDef, f: Filter) =>
  f === 'ALL' || (f === 'FORWARD' && p.role === 'FW') || (f === 'MIDFIELDER' && p.role === 'MF') || (f === 'GOALKEEPER' && p.role === 'GK');

/**
 * UPDATE 4 squad flow.
 *  pick    — BUILD YOUR SQUAD: 20 cards, choose 5 field players + 1 goalkeeper
 *  arrange — MY SQUAD: penalty order (▲/▼), ⭐ free-kick taker, SAVE SQUAD
 * First login starts at "pick"; the SQUAD menu opens "arrange" (with 선수 변경).
 */
export function SquadScreen({
  initial,
  firstTime,
  onSave,
  onBack,
}: {
  initial: Squad | null;
  firstTime: boolean;
  onSave: (s: Squad) => void;
  onBack?: () => void;
}) {
  const [step, setStep] = useState<'pick' | 'arrange'>(initial ? 'arrange' : 'pick');
  const [order, setOrder] = useState<string[]>(initial?.penaltyOrder ?? []);
  const [gk, setGk] = useState<string | null>(initial?.goalkeeperId ?? null);
  const [fk, setFk] = useState<string | null>(initial?.freeKickTakerId ?? null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [toast, setToast] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlayerDef | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const isSel = (p: PlayerDef) => (p.role === 'GK' ? gk === p.id : order.includes(p.id));
  const toggle = (p: PlayerDef) => {
    if (p.role === 'GK') {
      setGk((g) => (g === p.id ? null : p.id)); // one keeper: picking another replaces him
      return;
    }
    if (order.includes(p.id)) {
      setOrder(order.filter((x) => x !== p.id));
      if (fk === p.id) setFk(null);
      return;
    }
    if (order.length >= SQUAD_SIZE) {
      setToast('키커는 최대 5명까지 선택할 수 있습니다.');
      return;
    }
    setOrder([...order, p.id]);
  };
  const ready = order.length === SQUAD_SIZE && !!gk;
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const n = order.slice();
    [n[i], n[j]] = [n[j], n[i]];
    setOrder(n);
  };
  const save = () => {
    if (!ready || !gk) return;
    onSave({ penaltyOrder: order, goalkeeperId: gk, freeKickTakerId: fk && order.includes(fk) ? fk : order[0] });
  };

  if (step === 'pick') {
    const list = PLAYERS.filter((p) => inFilter(p, filter));
    return (
      <div className="screen squad" data-testid="squad-pick">
        <header className="squad-top">
          {onBack && !firstTime ? (
            <button className="btn-ghost squad-back" onClick={() => (initial ? setStep('arrange') : onBack())}>
              ‹ 뒤로
            </button>
          ) : (
            <span className="mini-logo">PIPA</span>
          )}
          <VersionBadge />
        </header>
        <div className="squad-head">
          <p className="eyebrow">{firstTime ? 'WELCOME' : 'SQUAD'}</p>
          <h2 className="squad-title">BUILD YOUR SQUAD</h2>
          <p className="squad-sub">키커 5명 + 골키퍼 1명을 골라주세요</p>
        </div>
        <div className="squad-filters" role="tablist">
          {FILTERS.map((f) => (
            <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)} role="tab" aria-selected={filter === f} data-testid={`filter-${f}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="card-grid" data-testid="card-grid">
          {list.map((p) => (
            <PlayerCard key={p.id} player={p} selected={isSel(p)} freeKick={fk === p.id} onToggle={() => toggle(p)} onInfo={() => setDetail(p)} />
          ))}
        </div>
        <div className="squad-bar">
          <div className="squad-count" data-testid="squad-count">
            <span className={order.length === SQUAD_SIZE ? 'ok' : ''}>
              키커 <b>{order.length}</b>/{SQUAD_SIZE}
            </span>
            <span className={gk ? 'ok' : ''}>
              GK <b>{gk ? 1 : 0}</b>/1
            </span>
          </div>
          <button className="btn-primary squad-next" disabled={!ready} onClick={() => setStep('arrange')} data-testid="squad-next">
            다음 · 순서 정하기
          </button>
        </div>
        {toast && (
          <div className="squad-toast" role="status" data-testid="squad-toast">
            {toast}
          </div>
        )}
        {detail && <DetailCard player={detail} selected={isSel(detail)} onToggle={() => toggle(detail)} onClose={() => setDetail(null)} />}
      </div>
    );
  }

  // ── MY SQUAD ─────────────────────────────────────────────────────────────
  const keeper = getPlayer(gk);
  return (
    <div className="screen squad arrange" data-testid="squad-arrange">
      <header className="squad-top">
        {onBack && !firstTime ? (
          <button className="btn-ghost squad-back" onClick={onBack} data-testid="squad-back">
            ‹ 홈
          </button>
        ) : (
          <button className="btn-ghost squad-back" onClick={() => setStep('pick')}>
            ‹ 선수 선택
          </button>
        )}
        <VersionBadge />
      </header>
      <div className="squad-head">
        <h2 className="squad-title">MY SQUAD</h2>
        <p className="squad-sub">승부차기 키커 순서와 프리킥 키커를 정하세요</p>
      </div>
      <section className="squad-section">
        <p className="eyebrow">PENALTY TAKERS</p>
        <ol className="taker-list" data-testid="taker-list">
          {order.map((id, i) => {
            const p = getPlayer(id)!;
            return (
              <li key={id} className="taker-row" data-testid="taker-row" data-id={id}>
                <span className="taker-n">{i + 1}</span>
                <span className="taker-ava">
                  <PlayerAvatar player={p} size={40} />
                </span>
                <span className="taker-text">
                  <b>{p.name}</b>
                  <span>
                    {p.positions.join(' / ')} · <Flag code={p.country} size={10} /> {COUNTRY_NAME[p.country]}
                  </span>
                </span>
                <button
                  className={`fk-toggle ${fk === id ? 'on' : ''}`}
                  onClick={() => setFk(id)}
                  aria-pressed={fk === id}
                  aria-label={`${p.name} 프리킥 키커로 지정`}
                  data-testid="fk-toggle"
                >
                  ⭐{fk === id ? ' FREE KICK' : ''}
                </button>
                <span className="taker-move">
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로" data-testid="move-up">
                    ▲
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label="아래로" data-testid="move-down">
                    ▼
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      </section>
      <section className="squad-section">
        <p className="eyebrow">GOALKEEPER</p>
        {keeper && (
          <div className="taker-row gk-row" data-testid="gk-row" data-id={keeper.id}>
            <span className="taker-n">GK</span>
            <span className="taker-ava">
              <PlayerAvatar player={keeper} size={40} />
            </span>
            <span className="taker-text">
              <b>{keeper.name}</b>
              <span>
                GK · <Flag code={keeper.country} size={10} /> {COUNTRY_NAME[keeper.country]}
              </span>
            </span>
          </div>
        )}
      </section>
      {!fk && <p className="squad-hint">⭐을 눌러 프리킥 키커를 지정하세요 (지정하지 않으면 1번 키커)</p>}
      <div className="squad-actions">
        <button className="btn-ghost" onClick={() => setStep('pick')} data-testid="squad-change">
          선수 변경
        </button>
        <button className="btn-primary" onClick={save} disabled={!ready} data-testid="squad-save">
          SAVE SQUAD
        </button>
      </div>
    </div>
  );
}

function DetailCard({ player, selected, onToggle, onClose }: { player: PlayerDef; selected: boolean; onToggle: () => void; onClose: () => void }) {
  return (
    <div className="detail-backdrop" onClick={onClose} data-testid="player-detail">
      <div className="detail-card" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <span className="detail-ava">
            <PlayerAvatar player={player} size={72} />
          </span>
          <div className="detail-text">
            <b>{player.name}</b>
            <span>{player.nameKo}</span>
            <span>
              {player.positions.join(' / ')} · <Flag code={player.country} size={12} /> {COUNTRY_NAME[player.country]} · #{player.number}
            </span>
          </div>
          <span className="detail-ovr">
            <b>{ovr(player)}</b>
            <em>OVR</em>
          </span>
        </div>
        <StatSheet player={player} />
        <div className="detail-actions">
          <button
            className={selected ? 'btn-ghost' : 'btn-primary'}
            onClick={() => {
              onToggle();
              onClose();
            }}
            data-testid="detail-toggle"
          >
            {selected ? 'REMOVE' : 'SELECT'}
          </button>
          <button className="btn-ghost" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
