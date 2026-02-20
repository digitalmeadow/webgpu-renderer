import { Vec3 } from "../math";
import { Entity } from "../scene";

export enum LightType {
  Directional,
  Point,
  Spot,
}

export abstract class Light extends Entity {
  public type: LightType;
  public color: Vec3 = new Vec3(1, 1, 1);
  public intensity: number = 1.0;

  constructor(name: string, type: LightType) {
    super(name);
    this.type = type;
  }
}

export function isLight(entity: Entity): entity is Light {
  return entity instanceof Light;
}
