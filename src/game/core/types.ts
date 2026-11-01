export type GameMode = 'penalty' | 'freekick';

export type ShotOutcome = 'GOAL' | 'SAVE' | 'MISS' | 'BLOCKED';

/** aim → runup (kicker animating) → flight (ball in the air) → result (waiting for tap) */
export type Phase = 'aim' | 'runup' | 'flight' | 'result';

/**
 * A shot as a real ball launch (UPDATE 3): the initial velocity (m/s) and side
 * spin computed from the drawn stroke. With the spot and the shared fixed-step
 * physics (physics/BallPhysics) this reproduces the exact same flight on every
 * phone and on the server — one small message per shot online.
 */
export interface ShotInput {
  /** initial velocity at the strike, world m/s */
  v: [number, number, number];
  /** side spin parameter (1/s): Magnus a = spin·(ŷ × v); + bends to the left of travel */
  spin: number;
  /** 0..1, from stroke speed (for display / telemetry) */
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
