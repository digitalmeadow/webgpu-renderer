import { Light, LightType } from "./Light";
import { Vec3 } from "../math";

export class DirectionalLight extends Light {
  public direction: Vec3 = new Vec3(0, -1, 0);

  constructor(name: string) {
    super(name, LightType.Directional);
  }
}
