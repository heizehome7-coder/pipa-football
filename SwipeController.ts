import type { SwipeSample } from './strokeReader';

export interface SwipeHandlers {
  /** return true to start tracking a swipe from this point */
  canStart(x: number, y: number): boolean;
  onMove(samples: SwipeSample[]): void;
  onEnd(samples: SwipeSample[]): void;
  onCancel(): void;
  onTap(x: number, y: number): void;
}

/**
 * Pointer-event based swipe capture that works for touch (iOS/Android) and mouse.
 * - touch-action:none is set on the element (CSS) so the browser never scrolls/zooms
 * - touchstart/touchmove are additionally preventDefault()-ed (passive:false) for old iOS
 * - coalesced events are used for a high-resolution path
 */
export class SwipeController {
  private samples: SwipeSample[] = [];
  private activeId: number | null = null;
  private tracking = false;
  private down = { x: 0, y: 0, t: 0 };

  constructor(
    private el: HTMLElement,
    private h: SwipeHandlers,
  ) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancelEv);
    el.addEventListener('lostpointercapture', this.onLost);
    el.addEventListener('touchstart', this.block, { passive: false });
    el.addEventListener('touchmove', this.block, { passive: false });
    el.addEventListener('touchend', this.block, { passive: false });
    el.addEventListener('contextmenu', this.block);
    el.addEventListener('gesturestart', this.block as EventListener);
  }

  dispose() {
    const el = this.el;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onCancelEv);
    el.removeEventListener('lostpointercapture', this.onLost);
    el.removeEventListener('touchstart', this.block);
    el.removeEventListener('touchmove', this.block);
    el.removeEventListener('touchend', this.block);
    el.removeEventListener('contextmenu', this.block);
    el.removeEventListener('gesturestart', this.block as EventListener);
  }

  private block = (e: Event) => {
    if (e.cancelable) e.preventDefault();
  };

  private local(e: PointerEvent): SwipeSample {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp || performance.now() };
  }

  private onDown = (e: PointerEvent) => {
    if (e.cancelable) e.preventDefault();
    if (this.activeId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const s = this.local(e);
    this.activeId = e.pointerId;
    this.down = { x: s.x, y: s.y, t: s.t };
    this.tracking = this.h.canStart(s.x, s.y);
    this.samples = [s];
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerId !== this.activeId) return;
    if (e.cancelable) e.preventDefault();
    if (!this.tracking) return;
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const evs = list.length ? list : [e];
    for (const ev of evs) {
      const s = this.local(ev);
      const last = this.samples[this.samples.length - 1];
      if (!last || s.t >= last.t) this.samples.push(s);
    }
    this.h.onMove(this.samples);
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.activeId) return;
    if (e.cancelable) e.preventDefault();
    const s = this.local(e);
    const moved = Math.hypot(s.x - this.down.x, s.y - this.down.y);
    const wasTracking = this.tracking;
    if (wasTracking) {
      const last = this.samples[this.samples.length - 1];
      if (!last || Math.hypot(s.x - last.x, s.y - last.y) > 0.5) this.samples.push(s);
    }
    this.release(e.pointerId);
    if (moved < 14 && s.t - this.down.t < 1500) {
      if (wasTracking) this.h.onCancel();
      this.h.onTap(s.x, s.y);
      return;
    }
    if (wasTracking) this.h.onEnd(this.samples);
  };

  private onCancelEv = (e: PointerEvent) => {
    if (e.pointerId !== this.activeId) return;
    const was = this.tracking;
    this.release(e.pointerId);
    if (was) this.h.onCancel();
  };

  private onLost = (e: PointerEvent) => {
    if (e.pointerId !== this.activeId) return;
    // pointerup normally fires first; this is only a safety net
    const was = this.tracking;
    this.activeId = null;
    this.tracking = false;
    if (was) this.h.onCancel();
  };

  private release(id: number) {
    this.activeId = null;
    this.tracking = false;
    try {
      if (this.el.hasPointerCapture(id)) this.el.releasePointerCapture(id);
    } catch {
      /* ignore */
    }
  }
}
