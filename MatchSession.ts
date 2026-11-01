import type { GameMode, PlayerProfile, ShotRecord } from '../core/types';

export interface ScoreState {
  goals: number;
  shots: number;
  history: ShotRecord[];
}

/**
 * Seam for multiplayer. The game view only talks to a MatchSession:
 *  - LocalSession (now): keeps score in memory.
 *  - OnlineSession (later): send ShotInput to a server, receive the opponent's
 *    shots / authoritative results, and alternate turns. Because a shot is fully
 *    described by ShotInput + spot + seed, the server can replay and validate it.
 */
export interface MatchSession {
  readonly mode: GameMode;
  readonly player: PlayerProfile;
  getState(): ScoreState;
  nextSeed(): number;
  recordShot(rec: ShotRecord): void;
  subscribe(fn: (s: ScoreState) => void): () => void;
}

export class LocalSession implements MatchSession {
  private state: ScoreState = { goals: 0, shots: 0, history: [] };
  private subs = new Set<(s: ScoreState) => void>();

  constructor(
    readonly mode: GameMode,
    readonly player: PlayerProfile,
  ) {}

  getState() {
    return this.state;
  }

  nextSeed() {
    return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  }

  recordShot(rec: ShotRecord) {
    this.state = {
      goals: this.state.goals + (rec.outcome === 'GOAL' ? 1 : 0),
      shots: this.state.shots + 1,
      history: [...this.state.history, rec],
    };
    this.subs.forEach((f) => f(this.state));
  }

  subscribe(fn: (s: ScoreState) => void) {
    this.subs.add(fn);
    fn(this.state);
    return () => {
      this.subs.delete(fn);
    };
  }
}
