/**
 * UPDATE 11 patch — MATCH is played in LANDSCAPE. After a tap we ASK the browser for full
 * screen + a landscape lock (Fullscreen API + Screen Orientation API). Many mobile browsers
 * (iPhone Safari among them) do not allow a forced rotation — then the game shows
 * "휴대폰을 가로로 돌려주세요." until the phone is turned. Nothing here pretends to force it.
 */
type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };

export async function requestLandscape(): Promise<boolean> {
  try {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    }
  } catch {
    /* not allowed here — fine */
  }
  try {
    const o = screen.orientation as LockableOrientation | undefined;
    if (o?.lock) {
      await o.lock('landscape');
      return true;
    }
  } catch {
    /* not supported (e.g. iOS) → the "turn your phone" screen */
  }
  return false;
}

export function releaseLandscape() {
  try {
    (screen.orientation as LockableOrientation | undefined)?.unlock?.();
  } catch {
    /* ignore */
  }
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
  } catch {
    /* ignore */
  }
}

export const isPortrait = () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
