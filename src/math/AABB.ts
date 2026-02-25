import { vec3, mat4, Vec3, Mat4 } from 'wgpu-matrix';

export class AABB {
  public min: Vec3;
  public max: Vec3;
  public corners: Vec3[];
  
  public minWS: Vec3;
  public maxWS: Vec3;
  public cornersWS: Vec3[];

  constructor() {
    this.min = vec3.fromValues(Infinity, Infinity, Infinity);
    this.max = vec3.fromValues(-Infinity, -Infinity, -Infinity);
    this.corners = this.computeCorners();
    
    this.minWS = vec3.fromValues(Infinity, Infinity, Infinity);
    this.maxWS = vec3.fromValues(-Infinity, -Infinity, -Infinity);
    this.cornersWS = this.computeCorners();
  }

  private computeCorners(): Vec3[] {
    return [
      vec3.create(), vec3.create(), vec3.create(), vec3.create(),
      vec3.create(), vec3.create(), vec3.create(), vec3.create(),
    ];
  }

  public setFromVertices(positions: number[]): void {
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      if (x < this.min[0]) this.min[0] = x;
      if (y < this.min[1]) this.min[1] = y;
      if (z < this.min[2]) this.min[2] = z;
      
      if (x > this.max[0]) this.max[0] = x;
      if (y > this.max[1]) this.max[1] = y;
      if (z > this.max[2]) this.max[2] = z;
    }

    this.updateCorners();
  }

  private updateCorners(): void {
    const min = this.min;
    const max = this.max;
    
    const c0 = this.corners[0]; c0[0] = min[0]; c0[1] = min[1]; c0[2] = min[2];
    const c1 = this.corners[1]; c1[0] = max[0]; c1[1] = min[1]; c1[2] = min[2];
    const c2 = this.corners[2]; c2[0] = max[0]; c2[1] = max[1]; c2[2] = min[2];
    const c3 = this.corners[3]; c3[0] = min[0]; c3[1] = max[1]; c3[2] = min[2];
    const c4 = this.corners[4]; c4[0] = min[0]; c4[1] = min[1]; c4[2] = max[2];
    const c5 = this.corners[5]; c5[0] = max[0]; c5[1] = min[1]; c5[2] = max[2];
    const c6 = this.corners[6]; c6[0] = max[0]; c6[1] = max[1]; c6[2] = max[2];
    const c7 = this.corners[7]; c7[0] = min[0]; c7[1] = max[1]; c7[2] = max[2];
  }

  public updateWorldSpace(worldMatrix: Mat4): void {
    this.minWS[0] = Infinity; this.minWS[1] = Infinity; this.minWS[2] = Infinity;
    this.maxWS[0] = -Infinity; this.maxWS[1] = -Infinity; this.maxWS[2] = -Infinity;

    for (let i = 0; i < 8; i++) {
      const corner = this.corners[i];
      const cornerWS = this.cornersWS[i];
      
      const x = corner[0], y = corner[1], z = corner[2];
      cornerWS[0] = worldMatrix[0] * x + worldMatrix[4] * y + worldMatrix[8] * z + worldMatrix[12];
      cornerWS[1] = worldMatrix[1] * x + worldMatrix[5] * y + worldMatrix[9] * z + worldMatrix[13];
      cornerWS[2] = worldMatrix[2] * x + worldMatrix[6] * y + worldMatrix[10] * z + worldMatrix[14];
      
      for (let j = 0; j < 3; j++) {
        if (cornerWS[j] < this.minWS[j]) this.minWS[j] = cornerWS[j];
        if (cornerWS[j] > this.maxWS[j]) this.maxWS[j] = cornerWS[j];
      }
    }
  }
}
