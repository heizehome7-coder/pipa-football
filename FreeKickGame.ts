import * as THREE from 'three';
import { FIELD, MODES } from './core/config';
import { DefensiveWall } from './entities/DefensiveWall';
import { KickGame, type KickGameOptions, type KickSpot } from './KickGame';

// free-kick spots (x, z) around the "D", 20–27 m from goal
const SPOTS: [number, number][] = [
  [-5, 23],
  [1.2, 24.5],
  [6.5, 22],
  [-9, 21],
  [3.5, 27],
];

/** Direct free kick: same controls as the penalty, plus a 4–5 man wall that jumps. */
export class FreeKickGame extends KickGame {
  private order: number[] | null = null;

  constructor(opts: KickGameOptions) {
    super(MODES.freekick, opts);
  }

  protected createWall() {
    return new DefensiveWall(5);
  }

  protected pickSpot(attempt: number): KickSpot {
    if (!this.order) {
      this.order = SPOTS.map((_, i) => i);
      for (let i = this.order.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
      }
    }
    const [x, z] = SPOTS[this.order[attempt % SPOTS.length]];
    const ball = new THREE.Vector3(x, FIELD.ballRadius, z);
    const aim = new THREE.Vector3(-x, 0, -z).normalize();
    return { ball, aim, wallCount: Math.abs(x) < 2 ? 5 : 4 };
  }
}
