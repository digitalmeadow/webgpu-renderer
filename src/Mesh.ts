import { MeshUniforms } from "./MeshUniforms";
import { BaseMaterial } from "./materials/BaseMaterial";
import { Entity } from "./Entity";

export class Vertex {
  static getBufferLayout(): GPUVertexBufferLayout {
    return {
      arrayStride: 40,
      stepMode: "vertex",
      attributes: [
        {
          shaderLocation: 0,
          offset: 0,
          format: "float32x4",
        },
        {
          shaderLocation: 1,
          offset: 16,
          format: "float32x4",
        },
        {
          shaderLocation: 2,
          offset: 32,
          format: "float32x2",
        },
      ],
    };
  }

  static getShaderAttributes(): string {
    return `
struct VertexInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) uv_coords: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) vertex_position: vec4<f32>,
    @location(1) vertex_normal: vec4<f32>,
    @location(2) uv_coords: vec2<f32>,
};
`;
  }
}

export abstract class Mesh extends Entity {
  abstract vertexCount: number;
  abstract indexCount: number;
  abstract vertexBuffer: GPUBuffer;
  abstract indexBuffer: GPUBuffer;

  uniforms: MeshUniforms | null = null;
  material: BaseMaterial | null = null;
}

export class Plane extends Mesh {
  vertexCount = 4;
  indexCount = 6;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;

  constructor(device: GPUDevice) {
    super("Plane");
    this.uniforms = new MeshUniforms(device);

    const vertices: number[] = [
      -1,
      -1,
      0,
      1,
      0,
      0,
      1,
      0,
      0,
      0, // vertex 0: pos, normal, uv
      1,
      -1,
      0,
      1,
      0,
      0,
      1,
      0,
      1,
      0, // vertex 1
      1,
      1,
      0,
      1,
      0,
      0,
      1,
      0,
      1,
      1, // vertex 2
      -1,
      1,
      0,
      1,
      0,
      0,
      1,
      0,
      0,
      1, // vertex 3
    ];

    const indices: number[] = [0, 1, 2, 2, 3, 0];

    this.vertexBuffer = device.createBuffer({
      size: vertices.length * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.indexBuffer = device.createBuffer({
      size: indices.length * 4,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(this.vertexBuffer, 0, new Float32Array(vertices));
    device.queue.writeBuffer(this.indexBuffer, 0, new Uint32Array(indices));
  }
}

export class Triangle extends Mesh {
  vertexCount = 3;
  indexCount = 3;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;

  constructor(device: GPUDevice) {
    super("Triangle");
    this.uniforms = new MeshUniforms(device);

    const vertices: number[] = [
      -0.5,
      -0.5,
      0,
      1,
      1,
      0,
      0,
      1,
      0,
      0, // vertex 0: pos, normal, uv
      0.5,
      -0.5,
      0,
      1,
      0,
      1,
      0,
      1,
      0,
      0, // vertex 1
      0,
      0.5,
      0,
      1,
      0,
      0,
      1,
      1,
      0,
      0, // vertex 2
    ];

    const indices: number[] = [0, 1, 2];

    this.vertexBuffer = device.createBuffer({
      size: vertices.length * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.indexBuffer = device.createBuffer({
      size: indices.length * 4,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(this.vertexBuffer, 0, new Float32Array(vertices));
    device.queue.writeBuffer(this.indexBuffer, 0, new Uint32Array(indices));
  }
}

export class Cube extends Mesh {
  vertexCount = 24;
  indexCount = 36;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;

  constructor(device: GPUDevice) {
    super("Cube");
    this.uniforms = new MeshUniforms(device);

    // 24 vertices (4 per face x 6 faces), flat shaded
    // Each face has its own normals to ensure flat shading
    const vertices: number[] = [
      // Front face (z = 1), normal (0, 0, 1)
      -1,
      -1,
      1,
      1,
      0,
      0,
      1,
      0,
      0,
      0, // 0
      1,
      -1,
      1,
      1,
      0,
      0,
      1,
      0,
      1,
      0, // 1
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      0,
      1,
      1, // 2
      -1,
      1,
      1,
      1,
      0,
      0,
      1,
      0,
      0,
      1, // 3

      // Back face (z = -1), normal (0, 0, -1)
      1,
      -1,
      -1,
      1,
      0,
      0,
      -1,
      0,
      0,
      0, // 4
      -1,
      -1,
      -1,
      1,
      0,
      0,
      -1,
      0,
      1,
      0, // 5
      -1,
      1,
      -1,
      1,
      0,
      0,
      -1,
      0,
      1,
      1, // 6
      1,
      1,
      -1,
      1,
      0,
      0,
      -1,
      0,
      0,
      1, // 7

      // Top face (y = 1), normal (0, 1, 0)
      -1,
      1,
      1,
      1,
      0,
      1,
      0,
      0,
      0,
      0, // 8
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      0,
      1,
      0, // 9
      1,
      1,
      -1,
      1,
      0,
      1,
      0,
      0,
      1,
      1, // 10
      -1,
      1,
      -1,
      1,
      0,
      1,
      0,
      0,
      0,
      1, // 11

      // Bottom face (y = -1), normal (0, -1, 0)
      -1,
      -1,
      -1,
      1,
      0,
      -1,
      0,
      0,
      0,
      0, // 12
      1,
      -1,
      -1,
      1,
      0,
      -1,
      0,
      0,
      1,
      0, // 13
      1,
      -1,
      1,
      1,
      0,
      -1,
      0,
      0,
      1,
      1, // 14
      -1,
      -1,
      1,
      1,
      0,
      -1,
      0,
      0,
      0,
      1, // 15

      // Right face (x = 1), normal (1, 0, 0)
      1,
      -1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0, // 16
      1,
      -1,
      -1,
      1,
      1,
      0,
      0,
      0,
      1,
      0, // 17
      1,
      1,
      -1,
      1,
      1,
      0,
      0,
      0,
      1,
      1, // 18
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      1, // 19

      // Left face (x = -1), normal (-1, 0, 0)
      -1,
      -1,
      -1,
      1,
      -1,
      0,
      0,
      0,
      0,
      0, // 20
      -1,
      -1,
      1,
      1,
      -1,
      0,
      0,
      0,
      1,
      0, // 21
      -1,
      1,
      1,
      1,
      -1,
      0,
      0,
      0,
      1,
      1, // 22
      -1,
      1,
      -1,
      1,
      -1,
      0,
      0,
      0,
      0,
      1, // 23
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

    this.vertexBuffer = device.createBuffer({
      size: vertices.length * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    this.indexBuffer = device.createBuffer({
      size: indices.length * 4,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(this.vertexBuffer, 0, new Float32Array(vertices));
    device.queue.writeBuffer(this.indexBuffer, 0, new Uint32Array(indices));
  }
}
