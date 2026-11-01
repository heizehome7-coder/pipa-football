import type { KickerLook } from '../game/entities/Player';
import type { Goalkeeper } from '../game/entities/Goalkeeper';
import type { PlayerDef } from './players';

/** a chosen player → his 3D look as a kicker (cosmetic only) */
export function kickerLookOf(p: PlayerDef | null | undefined): KickerLook | undefined {
  if (!p) return undefined;
  const l = p.look;
  return { shirt: p.shirt, number: p.number, skin: l.skin, hair: l.hair, hairStyle: l.hairStyle, beard: l.beard, height: l.height, build: l.build };
}

/** a chosen goalkeeper → his 3D look (hair/skin/name only: the body — and every save — stays the same) */
export function keeperLookOf(p: PlayerDef | null | undefined): ConstructorParameters<typeof Goalkeeper>[0] {
  if (!p) return undefined;
  const l = p.look;
  return { shirt: p.shirt, number: p.number, skin: l.skin, hair: l.hair, hairStyle: l.hairStyle, beard: l.beard };
}
