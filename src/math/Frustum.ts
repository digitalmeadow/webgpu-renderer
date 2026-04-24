import { Vec3 } from "./Vec3";
import { Mat4 } from "./Mat4";
import { AABBWorld } from "./AABBWorld";

export class FrustumPlane {
  public normal: Vec3;
  public distance: number;

  constructor() {
    this.normal = new Vec3();
    this.distance = 0;
  }
}

// Pre-allocated plane array reused across calls — callers must not hold references between frames.
const _planes: FrustumPlane[] = Array.from(
  { length: 6 },
  () => new FrustumPlane(),
);

export function frustumPlanesFromMatrix(
  viewProjectionMatrix: Mat4,
  out: FrustumPlane[] = _planes,
): FrustumPlane[] {
  const m = viewProjectionMatrix.data;

  // Matrix stored column-major; read across columns to form rows.
  // row0 = [m0, m4, m8,  m12]
  // row1 = [m1, m5, m9,  m13]
  // row2 = [m2, m6, m10, m14]
  // row3 = [m3, m7, m11, m15]

  // Each plane: normal = (px,py,pz), distance = p3; normalize by 1/len(normal).
  let px: number, py: number, pz: number, p3: number, invLen: number;

  // Left: row3 + row0
  px = m[3] + m[0];
  py = m[7] + m[4];
  pz = m[11] + m[8];
  p3 = m[15] + m[12];
  invLen = 1 / Math.sqrt(px * px + py * py + pz * pz);
  out[0].normal.set(px * invLen, py * invLen, pz * invLen);
  out[0].distance = p3 * invLen;

  // Right: row3 - row0
  px = m[3] - m[0];
  py = m[7] - m[4];
  pz = m[11] - m[8];
  p3 = m[15] - m[12];
  invLen = 1 / Math.sqrt(px * px + py * py + pz * pz);
  out[1].normal.set(px * invLen, py * invLen, pz * invLen);
  out[1].distance = p3 * invLen;

  // Bottom: row3 + row1
  px = m[3] + m[1];
  py = m[7] + m[5];
  pz = m[11] + m[9];
  p3 = m[15] + m[13];
  invLen = 1 / Math.sqrt(px * px + py * py + pz * pz);
  out[2].normal.set(px * invLen, py * invLen, pz * invLen);
  out[2].distance = p3 * invLen;

  // Top: row3 - row1
  px = m[3] - m[1];
  py = m[7] - m[5];
  pz = m[11] - m[9];
  p3 = m[15] - m[13];
  invLen = 1 / Math.sqrt(px * px + py * py + pz * pz);
  out[3].normal.set(px * invLen, py * invLen, pz * invLen);
  out[3].distance = p3 * invLen;

  // Near: row3 + row2
  px = m[3] + m[2];
  py = m[7] + m[6];
  pz = m[11] + m[10];
  p3 = m[15] + m[14];
  invLen = 1 / Math.sqrt(px * px + py * py + pz * pz);
  out[4].normal.set(px * invLen, py * invLen, pz * invLen);
  out[4].distance = p3 * invLen;

  // Far: row3 - row2
  px = m[3] - m[2];
  py = m[7] - m[6];
  pz = m[11] - m[10];
  p3 = m[15] - m[14];
  invLen = 1 / Math.sqrt(px * px + py * py + pz * pz);
  out[5].normal.set(px * invLen, py * invLen, pz * invLen);
  out[5].distance = p3 * invLen;

  return out;
}

export function aabbInFrustum(
  aabb: AABBWorld,
  planes: FrustumPlane[],
): boolean {
  for (let i = 0; i < planes.length; i++) {
    const plane = planes[i];
    const nx = plane.normal.data[0];
    const ny = plane.normal.data[1];
    const nz = plane.normal.data[2];

    // P-vertex: corner most in the direction of the plane normal
    const px = nx >= 0 ? aabb.maxX : aabb.minX;
    const py = ny >= 0 ? aabb.maxY : aabb.minY;
    const pz = nz >= 0 ? aabb.maxZ : aabb.minZ;

    if (nx * px + ny * py + nz * pz + plane.distance < 0) {
      return false;
    }
  }
  return true;
}
