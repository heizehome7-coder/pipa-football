/**
 * UPDATE 10 — SEASONS. The season is separate from the update number (UPDATE 10 · SEASON 1).
 * When a new season starts, each account's online records are archived and start again from
 * 0 the first time the server touches that account (stored as data.season → exactly once,
 * never again on a restart). MP, FV, players, squads, evolutions, packs, tokens, level, XP,
 * daily status and the reward / trade history are never touched.
 */
export const SEASON = 1;
export const SEASON_LABEL = `SEASON ${SEASON}`;
