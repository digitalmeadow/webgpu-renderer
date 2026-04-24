import { Geometry } from "./Geometry";
import { Vertex } from "./Vertex";

export function createCubeGeometry(device: GPUDevice, size = 1): Geometry {
  const h = size; // half-extent; cube spans [-h, h] on each axis

  const vertices: Vertex[] = [
    // +Z face
    new Vertex([-h, -h, h, 1], [0, 0, 1, 0], [1, 0, 0, 1], [0, 0]),
    new Vertex([h, -h, h, 1], [0, 0, 1, 0], [1, 0, 0, 1], [1, 0]),
    new Vertex([h, h, h, 1], [0, 0, 1, 0], [1, 0, 0, 1], [1, 1]),
    new Vertex([-h, h, h, 1], [0, 0, 1, 0], [1, 0, 0, 1], [0, 1]),

    // -Z face
    new Vertex([h, -h, -h, 1], [0, 0, -1, 0], [-1, 0, 0, 1], [0, 0]),
    new Vertex([-h, -h, -h, 1], [0, 0, -1, 0], [-1, 0, 0, 1], [1, 0]),
    new Vertex([-h, h, -h, 1], [0, 0, -1, 0], [-1, 0, 0, 1], [1, 1]),
    new Vertex([h, h, -h, 1], [0, 0, -1, 0], [-1, 0, 0, 1], [0, 1]),

    // +Y face
    new Vertex([-h, h, h, 1], [0, 1, 0, 0], [1, 0, 0, 1], [0, 0]),
    new Vertex([h, h, h, 1], [0, 1, 0, 0], [1, 0, 0, 1], [1, 0]),
    new Vertex([h, h, -h, 1], [0, 1, 0, 0], [1, 0, 0, 1], [1, 1]),
    new Vertex([-h, h, -h, 1], [0, 1, 0, 0], [1, 0, 0, 1], [0, 1]),

    // -Y face
    new Vertex([-h, -h, -h, 1], [0, -1, 0, 0], [1, 0, 0, 1], [0, 0]),
    new Vertex([h, -h, -h, 1], [0, -1, 0, 0], [1, 0, 0, 1], [1, 0]),
    new Vertex([h, -h, h, 1], [0, -1, 0, 0], [1, 0, 0, 1], [1, 1]),
    new Vertex([-h, -h, h, 1], [0, -1, 0, 0], [1, 0, 0, 1], [0, 1]),

    // +X face
    new Vertex([h, -h, h, 1], [1, 0, 0, 0], [0, 0, -1, 1], [0, 0]),
    new Vertex([h, -h, -h, 1], [1, 0, 0, 0], [0, 0, -1, 1], [1, 0]),
    new Vertex([h, h, -h, 1], [1, 0, 0, 0], [0, 0, -1, 1], [1, 1]),
    new Vertex([h, h, h, 1], [1, 0, 0, 0], [0, 0, -1, 1], [0, 1]),

    // -X face
    new Vertex([-h, -h, -h, 1], [-1, 0, 0, 0], [0, 0, 1, 1], [0, 0]),
    new Vertex([-h, -h, h, 1], [-1, 0, 0, 0], [0, 0, 1, 1], [1, 0]),
    new Vertex([-h, h, h, 1], [-1, 0, 0, 0], [0, 0, 1, 1], [1, 1]),
    new Vertex([-h, h, -h, 1], [-1, 0, 0, 0], [0, 0, 1, 1], [0, 1]),
  ];

  const indices: number[] = [
    0, 1, 2, 2, 3, 0,
    4, 5, 6, 6, 7, 4,
    8, 9, 10, 10, 11, 8,
    12, 13, 14, 14, 15, 12,
    16, 17, 18, 18, 19, 16,
    20, 21, 22, 22, 23, 20,
  ];

  return new Geometry(device, vertices, indices);
}
