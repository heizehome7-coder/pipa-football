import * as THREE from 'three';
import { Humanoid, type Kit } from '../game/entities/Humanoid';
import { STANCE } from '../game/entities/Player';
import type { PlayerDef } from '../players/players';

/**
 * UPDATE 11 (patch) — card portraits rendered from the SAME 3D player model used in the
 * game (head, hair, beard, skin, kit), so a player's hair on a card always matches the
 * game and never pokes through the face or squashes. One small shared WebGL renderer
 * draws portraits one at a time (lazily, cached per player); if WebGL is not there the
 * cards keep the drawn avatar.
 */
const W = 168;
const H = 184;
const cache = new Map<string, string>();
const waiting = new Map<string, Array<(url: string) => void>>();
const queue: PlayerDef[] = [];
let renderer: THREE.WebGLRenderer | null = null;
let failed = false;
let busy = false;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;

function setup() {
  if (renderer || failed) return !!renderer;
  try {
    if (typeof document === 'undefined') throw new Error('no DOM');
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4a3a, 1.6));
    const key = new THREE.DirectionalLight(0xfff4e0, 2.2);
    key.position.set(-0.8, 2.4, -2.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xc8ff3d, 0.6);
    rim.position.set(1.4, 1.8, 1.5);
    scene.add(rim);
    camera = new THREE.PerspectiveCamera(20, W / H, 0.1, 20);
    return true;
  } catch {
    failed = true;
    renderer = null;
    return false;
  }
}

function kitOf(p: PlayerDef): Kit {
  const l = p.look;
  const gk = p.role === 'GK';
  return {
    jersey: gk ? 0xff8a1f : 0x13294b,
    trim: gk ? 0x161616 : 0xc8ff3d,
    shorts: 0xf2f4f0,
    socks: 0x13294b,
    boots: 0xc8ff3d,
    skin: l.skin,
    hair: l.hair,
    hairStyle: l.hairStyle,
    beard: l.beard,
  };
}

function draw(p: PlayerDef): string {
  const b = new Humanoid(kitOf(p));
  b.applyPose({ ...STANCE, head: [0.05, -0.18, 0], spine: [0, 0, 0] });
  b.root.rotation.y = 0.32;
  scene.add(b.root);
  b.root.updateMatrixWorld(true);
  const head = b.joints.head.getWorldPosition(new THREE.Vector3());
  // head + shoulders, a touch from the side (like a card photo)
  camera.position.set(head.x - 0.32, head.y + 0.16, head.z - 1.42);
  camera.lookAt(head.x, head.y + 0.03, head.z);
  renderer!.render(scene, camera);
  const url = renderer!.domElement.toDataURL('image/png');
  scene.remove(b.root);
  b.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mt of mats) (mt as THREE.Material & { map?: THREE.Texture }).map?.dispose();
    }
  });
  return url;
}

function pump() {
  if (busy) return;
  busy = true;
  const step = () => {
    const p = queue.shift();
    if (!p) {
      busy = false;
      return;
    }
    let url = cache.get(p.id) ?? '';
    if (!url && setup()) {
      try {
        url = draw(p);
        cache.set(p.id, url);
      } catch {
        failed = true;
      }
    }
    const cbs = waiting.get(p.id) ?? [];
    waiting.delete(p.id);
    if (url) for (const cb of cbs) cb(url);
    // one portrait per frame keeps scrolling smooth
    (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (f: () => void) => setTimeout(f, 0))(step);
  };
  step();
}

/** the cached portrait (or null) */
export function portraitOf(p: PlayerDef) {
  return cache.get(p.id) ?? null;
}

/** asks for a portrait; `cb` runs once it is ready (never when WebGL is unavailable) */
export function requestPortrait(p: PlayerDef, cb: (url: string) => void) {
  const hit = cache.get(p.id);
  if (hit) return cb(hit);
  if (failed) return;
  const list = waiting.get(p.id);
  if (list) list.push(cb);
  else {
    waiting.set(p.id, [cb]);
    queue.push(p);
  }
  pump();
}

/** test hook */
export function portraitNow(p: PlayerDef) {
  if (!setup()) return null;
  const url = draw(p);
  cache.set(p.id, url);
  return url;
}
