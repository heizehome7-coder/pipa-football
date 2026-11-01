import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture } from '../core/canvas';
import { mulberry32 } from '../core/math';
import type { GameMode } from '../core/types';

/**
 * Static environment: sky, light, striped pitch, markings, LED ad boards,
 * stepped stands with an instanced crowd (1 draw call per stand), roof and a
 * scoreboard. Everything is procedural — no external assets, tiny textures.
 */
export interface StadiumEnv {
  sun: THREE.DirectionalLight;
}

const SPONSORS = [
  { t: 'PIPA', bg: '#0b241e', fg: '#c8ff3d' },
  { t: 'VOLTA', bg: '#e94b3c', fg: '#ffffff' },
  { t: 'ORBIT AIR', bg: '#f4f6f8', fg: '#13294b' },
  { t: 'KOMO', bg: '#13294b', fg: '#f2c14e' },
  { t: 'PIPA FOOTBALL', bg: '#c8ff3d', fg: '#0b241e' },
  { t: 'NOVA', bg: '#141414', fg: '#5ad1ff' },
];

function skyTexture() {
  return canvasTexture(4, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#4f8fc9');
    g.addColorStop(0.55, '#a9cde6');
    g.addColorStop(1, '#e8eee9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function grassTexture(repeat: [number, number]) {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#4f9b3d';
    ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = '#5cab47';
    ctx.fillRect(0, h / 2, w, h / 2);
    const rnd = mulberry32(7);
    for (let i = 0; i < 1600; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(20,60,15,0.16)' : 'rgba(210,255,170,0.10)';
      ctx.fillRect(x, y, 1, 2);
    }
  }, { repeat });
}

function boardTexture(repeatX: number) {
  return canvasTexture(1536, 64, (ctx) => {
    const bw = 256;
    SPONSORS.forEach((s, i) => {
      ctx.fillStyle = s.bg;
      ctx.fillRect(i * bw, 0, bw, 64);
      ctx.fillStyle = s.fg;
      ctx.font = 'italic 800 38px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.t, i * bw + bw / 2, 34);
    });
  }, { repeat: [repeatX, 1] });
}

function bannerTexture(text: string, bg: string, fg: string, repeatX: number) {
  return canvasTexture(512, 48, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 48);
    ctx.fillStyle = fg;
    ctx.font = 'italic 800 30px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 26);
  }, { repeat: [repeatX, 1] });
}

function screenTexture(mode: GameMode) {
  return canvasTexture(256, 96, (ctx) => {
    ctx.fillStyle = '#0a0f0d';
    ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = '#c8ff3d';
    ctx.font = 'italic 900 52px "Barlow Condensed", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PIPA', 128, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 18px "Barlow Condensed", Arial, sans-serif';
    ctx.fillText(mode === 'penalty' ? 'PENALTY SHOOTOUT' : 'FREE KICK CHALLENGE', 128, 76);
  });
}

const CROWD_COLORS = [
  '#c8ff3d', '#c8ff3d', '#13294b', '#13294b', '#ffffff', '#ffffff', '#e94b3c', '#f2c14e',
  '#3a7bd5', '#2b2b2b', '#d6d6d6', '#8a4fff', '#ff8a1f', '#0f5f4c',
];

