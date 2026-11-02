import { useEffect, useMemo, useState } from 'react';
import { Flag, PlayerAvatar, PlayerCard, StatSheet } from '../components/PlayerArt';
import { VersionBadge } from '../components/VersionBadge';
import { COUNTRY_NAME, MARKET_PLAYERS, ovr, type PlayerDef } from '../players/players';
import { formatMP, formatMPKo, type Wallet } from '../players/ownership';

type Filter = 'ALL' | 'FORWARD' | 'MIDFIELDER' | 'DEFENDER' | 'GOALKEEPER' | 'LEGEND';
const FILTERS: Filter[] = ['ALL', 'FORWARD', 'MIDFIELDER', 'DEFENDER', 'GOALKEEPER', 'LEGEND'];
type Sort = 'PRICE LOW' | 'PRICE HIGH' | 'NAME';
const SORTS: Sort[] = ['PRICE LOW', 'PRICE HIGH', 'NAME'];

const inFilter = (p: PlayerDef, f: Filter) =>
  f === 'ALL' ||
  (f === 'FORWARD' && p.role === 'FW') ||
  (f === 'MIDFIELDER' && p.role === 'MF') ||
  (f === 'DEFENDER' && p.role === 'DF') ||
  (f === 'GOALKEEPER' && p.role === 'GK') ||
  (f === 'LEGEND' && !!p.legend);

/**
 * UPDATE 6 — PIPA TRANSFER MARKET: 100 players for MP. BUY only (no sell / trade /
 * auction yet). The purchase itself happens on the server (onBuy); this screen never
 * changes the balance by itself.
 */
