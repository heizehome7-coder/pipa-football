import * as THREE from 'three';
import { FIELD } from './core/config';
import type { GameMode, Phase, ShotOutcome } from './core/types';
import { FreeKickGame } from './FreeKickGame';
import { SwipeController } from './input/SwipeController';
import { readStroke, smoothStroke, type StrokeContext, type StrokeReading, type SwipeSample } from './input/strokeReader';
import type { KickGame } from './KickGame';
import { PenaltyGame } from './PenaltyGame';
import { samplePlan, type ShotPlan } from './physics/ShotModel';
import { TrajectoryOverlay, type Pt } from './render/Trajectory';
import type { MatchSession } from './session/MatchSession';
import { buildStadium } from './world/Stadium';
import { cameraServices, frameCamera } from './render/cameraFraming';

export interface GameViewCallbacks {
  onPhase(p: Phase): void;
  onOutcome(o: ShotOutcome, detail: string): void;
  onHint(msg: string | null): void;
}

/**
 * Browser glue: WebGL renderer, camera framing, render loop, swipe input and
 * the trajectory overlay. All game rules live in KickGame (renderer-agnostic).
 */
export class GameView {
  readonly game: KickGame;
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private overlay: TrajectoryOverlay;
  private swipe: SwipeController;
  private ro: ResizeObserver | null = null;
  private raf = 0;
  private last = 0;
  private w = 1;
  private h = 1;
  private disposed = false;
  /** raw finger path while drawing (gold) */
  private stroke: Pt[] | null = null;
  /** final 3D path projected to screen after release (white dashed) */
  private finalPath: THREE.Vector3[] | null = null;
  private launchAt = 0;
  private framedAttempt = -1;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private ndc = new THREE.Vector2();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  lastReading: StrokeReading | null = null;
  fps = 0;
  private fpsAcc = 0;
  private fpsN = 0;

  constructor(
    private host: HTMLElement,
    mode: GameMode,
    private session: MatchSession,
    private cb: GameViewCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'game-canvas';
    host.appendChild(this.renderer.domElement);

    this.overlay = new TrajectoryOverlay();
    host.appendChild(this.overlay.canvas);

    buildStadium(this.scene, mode);
    const opts = { visuals: true, nickname: session.player.nickname, seed: session.nextSeed() };
    this.game = mode === 'penalty' ? new PenaltyGame(opts) : new FreeKickGame(opts);
    this.scene.add(this.game.group);
    this.game.listener = {
      onPhase: (p) => {
        if (p === 'aim') {
          this.frameCamera();
          this.finalPath = null;
        }
        this.cb.onPhase(p);
      },
      onOutcome: (o, detail) => {
        if (this.game.lastInput) {
          this.session.recordShot({ input: this.game.lastInput, outcome: o, detail, attempt: this.game.attempt, at: Date.now() });
        }
        this.cb.onOutcome(o, detail);
      },
      onLaunch: () => {
        this.launchAt = performance.now();
      },
    };

    this.swipe = new SwipeController(this.overlay.canvas, {
      canStart: (x, y) => this.canStart(x, y),
      onMove: (s) => this.onSwipeMove(s),
      onEnd: (s) => this.onSwipeEnd(s),
      onCancel: () => {
        this.stroke = null;
      },
      onTap: () => {
        if (this.game.canContinue()) this.game.next();
      },
    });

    this.resize();
    this.game.start();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(host);
    }
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    (window as unknown as { __PIPA?: GameView }).__PIPA = this;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.swipe.dispose();
    this.ro?.disconnect();
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      for (const mm of Array.isArray(m) ? m : [m]) {
        const map = (mm as THREE.MeshBasicMaterial).map;
        if (map) map.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.overlay.canvas.remove();
    const w = window as unknown as { __PIPA?: GameView };
    if (w.__PIPA === this) delete w.__PIPA;
  }

