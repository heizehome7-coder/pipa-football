import { FIELD, MODES, type ModeConfig } from '../game/core/config';

/**
 * UPDATE 11 — THE MATCH: 5-a-side (4 field players + 1 GK each) on a small pitch.
 * One place for the numbers. World axes: x = along the pitch (goals at x = ±HALF_L),
 * z = across (the broadcast camera sits on the +z side), y = up.
 */
export const PITCH = {
  /** half length / half width (m) — UPDATE 11 patch: a full 100 × 64 m 11-a-side pitch */
  HALF_L: 50,
  HALF_W: 32,
  /** penalty box: depth from the goal line, half width */
  BOX_D: 16,
  BOX_HW: 19,
  CIRCLE_R: 9,
  goalHW: FIELD.goalHalfWidth,
  goalH: FIELD.goalHeight,
  goalDepth: FIELD.goalDepth,
  postR: FIELD.postRadius,
  ballR: FIELD.ballRadius,
} as const;

/** 3 real minutes = 90 game minutes (1 real second = 30 game seconds) */
export const CLOCK = {
  realSeconds: 180,
  gameMinutes: 90,
  /** game seconds per real second */
  rate: (90 * 60) / 180,
  halfTimeRealSeconds: 5,
  /** a goal: GOAL! → celebration + card, then the other team kicks off (clock keeps running) */
  goalPause: 4.2,
} as const;

export const MOVE = {
  /** UPDATE 11 patch: ~13 % slower than the first 5-a-side version (PACE still differs per player) */
  run: 5.4,
  sprint: 7.15,
  /** with the ball at the feet */
  dribbleMul: 0.9,
  accel: 26,
  turn: 11,
  /** a touch every … s while dribbling (faster when sprinting) */
  touchEvery: 0.34,
  touchEverySprint: 0.26,
  /** the ball counts as "at his feet" within … m */
  control: 1.15,
  /** a loose ball is picked up within … m (feet) */
  pickup: 0.62,
  /** after losing the ball he cannot win it straight back for … s */
  regainCooldown: 0.55,
  /** a skill move (short press of 질주 / 개인기) */
  skillCooldown: 0.9,
  maxSubs: 3,
} as const;

/** 질주 / 개인기: hold ≥ this = sprint · two quick taps (≤ DOUBLE_TAP_MS apart) = skill move */
export const SPRINT_HOLD_MS = 200;
export const DOUBLE_TAP_MS = 320;

/** shot types (the SHOOT button's gesture) */
export type ShotType = 'normal' | 'chip' | 'power' | 'curl' | 'outside' | 'header';
export const SHOT_LABEL: Record<ShotType, string> = { normal: '슛', chip: '칩슛', power: '파워슛', curl: '감아차기', outside: '아웃프런트', header: '헤딩' };
/** what the SHOOT button does right now */
export type ShootMode = 'shoot' | 'clear' | 'tackle' | 'header';
export const SHOOT_MODE_LABEL: Record<ShootMode, string> = { shoot: '슈팅', clear: '걷어내기', tackle: '태클', header: '헤딩' };

/**
 * The ball physics of the match: the same PIPA engine (gravity, drag, Magnus side spin,
 * knuckle, bounce, grass) with the free-kick keeper; speeds a touch lower (open play).
 */
export const MATCH_MODE: ModeConfig = {
  ...MODES.freekick,
  minSpeed: 13,
  maxSpeed: 28,
  maxApex: 5.2,
  knuckleScale: 0.9,
  curveOnset: undefined,
  keeper: { ...MODES.freekick.keeper, reactionMin: 0.1, reactionMax: 0.26, readNoise: 0.45, stepRange: 1.6, stepSpeed: 3.2, diveBase: 0.22, diveScale: 0.1, maxHipTravel: 1.9 },
};

/** the warning shown before the MATCH (exact text) */
export const MATCH_WARNING = '아직 개발 단계이므로 많은 버그와 작동이 안 될 수 있습니다.';
