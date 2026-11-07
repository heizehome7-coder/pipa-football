import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Ball } from '../game/entities/Ball';
import { clamp, lerp } from '../game/core/math';
import { PITCH } from './config';
import type { MatchEngine, MatchInput } from './MatchEngine';
import { buildMatchStadium } from './MatchStadium';

/**
 * UPDATE 11 — the MATCH renderer: WebGL, the BROADCAST CAMERA (from the side stand, looking
 * down across the pitch like TV, following the ball smoothly — never 1st person, never
 * behind a player), the ball, the CONTROLLED PLAYER marker and the render loop.
 */
export class MatchView {
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.5, 500);
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private ballViz = new Ball(true);
  private marker: THREE.Mesh;
  private ring: THREE.Mesh;
  private raf = 0;
  private last = 0;
  private ro: ResizeObserver | null = null;
  private w = 1;
  private h = 1;
  private disposed = false;
  private camX = 0;
  private camZ = 0;
  private zoom = 1;
  fps = 0;
  private fpsAcc = 0;
  private fpsN = 0;

  constructor(
    private host: HTMLElement,
    readonly engine: MatchEngine,
    private input: () => MatchInput,
    private onFrame: () => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'game-canvas match-canvas';
    host.appendChild(this.renderer.domElement);
    buildMatchStadium(this.scene);
    this.scene.add(engine.root);
    this.scene.add(this.ballViz.group);
    // CONTROLLED PLAYER: a cyan triangle over his head + a dashed yellow ring at his feet (TV style)
    const cyan = new THREE.MeshBasicMaterial({ color: 0x5ef2e6 });
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 3), cyan);
    this.marker.rotation.x = Math.PI;
    this.scene.add(this.marker);
    const dashes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) {
      const a0 = (i / 14) * Math.PI * 2;
      const g = new THREE.RingGeometry(0.62, 0.74, 6, 1, a0, (Math.PI * 2) / 14 * 0.62);
      dashes.push(g);
    }
    this.ring = new THREE.Mesh(mergeGeometries(dashes), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.95 }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.scale.set(1, 0.62, 1);
    this.scene.add(this.ring);
    this.camX = engine.ball.pos.x;
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(host);
    }
    window.addEventListener('resize', this.resize);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private resize = () => {
    const r = this.host.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  };

  get portrait() {
    return this.h > this.w;
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    // real elapsed time (a slow phone frame still advances the clock correctly, capped)
    const dt = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (document.hidden) return;
    const inp = this.input();
    // sub-steps of ≤ 1/60 s for the rules (a slow frame still advances the real time)
    let left = dt;
    let first = true;
    while (left > 1e-4) {
      const h = Math.min(left, 1 / 60);
      this.engine.step(h, first ? inp : { ...inp, actions: [] });
      first = false;
      left -= h;
    }
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 1) {
      this.fps = Math.round(this.fpsN / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    this.draw(dt);
    this.onFrame();
  };

  /** the broadcast camera: high on the +z side, follows the ball across the pitch */
  private frame(dt: number) {
    const e = this.engine;
    const b = e.ball;
    const portrait = this.portrait;
    const wide = e.phase === 'halftime' || e.phase === 'fulltime';
    const goal = e.phase === 'goal';
    const wantZoom = wide ? 1.45 : goal ? 0.82 : 1;
    this.zoom = lerp(this.zoom, wantZoom, 1 - Math.exp(-dt * 1.6));
    // horizontal span shown (m) and the camera distance (portrait: higher, a bit further)
    // UPDATE 11 patch: 11 vs 11 on a 100 m pitch — a wider, higher TV view
    const span = (portrait ? 30 : 56) * this.zoom;
    const height = (portrait ? 40 : 27) * this.zoom;
    const back = (portrait ? 30 : 36) * this.zoom;
    let tx = wide ? 0 : b.pos.x + b.vel.x * 0.35;
    if (goal && e.lastGoal) {
      const sc = e.allPlayers().find((p) => p.def === e.lastGoal!.scorer);
      if (sc) tx = sc.pos.x;
    }
    const lim = Math.max(0, PITCH.HALF_L + 5 - span / 2);
    tx = clamp(tx, -lim, lim);
    const tz = wide ? 0 : clamp(b.pos.z * 0.4, -14, 12);
    const k = 1 - Math.exp(-dt * 2.4);
    this.camX = lerp(this.camX, tx, k);
    this.camZ = lerp(this.camZ, tz, k);
    const dist = Math.hypot(height, back);
    const aspect = this.w / this.h;
    const hfov = 2 * Math.atan(span / 2 / dist);
    this.camera.fov = clamp((2 * Math.atan(Math.tan(hfov / 2) / aspect) * 180) / Math.PI, 26, portrait ? 74 : 60);
    this.camera.updateProjectionMatrix();
    this.camera.position.set(this.camX, height, this.camZ + back);
    // portrait: look a little towards the camera side so the whole width of the pitch fits
    this.camera.lookAt(this.camX, 0, this.camZ + (portrait ? 3 : -1));
  }

  private draw(dt: number) {
    const e = this.engine;
    this.ballViz.setPosition(e.ball.pos);
    this.ballViz.spin(e.ball.vel, e.ball.spin, dt);
    const c = e.controlled;
    const show = e.phase === 'play' || e.phase === 'kickoff' || e.phase === 'restart';
    this.marker.visible = this.ring.visible = show;
    if (show) {
      const hgt = 2.25 * c.def.look.height;
      this.marker.position.set(c.pos.x, hgt + Math.sin(performance.now() / 160) * 0.06, c.pos.z);
      this.marker.rotation.y += dt * 2;
      this.ring.position.set(c.pos.x, 0.03, c.pos.z);
      this.ring.rotation.z += dt * 0.6;
    }
    this.frame(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** world point → screen px (HUD labels) */
  project(p: THREE.Vector3) {
    const v = p.clone().project(this.camera);
    return { x: ((v.x + 1) / 2) * this.w, y: ((1 - v.y) / 2) * this.h, visible: v.z < 1 };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
