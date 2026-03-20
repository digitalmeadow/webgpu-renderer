import { Mat4 } from "../math";
import { Entity } from "../scene";

export class SkinData {
  public joints: Entity[];
  public inverseBindMatrices: Mat4[];

  constructor(joints: Entity[], inverseBindMatrices: Mat4[]) {
    this.joints = joints;
    this.inverseBindMatrices = inverseBindMatrices;
  }
}
