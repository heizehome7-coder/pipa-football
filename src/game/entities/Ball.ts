import * as THREE from 'three';
import { canvasTexture } from '../core/canvas';
import { FIELD } from '../core/config';

function ballTexture() {
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#f5f5ef';
    ctx.fillRect(0, 0, w, h);
    const poly = (cx: number, cy: number, r: number, n: number, rot: number, color: string) => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.9;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    // PIPA ball: navy pentagons + lime accents (original design)
    for (let i = 0; i < 6; i++) {
      poly(i * (w / 6) + 21, 30, 17, 5, -Math.PI / 2, '#13294b');
      poly(i * (w / 6) + 64 - 21, 98, 17, 5, Math.PI / 2, '#13294b');
      poly(i * (w / 6) + 42, 64, 9, 3, i % 2 ? 0 : Math.PI, '#c8ff3d');
    }
    ctx.fillStyle = '#13294b';
    ctx.fillRect(0, 0, w, 7);
    ctx.fillRect(0, h - 7, w, 7);
  });
}

function blobTexture() {
  return canvasTexture(64, 64, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.75)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
}

export class Ball {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  private shadow: THREE.Mesh | null = null;
  private shadowMat: THREE.MeshBasicMaterial | null = null;
  private q = new THREE.Quaternion();
  private axis = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(visuals: boolean) {
    const map = visuals ? ballTexture() : null;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(FIELD.ballRadius, 18, 12),
      new THREE.MeshLambertMaterial({ color: 0xffffff, map: map ?? null }),
    );
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
    if (visuals) {
      const tex = blobTexture();
      this.shadowMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.55 });
      this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), this.shadowMat);
      this.shadow.rotation.x = -Math.PI / 2;
      this.shadow.renderOrder = 1;
      this.group.add(this.shadow);
    }
  }

  reset() {
    this.mesh.quaternion.identity();
  }

  setPosition(p: THREE.Vector3) {
    this.mesh.position.copy(p);
    if (this.shadow && this.shadowMat) {
      const h = Math.max(0, p.y - FIELD.ballRadius);
      this.shadow.position.set(p.x, 0.014, p.z);
      this.shadow.scale.setScalar(1 + h * 0.35);
      this.shadowMat.opacity = 0.55 / (1 + h * 0.9);
    }
  }

  /** roll/top-spin along the velocity plus side-spin (curl) around the vertical axis */
  spin(vel: THREE.Vector3, sideSpin: number, dt: number) {
    const speed = Math.hypot(vel.x, vel.z);
    if (speed > 0.01) {
      this.axis.set(vel.x, 0, vel.z).cross(this.up).negate().normalize();
      this.q.setFromAxisAngle(this.axis, (speed / FIELD.ballRadius) * 0.55 * dt);
      this.mesh.quaternion.premultiply(this.q);
    }
    if (sideSpin !== 0) {
      this.q.setFromAxisAngle(this.up, sideSpin * dt);
      this.mesh.quaternion.premultiply(this.q);
    }
  }
}
