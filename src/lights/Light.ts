import { Vec3 } from "../math";
import { Entity } from "../scene";

export const LightType = {
  Directional: "directional",
  Point: "point",
  Spot: "spot",
} as const;
export type LightType = (typeof LightType)[keyof typeof LightType];

export abstract class Light extends Entity {
  public color: Vec3 = new Vec3(1, 1, 1);
  public intensity: number = 1.0;

  constructor(name: string, type: LightType) {
    super(name);
    this.type = type;
  }
}

export function isLight(entity: Entity): boolean {
  return (
    entity.type === LightType.Directional ||
    entity.type === LightType.Point ||
    entity.type === LightType.Spot
  );
}
