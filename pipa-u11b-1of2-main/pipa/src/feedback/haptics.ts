/**
 * UPDATE 8: the game has NO sound any more (kick / net / crowd and the SOUND toggle were
 * removed). The short GOAL vibration stays — it is not a sound.
 */
export function goalHaptic() {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator && window.matchMedia?.('(pointer: coarse)').matches) navigator.vibrate(45);
  } catch {
    /* unsupported */
  }
}
