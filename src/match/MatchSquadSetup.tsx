import { useContext, useMemo, useState } from 'react';
import { EvoContext, PlayerAvatar } from '../components/PlayerArt';
import { accountApi, type AccountReply } from '../online/account';
import type { Wallet } from '../players/ownership';
import { getPlayer, ovr, PLAYERS, SKILL_MOVES, type PlayerDef } from '../players/players';
import { evoOvrBonus } from '../progress/evolution';
import { requestLandscape } from './orientation';
import { autoMatchSquad, FORMATION_433H, FORMATION_ID, FORMATION_NAME, MATCH_SUBS, slotFit, type FormationSlot, type MatchSquad, type SlotId } from './formation';

type Pick = { kind: 'xi'; slot: SlotId } | { kind: 'sub'; i: number } | null;

/**
 * UPDATE 11 patch — MATCH SQUAD SETUP: 4-3-3 HOLDING on a real pitch, 11 starters + 4 subs,
 * tap a spot then a player (a player already elsewhere swaps places). Free starters and
 * every bought player can play; defenders are needed for the back four — anyone else
 * there gets an "out of position" warning (and defends worse). Saved on the account,
 * apart from the penalty squad.
 */
export function MatchSquadSetup({ wallet, token, onWallet, onBack, onStart }: { wallet: Wallet; token: string | null; onWallet: (r: AccountReply) => void; onBack: () => void; onStart: (m: MatchSquad) => void }) {
  const evo = useContext(EvoContext) ?? {};
  const eff = (p: PlayerDef) => ovr(p) + evoOvrBonus(evo[p.id] ?? 0);
  const pool = useMemo(() => PLAYERS.filter((p) => wallet.owned.has(p.id)), [wallet.owned]);
  const initial = useMemo<MatchSquad | null>(() => {
    const s = wallet.matchSquad;
    if (s && s.formation === FORMATION_ID && FORMATION_433H.every((f) => wallet.owned.has(s.xi[f.id]))) return { ...s, xi: { ...s.xi }, subs: s.subs.filter((id) => wallet.owned.has(id)) };
    return autoMatchSquad(pool, eff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [xi, setXi] = useState<Record<SlotId, string>>(initial?.xi ?? ({} as Record<SlotId, string>));
  const [subs, setSubs] = useState<string[]>(initial?.subs ?? []);
  const [pick, setPick] = useState<Pick>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const used = new Set([...Object.values(xi), ...subs]);
  const avail = pool.length;
  const needSubs = Math.min(MATCH_SUBS, Math.max(0, avail - 11));
  const ready = FORMATION_433H.every((f) => !!xi[f.id]) && subs.length >= needSubs;
  const offCount = FORMATION_433H.filter((f) => xi[f.id] && slotFit(getPlayer(xi[f.id])!, f) === 'off').length;

  const assign = (p: PlayerDef) => {
    if (!pick) return;
    const nx = { ...xi };
    const ns = [...subs];
    const cur = pick.kind === 'xi' ? nx[pick.slot] : ns[pick.i];
    if (pick.kind === 'xi') {
      const slot = FORMATION_433H.find((f) => f.id === pick.slot)!;
      if ((slot.pos === 'GK') !== (p.role === 'GK')) return setMsg(slot.pos === 'GK' ? 'GK 자리에는 골키퍼만 설 수 있어요' : '골키퍼는 GK 자리에만 설 수 있어요');
    }
    // he is somewhere else already → swap places
    const inXi = (Object.keys(nx) as SlotId[]).find((k) => nx[k] === p.id);
    const inSub = ns.indexOf(p.id);
    if (inXi) {
      const back = FORMATION_433H.find((f) => f.id === inXi)!;
      if (cur && (back.pos === 'GK') !== (getPlayer(cur)!.role === 'GK')) return setMsg('골키퍼와 필드 선수는 서로 자리를 바꿀 수 없어요');
      if (cur) nx[inXi] = cur;
      else delete (nx as Partial<Record<SlotId, string>>)[inXi];
    } else if (inSub >= 0) {
      if (cur) ns[inSub] = cur;
      else ns.splice(inSub, 1);
    }
    if (pick.kind === 'xi') nx[pick.slot] = p.id;
    else if (pick.i < ns.length) ns[pick.i] = p.id;
    else ns.push(p.id);
    setXi(nx);
    setSubs(ns.slice(0, MATCH_SUBS));
    setMsg(null);
    setPick(null);
  };

  const start = async () => {
    if (!ready || busy) return;
    // ask for full screen + landscape now, inside the tap (browsers only allow it from a tap)
    void requestLandscape();
    const ms: MatchSquad = { formation: FORMATION_ID, xi, subs };
    setBusy(true);
    try {
      if (token) onWallet(await accountApi.saveMatchSquad(token, ms));
      onStart(ms);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '저장하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  const slotOf = pick?.kind === 'xi' ? FORMATION_433H.find((f) => f.id === pick.slot) ?? null : null;
  const listed = pool
    .filter((p) => (slotOf ? (slotOf.pos === 'GK') === (p.role === 'GK') : true))
    .sort((a, b) => {
      const fa = slotOf ? { ok: 2, near: 1, off: 0 }[slotFit(a, slotOf)] : 0;
      const fb = slotOf ? { ok: 2, near: 1, off: 0 }[slotFit(b, slotOf)] : 0;
      return fb - fa || eff(b) - eff(a);
    });

  return (
    <div className="screen match-setup" data-testid="match-setup">
      <header className="ms-top">
        <button className="btn-ghost" onClick={onBack} data-testid="ms-back">
          ‹ 뒤로
        </button>
        <div>
          <p className="eyebrow">MATCH SQUAD SETUP</p>
          <h2 data-testid="ms-formation">{FORMATION_NAME}</h2>
        </div>
      </header>
      <p className="ms-note">선발 11명 + 교체 {MATCH_SUBS}명 · 페널티킥 스쿼드(키커 순서·프리킥 키커)와는 별도로 저장돼요</p>
      <div className="ms-pitch" data-testid="ms-pitch">
        <div className="ms-lines" aria-hidden>
          <i className="half" />
          <i className="circle" />
          <i className="box" />
          <i className="box top" />
        </div>
        {FORMATION_433H.map((f) => (
          <SlotCard key={f.id} slot={f} id={xi[f.id]} evo={evo} on={pick?.kind === 'xi' && pick.slot === f.id} onTap={() => setPick({ kind: 'xi', slot: f.id })} />
        ))}
      </div>
      <div className="ms-bench" data-testid="ms-bench">
        <p className="eyebrow">SUBSTITUTES · 교체 {subs.length}/{MATCH_SUBS}</p>
        <div className="ms-bench-row">
          {Array.from({ length: MATCH_SUBS }, (_, i) => {
            const p = subs[i] ? getPlayer(subs[i]) : null;
            return (
              <button key={i} className={`ms-sub ${pick?.kind === 'sub' && pick.i === i ? 'on' : ''}`} onClick={() => setPick({ kind: 'sub', i: Math.min(i, subs.length) })} data-testid="ms-sub" data-id={p?.id ?? ''}>
                {p ? (
                  <>
                    <PlayerAvatar player={p} size={34} />
                    <b>{p.nameKo}</b>
                    <em>
                      {p.positions[0]} · {eff(p)}
                      {evo[p.id] ? ` · +${evo[p.id]}` : ''}
                    </em>
                    <span className="ms-sub-stats">{p.stats ? `PWR ${p.stats.power} · ACC ${p.stats.accuracy}` : p.gk ? `REF ${p.gk.reflex} · DIV ${p.gk.diving}` : ''}{p.def ? ` · TKL ${p.def.tackle}` : ''}</span>
                  </>
                ) : (
                  <em>+ 교체 선수</em>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {offCount > 0 && (
        <p className="ms-warn" data-testid="ms-warn">
          ⚠ 부적합 포지션 {offCount}명 — 수비 위치에 수비수가 아닌 선수는 수비 성능이 떨어져요. 이적시장에서 수비수를 영입하면 정상 4-3-3 HOLDING을 만들 수 있어요
        </p>
      )}
      {msg && (
        <p className="dev-msg bad" data-testid="ms-msg">
          {msg}
        </p>
      )}
      {pick && (
        <div className="ms-picker" data-testid="ms-picker">
          <p className="eyebrow">{pick.kind === 'xi' ? `${slotOf?.pos} 자리에 넣을 선수` : '교체 선수'} · 보유 선수 {avail}명</p>
          <div className="ms-list">
            {listed.map((p) => {
              const fit = slotOf ? slotFit(p, slotOf) : 'ok';
              const here = used.has(p.id);
              return (
                <button key={p.id} className={`ms-row ${here ? 'used' : ''} fit-${fit}`} onClick={() => assign(p)} data-testid="ms-pick" data-id={p.id}>
                  <PlayerAvatar player={p} size={30} />
                  <span>
                    <b>{p.nameKo}</b>
                    <em>
                      {p.positions.join('/')} · OVR {eff(p)}
                      {evo[p.id] ? ` (+${evo[p.id]})` : ''} · {SKILL_MOVES[p.skillMove].name}
                    </em>
                  </span>
                  {slotOf && fit !== 'ok' && <i className="ms-fit">{fit === 'off' ? '부적합' : '비슷한 포지션'}</i>}
                  {here && <i className="ms-here">배치됨</i>}
                </button>
              );
            })}
          </div>
          <button className="btn-ghost" onClick={() => setPick(null)} data-testid="ms-picker-close">
            닫기
          </button>
        </div>
      )}
      <div className="ms-actions">
        <button className="btn-primary" disabled={!ready || busy} onClick={start} data-testid="ms-start">
          {busy ? '저장 중…' : 'KICK OFF · 경기 시작'}
        </button>
      </div>
    </div>
  );
}

const SLOT_TOP: Record<SlotId, number> = { GK: 89, LB: 68, LCB: 73, RCB: 73, RB: 68, CDM: 54, LCM: 38, RCM: 38, LW: 19, ST: 13, RW: 19 };

function SlotCard({ slot, id, evo, on, onTap }: { slot: FormationSlot; id?: string; evo: Record<string, number>; on: boolean; onTap: () => void }) {
  const p = id ? getPlayer(id) : null;
  const fit = p ? slotFit(p, slot) : 'ok';
  // own goal at the bottom; rows spaced so the cards never overlap
  const top = SLOT_TOP[slot.id];
  const left = 50 + slot.z * 46;
  return (
    <button className={`ms-slot ${on ? 'on' : ''} fit-${fit} ${p ? '' : 'empty'}`} style={{ top: `${top}%`, left: `${left}%` }} onClick={onTap} data-testid={`ms-slot-${slot.id}`} data-id={p?.id ?? ''} data-fit={fit}>
      {p ? <PlayerAvatar player={p} size={34} /> : <span className="ms-plus">+</span>}
      <b>{p ? p.shirt : slot.pos}</b>
      <em>
        {slot.pos}
        {p ? ` · ${ovr(p) + evoOvrBonus(evo[p.id] ?? 0)}` : ''}
      </em>
      {p && fit === 'off' && <i className="ms-off">⚠</i>}
    </button>
  );
}
