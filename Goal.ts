import * as THREE from 'three';
import { canvasTexture } from '../core/canvas';
import { FIELD } from '../core/config';
import { clamp, lerp } from '../core/math';

const NET_CELL = 0.16;

function netTexture() {
  return canvasTexture(32, 32, (ctx, w) => {
    ctx.clearRect(0, 0, w, w);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, 1);
    ctx.lineTo(w, 1);
    ctx.moveTo(1, 0);
    ctx.lineTo(1, w);
    ctx.stroke();
  }, { repeat: [1, 1] });
}

/** Bilinear quad between 4 corners with world-scaled UVs (so net cells are square everywhere). */
function quad(p00: THREE.Vector3, p10: THREE.Vector3, p11: THREE.Vector3, p01: THREE.Vector3, su: number, sv: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const lenU = p00.distanceTo(p10);
  const lenV = p00.distanceTo(p01);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let j = 0; j <= sv; j++) {
    const v = j / sv;
    a.lerpVectors(p00, p01, v);
    b.lerpVectors(p10, p11, v);
    for (let i = 0; i <= su; i++) {
      const u = i / su;
      p.lerpVectors(a, b, u);
      pos.push(p.x, p.y, p.z);
      uv.push((u * lenU) / NET_CELL, (v * lenV) / NET_CELL);
    }
  }
  for (let j = 0; j < sv; j++) {
    for (let i = 0; i < su; i++) {
      const k = j * (su + 1) + i;
      idx.push(k, k + 1, k + su + 2, k, k + su + 2, k + su + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Posts, crossbar, frame and a net whose back panel bulges when the ball hits it. */
export class GoalFrame {
  readonly group = new THREE.Group();
  private back: THREE.Mesh | null = null;
  private backBase: Float32Array | null = null;
  private bulge = { x: 0, y: 0, amp: 0, t: 0, active: false };

  static roofY(z: number) {
    return lerp(FIELD.goalHeight, FIELD.netBackHeight, clamp(-z / FIELD.goalDepth, 0, 1));
  }

  constructor(visuals: boolean) {
    const W = FIELD.goalHalfWidth;
    const H = FIELD.goalHeight;
    const D = FIELD.goalDepth;
    const BH = FIELD.netBackHeight;
    const pr = FIELD.postRadius;

    const postMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x222222 });
    const postGeo = new THREE.CylinderGeometry(pr, pr, H + pr, 10);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(s * W, (H + pr) / 2, 0);
      post.castShadow = true;
      this.group.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, 2 * W + 2 * pr, 10), postMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, H, 0);
    bar.castShadow = true;
    this.group.add(bar);

    if (!visuals) return;

    // thin back frame
    const frameMat = new THREE.MeshLambertMaterial({ color: 0xd9dde0 });
    const rod = (a: THREE.Vector3, b: THREE.Vector3) => {
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 5), frameMat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      this.group.add(m);
    };
    for (const s of [-1, 1]) {
      rod(new THREE.Vector3(s * W, 0.02, -D), new THREE.Vector3(s * W, BH, -D));
      rod(new THREE.Vector3(s * W, H, 0), new THREE.Vector3(s * W, BH, -D));
      rod(new THREE.Vector3(s * W, 0.02, 0), new THREE.Vector3(s * W, 0.02, -D));
    }
    rod(new THREE.Vector3(-W, BH, -D), new THREE.Vector3(W, BH, -D));
    rod(new THREE.Vector3(-W, 0.02, -D), new THREE.Vector3(W, 0.02, -D));

    const tex = netTexture();
    const netMat = new THREE.MeshBasicMaterial({
      color: 0xf2f4f5,
      map: tex,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // back (segmented for bulge)
    const backGeo = quad(V(-W, 0, -D), V(W, 0, -D), V(W, BH, -D), V(-W, BH, -D), 26, 9);
    this.back = new THREE.Mesh(backGeo, netMat);
    this.backBase = (backGeo.attributes.position.array as Float32Array).slice();
    this.group.add(this.back);
    // roof
    this.group.add(new THREE.Mesh(quad(V(-W, H, 0), V(W, H, 0), V(W, BH, -D), V(-W, BH, -D), 1, 1), netMat));
    // sides
    for (const s of [-1, 1]) {
      this.group.add(new THREE.Mesh(quad(V(s * W, 0, 0), V(s * W, 0, -D), V(s * W, BH, -D), V(s * W, H, 0), 1, 1), netMat));
    }
    for (const c of this.group.children) c.renderOrder = c === this.back ? 2 : 2;
  }

  impact(x: number, y: number, speed: number) {
    this.bulge = { x, y, amp: clamp(speed * 0.028, 0.08, 0.5), t: 0, active: true };
  }

  reset() {
    if (this.back && this.backBase) {
      (this.back.geometry.attributes.position.array as Float32Array).set(this.backBase);
      this.back.geometry.attributes.position.needsUpdate = true;
    }
    this.bulge.active = false;
  }

  update(dt: number) {
    if (!this.bulge.active || !this.back || !this.backBase) return;
    const b = this.bulge;
    b.t += dt;
    const d = b.amp * Math.exp(-3.4 * b.t) * Math.cos(9 * b.t);
    const arr = this.back.geometry.attributes.position.array as Float32Array;
    const base = this.backBase;
    for (let i = 0; i < arr.length; i += 3) {
      const dx = base[i] - b.x;
      const dy = base[i + 1] - b.y;
      const w = Math.exp(-(dx * dx + dy * dy) / (2 * 0.6 * 0.6));
      arr[i + 2] = base[i + 2] - d * w;
    }
    this.back.geometry.attributes.position.needsUpdate = true;
    if (b.t > 1.6) this.reset();
  }
}
