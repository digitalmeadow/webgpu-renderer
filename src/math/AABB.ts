import { Vec3 } from "./Vec3";

export class AABB {
  public min: Vec3;
  public max: Vec3;

  constructor() {
    this.min = new Vec3(Infinity, Infinity, Infinity);
    this.max = new Vec3(-Infinity, -Infinity, -Infinity);
  }

  public expandByPoint(x: number, y: number, z: number): void {
    if (x < this.min.data[0]) this.min.data[0] = x;
    if (y < this.min.data[1]) this.min.data[1] = y;
    if (z < this.min.data[2]) this.min.data[2] = z;
    if (x > this.max.data[0]) this.max.data[0] = x;
    if (y > this.max.data[1]) this.max.data[1] = y;
    if (z > this.max.data[2]) this.max.data[2] = z;
  }

  public setFromVertices(positions: number[]): void {
    for (let i = 0; i < positions.length; i += 3) {
      this.expandByPoint(positions[i], positions[i + 1], positions[i + 2]);
    }
  }
}
