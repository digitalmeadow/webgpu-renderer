import { Vec3 } from "../math";
import { Entity, EntityType } from "../scene/Entity";

export abstract class Light extends Entity {
  abstract readonly type:
    | typeof EntityType.LightDirectional
    | typeof EntityType.LightSpot
    | typeof EntityType.LightPoint;
  public color: Vec3 = new Vec3(1, 1, 1);
  public intensity: number = 1.0;

  constructor(name: string) {
    super(name);
  }
}
