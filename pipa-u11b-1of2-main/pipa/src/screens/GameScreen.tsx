import { useEffect, useRef, useState } from 'react';
import { GameHUD } from '../components/GameHUD';
import { ResultBanner } from '../components/ResultBanner';
import { MODES } from '../game/core/config';
import type { GameMode, Phase, PlayerProfile, ShotOutcome } from '../game/core/types';
import { GameView } from '../game/GameView';
import { LocalSession } from '../game/session/MatchSession';
import { NameBanner } from '../components/NameBanner';
import { keeperLookOf, kickerLookOf } from '../players/looks';
import { useGoalCard } from '../components/GoalCard';
import { GOALKEEPERS } from '../players/players';
import { useSpecialPop } from '../components/SpecialPop';
import type { PlayerDef } from '../players/players';
import { keeperScaleOf } from '../online/match/penaltyRound';

export function GameScreen({ mode, user, player = null, evo = 0, onExit }: { mode: GameMode; user: PlayerProfile; player?: PlayerDef | null; /** UPDATE 10 */ evo?: number; onExit: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('aim');
  const [result, setResult] = useState<{ outcome: ShotOutcome; detail: string } | null>(null);
  const [score, setScore] = useState({ goals: 0, shots: 0 });
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tutorial, setTutorial] = useState(true);
  const special = useSpecialPop();
  // UPDATE 6 patch: the scorer's big card on every GOAL
  const goalCard = useGoalCard();
  const shotNo = useRef(0);
  // UPDATE 5: single player faces a real keeper (random each session) — his abilities count
  const [keeper] = useState(() => GOALKEEPERS[Math.floor(Math.random() * GOALKEEPERS.length)]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const session = new LocalSession(mode, user);
    const unsub = session.subscribe((s) => setScore({ goals: s.goals, shots: s.shots }));
    let view: GameView | null = null;
    try {
      view = new GameView(host, mode, session, {
        onPhase: (p) => {
          setPhase(p);
          if (p === 'aim') setResult(null);
          if (p === 'runup') setTutorial(false);
        },
        onOutcome: (o, detail) => {
          setResult({ outcome: o, detail });
          shotNo.current++;
          if (o === 'GOAL') goalCard.show(`solo:${mode}:${shotNo.current}`, player, evo);
        },
        onHint: setHint,
        onSpecial: special.show,
      }, { kicker: kickerLookOf(player), kickerPlayer: player, kickerEvo: evo, keeperLook: keeperLookOf(keeper), keeperStats: keeper.gk, keeperSpecial: keeper.special, keeperScale: keeperScaleOf(keeper) });
    } catch (e) {
      console.error(e);
      setError('이 기기에서 3D(WebGL)를 시작할 수 없습니다.');
    }
    return () => {
      unsub();
      view?.dispose();
    };
  }, [mode, user, player, evo]);

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(null), 2200);
    return () => window.clearTimeout(t);
  }, [hint]);

  const cfg = MODES[mode];
  return (
    <div className="screen game">
      <div className="game-host" ref={hostRef} />
      <GameHUD label={cfg.label} goals={score.goals} shots={score.shots} nickname={user.nickname} onBack={onExit} />
      {result && <ResultBanner outcome={result.outcome} detail={result.detail} />}
      <NameBanner
        player={player}
        show={player ? `solo:${mode}:${player.id}` : ''}
        label={mode === 'freekick' ? 'FREE KICK TAKER' : 'PENALTY TAKER'}
        sub={`GK · ${keeper.nameKo}`}
      />
      {special.el}
      {goalCard.el}
      {phase === 'aim' && tutorial && !hint && (
        <div className="coach">
          <b>공을 누른 채 슛 경로를 그려보세요</b>
          <span>빠르게 그리면 강하게 · 휘게 그리면 감아차기 · 높게 그리면 {mode === 'freekick' ? '벽 넘기기' : '로빙'}</span>
        </div>
      )}
      {hint && <div className="coach coach-hint">{hint}</div>}
      {error && (
        <div className="fatal">
          <p>{error}</p>
          <button className="btn-primary" onClick={onExit}>
            돌아가기
          </button>
        </div>
      )}
    </div>
  );
}
