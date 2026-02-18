export class Vertex {
  public position: [number, number, number, number];
  public normal: [number, number, number, number];
  public uv: [number, number];

  constructor(
    position: [number, number, number, number] = [0, 0, 0, 1],
    normal: [number, number, number, number] = [0, 0, 0, 0],
    uv: [number, number] = [0, 0],
  ) {
    this.position = position;
    this.normal = normal;
    this.uv = uv;
  }

  static get vertexSize(): number {
    // position (4) + normal (4) + uv (2)
    return (4 + 4 + 2) * 4;
  }

  toArray(): number[] {
    return [...this.position, ...this.normal, ...this.uv];
  }

  static getBufferLayout(): GPUVertexBufferLayout {
    return {
      arrayStride: Vertex.vertexSize,
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
