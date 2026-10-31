import * as THREE from 'three';
import { FIELD, MODES } from './core/config';
import { KickGame, type KickGameOptions, type KickSpot } from './KickGame';

/** 11 m penalty: kicker, keeper, ball on the spot. */
export class PenaltyGame extends KickGame {
  constructor(opts: KickGameOptions) {
    super(MODES.penalty, opts);
  }

  protected pickSpot(): KickSpot {
    return {
      ball: new THREE.Vector3(0, FIELD.ballRadius, FIELD.penaltySpot),
      aim: new THREE.Vector3(0, 0, -1),
    };
  }
}
