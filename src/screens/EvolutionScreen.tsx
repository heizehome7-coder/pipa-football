import { useMemo, useRef, useState } from 'react';
import { VersionBadge } from '../components/VersionBadge';
import { PlayerAvatar, PlayerCard } from '../components/PlayerArt';
import { AccountError, accountApi, accountsAvailable, newNonce, type AccountReply } from '../online/account';
import { formatFV, formatMP, type Wallet } from '../players/ownership';
import { getPlayer, matchesSearch, ovr, STARTER_PLAYERS, type PlayerDef } from '../players/players';
import { EVO_MAX, EVO_TITLE, evoOvr, evoRateParts, evoSuccessRate, MATERIALS, materialOf, rateLabel } from '../progress/evolution';

/**
 * UPDATE 10 — EVOLUTION (+0 … +12). Every owned card (free starters, bought, pack, ICON, GK)
 * can be evolved with an EVOLUTION MATERIAL. The rate shown is the rate the server uses;
 * the server rolls it (crypto) and the material is used either way. A failure never lowers
 * a level and never destroys a card.
 */
interface EvoItem {
  key: string;
  player: PlayerDef;
  level: number;
  starter: boolean;
}

export function EvolutionScreen({ wallet, token, onReply, onBack, onShop }: { wallet: Wallet; token: string | null; onReply: (r: AccountReply) => void; onBack: () => void; onShop: () => void }) {
  const online = accountsAvailable() && !!token;
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [matOvr, setMatOvr] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ success: boolean; from: number; to: number; player: PlayerDef; rate: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const busyRef = useRef(false);

  const items = useMemo<EvoItem[]>(() => {
    const list: EvoItem[] = STARTER_PLAYERS.map((p) => ({ key: `starter:${p.id}`, player: p, level: wallet.starterEvo?.[p.id] ?? 0, starter: true }));
    for (const c of wallet.cards ?? []) {
      const p = getPlayer(c.playerId);
      if (p) list.push({ key: c.id, player: p, level: c.evo ?? 0, starter: false });
    }
    return list.sort((a, b) => b.level - a.level || evoOvr(b.player, b.level) - evoOvr(a.player, a.level));
  }, [wallet.cards, wallet.starterEvo]);
  const shown = items.filter((it) => matchesSearch(it.player, query));
  const item = items.find((it) => it.key === sel) ?? null;
  const mats = wallet.materials ?? [];
  const count = (o: number) => mats.filter((m) => m.ovr === o).length;
  const curOvr = item ? evoOvr(item.player, item.level) : 0;
  const parts = item && matOvr ? evoRateParts(item.level, matOvr, curOvr) : null;
  const rate = parts?.rate ?? 0;

  const go = async () => {
    if (!token || !item || !matOvr || busyRef.current) return;
    const m = mats.find((x) => x.ovr === matOvr);
    if (!m) return;
    busyRef.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const r = await accountApi.evolve(token, item.key, m.id, newNonce());
      onReply(r);
      setResult({ success: !!r.success, from: r.from ?? item.level, to: r.evoLevel ?? item.level, player: item.player, rate: r.rate ?? rate });
      if (!count(matOvr) || count(matOvr) <= 1) setMatOvr(null);
    } catch (e) {
      if (e instanceof AccountError && e.reply) onReply(e.reply);
      setMsg(e instanceof Error ? e.message : '진화하지 못했어요');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="screen evo" data-testid="evolution">
      <header className="modes-top">
        <button className="btn-ghost" onClick={onBack} data-testid="evo-back">
          ‹ 홈
        </button>
        <VersionBadge />
      </header>
      <div className="dev-head">
        <span className="mini-logo dev-logo">PIPA</span>
        <h2 className="dev-title">EVOLUTION</h2>
        <p className="dev-sub">{online ? `진화 · 보유 재료 ${mats.length}개 · 최대 +${EVO_MAX}` : '진화는 Render 서버 버전에서 할 수 있어요'}</p>
      </div>
      <div className="evo-mats" data-testid="evo-mats">
        {MATERIALS.map((m) => (
          <span key={m.ovr} className={`evo-mat-chip o${m.ovr}`} data-testid={`evo-have-${m.ovr}`} data-count={count(m.ovr)}>
            <b>{m.ovr}</b>×{count(m.ovr)}
          </span>
        ))}
        <button className="btn-ghost small" onClick={onShop} data-testid="evo-to-shop">
          재료 상점 ›
        </button>
      </div>
      <div className="market-search">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="선수 검색" data-testid="evo-search" />
      </div>
      <div className="card-grid" data-testid="evo-grid">
        {shown.map((it) => (
          <div className="mcard-wrap" key={it.key} data-key={it.key}>
            <PlayerCard player={it.player} selected={sel === it.key} evo={it.level} onToggle={() => (setSel(it.key), setMsg(null))} />
          </div>
        ))}
      </div>

      {item && (
        <div className="detail-backdrop" onClick={() => !busy && setSel(null)} data-testid="evo-detail">
          <div className="detail-card evo-card" onClick={(e) => e.stopPropagation()}>
            <div className="evo-head">
              <PlayerAvatar player={item.player} size={64} />
              <div>
                <b className="evo-name">{item.player.nameKo}</b>
                <span className="evo-ovr" data-testid="evo-ovr">
                  OVR {curOvr} <em>(기본 {ovr(item.player)})</em>
                </span>
              </div>
            </div>
            <div className="evo-levels">
              <span className={`evo-lv ${item.level >= 10 ? 'high' : ''}`} data-testid="evo-level" data-level={item.level}>
                EVOLUTION +{item.level}
              </span>
              <span className="evo-arrow">→</span>
              <span className="evo-lv next">{item.level >= EVO_MAX ? 'MAX' : `NEXT +${item.level + 1}`}</span>
            </div>
            {item.level >= 10 && <p className="evo-title">{EVO_TITLE[item.level]}</p>}
            {item.level >= EVO_MAX ? (
              <p className="evo-maxed" data-testid="evo-maxed">
                MAX EVOLUTION — 더 이상 진화할 수 없어요
              </p>
            ) : (
              <>
                <p className="dev-sq-title">진화 재료 선택</p>
                <div className="evo-slots">
                  {MATERIALS.map((m) => (
                    <button
                      key={m.ovr}
                      className={`evo-slot o${m.ovr} ${matOvr === m.ovr ? 'on' : ''}`}
                      disabled={!count(m.ovr)}
                      onClick={() => setMatOvr(m.ovr)}
                      data-testid={`evo-slot-${m.ovr}`}
                    >
                      <b>{m.ovr}</b>
                      <em>×{count(m.ovr)}</em>
                      <i data-testid={`evo-slot-rate-${m.ovr}`}>{rateLabel(evoSuccessRate(item.level, m.ovr, curOvr))}</i>
                    </button>
                  ))}
                </div>
                <div className="evo-rate" data-testid="evo-rate" data-rate={rate}>
                  <div className="evo-rate-rows">
                    <span>기본 성공 확률</span>
                    <b data-testid="evo-rate-base">{rateLabel(parts?.base ?? evoRateParts(item.level, 130, curOvr).base)}</b>
                    <span>재료 OVR 보정</span>
                    <b data-testid="evo-rate-mul">
                      {parts ? `×${parts.mul.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}` : '—'}
                      {parts && (
                        <em>
                          {' '}
                          (등급 ×{parts.grade} · {parts.compare < 1 ? '선수보다 낮음' : parts.compare > 1 ? '선수보다 높음' : '선수와 같음'} ×{parts.compare})
                        </em>
                      )}
                    </b>
                  </div>
                  <div className="evo-rate-final">
                    <span>최종 성공 확률</span>
                    <b data-testid="evo-rate-final">{matOvr ? rateLabel(rate) : '—'}</b>
                  </div>
                  {parts?.capped && <em>+{item.level + 1} 단계 상한 {rateLabel(parts.cap)} 근처 — 고단계 진화는 좋은 재료로도 어려워요</em>}
                  {matOvr && <em>재료 OVR {matOvr} · 선수 OVR {curOvr}</em>}
                </div>
                <p className="evo-note">재료는 성공/실패와 관계없이 사용돼요 · 실패해도 진화 단계는 내려가지 않아요</p>
                {!mats.length && (
                  <button className="btn-ghost" onClick={onShop} data-testid="evo-need-mat">
                    진화 재료 상점으로 ›
                  </button>
                )}
                <button className="btn-primary" disabled={!online || !matOvr || busy || !count(matOvr ?? 0)} onClick={go} data-testid="evo-go">
                  {busy ? '진화 중…' : '진화 시작'}
                </button>
              </>
            )}
            {msg && <p className="dev-msg bad">{msg}</p>}
          </div>
        </div>
      )}

      {result && (
        <div className={`evo-result ${result.success ? 'ok' : 'fail'}`} data-testid="evo-result" data-success={result.success ? '1' : '0'} onClick={() => setResult(null)}>
          <div className="evo-result-card">
            <div className="evo-result-glow" />
            <PlayerCard player={result.player} selected={false} evo={result.to} />
            <b className="evo-result-word">{result.success ? '진화 성공!!' : '진화 실패…'}</b>
            <span className="evo-result-sub">
              {result.success ? `+${result.from} → +${result.to}  SUCCESS!` : `+${result.from} 유지 · 재료 1개 사용 (확률 ${rateLabel(result.rate)})`}
            </span>
            <button className="btn-primary" onClick={() => setResult(null)} data-testid="evo-result-ok">
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** an EVOLUTION MATERIAL card (PIPA original character — never a real footballer) */
export function MaterialCard({ ovr: o }: { ovr: number }) {
  const m = materialOf(o);
  if (!m) return null;
  return (
    <div className={`mat-card o${o}`} data-testid="mat-card" data-ovr={o}>
      <span className="mat-ovr">
        <b>{o}</b>
        <em>OVR</em>
      </span>
      <svg className="mat-art" viewBox="0 0 80 80" aria-hidden>
        <circle cx="40" cy="26" r="13" fill="rgba(255,255,255,0.9)" />
        <path d="M14 76 Q40 34 66 76 Z" fill="rgba(255,255,255,0.85)" />
        <path d="M40 4 l4 8 9 1 -7 6 2 9 -8 -5 -8 5 2 -9 -7 -6 9 -1z" fill="currentColor" />
      </svg>
      <b className="mat-name">{m.name}</b>
      <span className="mat-tag">EVOLUTION MATERIAL</span>
      <span className="mat-untr">UNTRADEABLE</span>
    </div>
  );
}

export function MaterialShopScreen({ wallet, token, onReply, onBack, onEvolve }: { wallet: Wallet; token: string | null; onReply: (r: AccountReply) => void; onBack: () => void; onEvolve: () => void }) {
  const online = accountsAvailable() && !!token;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const busyRef = useRef(false);
  const mats = wallet.materials ?? [];
  const mp = wallet.mp ?? 0;
  const fv = wallet.progress?.fv ?? 0;
  const buy = async (o: number, currency: 'mp' | 'fv') => {
    if (!token || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMsg(null);
    try {
      const r = await accountApi.evoBuy(token, o, currency, newNonce());
      onReply(r);
      setMsg({ text: `진화 재료 OVR ${o} 구매 완료!`, tone: 'good' });
    } catch (e) {
      if (e instanceof AccountError && e.reply) onReply(e.reply);
      setMsg({ text: e instanceof Error ? e.message : '구매하지 못했어요', tone: 'bad' });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="screen evo" data-testid="evo-shop">
      <header className="modes-top">
        <button className="btn-ghost" onClick={onBack} data-testid="shop-back">
          ‹ 홈
        </button>
        <VersionBadge />
      </header>
      <div className="dev-head">
        <span className="mini-logo dev-logo">PIPA</span>
        <h2 className="dev-title">진화 재료 상점</h2>
        <p className="dev-sub">
          {formatMP(mp)} · {formatFV(fv)} · MP 또는 FV 중 하나로 구매 · 경기 출전·거래 불가
        </p>
      </div>
      {msg && (
        <p className={`dev-msg ${msg.tone}`} data-testid="shop-msg">
          {msg.text}
        </p>
      )}
      <div className="shop-list">
        {MATERIALS.map((m) => (
          <div className="shop-row" key={m.ovr} data-testid={`shop-row-${m.ovr}`}>
            <MaterialCard ovr={m.ovr} />
            <div className="shop-buy">
              <span className="shop-have" data-testid={`shop-have-${m.ovr}`} data-count={mats.filter((x) => x.ovr === m.ovr).length}>
                보유 {mats.filter((x) => x.ovr === m.ovr).length}개
              </span>
              <button className="btn-primary" disabled={!online || busy || mp < m.mp} onClick={() => buy(m.ovr, 'mp')} data-testid={`shop-buy-mp-${m.ovr}`}>
                {formatMP(m.mp)}
              </button>
              <button className="btn-primary shop-fv" disabled={!online || busy || fv < m.fv} onClick={() => buy(m.ovr, 'fv')} data-testid={`shop-buy-fv-${m.ovr}`}>
                {formatFV(m.fv)}
              </button>
            </div>
          </div>
        ))}
      </div>
      <button className="btn-ghost" onClick={onEvolve} data-testid="shop-to-evo">
        EVOLUTION으로 ›
      </button>
    </div>
  );
}
