import { Vec3 } from "./Vec3";
import { Mat4 } from "./Mat4";

export class AABB {
  public min: Vec3;
  public max: Vec3;
  public corners: Vec3[];
  
  public minWS: Vec3;
  public maxWS: Vec3;
  public cornersWS: Vec3[];

  constructor() {
    this.min = new Vec3(Infinity, Infinity, Infinity);
    this.max = new Vec3(-Infinity, -Infinity, -Infinity);
    this.corners = this.computeCorners();
    
    this.minWS = new Vec3(Infinity, Infinity, Infinity);
    this.maxWS = new Vec3(-Infinity, -Infinity, -Infinity);
    this.cornersWS = this.computeCorners();
  }

  private computeCorners(): Vec3[] {
    return [
      new Vec3(), new Vec3(), new Vec3(), new Vec3(),
      new Vec3(), new Vec3(), new Vec3(), new Vec3(),
    ];
  }

  public setFromVertices(positions: number[]): void {
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      if (x < this.min.data[0]) this.min.data[0] = x;
      if (y < this.min.data[1]) this.min.data[1] = y;
      if (z < this.min.data[2]) this.min.data[2] = z;
      
      if (x > this.max.data[0]) this.max.data[0] = x;
      if (y > this.max.data[1]) this.max.data[1] = y;
      if (z > this.max.data[2]) this.max.data[2] = z;
    }

    this.updateCorners();
  }

  private updateCorners(): void {
    const min = this.min;
    const max = this.max;
    
    this.corners[0].set(min.data[0], min.data[1], min.data[2]);
    this.corners[1].set(max.data[0], min.data[1], min.data[2]);
    this.corners[2].set(max.data[0], max.data[1], min.data[2]);
    this.corners[3].set(min.data[0], max.data[1], min.data[2]);
    this.corners[4].set(min.data[0], min.data[1], max.data[2]);
    this.corners[5].set(max.data[0], min.data[1], max.data[2]);
    this.corners[6].set(max.data[0], max.data[1], max.data[2]);
    this.corners[7].set(min.data[0], max.data[1], max.data[2]);
  }

  public updateWorldSpace(worldMatrix: Mat4): void {
    this.minWS.set(Infinity, Infinity, Infinity);
    this.maxWS.set(-Infinity, -Infinity, -Infinity);

    for (let i = 0; i < 8; i++) {
      const corner = this.corners[i];
      const cornerWS = this.cornersWS[i];
      
      Mat4.transformVec3(corner, worldMatrix, cornerWS);
      
      this.minWS.min(cornerWS);
      this.maxWS.max(cornerWS);
    }
  }
}
