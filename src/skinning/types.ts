import { Mat4 } from "../math";

type Joint = { transform: { worldMatrix: Mat4 } };

export type SkinData = {
  joints: Joint[];
  inverseBindMatrices: Mat4[];
};