function crowdMesh(seats: THREE.Vector3[], seed: number) {
  const rnd = mulberry32(seed);
  const geo = new THREE.BoxGeometry(0.44, 0.58, 0.34);
  geo.translate(0, 0.29, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), seats.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  seats.forEach((p, i) => {
    const s = 0.85 + rnd() * 0.3;
    m.makeScale(1, s, 1);
    m.setPosition(p.x + (rnd() - 0.5) * 0.12, p.y, p.z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(CROWD_COLORS[Math.floor(rnd() * CROWD_COLORS.length)]));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

export function buildStadium(scene: THREE.Scene, mode: GameMode): StadiumEnv {
  scene.background = skyTexture() ?? new THREE.Color(0xa9cbe2);
  scene.fog = new THREE.Fog(0xcadbe3, 90, 260);

  scene.add(new THREE.HemisphereLight(0xdcecff, 0x3d5c2c, 1.35));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(-14, 30, mode === 'penalty' ? 26 : 34);
  sun.target.position.set(0, 0, mode === 'penalty' ? 7 : 13);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const ext = mode === 'penalty' ? 12 : 21;
  const sc = sun.shadow.camera;
  sc.left = -ext;
  sc.right = ext;
  sc.top = ext;
  sc.bottom = -ext;
  sc.near = 4;
  sc.far = 90;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const root = new THREE.Group();
  scene.add(root);

  // ground outside the pitch
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshLambertMaterial({ color: 0x3f7a33 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.set(0, -0.02, 40);
  root.add(outer);

  // striped pitch (x ±38, z -6..108)
  const pw = 76;
  const pl = 114;
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(pw, pl),
    new THREE.MeshLambertMaterial({ map: grassTexture([pw / 11, pl / 11]), color: 0xffffff }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, 0, pl / 2 - 6);
  grass.receiveShadow = true;
  root.add(grass);

  // markings
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xeef5ea, transparent: true, opacity: 0.88 });
  const lw = 0.12;
  const line = (x1: number, z1: number, x2: number, z2: number) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(lw, len + lw), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.atan2(x2 - x1, z2 - z1);
    m.position.set((x1 + x2) / 2, 0.006, (z1 + z2) / 2);
    m.receiveShadow = true;
    root.add(m);
  };
  line(-34, 0, 34, 0);
  line(-34, 0, -34, 105);
  line(34, 0, 34, 105);
  line(-34, 52.5, 34, 52.5);
  line(-9.16, 0, -9.16, 5.5);
  line(9.16, 0, 9.16, 5.5);
  line(-9.16, 5.5, 9.16, 5.5);
  line(-20.16, 0, -20.16, 16.5);
  line(20.16, 0, 20.16, 16.5);
  line(-20.16, 16.5, 20.16, 16.5);
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), lineMat);
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(0, 0.006, 11);
  root.add(spot);
  const a0 = Math.asin(5.5 / 9.15);
  const arc = new THREE.Mesh(new THREE.RingGeometry(9.09, 9.21, 40, 1, Math.PI + a0, Math.PI - 2 * a0), lineMat);
  arc.rotation.x = -Math.PI / 2;
  arc.position.set(0, 0.006, 11);
  root.add(arc);
  const cc = new THREE.Mesh(new THREE.RingGeometry(9.09, 9.21, 48), lineMat);
  cc.rotation.x = -Math.PI / 2;
  cc.position.set(0, 0.006, 52.5);
  root.add(cc);

  // LED ad boards behind the goal and along the touchlines
  const boardBack = new THREE.MeshLambertMaterial({ color: 0x1a1f24 });
  const addBoard = (len: number, x: number, z: number, rotY: number) => {
    const g = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), new THREE.MeshBasicMaterial({ map: boardTexture(len / 24) }));
    face.position.set(0, 0.5, 0.061);
    const box = new THREE.Mesh(new THREE.BoxGeometry(len, 0.95, 0.12), boardBack);
    box.position.y = 0.475;
    box.castShadow = false;
    g.add(box, face);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    root.add(g);
  };
  addBoard(60, 0, -4.4, 0);
  addBoard(44, -36.5, 18, Math.PI / 2);
  addBoard(44, 36.5, 18, -Math.PI / 2);

  // stands
  const concrete = new THREE.MeshLambertMaterial({ color: 0x8c9198 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x56606b });
  const rows = 15;
  const stepH = 0.62;
  const stepD = 1.2;

  // behind the goal (faces +z)
  {
    const steps: THREE.BufferGeometry[] = [];
    const seats: THREE.Vector3[] = [];
    const rnd = mulberry32(11);
    for (let i = 0; i < rows; i++) {
      const y = 1.1 + i * stepH;
      const z = -7.6 - i * stepD;
      const b = new THREE.BoxGeometry(92, stepH, stepD);
      b.translate(0, y - stepH / 2, z);
      steps.push(b);
      for (let x = -45; x <= 45; x += 0.62) if (rnd() > 0.1) seats.push(new THREE.Vector3(x, y, z));
    }
    const under = new THREE.BoxGeometry(92, 1.1, (rows + 1) * stepD);
    under.translate(0, 0.55, -7.6 - (rows * stepD) / 2 + stepD / 2);
    steps.push(under);
    root.add(new THREE.Mesh(mergeGeometries(steps), concrete));
    root.add(crowdMesh(seats, 21));
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(92, 0.7),
      new THREE.MeshBasicMaterial({ map: bannerTexture('PIPA · FOOTBALL GAME', '#0b241e', '#c8ff3d', 92 / 8) }),
    );
    banner.position.set(0, 0.62, -6.99);
    root.add(banner);
    const topY = 1.1 + rows * stepH;
    const backZ = -7.6 - rows * stepD;
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(92, 6, 0.6), darkMat);
    backWall.position.set(0, topY + 2, backZ - 0.4);
    root.add(backWall);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(96, 0.5, 17), darkMat);
    roof.position.set(0, topY + 5, backZ + 6);
    root.add(roof);
    const scr = new THREE.Mesh(new THREE.BoxGeometry(11, 4.2, 0.4), darkMat);
    scr.position.set(0, topY + 7.5, backZ + 13);
    const scrFace = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 3.7), new THREE.MeshBasicMaterial({ map: screenTexture(mode) }));
    scrFace.position.set(0, 0, 0.21);
    scr.add(scrFace);
    root.add(scr);
    for (const x of [-30, -10, 10, 30]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 5, 6), darkMat);
      col.position.set(x, topY + 2.5, backZ + 13.5);
      root.add(col);
    }
  }

  // side stands (face the pitch)
  for (const s of [-1, 1]) {
    const steps: THREE.BufferGeometry[] = [];
    const seats: THREE.Vector3[] = [];
    const rnd = mulberry32(31 + s);
    for (let i = 0; i < rows - 2; i++) {
      const y = 1.1 + i * stepH;
      const x = s * (40 + i * stepD);
      const b = new THREE.BoxGeometry(stepD, stepH, 80);
      b.translate(x, y - stepH / 2, 32);
      steps.push(b);
      for (let z = -7; z <= 72; z += 0.62) if (rnd() > 0.12) seats.push(new THREE.Vector3(x, y, z));
    }
    root.add(new THREE.Mesh(mergeGeometries(steps), concrete));
    root.add(crowdMesh(seats, 41 + s));
    const roof = new THREE.Mesh(new THREE.BoxGeometry(18, 0.5, 82), darkMat);
    roof.position.set(s * 47, 1.1 + rows * stepH + 4, 32);
    root.add(roof);
  }

  return { sun };
}
