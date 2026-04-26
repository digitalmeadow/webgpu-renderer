import { Mat4 } from "../math";

export class SkinData {
  public joints: { transform: { worldMatrix: Mat4 } }[];
  public inverseBindMatrices: Mat4[];

  constructor(
    joints: { transform: { worldMatrix: Mat4 } }[],
    inverseBindMatrices: Mat4[],
  ) {
    this.joints = joints;
    this.inverseBindMatrices = inverseBindMatrices;
  }
}