  // ── layout & camera ────────────────────────────────────────────────────
  private resize = () => {
    if (this.disposed) return;
    const r = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === this.w && h === this.h && this.framedAttempt >= 0) return;
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.overlay.resize(w, h);
    if (this.game) this.frameCamera();
  };

  private frameCamera() {
    if (!this.game.spot) return;
    frameCamera(this.camera, this.game, this.w, this.h);
    this.framedAttempt = this.game.attempt;
  }

  worldToScreen(p: THREE.Vector3): Pt {
    this.v.copy(p).project(this.camera);
    return { x: ((this.v.x + 1) / 2) * this.w, y: ((1 - this.v.y) / 2) * this.h };
  }

  screenToGoalPlane(sx: number, sy: number) {
    this.ndc.set((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.ray.intersectPlane(this.plane, this.v);
    return hit ? { x: hit.x, y: hit.y } : null;
  }

  // ── input ──────────────────────────────────────────────────────────────
  private strokeContext(): StrokeContext {
    return { viewportH: this.h, ball: this.game.ballPos.clone(), ...cameraServices(this.camera, this.w, this.h) };
  }

  private canStart(x: number, y: number) {
    if (this.game.phase !== 'aim') return false;
    const b = this.worldToScreen(this.game.ballPos);
    const R = Math.max(64, Math.min(this.w, this.h) * 0.2);
    const near = Math.hypot(x - b.x, y - b.y) < R;
    const below = y > b.y - R * 0.6 && Math.abs(x - b.x) < this.w * 0.32;
    if (!near && !below) this.cb.onHint('공을 누른 채로 슛 경로를 그려주세요');
    if (near || below) this.stroke = [{ x, y }];
    return near || below;
  }

  private onSwipeMove(samples: SwipeSample[]) {
    // the gold line follows the raw finger immediately (drawn next frame, ≤16 ms)
    this.stroke = samples;
  }

  private onSwipeEnd(samples: SwipeSample[]) {
    this.stroke = null;
    const r = readStroke(samples, this.strokeContext(), this.game.cfg);
    if (!r) {
      this.cb.onHint('골대 쪽으로 슛 경로를 조금 더 길게 그려주세요');
      return;
    }
    this.lastReading = r;
    this.cb.onHint(null);
    if (this.game.shoot(r.input)) {
      this.finalPath = samplePlan(this.game.plan as ShotPlan, 48);
      this.launchAt = 0;
    }
  }

  // ── loop ───────────────────────────────────────────────────────────────
  private onVisibility = () => {
    this.last = performance.now();
  };

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.max(0, (now - this.last) / 1000);
    this.last = now;
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 1) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    this.game.update(dt);
    if (this.framedAttempt !== this.game.attempt) this.frameCamera();
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay(now);
  };

  private drawOverlay(now: number) {
    const o = this.overlay;
    o.clear();
    if (this.stroke && this.stroke.length > 1) {
      o.drawGoldTrail(smoothStroke(this.stroke));
      return;
    }
    if (this.finalPath) {
      // visible through the run-up, fades out once the ball is on its way
      const alpha = this.launchAt ? 1 - (now - this.launchAt) / 550 : 1;
      if (alpha > 0) o.drawDashedPath(this.finalPath.map((p) => this.worldToScreen(p)), alpha);
      else this.finalPath = null;
    }
    if (this.game.phase === 'aim' && !this.stroke) {
      const b = this.worldToScreen(this.game.ballPos);
      const top = this.worldToScreen(this.v2.copy(this.game.ballPos).setY(this.game.ballPos.y + FIELD.ballRadius));
      o.drawBallHint(b.x, b.y, Math.max(6, b.y - top.y), now);
    }
  }

  // ── debug / test hooks (used by automated tests) ─────────────────────────
  /** Feeds a timed synthetic swipe through the same reader → shot path as real touches. */
  simulateSwipe(samples: SwipeSample[]) {
    this.lastReading = null;
    this.onSwipeEnd(samples);
    return this.lastReading;
  }

  debug() {
    const g = this.game;
    const L = this.worldToScreen(new THREE.Vector3(-FIELD.goalHalfWidth, 0, 0));
    const R = this.worldToScreen(new THREE.Vector3(FIELD.goalHalfWidth, 0, 0));
    const T = this.worldToScreen(new THREE.Vector3(0, FIELD.goalHeight, 0));
    const box = new THREE.Box3().setFromObject(g.kicker.body.root);
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.max.z), new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z), new THREE.Vector3(box.max.x, box.max.y, box.max.z),
      new THREE.Vector3(box.min.x, box.min.y, box.min.z), new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    ].map((p) => this.worldToScreen(p));
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    return {
      w: this.w,
      h: this.h,
      fov: this.camera.fov,
      phase: g.phase,
      outcome: g.outcome,
      detail: g.detail,
      attempt: g.attempt,
      ball: this.worldToScreen(g.ballPos),
      ballWorld: g.ballPos.toArray(),
      goal: { left: L.x, right: R.x, bottom: L.y, top: T.y, fraction: (R.x - L.x) / this.w },
      kicker: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
      wall: g.wall
        ? (() => {
            const ps = g.wall.players.filter((p) => p.root.visible).map((p) => this.worldToScreen(p.root.position.clone().setY(0.9)));
            return { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length, n: ps.length };
          })()
        : null,
      keeper: { action: g.keeper.action, stage: g.keeper.stage, guess: g.keeper.guess, reaction: g.keeper.reaction, x: g.keeper.hipsWorldX() },
      plan: g.plan ? { speed: g.plan.speed, power: g.plan.power, curve: g.plan.curve, apex: g.plan.apex, target: g.plan.target.toArray(), duration: g.plan.duration, forward: g.plan.forward.toArray() } : null,
      overlay: { drawing: !!this.stroke, dashed: !!this.finalPath },
      reading: this.lastReading,
      fps: this.fps,
    };
  }
}
