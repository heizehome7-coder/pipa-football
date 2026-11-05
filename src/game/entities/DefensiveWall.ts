import * as THREE from 'three';
import { FIELD } from '../core/config';
import type { Collider } from './Goalkeeper';
import { blendPose, Humanoid, type Pose } from './Humanoid';

const WALL_POSE: Pose = {
  spine: [-0.06, 0, 0], head: [0.05, 0, 0],
  lShoulder: [0.35, 0, 0.18], rShoulder: [0.35, 0, -0.18], lElbow: [1.9, 0, 0], rElbow: [1.9, 0, 0],
  lHip: [0.12, 0, -0.03], rHip: [0.12, 0, 0.03], lKnee: [-0.2, 0, 0], rKnee: [-0.2, 0, 0],
  hipsPos: [0, -0.03, 0],
};
const WALL_JUMP: Pose = {
  spine: [0.02, 0, 0], head: [-0.05, 0, 0],
  lShoulder: [0.2, 0, 0.12], rShoulder: [0.2, 0, -0.12], lElbow: [1.8, 0, 0], rElbow: [1.8, 0, 0],
  lHip: [0.35, 0, -0.03], rHip: [0.35, 0, 0.03], lKnee: [-0.7, 0, 0], rKnee: [-0.7, 0, 0],
  lAnkle: [-0.4, 0, 0], rAnkle: [-0.4, 0, 0],
};

/**
 * UPDATE 8: the wall is a touch bigger — players and their collision +4 % wider (+1 % taller;
 * same scale, so what you see is what blocks), same spots, still 4–5 players.
 */
export const WALL_SCALE = 1.04;
/** height grows less than width: a well-struck ball over the wall must still clear it */
export const WALL_HEIGHT_SCALE = 1.01;
const WALL_SPACING = 0.56;
// collision spheres (height above the player's feet, radius) — scaled with the players
const BODY: [number, number][] = ([[0.32, 0.19], [0.7, 0.21], [1.08, 0.25], [1.38, 0.24], [1.66, 0.14]] as [number, number][]).map(([h, r]) => [h * WALL_HEIGHT_SCALE, r * WALL_SCALE]);
// between neighbours (height, radius)
const GAP: [number, number][] = ([[0.4, 0.15], [0.85, 0.16], [1.25, 0.18]] as [number, number][]).map(([h, r]) => [h * WALL_HEIGHT_SCALE, r * WALL_SCALE]);

const WALL_KIT = {
  jersey: 0xd8323c,
  trim: 0xffffff,
  shorts: 0xffffff,
  socks: 0xd8323c,
  boots: 0x111111,
  skin: 0xb27a55,
  hair: 0x1b120c,
  printColor: '#ffffff',
};
const SKINS = [0xb27a55, 0xe2b48f, 0x8a5a3c, 0xd29a74, 0x6e4630];

/** UPDATE 10: the standard wall body is about 180 cm tall (head top ≈ the highest collider) */
export const WALL_BASE_CM = 180;
/**
 * UPDATE 10: five wall heights, 165–200 cm (whole cm), from a seed — the online game uses the
 * round's seed, so the kicker's phone, the keeper's phone and the server build the same wall.
 */
export function wallHeights(seed: number, attempt = 0): number[] {
  let a = (seed ^ Math.imul(attempt + 1, 0x9e3779b1) ^ 0x5a11) >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 5 }, () => 165 + Math.floor(rnd() * 36));
}

/** 4–5 defenders, 9.15 m from the ball, lined up to cover the near post. They jump on the strike. */
export class DefensiveWall {
  readonly group = new THREE.Group();
  readonly players: Humanoid[] = [];
  readonly colliders: Collider[] = [];
  private count = 0;
  private jumpT = -1;
  private delays: number[] = [];
  private pose: Pose = {};
  /** UPDATE 10: each wall player's height (cm) and body scale (height / 180 cm, same in every direction) */
  heights: number[] = [180, 180, 180, 180, 180];
  private sizes: number[] = [1, 1, 1, 1, 1];

