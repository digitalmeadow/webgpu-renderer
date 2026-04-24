import { Geometry } from "./Geometry";
import { Vertex } from "./Vertex";

export function createPlaneGeometry(
  device: GPUDevice,
  width = 2,
  depth = 2,
): Geometry {
  const halfW = width / 2;
  const halfD = depth / 2;

  const vertices: Vertex[] = [
    // +Y face (top)
    new Vertex([-halfW, 0, -halfD, 1], [0, 1, 0, 0], [1, 0, 0, 1], [0, 0]),
    new Vertex([halfW, 0, -halfD, 1], [0, 1, 0, 0], [1, 0, 0, 1], [1, 0]),
    new Vertex([halfW, 0, halfD, 1], [0, 1, 0, 0], [1, 0, 0, 1], [1, 1]),
    new Vertex([-halfW, 0, halfD, 1], [0, 1, 0, 0], [1, 0, 0, 1], [0, 1]),

    // -Y face (bottom) — explicit back face so the plane is visible from both sides
    // without relying on the pipeline's cull mode setting.
    new Vertex([halfW, 0, -halfD, 1], [0, -1, 0, 0], [1, 0, 0, 1], [0, 0]),
    new Vertex([-halfW, 0, -halfD, 1], [0, -1, 0, 0], [1, 0, 0, 1], [1, 0]),
    new Vertex([-halfW, 0, halfD, 1], [0, -1, 0, 0], [1, 0, 0, 1], [1, 1]),
    new Vertex([halfW, 0, halfD, 1], [0, -1, 0, 0], [1, 0, 0, 1], [0, 1]),
  ];

  const indices: number[] = [
    0, 3, 2, 2, 1, 0,
    4, 7, 6, 6, 5, 4,
  ];

  return new Geometry(device, vertices, indices);
}
