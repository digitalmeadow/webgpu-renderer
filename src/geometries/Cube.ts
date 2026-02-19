import { Geometry } from "./Geometry";
import { Vertex } from "./Vertex";

export function createCubeGeometry(device: GPUDevice): Geometry {
  // 24 vertices (4 per face x 6 faces), flat shaded
  // Each face has its own normals to ensure flat shading
  const vertices: Vertex[] = [
    // Front face (z = 1), normal (0, 0, 1)
    new Vertex([-1, -1, 1, 1], [0, 0, 1, 0], [0, 0]), // 0
    new Vertex([1, -1, 1, 1], [0, 0, 1, 0], [1, 0]), // 1
    new Vertex([1, 1, 1, 1], [0, 0, 1, 0], [1, 1]), // 2
    new Vertex([-1, 1, 1, 1], [0, 0, 1, 0], [0, 1]), // 3

    // Back face (z = -1), normal (0, 0, -1)
    new Vertex([1, -1, -1, 1], [0, 0, -1, 0], [0, 0]), // 4
    new Vertex([-1, -1, -1, 1], [0, 0, -1, 0], [1, 0]), // 5
    new Vertex([-1, 1, -1, 1], [0, 0, -1, 0], [1, 1]), // 6
    new Vertex([1, 1, -1, 1], [0, 0, -1, 0], [0, 1]), // 7

    // Top face (y = 1), normal (0, 1, 0)
    new Vertex([-1, 1, 1, 1], [0, 1, 0, 0], [0, 0]), // 8
    new Vertex([1, 1, 1, 1], [0, 1, 0, 0], [1, 0]), // 9
    new Vertex([1, 1, -1, 1], [0, 1, 0, 0], [1, 1]), // 10
    new Vertex([-1, 1, -1, 1], [0, 1, 0, 0], [0, 1]), // 11

    // Bottom face (y = -1), normal (0, -1, 0)
    new Vertex([-1, -1, -1, 1], [0, -1, 0, 0], [0, 0]), // 12
    new Vertex([1, -1, -1, 1], [0, -1, 0, 0], [1, 0]), // 13
    new Vertex([1, -1, 1, 1], [0, -1, 0, 0], [1, 1]), // 14
    new Vertex([-1, -1, 1, 1], [0, -1, 0, 0], [0, 1]), // 15

    // Right face (x = 1), normal (1, 0, 0)
    new Vertex([1, -1, 1, 1], [1, 0, 0, 0], [0, 0]), // 16
    new Vertex([1, -1, -1, 1], [1, 0, 0, 0], [1, 0]), // 17
    new Vertex([1, 1, -1, 1], [1, 0, 0, 0], [1, 1]), // 18
    new Vertex([1, 1, 1, 1], [1, 0, 0, 0], [0, 1]), // 19

    // Left face (x = -1), normal (-1, 0, 0)
    new Vertex([-1, -1, -1, 1], [-1, 0, 0, 0], [0, 0]), // 20
    new Vertex([-1, -1, 1, 1], [-1, 0, 0, 0], [1, 0]), // 21
    new Vertex([-1, 1, 1, 1], [-1, 0, 0, 0], [1, 1]), // 22
    new Vertex([-1, 1, -1, 1], [-1, 0, 0, 0], [0, 1]), // 23
  ];

  const indices: number[] = [
    0,
    1,
    2,
    2,
    3,
    0, // front
    4,
    5,
    6,
    6,
    7,
    4, // back
    8,
    9,
    10,
    10,
    11,
    8, // top
    12,
    13,
    14,
    14,
    15,
    12, // bottom
    16,
    17,
    18,
    18,
    19,
    16, // right
    20,
    21,
    22,
    22,
    23,
    20, // left
  ];

  return new Geometry(device, vertices, indices);
}
