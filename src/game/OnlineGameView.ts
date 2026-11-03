import * as THREE from 'three';
import { goalHaptic } from '../feedback/haptics';
import { FIELD } from './core/config';
import type { ShotInput } from './core/types';
import { SwipeController } from './input/SwipeController';
import { readStroke, smoothStroke, type SwipeSample } from './input/strokeReader';
import { samplePlan } from './physics/ShotModel';
import { cameraServices, frameCamera } from './render/cameraFraming';
import { TrajectoryOverlay, type Pt } from './render/Trajectory';
import { buildStadium } from './world/Stadium';
import { diveCommand, OnlineKickGame } from '../online/match/penaltyRound';
import type { KickGameOptions } from './KickGame';
import type { PlayerDef } from '../players/players';
import { clampKeeperX, KEEPER_LINE, type DiveDir, type MatchMode, type WireDive, type WireShot } from '../online/match/protocol';

export type OnlineRole = 'kicker' | 'keeper';

export interface OnlineViewCallbacks {
  /** the kicker released a drawn path → send it to the server */
  onShot(input: ShotInput): boolean;
  /** the keeper chose a dive; `at` = s since the run-up started (synced clock) */
  onDive(dir: DiveDir, at: number): void;
  onHint(msg: string | null): void;
  onSpecial?(id: string): void;
  /** UPDATE 8: the keeper moved along his line (joystick) → server (throttled here) */
  onKeeperMove?(x: number): void;
}

/** what a swipe means for the keeper: dives the way the finger went on screen */
export function classifyKeeperSwipe(dx: number, dy: number): DiveDir | null {
  const len = Math.hypot(dx, dy);
  if (len < 24) return null;
  const right = dx > 0;
  if (dy < 0 && Math.abs(dx) < -dy * 0.45) return 'up';
  if (dy > 0 && Math.abs(dx) < dy * 0.8) return 'down';
  if (dy < 0 && -dy > Math.abs(dx) * 0.45) return right ? 'upRight' : 'upLeft';
  if (len < 90) return right ? 'lowRight' : 'lowLeft';
  return right ? 'right' : 'left';
}

const STEP_CHUNK = 0.1;

/**
 * keeper camera (UPDATE 3): from the kicker's side, facing the goal head-on like the
 * kicker's view — whole goal (both posts + bar) with margin, keeper seen from the
 * front, ball and kicker in the foreground. FOV solved so the goal fills ~78% width.
 */
const KEEPER_CAM = { x: 0, z: 16.8, y: 2.55, lookX: 0, lookY: 0.95, lookZ: 0, frac: 0.78, minFov: 50, maxFov: 75 };

/**
 * 3D view of one online penalty round, from either side:
 *  - KICKER: the single-player penalty camera, draw the path → sent to the server
 *  - GOALKEEPER: camera behind the goal facing the kicker, swipe/arrow keys to dive
 * Both phones replay the server's shot on the same server timestamp with the same
 * deterministic simulation; nothing per frame goes over the network.
 */
export class OnlineGameView {
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  game: OnlineKickGame;
  role: OnlineRole = 'kicker';
  /** UPDATE 6: FREE KICK DUEL spot for this round (same on both phones and the server) */
  private spot = 0;
  /** goal vibration already given this match (g<round>) — UPDATE 8: no sound */
  private soundDone = new Set<string>();
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
  private stroke: Pt[] | null = null;
  private finalPath: THREE.Vector3[] | null = null;
  private launchAt = 0;
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private kickerNick = '';
  /** UPDATE 4: this round's players (cosmetic) */
  private looks: Pick<KickGameOptions, 'kickerLook' | 'keeperLook' | 'keeperStats' | 'keeperSpecial'> & { kickerPlayer?: PlayerDef | null } = {};
  private canShoot = false;
  /** shot being replayed: local Date.now() of run-up start */
  private shot: WireShot | null = null;
  private runStartLocal = 0;
  private simT = 0;
  private started = false;
  private dive: WireDive | null = null;
  private keyBuf: Set<string> = new Set();
  private keyTimer = 0;
  lastDiveDir: DiveDir | null = null;
  /** UPDATE 8: keeper's spot on the goal line this round (world x) + joystick input −1…1 */
  private keeperX = 0;
  private joy = 0;
  private sentX = 0;
  private sentAt = 0;
  private lineAt = 0;
  /** this phone's own replay result per round (tests compare it with the server's) */
  readonly localOutcomes: Record<number, string> = {};

