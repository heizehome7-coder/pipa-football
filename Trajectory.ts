export interface Pt {
  x: number;
  y: number;
}

const GOLD = '233,185,73'; // #E9B949

/**
 * 2D overlay above the WebGL canvas, drawn at device resolution.
 *   while drawing → the finger's own path as a warm gold line with a soft glow
 *   after release → the final 3D shot path (projected) as a bright white dashed line
 */
export class TrajectoryOverlay {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private w = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-overlay';
    this.ctx = this.canvas.getContext('2d')!;
  }

  resize(w: number, h: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.w = w;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  clear() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private smoothPath(pts: Pt[]) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) {
      c.lineTo(pts[1].x, pts[1].y);
      return;
    }
    for (let i = 1; i < pts.length - 1; i++) {
      c.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
    }
    const last = pts[pts.length - 1];
    c.lineTo(last.x, last.y);
  }

  private get lw() {
    return Math.max(2.4, Math.min(3.4, this.w / 125));
  }

  /** live stroke under the finger */
  drawGoldTrail(pts: Pt[]) {
    if (pts.length < 2) return;
    const c = this.ctx;
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // soft glow
    c.strokeStyle = `rgba(${GOLD},0.35)`;
    c.lineWidth = this.lw * 2.6;
    c.shadowColor = `rgba(${GOLD},0.7)`;
    c.shadowBlur = 10;
    this.smoothPath(pts);
    c.stroke();
    // core line
    c.shadowBlur = 2;
    c.shadowColor = 'rgba(80,50,0,0.35)';
    c.strokeStyle = `rgb(${GOLD})`;
    c.lineWidth = this.lw;
    this.smoothPath(pts);
    c.stroke();
    // bright tip under the finger
    const tip = pts[pts.length - 1];
    c.shadowBlur = 8;
    c.shadowColor = `rgba(${GOLD},0.9)`;
    c.fillStyle = '#fff3c9';
    c.beginPath();
    c.arc(tip.x, tip.y, this.lw * 1.5, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  /** final shot path after release */
  drawDashedPath(pts: Pt[], alpha: number) {
    if (pts.length < 2 || alpha <= 0.01) return;
    const c = this.ctx;
    c.save();
    c.globalAlpha = alpha;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.setLineDash([2, this.lw * 3.2]);
    c.lineWidth = this.lw * 1.25;
    c.strokeStyle = 'rgba(255,255,255,0.96)';
    c.shadowColor = 'rgba(0,0,0,0.35)';
    c.shadowBlur = 3;
    this.smoothPath(pts);
    c.stroke();
    c.setLineDash([]);
    const last = pts[pts.length - 1];
    c.lineWidth = 2;
    c.beginPath();
    c.arc(last.x, last.y, 6, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  /** pulsing ring around the ball inviting a stroke */
  drawBallHint(x: number, y: number, r: number, timeMs: number) {
    const c = this.ctx;
    const k = (timeMs % 1400) / 1400;
    c.save();
    c.strokeStyle = `rgba(${GOLD},${0.85 * (1 - k)})`;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x, y, r * (1.4 + k * 1.6), 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineCap = 'round';
    const ay = y - r * 3.2;
    const bob = Math.sin(timeMs / 220) * 2;
    c.beginPath();
    c.moveTo(x - 7, ay + 5 + bob);
    c.lineTo(x, ay - 2 + bob);
    c.lineTo(x + 7, ay + 5 + bob);
    c.stroke();
    c.restore();
  }
}
