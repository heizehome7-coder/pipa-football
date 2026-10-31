import * as THREE from 'three';
import { canvasTexture } from '../core/canvas';
import { lerp, smoothstep } from '../core/math';

/**
 * Low-poly articulated footballer. Faces -z (towards the goal) by default.
 * Built from ~30 tiny primitives with shared geometries/materials, so a full
 * squad costs very little on mobile GPUs.
 *
 * Rotation conventions (local joint space):
 *   hip/shoulder +x  = limb swings forward      knee  -x = shin bends back
 *   elbow +x         = forearm bends forward    spine -x = lean forward
 *   right shoulder +z / left shoulder -z = arm raised sideways
 */
export type JointName =
  | 'hips' | 'spine' | 'neck' | 'head'
  | 'lShoulder' | 'lElbow' | 'rShoulder' | 'rElbow'
  | 'lHip' | 'lKnee' | 'lAnkle' | 'rHip' | 'rKnee' | 'rAnkle';

export const JOINT_NAMES: readonly JointName[] = [
  'hips', 'spine', 'neck', 'head', 'lShoulder', 'lElbow', 'rShoulder', 'rElbow',
  'lHip', 'lKnee', 'lAnkle', 'rHip', 'rKnee', 'rAnkle',
];

export type V3 = [number, number, number];
export type Pose = { [K in JointName]?: V3 } & { hipsPos?: V3 };

export type MarkerName =
  | 'head' | 'chest' | 'pelvis' | 'lHand' | 'rHand' | 'lForearm' | 'rForearm'
  | 'lKnee' | 'rKnee' | 'lFoot' | 'rFoot';

export interface Kit {
  jersey: number;
  trim: number;
  shorts: number;
  socks: number;
  boots: number;
  skin: number;
  hair: number;
  gloves?: number;
  backName?: string;
  backNumber?: string;
  printColor?: string;
}

export const HIPS_HEIGHT = 0.98;
const ZERO: V3 = [0, 0, 0];

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
const matCache = new Map<number, THREE.Material>();
function mat(color: number) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    matCache.set(color, m);
  }
  return m;
}

function backTexture(k: Kit) {
  return canvasTexture(128, 128, (ctx, w) => {
    ctx.clearRect(0, 0, w, w);
    ctx.fillStyle = k.printColor ?? '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (k.backName) {
      ctx.font = '700 19px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
      ctx.fillText(k.backName.toUpperCase().slice(0, 12), w / 2, 20);
    }
    if (k.backNumber) {
      ctx.font = '800 78px "Barlow Condensed", Arial, sans-serif';
      ctx.fillText(k.backNumber, w / 2, 80);
    }
  });
}

export class Humanoid {
  readonly root = new THREE.Group();
  readonly joints = {} as Record<JointName, THREE.Object3D>;
  readonly markers = {} as Record<MarkerName, THREE.Object3D>;
  private readonly meshes: THREE.Mesh[] = [];

  constructor(kit: Kit) {
    this.build(kit);
    this.applyPose({});
  }

