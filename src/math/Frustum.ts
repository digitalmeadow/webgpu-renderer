import { vec3, mat4, Vec3, Mat4 } from 'wgpu-matrix';
import { AABB } from "./AABB";

export class FrustumPlane {
  public normal: Vec3;
  public d: number;

  constructor() {
    this.normal = vec3.create();
    this.d = 0;
  }
}

export function frustumPlanesFromMatrix(viewProjectionMatrix: Mat4): FrustumPlane[] {
  const planes: FrustumPlane[] = [];
  for (let i = 0; i < 6; i++) {
    planes.push(new FrustumPlane());
  }

  const m = viewProjectionMatrix;
  
  // Left plane
  planes[0].normal[0] = m[3] + m[0];
  planes[0].normal[1] = m[7] + m[4];
  planes[0].normal[2] = m[11] + m[8];
  planes[0].d = m[15] + m[12];

  // Right plane
  planes[1].normal[0] = m[3] - m[0];
  planes[1].normal[1] = m[7] - m[4];
  planes[1].normal[2] = m[11] - m[8];
  planes[1].d = m[15] - m[12];

  // Bottom plane
  planes[2].normal[0] = m[3] - m[1];
  planes[2].normal[1] = m[7] - m[5];
  planes[2].normal[2] = m[11] - m[9];
  planes[2].d = m[15] - m[13];

  // Top plane
  planes[3].normal[0] = m[3] + m[1];
  planes[3].normal[1] = m[7] + m[5];
  planes[3].normal[2] = m[11] + m[9];
  planes[3].d = m[15] + m[13];

  // Near plane (z=0 in NDC, WebGPU) - points toward camera (inward)
  // WebGPU NDC: z ranges from 0 (near) to 1 (far)
  // The plane equation is n · P + d = 0, where n is the inward-facing normal
  planes[4].normal[0] = m[3] + m[2];
  planes[4].normal[1] = m[7] + m[6];
  planes[4].normal[2] = m[11] + m[10];
  planes[4].d = m[15] + m[14];

  // Far plane (z=1 in NDC, WebGPU) - points away from camera
  planes[5].normal[0] = m[3] - m[2];
  planes[5].normal[1] = m[7] - m[6];
  planes[5].normal[2] = m[11] - m[10];
  planes[5].d = m[15] - m[14];

  for (let i = 0; i < 6; i++) {
    const normal = planes[i].normal;
    const len = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
    const invLen = 1.0 / len;
    normal[0] *= invLen;
    normal[1] *= invLen;
    normal[2] *= invLen;
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

    const px = normal[0] >= 0 ? max[0] : min[0];
    const py = normal[1] >= 0 ? max[1] : min[1];
    const pz = normal[2] >= 0 ? max[2] : min[2];

    const dot = normal[0] * px + normal[1] * py + normal[2] * pz + plane.d;
    
    if (dot < 0) {
      return false;
    }
  }
  return true;
}
