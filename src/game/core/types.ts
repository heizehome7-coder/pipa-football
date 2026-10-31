export type GameMode = 'penalty' | 'freekick';

export type ShotOutcome = 'GOAL' | 'SAVE' | 'MISS' | 'BLOCKED';

/** aim → runup (kicker animating) → flight (ball in the air) → result (waiting for tap) */
export type Phase = 'aim' | 'runup' | 'flight' | 'result';

/**
 * Network-ready description of a shot: the 3D path the player drew (world
 * metres, ball → goal plane) and the power from drawing speed. Together with the
 * spot and RNG seed this reproduces the exact same kick, so a future PvP server
 * can relay or validate it.
 */
export interface ShotInput {
  points: [number, number, number][];
  /** 0..1, from stroke speed */
  power: number;
}

export interface ShotRecord {
  input: ShotInput;
  outcome: ShotOutcome;
  detail: string;
  attempt: number;
  at: number;
}

export interface PlayerProfile {
  nickname: string;
}
