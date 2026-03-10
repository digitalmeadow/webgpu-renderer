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
  // String-based light type for cross-boundary type checking
  public lightType: string = "base";

  constructor(name: string, type: LightType) {
    super(name);
    this.type = type;
  }
}

export function isLight(entity: Entity): boolean {
  // Use property check instead of instanceof to avoid cross-boundary issues
  return "lightType" in entity;
}
