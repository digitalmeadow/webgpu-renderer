import { AABB } from "./AABB";
import { Mat4 } from "./Mat4";

// Per-instance world-space bounds derived from a shared local AABB + a world matrix.
// Per mesh, so meshes can share geometry without sharing world bounds
export class AABBWorld {
  public minX: number = Infinity;
  public minY: number = Infinity;
  public minZ: number = Infinity;
  public maxX: number = -Infinity;
  public maxY: number = -Infinity;
  public maxZ: number = -Infinity;

  // Transform the 8 corners of localAABB by worldMatrix and compute axis-aligned WS bounds.
  public update(localAABB: AABB, worldMatrix: Mat4): void {
    const m = worldMatrix.data;
    const lMinX = localAABB.min.data[0];
    const lMinY = localAABB.min.data[1];
    const lMinZ = localAABB.min.data[2];
    const lMaxX = localAABB.max.data[0];
    const lMaxY = localAABB.max.data[1];
    const lMaxZ = localAABB.max.data[2];

    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    // Iterate all 8 corners of the local AABB without allocation
    for (let i = 0; i < 8; i++) {
      const x = i & 1 ? lMaxX : lMinX;
      const y = i & 2 ? lMaxY : lMinY;
      const z = i & 4 ? lMaxZ : lMinZ;

      const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const wz = m[2] * x + m[6] * y + m[10] * z + m[14];

      if (wx < minX) minX = wx;
      if (wy < minY) minY = wy;
      if (wz < minZ) minZ = wz;
      if (wx > maxX) maxX = wx;
      if (wy > maxY) maxY = wy;
      if (wz > maxZ) maxZ = wz;
    }

    this.minX = minX;
    this.minY = minY;
    this.minZ = minZ;
    this.maxX = maxX;
    this.maxY = maxY;
    this.maxZ = maxZ;
  }
}