  private joint(name: JointName, parent: THREE.Object3D, x: number, y: number, z: number) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    this.joints[name] = o;
    return o;
  }

  private mesh(
    parent: THREE.Object3D, g: THREE.BufferGeometry, color: number,
    x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0,
  ) {
    const m = new THREE.Mesh(g, mat(color));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.x = rx;
    m.castShadow = true;
    parent.add(m);
    this.meshes.push(m);
    return m;
  }

  private marker(name: MarkerName, parent: THREE.Object3D, x: number, y: number, z: number) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    this.markers[name] = o;
  }

  private build(k: Kit) {
    const hips = this.joint('hips', this.root, 0, HIPS_HEIGHT, 0);
    this.mesh(hips, geo('shorts', () => new THREE.CylinderGeometry(0.165, 0.15, 0.24, 8)), k.shorts, 0, -0.03, 0, 1, 1, 0.78);
    this.marker('pelvis', hips, 0, -0.02, 0);

    const spine = this.joint('spine', hips, 0, 0.08, 0);
    this.mesh(spine, geo('torso', () => new THREE.CylinderGeometry(0.2, 0.155, 0.46, 8)), k.jersey, 0, 0.22, 0, 1, 1, 0.66);
    this.mesh(spine, geo('collar', () => new THREE.CylinderGeometry(0.075, 0.095, 0.05, 8)), k.trim, 0, 0.46, 0, 1, 1, 0.9);
    this.marker('chest', spine, 0, 0.27, 0);
    if (k.backName || k.backNumber) {
      const tex = backTexture(k);
      if (tex) {
        const plane = new THREE.Mesh(
          geo('backPlane', () => new THREE.PlaneGeometry(0.24, 0.26)),
          new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false }),
        );
        plane.position.set(0, 0.25, 0.124);
        plane.rotation.x = 0.065;
        spine.add(plane);
      }
    }

    const neck = this.joint('neck', spine, 0, 0.47, 0);
    this.mesh(neck, geo('neck', () => new THREE.CylinderGeometry(0.048, 0.056, 0.1, 6)), k.skin, 0, 0.03, 0);
    const head = this.joint('head', neck, 0, 0.08, 0);
    this.mesh(head, geo('head', () => new THREE.IcosahedronGeometry(0.112, 1)), k.skin, 0, 0.1, -0.005, 0.9, 1.04, 0.98);
    this.mesh(
      head,
      geo('hair', () => new THREE.SphereGeometry(0.119, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.55)),
      k.hair, 0, 0.11, 0.01, 0.93, 0.98, 1.0, 0.45,
    );
    this.marker('head', head, 0, 0.1, 0);

    for (const side of ['l', 'r'] as const) {
      const sx = side === 'l' ? -1 : 1;
      const sh = this.joint(`${side}Shoulder`, spine, 0.205 * sx, 0.4, 0);
      this.mesh(sh, geo('shoulderCap', () => new THREE.SphereGeometry(0.072, 7, 5)), k.jersey, 0, 0, 0);
      this.mesh(sh, geo('sleeve', () => new THREE.CylinderGeometry(0.064, 0.057, 0.15, 7)), k.jersey, 0, -0.075, 0);
      this.mesh(sh, geo('upperArm', () => new THREE.CapsuleGeometry(0.044, 0.18, 2, 6)), k.skin, 0, -0.18, 0);
      const el = this.joint(`${side}Elbow`, sh, 0, -0.3, 0);
      this.mesh(el, geo('forearm', () => new THREE.CapsuleGeometry(0.04, 0.19, 2, 6)), k.gloves ? k.jersey : k.skin, 0, -0.125, 0);
      if (k.gloves) {
        this.mesh(el, geo('glove', () => new THREE.IcosahedronGeometry(0.07, 0)), k.gloves, 0, -0.29, 0, 1, 1.2, 0.75);
      } else {
        this.mesh(el, geo('hand', () => new THREE.IcosahedronGeometry(0.047, 0)), k.skin, 0, -0.29, 0, 1, 1.15, 0.8);
      }
      this.marker(`${side}Hand`, el, 0, -0.3, 0);
      this.marker(`${side}Forearm`, el, 0, -0.13, 0);

      const hip = this.joint(`${side}Hip`, hips, 0.095 * sx, -0.07, 0);
      this.mesh(hip, geo('thigh', () => new THREE.CapsuleGeometry(0.072, 0.28, 2, 7)), k.skin, 0, -0.22, 0);
      this.mesh(hip, geo('shortLeg', () => new THREE.CylinderGeometry(0.09, 0.084, 0.17, 7)), k.shorts, 0, -0.065, 0);
      const knee = this.joint(`${side}Knee`, hip, 0, -0.43, 0);
      this.marker(`${side}Knee`, knee, 0, 0, 0);
      this.mesh(knee, geo('shin', () => new THREE.CapsuleGeometry(0.056, 0.3, 2, 6)), k.skin, 0, -0.19, 0);
      this.mesh(knee, geo('sock', () => new THREE.CylinderGeometry(0.063, 0.05, 0.27, 7)), k.socks, 0, -0.27, 0);
      const ankle = this.joint(`${side}Ankle`, knee, 0, -0.41, 0);
      this.mesh(ankle, geo('boot', () => new THREE.BoxGeometry(0.095, 0.07, 0.25)), k.boots, 0, -0.03, -0.055);
      this.marker(`${side}Foot`, ankle, 0, -0.03, -0.08);
    }
  }

  applyPose(p: Pose) {
    for (const n of JOINT_NAMES) {
      const r = p[n];
      const o = this.joints[n];
      if (r) o.rotation.set(r[0], r[1], r[2]);
      else o.rotation.set(0, 0, 0);
    }
    const hp = p.hipsPos ?? ZERO;
    this.joints.hips.position.set(hp[0], HIPS_HEIGHT + hp[1], hp[2]);
  }

  setCastShadow(v: boolean) {
    for (const m of this.meshes) m.castShadow = v;
  }

  markerWorld(name: MarkerName, out: THREE.Vector3) {
    return this.markers[name].getWorldPosition(out);
  }
}

export function blendPose(a: Pose, b: Pose, t: number, out: Pose = {}): Pose {
  for (const n of JOINT_NAMES) {
    const ra = a[n];
    const rb = b[n];
    if (!ra && !rb) {
      out[n] = undefined;
      continue;
    }
    const x = ra ?? ZERO;
    const y = rb ?? ZERO;
    out[n] = [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)];
  }
  const ha = a.hipsPos ?? ZERO;
  const hb = b.hipsPos ?? ZERO;
  out.hipsPos = [lerp(ha[0], hb[0], t), lerp(ha[1], hb[1], t), lerp(ha[2], hb[2], t)];
  return out;
}

const MIRROR: Record<JointName, JointName> = {
  hips: 'hips', spine: 'spine', neck: 'neck', head: 'head',
  lShoulder: 'rShoulder', rShoulder: 'lShoulder', lElbow: 'rElbow', rElbow: 'lElbow',
  lHip: 'rHip', rHip: 'lHip', lKnee: 'rKnee', rKnee: 'lKnee', lAnkle: 'rAnkle', rAnkle: 'lAnkle',
};

export function mirrorPose(p: Pose): Pose {
  const out: Pose = {};
  for (const n of JOINT_NAMES) {
    const r = p[n];
    if (r) out[MIRROR[n]] = [r[0], -r[1], -r[2]];
  }
  if (p.hipsPos) out.hipsPos = [-p.hipsPos[0], p.hipsPos[1], p.hipsPos[2]];
  return out;
}

export interface Keyframe {
  t: number;
  pose: Pose;
  /** progress along the run-up path (0 = start, 1 = at the ball) */
  root?: number;
}

/** Samples a keyframed animation into `out`; returns the interpolated root progress. */
export function sampleKeyframes(kfs: Keyframe[], time: number, out: Pose): number {
  if (time <= kfs[0].t) {
    blendPose(kfs[0].pose, kfs[0].pose, 0, out);
    return kfs[0].root ?? 0;
  }
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (time <= b.t) {
      const u = (time - a.t) / (b.t - a.t);
      blendPose(a.pose, b.pose, smoothstep(u), out);
      return lerp(a.root ?? 0, b.root ?? 0, u);
    }
  }
  const last = kfs[kfs.length - 1];
  blendPose(last.pose, last.pose, 0, out);
  return last.root ?? 0;
}
