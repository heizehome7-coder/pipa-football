import * as THREE from 'three';
import { FIELD } from '../core/config';
import { clamp } from '../core/math';
import type { KickGame } from '../KickGame';

/**
 * Places the camera behind/right of the kicker (from the mode's framing config)
 * and solves the FOV so the goal mouth fills the configured share of the width.
 * Shared by the browser view and the headless tests.
 */
export function frameCamera(cam: THREE.PerspectiveCamera, game: KickGame, w: number, h: number) {
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  game.cameraRig(pos, look);
  cam.position.copy(pos);
  cam.aspect = w / h;
  cam.lookAt(look);
  cam.updateMatrixWorld();
  const c = game.cfg.camera;
  const target = cam.aspect > 1 ? 0.5 : c.goalFraction;
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
  cam.fov = clamp((lo + hi) / 2, c.minFov, c.maxFov);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}

/** Camera services for the stroke reader, in css pixels of a w×h viewport. */
export function cameraServices(cam: THREE.PerspectiveCamera, w: number, h: number) {
  const v = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  const rc = new THREE.Raycaster();
  return {
    project: (p: THREE.Vector3) => {
      v.copy(p).project(cam);
      return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
    },
    ray: (x: number, y: number) => {
      ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1);
      rc.setFromCamera(ndc, cam);
      return rc.ray.clone();
    },
  };
}
