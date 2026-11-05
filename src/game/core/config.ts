import type { GameMode } from './types';

/** Real-world football dimensions (metres). Goal line is z = 0, pitch extends to +z. */
export const FIELD = {
  // UPDATE 9.5: the goal a touch smaller (7.32 × 2.44 → 7.14 × 2.38, about −2.5 %)
  goalHalfWidth: 3.57,
  goalHeight: 2.38,
  postRadius: 0.06,
  goalDepth: 1.95,
  netBackHeight: 2.0,
  ballRadius: 0.11,
  gravity: 9.81,
  penaltySpot: 11,
} as const;

export interface CameraFraming {
  /** metres behind the ball along the aim direction */
  back: number;
  /** metres to the right of the ball (so the kicker sits lower-left) */
  side: number;
  height: number;
  /** look-at height at the goal */
  lookY: number;
  /** 0 = look at goal, 1 = look at ball */
  lookBlend: number;
  /** fraction of screen width the goal (post to post) should fill in portrait */
  goalFraction: number;
  minFov: number;
  maxFov: number;
}

export interface KeeperTuning {
  /** reaction delay after the strike (free kick): fastest shots → min, slow → max */
  reactionMin: number;
  reactionMax: number;
  /** action duration = diveBase + diveScale × metres the hips must travel */
  diveBase: number;
  diveScale: number;
  maxHipTravel: number;
  /** read / perception error (m) */
  readNoise: number;
  /** penalty: chance the read is roughly right, chance he stays central (rest = wrong way) */
  guessCorrect: number;
  guessCentre: number;
  /** penalty: commit up to this long before foot-ball contact (s) */
  leadMax: number;
  /** free kick: side-step range (m) and speed (m/s) before diving */
  stepRange: number;
  stepSpeed: number;
  catchSpeed: number;
}

export interface ModeConfig {
  id: GameMode;
  label: string;
  labelKo: string;
  /** ball speed (m/s) at power 0 and 1 */
  minSpeed: number;
  maxSpeed: number;
  /** (legacy, unused since UPDATE 3 — air drag lives in physics/BallPhysics) */
  drag: number;
  /** side-spin / Magnus strength vs the free kick (penalty ≈ 0.55: short distance, little bend) */
  curveMultiplier: number;
  /** highest a drawn lob may peak (m) */
  maxApex: number;
  /** metres of extra peak height per screen-height the stroke rises above its end (loft) */
  loftPerScreen: number;
  /** UPDATE 5: knuckle wobble strength (short penalty flights need more to be visible) */
  knuckleScale: number;
  /**
   * UPDATE 8 (free kick): the curl shows EARLY — the side force starts `gain` × stronger and
   * fades with time constant `tau` (s), so most of the bend forms in the first part of the
   * flight and the ball then keeps its line into the goal (no late hook). Penalty: none.
   */
  curveOnset?: { gain: number; tau: number };
  /** swipe speed (screen-heights / s) mapped to power 0 and 1 */
  swipeSpeedMin: number;
  swipeSpeedMax: number;
  keeper: KeeperTuning;
  camera: CameraFraming;
}

export const MODES: Record<GameMode, ModeConfig> = {
  penalty: {
    id: 'penalty',
    label: 'PENALTY',
    labelKo: '페널티킥',
    minSpeed: 17,
    maxSpeed: 31,
    drag: 0.35,
    curveMultiplier: 0.8,
    maxApex: 3.0,
    loftPerScreen: 9,
    knuckleScale: 3.2,
    swipeSpeedMin: 0.55,
    swipeSpeedMax: 3.0,
    keeper: {
      reactionMin: 0,
      reactionMax: 0,
      diveBase: 0.34,
      diveScale: 0.15,
      maxHipTravel: 1.75,
      readNoise: 0.4,
      guessCorrect: 0.66,
      guessCentre: 0.12,
      leadMax: 0.05,
      stepRange: 0,
      stepSpeed: 0,
      catchSpeed: 24,
    },
    camera: {
      back: 6.6,
      side: 0.25,
      height: 2.9,
      lookY: 0.0,
      lookBlend: 0.3,
      goalFraction: 0.74,
      minFov: 30,
      maxFov: 82,
    },
  },
  freekick: {
    id: 'freekick',
    label: 'FREE KICK',
    labelKo: '프리킥',
    minSpeed: 19,
    maxSpeed: 32,
    drag: 0.3,
    curveMultiplier: 1,
    maxApex: 4.6,
    loftPerScreen: 14,
    knuckleScale: 0.6,
    curveOnset: { gain: 1.3, tau: 1.0 },
    swipeSpeedMin: 0.55,
    swipeSpeedMax: 3.0,
    keeper: {
      reactionMin: 0.18,
      reactionMax: 0.35,
      diveBase: 0.36,
      diveScale: 0.17,
      maxHipTravel: 1.65,
      /** UPDATE 7 hotfix: 0.7 → 1.0 so the reworked dive keeps single-player free kicks as hard as before */
      readNoise: 1.0,
      guessCorrect: 0,
      guessCentre: 0,
      leadMax: 0,
      stepRange: 1.0,
      stepSpeed: 2.8,
      catchSpeed: 22,
    },
    camera: {
      back: 10.5,
      side: -0.1,
      height: 3.4,
      lookY: 0.0,
      lookBlend: 0.3,
      goalFraction: 0.5,
      minFov: 28,
      maxFov: 78,
    },
  },
};