export function MarketScreen({
  wallet,
  onBuy,
  onBack,
}: {
  wallet: Wallet;
  /** resolves with an error message, or null on success */
  onBuy: (p: PlayerDef) => Promise<string | null>;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [sort, setSort] = useState<Sort>('PRICE LOW');
  const [detail, setDetail] = useState<PlayerDef | null>(null);
  const [confirm, setConfirm] = useState<PlayerDef | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: 'good' | 'warn' } | null>(null);
  const available = wallet.mp !== null;
  const mp = wallet.mp ?? 0;

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const list = useMemo(() => {
    const l = MARKET_PLAYERS.filter((p) => inFilter(p, filter));
    if (sort === 'NAME') return [...l].sort((a, b) => a.name.localeCompare(b.name));
    return [...l].sort((a, b) => (sort === 'PRICE LOW' ? a.price! - b.price! : b.price! - a.price!) || a.name.localeCompare(b.name));
  }, [filter, sort]);

  const askBuy = (p: PlayerDef) => {
    if (!available) return setToast({ text: 'TRANSFER MARKET은 Render 서버 버전에서 이용할 수 있어요', tone: 'warn' });
    if (wallet.owned.has(p.id)) return;
    if (mp < p.price!) return setToast({ text: 'MP가 부족합니다.', tone: 'warn' });
    setConfirm(p);
  };
  const doBuy = async () => {
    const p = confirm;
    if (!p || busy) return;
    setBusy(true);
    const err = await onBuy(p);
    setBusy(false);
    setConfirm(null);
    setDetail(null);
    setToast(err ? { text: err, tone: 'warn' } : { text: `${p.name} 영입 완료!`, tone: 'good' });
  };

  const owned = MARKET_PLAYERS.filter((p) => wallet.owned.has(p.id)).length;

  return (
    <div className="screen squad market" data-testid="market">
      <header className="squad-top">
        <button className="btn-ghost squad-back" onClick={onBack} data-testid="market-back">
          ‹ 뒤로
        </button>
        <MpBadge mp={wallet.mp} />
      </header>
      <div className="squad-head market-head">
        <p className="eyebrow">
          TRANSFER MARKET <VersionBadge />
        </p>
        <h2 className="squad-title">PIPA TRANSFER MARKET</h2>
        <p className="squad-sub" data-testid="market-sub">
          {available
            ? `보유 ${formatMP(mp)} · 영입 ${owned}/${MARKET_PLAYERS.length} · 온라인 승부차기 승리 +10,000,000 MP`
            : '이 버전은 서버가 없어 구매할 수 없어요 (Render 버전에서 이용 가능)'}
        </p>
      </div>
      <div className="squad-filters" role="tablist">
        {FILTERS.map((f) => (
          <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)} role="tab" aria-selected={filter === f} data-testid={`mfilter-${f}`}>
            {f}
          </button>
        ))}
      </div>
      <div className="market-sorts">
        {SORTS.map((x) => (
          <button key={x} className={`chip small ${sort === x ? 'on' : ''}`} onClick={() => setSort(x)} data-testid={`msort-${x.replace(' ', '_')}`}>
            {x}
          </button>
        ))}
      </div>
      <div className="card-grid" data-testid="market-grid">
        {list.map((p) => (
          <PlayerCard key={p.id} player={p} selected={false} market={{ price: p.price!, owned: wallet.owned.has(p.id) }} onToggle={() => setDetail(p)} onInfo={() => setDetail(p)} />
        ))}
      </div>

      {detail && (
        <div className="detail-backdrop" onClick={() => setDetail(null)} data-testid="market-detail">
          <div className="detail-card" onClick={(e) => e.stopPropagation()}>
            <div className="detail-head">
              <span className="detail-ava">
                <PlayerAvatar player={detail} size={72} />
              </span>
              <div className="detail-text">
                <b>{detail.name}</b>
                <span>
                  {detail.nameKo}
                  {detail.legend ? ' · LEGEND' : ''}
                </span>
                <span>
                  {detail.positions.join(' / ')} · <Flag code={detail.country} size={12} /> {COUNTRY_NAME[detail.country]} · #{detail.number}
                </span>
              </div>
              <span className="detail-ovr">
                <b>{ovr(detail)}</b>
                <em>OVR</em>
              </span>
            </div>
            <StatSheet player={detail} />
            <div className="market-price-row">
              <span>PRICE</span>
              <b data-testid="detail-price">{formatMP(detail.price!)}</b>
              <em>{formatMPKo(detail.price!)}</em>
            </div>
            <div className="detail-actions">
              {wallet.owned.has(detail.id) ? (
                <button className="btn-ghost" disabled data-testid="buy">
                  ✓ OWNED
                </button>
              ) : (
                <button className="btn-primary" onClick={() => askBuy(detail)} disabled={!available} data-testid="buy">
                  BUY
                </button>
              )}
              <button className="btn-ghost" onClick={() => setDetail(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="detail-backdrop confirm" data-testid="buy-confirm">
          <div className="detail-card confirm-card" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-q">이 선수를 구매하시겠습니까?</p>
            <b className="confirm-name">{confirm.name}</b>
            <dl className="confirm-rows">
              <dt>PRICE</dt>
              <dd data-testid="confirm-price">{formatMP(confirm.price!)}</dd>
              <dt>현재 MP</dt>
              <dd>{formatMP(mp)}</dd>
              <dt>구매 후 MP</dt>
              <dd className="after" data-testid="confirm-after">
                {formatMP(mp - confirm.price!)}
              </dd>
            </dl>
            <div className="detail-actions">
              <button className="btn-primary" onClick={doBuy} disabled={busy} data-testid="confirm-buy">
                {busy ? '구매 중…' : '구매'}
              </button>
              <button className="btn-ghost" onClick={() => setConfirm(null)} disabled={busy} data-testid="confirm-cancel">
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`squad-toast ${toast.tone}`} role="status" data-testid="market-toast">
          {toast.text}
        </div>
      )}
    </div>
  );
}

/** current MP (top right of HOME / SQUAD / MARKET) */
export function MpBadge({ mp }: { mp: number | null }) {
  if (mp === null) return null;
  return (
    <span className="mp-badge" data-testid="mp-badge" data-mp={mp} title={formatMPKo(mp)}>
      <i aria-hidden>MP</i>
      {Math.round(mp).toLocaleString('en-US')}
    </span>
  );
}
