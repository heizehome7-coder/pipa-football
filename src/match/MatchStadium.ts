import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../game/core/math';
import { bannerTexture, boardTexture, crowdMesh, grassTexture, skyTexture } from '../game/world/Stadium';
import { PITCH } from './config';

/**
 * UPDATE 11 — the MATCH stadium: a full small pitch with BOTH ends (touchlines, goal
 * lines, halfway line, centre circle + spot, penalty boxes + spots, goal areas), striped
 * grass, LED ad boards, crowd stands on three sides (the camera side stays open, like a TV
 * gantry), floodlight towers and a sun with shadows. Built from PIPA's own stadium parts.
 */
export function buildMatchStadium(scene: THREE.Scene) {
  const L = PITCH.HALF_L;
  const W = PITCH.HALF_W;
  scene.background = skyTexture() ?? new THREE.Color(0xa9cbe2);
  scene.fog = new THREE.Fog(0xcadbe3, 110, 280);
  scene.add(new THREE.HemisphereLight(0xdcecff, 0x3d5c2c, 1.4));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
  sun.position.set(-18, 42, 26);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -L - 4;
  sc.right = L + 4;
  sc.top = W + 6;
  sc.bottom = -W - 6;
  sc.near = 5;
  sc.far = 120;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  const root = new THREE.Group();
  scene.add(root);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x3f7a33 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.02;
  root.add(outer);
  // striped grass (stripes across the pitch length, like a real broadcast)
  const gl = 2 * L + 10;
  const gw = 2 * W + 10;
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(gw, gl), new THREE.MeshLambertMaterial({ map: grassTexture([gw / 11, gl / 6]), color: 0xffffff }));
  grass.rotation.x = -Math.PI / 2;
  grass.rotation.z = Math.PI / 2;
  grass.receiveShadow = true;
  root.add(grass);

  // markings
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xeef5ea, transparent: true, opacity: 0.9 });
  const lw = 0.12;
  const line = (x1: number, z1: number, x2: number, z2: number) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(lw, len + lw), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.atan2(x2 - x1, z2 - z1);
    m.position.set((x1 + x2) / 2, 0.006, (z1 + z2) / 2);
    root.add(m);
  };
  line(-L, -W, L, -W);
  line(-L, W, L, W);
  line(-L, -W, -L, W);
  line(L, -W, L, W);
  line(0, -W, 0, W);
  for (const s of [-1, 1]) {
    const gx = s * L;
    const bx = gx - s * PITCH.BOX_D;
    line(gx, -PITCH.BOX_HW, bx, -PITCH.BOX_HW);
    line(gx, PITCH.BOX_HW, bx, PITCH.BOX_HW);
    line(bx, -PITCH.BOX_HW, bx, PITCH.BOX_HW);
    const ax = gx - s * 5.5;
    line(gx, -9.2, ax, -9.2);
    line(gx, 9.2, ax, 9.2);
    line(ax, -9.2, ax, 9.2);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), lineMat);
    spot.rotation.x = -Math.PI / 2;
    spot.position.set(gx - s * 11, 0.006, 0);
    root.add(spot);
  }
  const cc = new THREE.Mesh(new THREE.RingGeometry(PITCH.CIRCLE_R - 0.06, PITCH.CIRCLE_R + 0.06, 56), lineMat);
  cc.rotation.x = -Math.PI / 2;
  cc.position.y = 0.006;
  root.add(cc);
  const cs = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), lineMat);
  cs.rotation.x = -Math.PI / 2;
  cs.position.y = 0.007;
  root.add(cs);

  // LED ad boards around the pitch
  const boardBack = new THREE.MeshLambertMaterial({ color: 0x1a1f24 });
  const addBoard = (len: number, x: number, z: number, rotY: number) => {
    const g = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), new THREE.MeshBasicMaterial({ map: boardTexture(len / 24) }));
    face.position.set(0, 0.5, 0.061);
    const box = new THREE.Mesh(new THREE.BoxGeometry(len, 0.95, 0.12), boardBack);
    box.position.y = 0.475;
    g.add(box, face);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    root.add(g);
  };
  addBoard(2 * L + 6, 0, -W - 3, 0);
  addBoard(2 * L + 6, 0, W + 3.2, Math.PI);
  addBoard(2 * W + 4, -L - 4.2, 0, Math.PI / 2);
  addBoard(2 * W + 4, L + 4.2, 0, -Math.PI / 2);

  // stands: far side (the TV backdrop) and both ends
  const concrete = new THREE.MeshLambertMaterial({ color: 0x8c9198 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x56606b });
  const stepH = 0.62;
  const stepD = 1.2;
  const stand = (rows: number, along: 'x' | 'z', start: number, sign: number, span: number, seed: number) => {
    const steps: THREE.BufferGeometry[] = [];
    const seats: THREE.Vector3[] = [];
    const rnd = mulberry32(seed);
    for (let i = 0; i < rows; i++) {
      const y = 1.1 + i * stepH;
      const d = sign * (start + i * stepD);
      const b = along === 'x' ? new THREE.BoxGeometry(span, stepH, stepD) : new THREE.BoxGeometry(stepD, stepH, span);
      if (along === 'x') b.translate(0, y - stepH / 2, d);
      else b.translate(d, y - stepH / 2, 0);
      steps.push(b);
      for (let u = -span / 2 + 0.4; u <= span / 2 - 0.4; u += 0.62) if (rnd() > 0.1) seats.push(along === 'x' ? new THREE.Vector3(u, y, d) : new THREE.Vector3(d, y, u));
    }
    root.add(new THREE.Mesh(mergeGeometries(steps), concrete));
    root.add(crowdMesh(seats, seed + 7));
    const topY = 1.1 + rows * stepH;
    const back = sign * (start + rows * stepD + 0.3);
    const wall = along === 'x' ? new THREE.BoxGeometry(span + 2, 7, 0.6) : new THREE.BoxGeometry(0.6, 7, span + 2);
    const wm = new THREE.Mesh(wall, darkMat);
    if (along === 'x') wm.position.set(0, topY + 2.5, back);
    else wm.position.set(back, topY + 2.5, 0);
    root.add(wm);
    const roof = new THREE.Mesh(along === 'x' ? new THREE.BoxGeometry(span + 4, 0.5, rows * stepD + 4) : new THREE.BoxGeometry(rows * stepD + 4, 0.5, span + 4), darkMat);
    const mid = sign * (start + (rows * stepD) / 2);
    if (along === 'x') roof.position.set(0, topY + 5.5, mid);
    else roof.position.set(mid, topY + 5.5, 0);
    root.add(roof);
  };
  stand(18, 'x', W + 6, -1, 2 * L + 30, 11);
  stand(14, 'z', L + 6.5, -1, 2 * W + 14, 21);
  stand(14, 'z', L + 6.5, 1, 2 * W + 14, 31);
  // the banner on the far stand
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(2 * L + 20, 0.7), new THREE.MeshBasicMaterial({ map: bannerTexture('PIPA · THE MATCH · 5 vs 5', '#0b241e', '#c8ff3d', (2 * L + 20) / 8) }));
  banner.position.set(0, 0.62, -W - 5.99);
  // (UPDATE 11 patch: the same stadium, scaled to the 100 × 64 m pitch)
  root.add(banner);
  // floodlight towers in the corners
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x9aa3ad });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfffbe6 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 34, 8), poleMat);
      pole.position.set(sx * (L + 14), 17, sz * (W + 16));
      root.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.6), lampMat);
      lamp.position.set(sx * (L + 13), 34, sz * (W + 15));
      lamp.lookAt(0, 0, 0);
      root.add(lamp);
    }
  return { sun };
}