  constructor(
    private host: HTMLElement,
    private cb: OnlineViewCallbacks,
    /** UPDATE 6: PENALTY SHOOTOUT or FREE KICK DUEL */
    readonly mode: MatchMode = 'penalty',
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
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(90, 14), new THREE.MeshLambertMaterial({ color: 0x4a9439 }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, -0.012, -12.5);
    apron.receiveShadow = true;
    this.scene.add(apron);

    this.game = this.makeGame('PLAYER', 1);

    this.swipe = new SwipeController(this.overlay.canvas, {
      canStart: (x, y) => this.canStart(x, y),
      onMove: (s) => {
        this.stroke = s;
      },
      onEnd: (s) => this.onSwipeEnd(s),
      onCancel: () => {
        this.stroke = null;
      },
      onTap: () => {},
    });
    window.addEventListener('keydown', this.onKey);
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(host);
    }
    window.addEventListener('resize', this.resize);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    (window as unknown as { __PIPA_ONLINE?: OnlineGameView }).__PIPA_ONLINE = this;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.swipe.dispose();
    this.ro?.disconnect();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKey);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.overlay.canvas.remove();
    const w = window as unknown as { __PIPA_ONLINE?: OnlineGameView };
    if (w.__PIPA_ONLINE === this) delete w.__PIPA_ONLINE;
  }

  // ── round control (driven by server state) ────────────────────────────
  private makeGame(nick: string, seed: number) {
    const { kickerLook, keeperLook, keeperStats, keeperSpecial } = this.looks ?? {};
    // UPDATE 8: a struck shot uses the server's keeper position; while aiming he starts mid-line
    const g = new OnlineKickGame(nick, seed, true, { kickerLook, keeperLook, keeperStats, keeperSpecial }, this.mode, this.spot, this.shot?.keeperX ?? 0);
    g.start();
    // GOAL vibration from this phone's replay of the server's shot, once per round (a
    // replay after a late dive or a phone catching up stays quiet). UPDATE 8: no sound.
    g.listener = {
      onOutcome: (o) => {
        const r = this.shot?.round ?? -1;
        if (o !== 'GOAL' || this.soundDone.has(`g${r}`) || this.runClock() - this.simT > 0.8) return;
        this.soundDone.add(`g${r}`);
        goalHaptic();
      },
    };
    return g;
  }

  private swapGame(g: OnlineKickGame) {
    if (this.game) this.scene.remove(this.game.group);
    this.game = g;
    this.scene.add(g.group);
  }

  /** new round: fresh pitch, roles from the server */
  setRound(r: {
    role: OnlineRole;
    kickerNick: string;
    canShoot: boolean;
    looks?: Pick<KickGameOptions, 'kickerLook' | 'keeperLook' | 'keeperStats' | 'keeperSpecial'> & { kickerPlayer?: PlayerDef | null };
    /** free-kick spot index (freeKickSpotIndex) */
    spot?: number;
  }) {
    this.looks = r.looks ?? {};
    this.spot = r.spot ?? 0;
    this.role = r.role;
    this.kickerNick = r.kickerNick;
    this.canShoot = r.canShoot;
    this.shot = null;
    this.started = false;
    this.simT = 0;
    this.dive = null;
    this.lastDiveDir = null;
    this.finalPath = null;
    this.stroke = null;
    this.keeperX = 0;
    this.joy = 0;
    this.sentX = 0;
    this.swapGame(this.makeGame(r.kickerNick, 1));
    this.frameCamera();
  }

  setCanShoot(v: boolean) {
    this.canShoot = v;
  }

  /** the server accepted the kicker's shot: play it from `runStartLocal` (Date.now ms) */
  playShot(shot: WireShot, runStartLocal: number, dive: WireDive | null) {
    if (this.shot && this.shot.round === shot.round && this.shot.runStart === shot.runStart) return;
    // a new shot (also round 1 of a rematch) may play its sounds again
    this.soundDone.delete(`g${shot.round}`);
    this.shot = shot;
    this.runStartLocal = runStartLocal;
    this.started = false;
    this.simT = 0;
    this.dive = dive;
    this.swapGame(this.makeGame(this.kickerNick, shot.seed));
    if (this.role === 'kicker') this.finalPath = samplePlan(this.game.planFor(shot.input), 48);
    this.launchAt = 0;
    this.catchUp();
  }

  /** a dive for this round (mine, or the opponent's relayed by the server) */
  applyDive(d: WireDive) {
    if (!this.shot || d.round !== this.shot.round) {
      this.dive = d; // picked before the shot: used when the shot starts
      return;
    }
    if (this.dive && this.dive.dir === d.dir && Math.abs(this.dive.at - d.at) < 1e-6 && this.game.keeperDive) return;
    this.dive = d;
    const when = Math.max(d.at, this.game.kicker.contactTime - 0.03);
    if (!this.started || this.simT <= when + 1e-6) {
      if (this.started) this.game.setKeeperDive(diveCommand(d, this.game.keeperLineX));
      return;
    }
    // arrived after its moment (network delay): replay the kick with the dive in place
    const target = this.simT;
    this.swapGame(this.makeGame(this.kickerNick, this.shot.seed));
    this.started = false;
    this.simT = 0;
    this.advanceTo(target);
  }

  private catchUp() {
    if (!this.shot) return;
    const t = (Date.now() - this.runStartLocal) / 1000;
    this.advanceTo(Math.min(t, 6));
  }

  private advanceTo(t: number) {
    if (!this.shot || t < 0) return;
    if (!this.started) {
      this.started = true;
      this.game.shoot(this.shot.input);
      if (this.dive) this.game.setKeeperDive(diveCommand(this.dive, this.game.keeperLineX));
    }
    while (this.simT < t - 1e-9) {
      const d = Math.min(STEP_CHUNK, t - this.simT);
      this.game.update(d);
      this.simT += d;
    }
  }

  /** seconds since this round's run-up started (synced clock); negative before */
  runClock() {
    return this.shot ? (Date.now() - this.runStartLocal) / 1000 : -1;
  }

  // ── layout & camera ────────────────────────────────────────────────────
  private resize = () => {
    if (this.disposed) return;
    const r = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.overlay.resize(w, h);
    this.frameCamera();
  };

  private frameCamera() {
    if (!this.game?.spot) return;
    // free kick: both players watch from behind the ball (the keeper sees taker, wall and goal)
    if (this.role === 'kicker' || this.mode === 'freekick') {
      frameCamera(this.camera, this.game, this.w, this.h);
      return;
    }
    // GOALKEEPER: same direction as the kicker's view, centred on the goal
    const k = { ...KEEPER_CAM, ...((window as unknown as { __PIPA_KEEPER_CAM?: Partial<typeof KEEPER_CAM> }).__PIPA_KEEPER_CAM || {}) };
    const cam = this.camera;
    cam.aspect = this.w / this.h;
    cam.position.set(k.x, k.y, k.z);
    cam.lookAt(k.lookX, k.lookY, k.lookZ);
    cam.updateMatrixWorld();
    const target = cam.aspect > 1 ? 0.55 : k.frac;
    const L = new THREE.Vector3(-FIELD.goalHalfWidth, 1.2, 0);
    const R = new THREE.Vector3(FIELD.goalHalfWidth, 1.2, 0);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    let lo = 10;
    let hi = 120;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      cam.fov = mid;
      cam.updateProjectionMatrix();
      const frac = Math.abs(a.copy(R).project(cam).x - b.copy(L).project(cam).x) / 2;
      if (frac > target) lo = mid;
      else hi = mid;
    }
    cam.fov = Math.min(k.maxFov, Math.max(k.minFov, (lo + hi) / 2));
    cam.updateProjectionMatrix();
  }

  /** re-frame (test hook for camera tuning) */
  refreshCamera() {
    this.frameCamera();
  }

  worldToScreen(p: THREE.Vector3): Pt {
    this.v.copy(p).project(this.camera);
    return { x: ((this.v.x + 1) / 2) * this.w, y: ((1 - this.v.y) / 2) * this.h };
  }

  // ── input ──────────────────────────────────────────────────────────────
  private keeperCanDive() {
    if (this.role !== 'keeper' || this.lastDiveDir) return false;
    if (!this.shot) return true; // pick early (committed, goes at contact)
    return this.game.phase === 'runup' || this.game.phase === 'flight';
  }

  private canStart(x: number, y: number) {
    if (this.role === 'keeper') {
      if (!this.keeperCanDive()) return false;
      this.stroke = [{ x, y }];
      return true;
    }
    if (!this.canShoot || this.shot || this.game.phase !== 'aim') return false;
    const b = this.worldToScreen(this.game.ballPos);
    const R = Math.max(64, Math.min(this.w, this.h) * 0.2);
    const near = Math.hypot(x - b.x, y - b.y) < R;
    const below = y > b.y - R * 0.6 && Math.abs(x - b.x) < this.w * 0.32;
    if (!near && !below) this.cb.onHint('공을 누른 채로 슛 경로를 그려주세요');
    if (near || below) this.stroke = [{ x, y }];
    return near || below;
  }

  private onSwipeEnd(samples: SwipeSample[]) {
    this.stroke = null;
    if (this.role === 'keeper') {
      const a = samples[0];
      const b = samples[samples.length - 1];
      const dir = classifyKeeperSwipe(b.x - a.x, b.y - a.y);
      if (dir) this.keeperDive(dir);
      return;
    }
    const svc = cameraServices(this.camera, this.w, this.h);
    const r = readStroke(samples, { viewportH: this.h, ball: this.game.ballPos.clone(), ...svc }, this.game.cfg, this.looks.kickerPlayer ?? null);
    if (!r) {
      this.cb.onHint('골대 쪽으로 슛 경로를 조금 더 길게 그려주세요');
      return;
    }
    this.cb.onHint(null);
    if (this.submitShot(r.input) && r.intent.special) this.cb.onSpecial?.(r.intent.special);
  }

  private submitShot(input: ShotInput) {
    if (!this.cb.onShot(input)) return false;
    this.canShoot = false;
    // show the final dashed path right away; the kick starts on the server's clock
    this.finalPath = samplePlan(this.game.planFor(input), 48);
    return true;
  }

  // ── UPDATE 8: keeper joystick (left ↔ right along the goal line only) ──
  /** −1 … +1 from the on-screen stick (screen left = world −x on both cameras) */
  setJoystick(v: number) {
    this.joy = Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
  }
  /** can the keeper still walk his line? (only while the kicker aims) */
  keeperCanMove() {
    return this.role === 'keeper' && !this.shot && this.game.phase === 'aim';
  }
  /** the opponent keeper moved (relayed by the server) → he shuffles there on this phone */
  setRemoteKeeperX(x: number) {
    if (this.role === 'keeper' || this.shot) return;
    this.keeperX = clampKeeperX(x);
    this.game.keeper.shuffleTo(this.keeperX, KEEPER_LINE.maxSpeed);
  }
  private stepKeeperLine(dt: number) {
    if (!this.keeperCanMove()) return;
    if (this.joy !== 0) {
      // a little push = slow side-step, full push = quick shuffle (never a sprint)
      const sp = KEEPER_LINE.maxSpeed * Math.sign(this.joy) * Math.pow(Math.abs(this.joy), 1.4);
      this.keeperX = clampKeeperX(this.keeperX + sp * dt);
      this.game.keeper.shuffleTo(this.keeperX, KEEPER_LINE.maxSpeed);
    }
    const now = performance.now();
    if (Math.abs(this.keeperX - this.sentX) > 0.015 && now - this.sentAt >= KEEPER_LINE.sendMs) {
      this.sentX = this.keeperX;
      this.sentAt = now;
      this.cb.onKeeperMove?.(this.keeperX);
    }
  }

  keeperDive(dir: DiveDir) {
    if (!this.keeperCanDive()) return false;
    this.lastDiveDir = dir;
    const at = this.shot ? Math.max(0, this.runClock()) : -1;
    this.cb.onDive(dir, at);
    return true;
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.role !== 'keeper') return;
    const k = e.key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) return;
    e.preventDefault();
    this.keyBuf.add(k);
    // a short window so ↑+← / ↑+→ can be pressed together for the top corners
    window.clearTimeout(this.keyTimer);
    this.keyTimer = window.setTimeout(() => {
      const ks = this.keyBuf;
      this.keyBuf = new Set();
      const up = ks.has('ArrowUp');
      const down = ks.has('ArrowDown');
      const l = ks.has('ArrowLeft');
      const r = ks.has('ArrowRight');
      let dir: DiveDir | null = null;
      if (l && !r) dir = up ? 'upLeft' : down ? 'lowLeft' : 'left';
      else if (r && !l) dir = up ? 'upRight' : down ? 'lowRight' : 'right';
      else if (up) dir = 'up';
      else if (down) dir = 'down';
      if (dir) this.keeperDive(dir);
    }, 90);
  };

  // ── loop ───────────────────────────────────────────────────────────────
  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const lineAt = this.lineAt;
    this.lineAt = now;
    if (this.shot) {
      const before = this.game.phase;
      this.catchUp();
      if (before !== 'flight' && this.game.phase === 'flight') this.launchAt = now;
      if (this.game.outcome && !(this.shot.round in this.localOutcomes)) this.localOutcomes[this.shot.round] = this.game.outcome;
    } else {
      // the walk uses real time (a slow phone still moves at the same metres per second)
      this.stepKeeperLine(lineAt ? Math.min(0.25, Math.max(0, (now - lineAt) / 1000)) : 0);
      this.game.update(dt); // idle animation while aiming
    }
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
    if (this.finalPath && this.role === 'kicker') {
      const alpha = this.launchAt ? 1 - (now - this.launchAt) / 550 : 1;
      if (alpha > 0) o.drawDashedPath(this.finalPath.map((p) => this.worldToScreen(p)), alpha);
      else this.finalPath = null;
    }
    if (this.role === 'kicker' && this.canShoot && !this.shot && this.game.phase === 'aim' && !this.stroke) {
      const b = this.worldToScreen(this.game.ballPos);
      const top = this.worldToScreen(this.v2.copy(this.game.ballPos).setY(this.game.ballPos.y + FIELD.ballRadius));
      o.drawBallHint(b.x, b.y, Math.max(6, b.y - top.y), now);
    }
  }

  // ── test hooks ─────────────────────────────────────────────────────────
  /** synthetic swipe through the same reader as real touches (automated tests) */
  simulateSwipe(samples: SwipeSample[]) {
    this.onSwipeEnd(samples);
  }

  debug() {
    const g = this.game;
    return {
      role: this.role,
      mode: this.mode,
      keeperX: this.keeperX,
      keeperLineX: this.game.keeper.lineX,
      keeperZ: this.game.keeper.body.root.position.z,
      keeperHome: this.game.keeperLineX,
      spot: this.spot,
      wall: g.wall ? g.wall.players.filter((p) => p.root.visible).length : 0,
      w: this.w,
      h: this.h,
      fov: this.camera.fov,
      phase: g.phase,
      outcome: g.outcome,
      simT: this.simT,
      runClock: this.runClock(),
      runStartLocal: this.shot ? this.runStartLocal : null,
      shotRound: this.shot?.round ?? null,
      ball: this.worldToScreen(g.ballPos),
      ballWorld: g.ballPos.toArray(),
      keeper: { action: g.keeper.action, stage: g.keeper.stage, x: g.keeper.hipsWorldX() },
      keeperScreen: this.worldToScreen(new THREE.Vector3(g.keeper.hipsWorldX(), 1, 0.45)),
      kickerScreen: this.worldToScreen(g.kicker.body.root.position.clone().setY(1)),
      goal: {
        left: this.worldToScreen(new THREE.Vector3(-FIELD.goalHalfWidth, 0, 0)).x,
        right: this.worldToScreen(new THREE.Vector3(FIELD.goalHalfWidth, 0, 0)).x,
        bottom: this.worldToScreen(new THREE.Vector3(0, 0, 0)).y,
        top: this.worldToScreen(new THREE.Vector3(0, FIELD.goalHeight, 0)).y,
      },
      dive: this.dive,
      canShoot: this.canShoot,
      localOutcomes: this.localOutcomes,
    };
  }
}
