import { Geometry } from "./Geometry";
import { Vertex } from "./Vertex";

export function createPlaneGeometry(device: GPUDevice, width = 10, height = 10): Geometry {
  const halfW = width / 2;
  const halfH = height / 2;
  
  const vertices: Vertex[] = [
    new Vertex([-halfW, 0, -halfH, 1], [0, 1, 0, 0], [0, 0]),
    new Vertex([halfW, 0, -halfH, 1], [0, 1, 0, 0], [1, 0]),
    new Vertex([halfW, 0, halfH, 1], [0, 1, 0, 0], [1, 1]),
    new Vertex([-halfW, 0, halfH, 1], [0, 1, 0, 0], [0, 1]),
  ];

  const indices: number[] = [
    0, 1, 2,
    2, 3, 0,
  ];

  return new Geometry(device, vertices, indices);
}
