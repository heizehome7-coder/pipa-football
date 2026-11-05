import { useCallback, useEffect, useMemo, useState } from 'react';
import { Flag, PlayerAvatar, PlayerCard, StatSheet } from '../components/PlayerArt';
import { VersionBadge } from '../components/VersionBadge';
import { AccountError, accountApi, type AccountReply, type Listing } from '../online/account';
import { BUYABLE_PLAYERS, COUNTRY_NAME, matchesSearch, ovr, PLAYERS, type PlayerDef } from '../players/players';
import { formatMP, formatMPKo, type Wallet } from '../players/ownership';
import type { Squad } from '../players/squad';
import { PROGRESSION, saleFee, saleRange, sellerRevenue } from '../progress/progression';

// UPDATE 10: no DEFENDER filter — defenders are no longer sold
type Filter = 'ALL' | 'FORWARD' | 'MIDFIELDER' | 'DEFENDER' | 'GOALKEEPER' | 'LEGEND' | 'FAVORITE';
const FILTERS: Filter[] = ['ALL', 'FAVORITE', 'FORWARD', 'MIDFIELDER', 'GOALKEEPER', 'LEGEND'];
const FILTER_LABEL: Partial<Record<Filter, string>> = { FAVORITE: '★ 관심' };
type Sort = 'PRICE LOW' | 'PRICE HIGH' | 'NAME';
const SORTS: Sort[] = ['PRICE LOW', 'PRICE HIGH', 'NAME'];

const inFilter = (p: PlayerDef, f: Filter, favs: Set<string> = new Set()) =>
  f === 'ALL' ||
  (f === 'FAVORITE' && favs.has(p.id)) ||
  (f === 'FORWARD' && p.role === 'FW') ||
  (f === 'MIDFIELDER' && p.role === 'MF') ||
  (f === 'DEFENDER' && p.role === 'DF') ||
  (f === 'GOALKEEPER' && p.role === 'GK') ||
  (f === 'LEGEND' && !!p.legend);

type Offers = Record<string, { count: number; min: number }>;

/**
 * PIPA TRANSFER MARKET.
 *  UPDATE 6: 100 players for MP (BUY).
 *  UPDATE 7: players other users put up for sale are always sold FIRST (cheapest, then
 *  oldest) — the system card only when no user listing is left. MY PLAYERS: SELL PLAYER
 *  (80–120 % of value, 30 % fee taken only when it sells) and CANCEL LISTING.
 * Every purchase / sale happens on the server; this screen never changes MP by itself.
 */
