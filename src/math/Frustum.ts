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
  
  // Left clipping plane
  planes[0].normal.set(m[3] + m[0], m[7] + m[4], m[11] + m[8]);
  planes[0].d = m[15] + m[12];

  // Right clipping plane
  planes[1].normal.set(m[3] - m[0], m[7] - m[4], m[11] - m[8]);
  planes[1].d = m[15] - m[12];

  // Top clipping plane
  planes[2].normal.set(m[3] - m[1], m[7] - m[5], m[11] - m[9]);
  planes[2].d = m[15] - m[13];

  // Bottom clipping plane
  planes[3].normal.set(m[3] + m[1], m[7] + m[5], m[11] + m[9]);
  planes[3].d = m[15] + m[13];

  // Near clipping plane
  planes[4].normal.set(m[3] + m[2], m[7] + m[6], m[11] + m[10]);
  planes[4].d = m[15] + m[14];

  // Far clipping plane
  planes[5].normal.set(m[3] - m[2], m[7] - m[6], m[11] - m[10]);
  planes[5].d = m[15] - m[14];

  // Normalize the plane equations
  for (let i = 0; i < 6; i++) {
    const invLen = 1.0 / planes[i].normal.length();
    planes[i].normal.multiply(invLen);
    planes[i].d *= invLen;
  }

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