  constructor(max = 5) {
    for (let i = 0; i < max; i++) {
      const h = new Humanoid({ ...WALL_KIT, skin: SKINS[i % SKINS.length], backNumber: String([4, 5, 6, 8, 3][i]) });
      h.root.scale.set(WALL_SCALE, WALL_HEIGHT_SCALE, WALL_SCALE);
      this.players.push(h);
      this.group.add(h.root);
    }
  }

  setup(ball: THREE.Vector3, count: number, heights?: number[]) {
    this.count = Math.min(count, this.players.length);
    this.heights = this.players.map((_, i) => Math.max(165, Math.min(200, Math.round(heights?.[i] ?? WALL_BASE_CM))));
    this.sizes = this.heights.map((h) => h / WALL_BASE_CM);
    // natural proportions: the whole body scales (never just the legs or the head)
    this.players.forEach((p, i) => p.root.scale.set(WALL_SCALE * this.sizes[i], WALL_HEIGHT_SCALE * this.sizes[i], WALL_SCALE * this.sizes[i]));
    const central = Math.abs(ball.x) < 1.5;
    const postX = central ? 0 : Math.sign(ball.x) * FIELD.goalHalfWidth;
    const toPost = new THREE.Vector3(postX - ball.x, 0, -ball.z).normalize();
    let perpOut = new THREE.Vector3(-toPost.z, 0, toPost.x);
    if (!central && Math.sign(perpOut.x) !== Math.sign(ball.x)) perpOut.negate();
    const base = new THREE.Vector3(ball.x, 0, ball.z).addScaledVector(toPost, 9.15);
    const spacing = WALL_SPACING;

    this.colliders.length = 0;
    this.delays = [];
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const active = i < this.count;
      p.root.visible = active;
      if (!active) continue;
      const offs = central ? (i - (this.count - 1) / 2) * spacing : 0.3 - i * spacing;
      p.root.position.copy(base).addScaledVector(perpOut, offs);
      const d = new THREE.Vector3(ball.x - p.root.position.x, 0, ball.z - p.root.position.z);
      p.root.rotation.set(0, Math.atan2(-d.x, -d.z), 0);
      p.applyPose(WALL_POSE);
      this.delays.push(0.12 + ((i * 0.023) % 0.06));
      for (const [, r] of BODY) this.colliders.push({ pos: new THREE.Vector3(), r: r * this.sizes[i] });
    }
    // shoulders/arms/legs of neighbours touch: fill the seams between players
    for (let i = 0; i < this.count - 1; i++) for (const [, r] of GAP) this.colliders.push({ pos: new THREE.Vector3(), r: r * (this.sizes[i] + this.sizes[i + 1]) / 2 });
    this.jumpT = -1;
    this.updateColliders();
  }

  jump() {
    this.jumpT = 0;
  }

  update(dt: number) {
    if (this.jumpT < 0) return;
    this.jumpT += dt;
    for (let i = 0; i < this.count; i++) {
      const u = (this.jumpT - this.delays[i]) / 0.56;
      const k = u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0;
      this.players[i].root.position.y = 0.36 * k * this.sizes[i];
      blendPose(WALL_POSE, WALL_JUMP, k, this.pose);
      this.players[i].applyPose(this.pose);
    }
    this.updateColliders();
  }

  updateColliders() {
    let c = 0;
    for (let i = 0; i < this.count; i++) {
      const p = this.players[i].root.position;
      for (const [h] of BODY) this.colliders[c++].pos.set(p.x, p.y + h * this.sizes[i], p.z);
    }
    for (let i = 0; i < this.count - 1; i++) {
      const a = this.players[i].root.position;
      const b = this.players[i + 1].root.position;
      const sz = (this.sizes[i] + this.sizes[i + 1]) / 2;
      for (const [h] of GAP) this.colliders[c++].pos.set((a.x + b.x) / 2, (a.y + b.y) / 2 + h * sz, (a.z + b.z) / 2);
    }
  }
}