export function MarketScreen({
  wallet,
  token,
  squad,
  onReply,
  onBack,
}: {
  wallet: Wallet;
  token: string | null;
  squad: Squad | null;
  onReply: (r: AccountReply) => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<'buy' | 'mine'>('buy');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [sort, setSort] = useState<Sort>('PRICE LOW');
  // UPDATE 9: search by Korean or English name (works with the filters and sorting)
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<PlayerDef | null>(null);
  const [confirm, setConfirm] = useState<{ p: PlayerDef; price: number; user: boolean } | null>(null);
  const [selling, setSelling] = useState<{ p: PlayerDef; cardId?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: 'good' | 'warn' } | null>(null);
  const [offers, setOffers] = useState<Offers>({});
  const [mine, setMine] = useState<Listing[]>([]);
  const available = wallet.mp !== null && !!token;
  const mp = wallet.mp ?? 0;
  // UPDATE 9.5: 관심 선수 — saved on the account (instant on screen, the server's list wins)
  const [favs, setFavs] = useState<Set<string>>(() => new Set(wallet.favorites ?? []));
  useEffect(() => setFavs(new Set(wallet.favorites ?? [])), [wallet.favorites]);
  const toggleFav = (p: PlayerDef) => {
    if (!available || !token) return setToast({ text: '관심 선수는 Render 서버 버전에서 저장할 수 있어요', tone: 'warn' });
    const on = !favs.has(p.id);
    setFavs((f) => {
      const n = new Set(f);
      if (on) n.add(p.id);
      else n.delete(p.id);
      return n;
    });
    accountApi
      .setFavorite(token, p.id, on)
      .then(onReply)
      .catch((e) => {
        if (e instanceof AccountError && e.reply) onReply(e.reply);
        setFavs(new Set(wallet.favorites ?? []));
        setToast({ text: e instanceof Error ? e.message : '저장하지 못했어요', tone: 'warn' });
      });
  };

  const loadState = useCallback(() => {
    if (!token) return;
    accountApi
      .marketState(token)
      .then((r) => {
        setOffers(r.listings ?? {});
        setMine(r.mine ?? []);
      })
      .catch(() => {});
  }, [token]);
  useEffect(() => loadState(), [loadState]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  /** what a buyer pays now: the cheapest user listing first, else the system price */
  const priceOf = (p: PlayerDef) => offers[p.id]?.min ?? p.price!;

  const list = useMemo(() => {
    const l = BUYABLE_PLAYERS.filter((p) => inFilter(p, filter, favs) && matchesSearch(p, query));
    const pr = (p: PlayerDef) => offers[p.id]?.min ?? p.price!;
    if (sort === 'NAME') return [...l].sort((a, b) => a.nameKo.localeCompare(b.nameKo, 'ko'));
    return [...l].sort((a, b) => (sort === 'PRICE LOW' ? pr(a) - pr(b) : pr(b) - pr(a)) || a.nameKo.localeCompare(b.nameKo, 'ko'));
  }, [filter, sort, offers, query, favs]);

  const isListed = (id: string) => (wallet.listed ?? []).includes(id);
  const askBuy = (p: PlayerDef) => {
    if (!available) return setToast({ text: 'TRANSFER MARKET은 Render 서버 버전에서 이용할 수 있어요', tone: 'warn' });
    if (wallet.owned.has(p.id) || isListed(p.id)) return;
    const price = priceOf(p);
    if (mp < price) return setToast({ text: 'MP가 부족합니다.', tone: 'warn' });
    setConfirm({ p, price, user: !!offers[p.id] });
  };
  const doBuy = async () => {
    if (!confirm || busy || !token) return;
    const { p, price } = confirm;
    setBusy(true);
    try {
      const r = await accountApi.buy(token, p.id, price);
      onReply(r);
      setToast({ text: `${p.nameKo} 영입 완료!`, tone: 'good' });
    } catch (e) {
      if (e instanceof AccountError && e.reply && typeof e.reply.mp === 'number') onReply(e.reply);
      setToast({ text: e instanceof Error ? e.message : '잠시 후 다시 시도해주세요', tone: 'warn' });
    } finally {
      setBusy(false);
      setConfirm(null);
      setDetail(null);
      loadState();
    }
  };

  const ownedMarket = BUYABLE_PLAYERS.filter((p) => wallet.owned.has(p.id)).length;

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
            ? `보유 ${formatMP(mp)} · 영입 ${ownedMarket}/${BUYABLE_PLAYERS.length} · 유저 매물 우선 판매`
            : '이 버전은 서버가 없어 구매할 수 없어요 (Render 버전에서 이용 가능)'}
        </p>
      </div>
      <div className="dev-tabs market-tabs" role="tablist">
        <button className={`chip ${tab === 'buy' ? 'on' : ''}`} onClick={() => setTab('buy')} data-testid="market-tab-buy">
          BUY
        </button>
        <button className={`chip ${tab === 'mine' ? 'on' : ''}`} onClick={() => setTab('mine')} data-testid="market-tab-mine">
          MY PLAYERS {mine.length ? `· LISTED ${mine.length}` : ''}
        </button>
      </div>

      {tab === 'buy' && (
        <>
          <div className="market-search">
            <input
              type="text"
              inputMode="search"
              placeholder="선수 검색 (예: 메시, 손흥민, yashin)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              enterKeyHint="search"
              autoComplete="off"
              data-testid="market-search"
            />
            {query && (
              <button className="btn-ghost small" onClick={() => setQuery('')} aria-label="검색 지우기" data-testid="market-search-clear">
                ✕
              </button>
            )}
          </div>
          <div className="squad-filters" role="tablist">
            {FILTERS.map((f) => (
              <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)} role="tab" aria-selected={filter === f} data-testid={`mfilter-${f}`}>
                {FILTER_LABEL[f] ?? f}
                {f === 'FAVORITE' && favs.size > 0 ? ` ${favs.size}` : ''}
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
          {!list.length && filter === 'FAVORITE' && !query && (
            <p className="dev-empty" data-testid="market-empty">
              아직 관심 선수가 없어요 — 카드의 ☆를 눌러 추가하세요
            </p>
          )}
          {!list.length && (filter !== 'FAVORITE' || query) && (
            <p className="dev-empty" data-testid="market-empty">
              {PLAYERS.some((p) => p.starter && matchesSearch(p, query))
                ? `"${query}" — 무료 스타터 선수예요 (SQUAD에서 바로 사용, 이적시장 판매 없음)`
                : `"${query}" 선수를 찾지 못했어요`}
            </p>
          )}
          <div className="card-grid" data-testid="market-grid">
            {list.map((p) => (
              <div className="mcard-wrap" key={p.id}>
                <PlayerCard
                  player={p}
                  selected={false}
                  market={{ price: priceOf(p), owned: wallet.owned.has(p.id), listed: isListed(p.id), userOffers: offers[p.id]?.count ?? 0 }}
                  onToggle={() => setDetail(p)}
                  onInfo={() => setDetail(p)}
                />
                <button
                  className={`fav-star ${favs.has(p.id) ? 'on' : ''}`}
                  onClick={(e) => (e.stopPropagation(), toggleFav(p))}
                  aria-label={favs.has(p.id) ? '관심 선수 해제' : '관심 선수 추가'}
                  aria-pressed={favs.has(p.id)}
                  data-testid="fav-star"
                  data-on={favs.has(p.id) ? '1' : '0'}
                >
                  {favs.has(p.id) ? '★' : '☆'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'mine' && (
        <MyPlayers
          wallet={wallet}
          squad={squad}
          mine={mine}
          token={token}
          onReply={onReply}
          onSell={(p, cardId) => setSelling({ p, cardId })}
          onChanged={loadState}
          toast={(text, tone) => setToast({ text, tone })}
        />
      )}

      {detail && (
        <div className="detail-backdrop" onClick={() => setDetail(null)} data-testid="market-detail">
          <div className="detail-card" onClick={(e) => e.stopPropagation()}>
            <div className="detail-head">
              <span className="detail-ava">
                <PlayerAvatar player={detail} size={72} />
              </span>
              <div className="detail-text">
                <b>{detail.nameKo}</b>
                <span className="detail-shirt">
                  {detail.shirt}
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
              <span>{offers[detail.id] ? 'USER' : 'PRICE'}</span>
              <b data-testid="detail-price">{formatMP(priceOf(detail))}</b>
              <em>{offers[detail.id] ? `유저 매물 ${offers[detail.id].count}개 · 기본 ${formatMPKo(detail.price!)}` : formatMPKo(detail.price!)}</em>
            </div>
            <div className="detail-actions">
              {wallet.owned.has(detail.id) || isListed(detail.id) ? (
                <button className="btn-ghost" disabled data-testid="buy">
                  {isListed(detail.id) ? 'LISTED' : '✓ OWNED'}
                </button>
              ) : (
                <button className="btn-primary" onClick={() => askBuy(detail)} disabled={!available} data-testid="buy">
                  BUY
                </button>
              )}
              <button className={`btn-ghost fav-btn ${favs.has(detail.id) ? 'on' : ''}`} onClick={() => toggleFav(detail)} data-testid="detail-fav">
                {favs.has(detail.id) ? '★ 관심' : '☆ 관심'}
              </button>
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
            <b className="confirm-name">{confirm.p.nameKo}</b>
            {confirm.user && (
              <p className="confirm-src" data-testid="confirm-source">
                유저 매물 (가장 싼 매물부터 판매돼요)
              </p>
            )}
            <dl className="confirm-rows">
              <dt>PRICE</dt>
              <dd data-testid="confirm-price">{formatMP(confirm.price)}</dd>
              <dt>현재 MP</dt>
              <dd>{formatMP(mp)}</dd>
              <dt>구매 후 MP</dt>
              <dd className="after" data-testid="confirm-after">
                {formatMP(mp - confirm.price)}
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

      {selling && token && (
        <SellDialog
          player={selling.p}
          cardId={selling.cardId}
          token={token}
          onDone={(r, msg) => {
            if (r) onReply(r);
            setSelling(null);
            loadState();
            setToast(msg);
          }}
          onCancel={() => setSelling(null)}
        />
      )}

      {toast && (
        <div className={`squad-toast ${toast.tone}`} role="status" data-testid="market-toast">
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ── MY PLAYERS: starters (UNTRADEABLE), bought players (SELL), listings (CANCEL) ──
function MyPlayers({
  wallet,
  squad,
  mine,
  token,
  onReply,
  onSell,
  onChanged,
  toast,
}: {
  wallet: Wallet;
  squad: Squad | null;
  mine: Listing[];
  token: string | null;
  onReply: (r: AccountReply) => void;
  onSell: (p: PlayerDef, cardId?: string) => void;
  onChanged: () => void;
  toast: (t: string, tone: 'good' | 'warn') => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const used = new Set(squad ? [...squad.penaltyOrder, squad.goalkeeperId, squad.freeKickTakerId] : []);
  // UPDATE 8: one row per CARD (two cards of a player = two rows); the squad keeps one
  const byId = new Map(PLAYERS.map((p) => [p.id, p]));
  const bought: { card: { id: string; playerId: string; source: string | null; evo?: number }; p: PlayerDef; locked: boolean }[] = [];
  const seenSquad = new Set<string>();
  for (const card of wallet.cards ?? []) {
    const p = byId.get(card.playerId);
    if (!p || p.starter) continue;
    const locked = used.has(p.id) && !seenSquad.has(p.id);
    if (locked) seenSquad.add(p.id);
    bought.push({ card, p, locked });
  }
  bought.sort((a, b) => a.p.nameKo.localeCompare(b.p.nameKo, 'ko') || Number(b.locked) - Number(a.locked));
  const starters = PLAYERS.filter((p) => p.starter);
  const cancelListing = async (l: Listing) => {
    if (!token || busy) return;
    setBusy(l.id);
    try {
      const r = await accountApi.cancel(token, l.id);
      onReply(r);
      toast('판매 등록을 취소했어요', 'good');
    } catch (e) {
      if (e instanceof AccountError && e.reply && typeof e.reply.mp === 'number') onReply(e.reply);
      toast(e instanceof Error ? e.message : '취소하지 못했어요', 'warn');
    } finally {
      setBusy(null);
      onChanged();
    }
  };
  const Row = ({ p, children, tag, card }: { p: PlayerDef; children: React.ReactNode; tag?: string; card?: { id: string; source: string | null } }) => (
    <li className="mine-row" data-testid="mine-row" data-id={p.id} data-tag={tag ?? ''} data-card={card?.id ?? ''}>
      <span className="mine-ava">
        <PlayerAvatar player={p} size={40} />
      </span>
      <span className="mine-name">
        <b>
          {p.nameKo}
          {card?.source === 'pack' && <i className="mine-pack">PACK</i>}
        </b>
        <em>
          {p.positions.join(' / ')} · OVR {ovr(p)}
          {p.price ? ` · 가치 ${formatMPKo(p.price)}` : ''}
        </em>
      </span>
      <span className="mine-act">{children}</span>
    </li>
  );
  return (
    <div className="mine" data-testid="my-players">
      {mine.length > 0 && <p className="mine-head">LISTED · 판매 중</p>}
      <ul className="mine-list">
        {mine.map((l) => {
          const p = PLAYERS.find((x) => x.id === l.playerId);
          if (!p) return null;
          return (
            <Row key={l.id} p={p} tag="listed">
              <span className="mine-price">{formatMP(l.price)}</span>
              <button className="btn-ghost small" onClick={() => cancelListing(l)} disabled={busy === l.id} data-testid="cancel-listing">
                CANCEL LISTING
              </button>
            </Row>
          );
        })}
      </ul>
      <p className="mine-head">보유 카드 (구매 · 팩) · SELL 가능 (수수료 {Math.round(PROGRESSION.market.fee * 100)}%)</p>
      <ul className="mine-list">
        {bought.map(({ card, p, locked }) => (
          <Row key={card.id} p={p} tag={locked ? 'squad' : 'sellable'} card={card}>
            {locked ? (
              <button className="btn-ghost small" onClick={() => toast('현재 스쿼드에서 사용 중인 선수입니다.', 'warn')} data-testid="sell-blocked">
                IN SQUAD
              </button>
            ) : p.defender ? (
              <button className="btn-ghost small" onClick={() => toast('수비수는 이적시장에 등록할 수 없어요 (UPDATE 10)', 'warn')} data-testid="sell-defender">
                판매 불가 · 수비수
              </button>
            ) : card.evo ? (
              <button className="btn-ghost small" onClick={() => toast('진화한 카드는 판매할 수 없어요', 'warn')} data-testid="sell-evolved">
                +{card.evo} 진화 · 판매 불가
              </button>
            ) : (
              <button className="btn-primary small" onClick={() => onSell(p, card.id)} data-testid="sell-player">
                SELL PLAYER
              </button>
            )}
          </Row>
        ))}
        {!bought.length && <li className="dev-empty">아직 이적시장에서 산 선수가 없어요</li>}
      </ul>
      <p className="mine-head">무료 스타터 · 판매 불가</p>
      <ul className="mine-list">
        {starters.map((p) => (
          <Row key={p.id} p={p} tag="untradeable">
            <span className="untradeable">UNTRADEABLE</span>
          </Row>
        ))}
      </ul>
    </div>
  );
}

// ── SELL: price within 80–120 %, fee 30 % only when it actually sells ──
function SellDialog({ player, cardId, token, onDone, onCancel }: { player: PlayerDef; cardId?: string; token: string; onDone: (r: AccountReply | null, msg: { text: string; tone: 'good' | 'warn' }) => void; onCancel: () => void }) {
  const value = player.price!;
  const { min, max } = saleRange(value);
  const [raw, setRaw] = useState(value.toLocaleString('en-US'));
  const [busy, setBusy] = useState(false);
  const price = /^[0-9,]+$/.test(raw.trim()) ? Number(raw.replace(/,/g, '')) : NaN;
  const ok = Number.isSafeInteger(price) && price >= min && price <= max;
  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const r = await accountApi.sell(token, player.id, price, cardId);
      onDone(r, { text: `${player.nameKo} 판매 등록 완료 (LISTED)`, tone: 'good' });
    } catch (e) {
      onDone(e instanceof AccountError && e.reply && typeof e.reply.mp === 'number' ? e.reply : null, { text: e instanceof Error ? e.message : '등록하지 못했어요', tone: 'warn' });
    }
  };
  return (
    <div className="detail-backdrop confirm" data-testid="sell-dialog">
      <div className="detail-card confirm-card" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-q">SELL PLAYER</p>
        <b className="confirm-name">{player.nameKo}</b>
        <label className="field">
          <span>판매 희망 가격 (MARKET VALUE {formatMP(value)})</span>
          <input inputMode="numeric" value={raw} onChange={(e) => setRaw(e.target.value)} data-testid="sell-price" />
        </label>
        <p className={`sell-range ${ok || !raw ? '' : 'bad'}`}>
          허용 판매 가격: {formatMP(min)} ~ {formatMP(max)}
        </p>
        <dl className="confirm-rows">
          <dt>판매 가격</dt>
          <dd>{ok ? formatMP(price) : '-'}</dd>
          <dt>판매 수수료 ({Math.round(PROGRESSION.market.fee * 100)}%)</dt>
          <dd data-testid="sell-fee">{ok ? formatMP(saleFee(price)) : '-'}</dd>
          <dt>판매 완료 후 받을 금액</dt>
          <dd className="after" data-testid="sell-net">
            {ok ? formatMP(sellerRevenue(price)) : '-'}
          </dd>
        </dl>
        <p className="sell-note">다른 유저가 실제로 구매했을 때만 MP가 들어오고 수수료가 빠져요.</p>
        <div className="detail-actions">
          <button className="btn-primary" onClick={submit} disabled={!ok || busy} data-testid="sell-submit">
            {busy ? '등록 중…' : '판매 등록'}
          </button>
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

/** current MP (top right of SQUAD / MARKET) */
export function MpBadge({ mp }: { mp: number | null }) {
  if (mp === null) return null;
  return (
    <span className="mp-badge" data-testid="mp-badge" data-mp={mp} title={formatMPKo(mp)}>
      <i aria-hidden>MP</i>
      {Math.round(mp).toLocaleString('en-US')}
    </span>
  );
}
