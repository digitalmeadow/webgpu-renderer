import { Geometry } from "./Geometry";
import { Vertex } from "./Vertex";

export function createSphereGeometry(
  device: GPUDevice,
  radius = 1,
  segments = 32,
): Geometry {
  const rings = segments; // latitude divisions
  const sectors = segments; // longitude divisions

  const vertices: Vertex[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI; // 0 → PI (top → bottom)
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    for (let s = 0; s <= sectors; s++) {
      const theta = (s / sectors) * 2 * Math.PI; // 0 → 2PI
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      const x = radius * sinPhi * cosTheta;
      const y = radius * cosPhi;
      const z = radius * sinPhi * sinTheta;

      // Normal points outward from center
      const nx = sinPhi * cosTheta;
      const ny = cosPhi;
      const nz = sinPhi * sinTheta;

      // Tangent: dP/dtheta (longitude direction), normalized
      // dP/dtheta = r * sinPhi * (-sinTheta, 0, cosTheta)
      const tx = -sinTheta;
      const ty = 0;
      const tz = cosTheta;

      const u = s / sectors;
      const v = r / rings;

      vertices.push(
        new Vertex(
          [x, y, z, 1],
          [nx, ny, nz, 0],
          [tx, ty, tz, 1],
          [u, v],
        ),
      );
    }
  }

  // Build index buffer: two triangles per quad, wound CW (matching renderer convention)
  const stride = sectors + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const a = r * stride + s;
      const b = r * stride + s + 1;
      const c = (r + 1) * stride + s;
      const d = (r + 1) * stride + s + 1;

      // CW winding: top-left triangle then bottom-right triangle
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  return new Geometry(device, vertices, indices);
}
