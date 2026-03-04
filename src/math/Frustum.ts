import { Vec3 } from "./Vec3";
import { Mat4 } from "./Mat4";
import { AABB } from "./AABB";

export class FrustumPlane {
  public normal: Vec3;
  public d: number;

  constructor() {
    this.normal = new Vec3();
    this.d = 0;
  }
}

export function frustumPlanesFromMatrix(viewProjectionMatrix: Mat4): FrustumPlane[] {
  const planes: FrustumPlane[] = [];
  for (let i = 0; i < 6; i++) {
    planes.push(new FrustumPlane());
  }

  const m = viewProjectionMatrix.data;
  
  const row0 = [m[0], m[1], m[2], m[3]];
  const row1 = [m[4], m[5], m[6], m[7]];
  const row2 = [m[8], m[9], m[10], m[11]];
  const row3 = [m[12], m[13], m[14], m[15]];

  // Left: row3 + row0
  let p = [row3[0] + row0[0], row3[1] + row0[1], row3[2] + row0[2], row3[3] + row0[3]];
  let len = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
  planes[0].normal.set(p[0] / len, p[1] / len, p[2] / len);
  planes[0].d = p[3] / len;

  // Right: row3 - row0
  p = [row3[0] - row0[0], row3[1] - row0[1], row3[2] - row0[2], row3[3] - row0[3]];
  len = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
  planes[1].normal.set(p[0] / len, p[1] / len, p[2] / len);
  planes[1].d = p[3] / len;

  // Bottom: row3 + row1
  p = [row3[0] + row1[0], row3[1] + row1[1], row3[2] + row1[2], row3[3] + row1[3]];
  len = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
  planes[2].normal.set(p[0] / len, p[1] / len, p[2] / len);
  planes[2].d = p[3] / len;

  // Top: row3 - row1
  p = [row3[0] - row1[0], row3[1] - row1[1], row3[2] - row1[2], row3[3] - row1[3]];
  len = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
  planes[3].normal.set(p[0] / len, p[1] / len, p[2] / len);
  planes[3].d = p[3] / len;

  // Near: row3 + row2
  p = [row3[0] + row2[0], row3[1] + row2[1], row3[2] + row2[2], row3[3] + row2[3]];
  len = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
  planes[4].normal.set(p[0] / len, p[1] / len, p[2] / len);
  planes[4].d = p[3] / len;

  // Far: row3 - row2
  p = [row3[0] - row2[0], row3[1] - row2[1], row3[2] - row2[2], row3[3] - row2[3]];
  len = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
  planes[5].normal.set(p[0] / len, p[1] / len, p[2] / len);
  planes[5].d = p[3] / len;

  return planes;
}

export function aabbInFrustum(aabb: AABB, planes: FrustumPlane[]): boolean {
  const min = aabb.minWS;
  const max = aabb.maxWS;

  for (let i = 0; i < planes.length; i++) {
    const plane = planes[i];
    const normal = plane.normal;

    let px = normal.data[0] >= 0 ? max.data[0] : min.data[0];
    let py = normal.data[1] >= 0 ? max.data[1] : min.data[1];
    let pz = normal.data[2] >= 0 ? max.data[2] : min.data[2];

    const padding = 1.0;
    px += normal.data[0] * padding;
    py += normal.data[1] * padding;
    pz += normal.data[2] * padding;

    const dot = normal.data[0] * px + normal.data[1] * py + normal.data[2] * pz + plane.d;
    if (dot < 0) {
      return false;
    }
  }
  return true;
}
