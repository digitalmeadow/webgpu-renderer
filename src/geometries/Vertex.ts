export class Vertex {
  public position: [number, number, number, number];
  public normal: [number, number, number, number];
  public uv: [number, number];
  public jointIndices: [number, number, number, number];
  public jointWeights: [number, number, number, number];

  constructor(
    position: [number, number, number, number] = [0, 0, 0, 1],
    normal: [number, number, number, number] = [0, 0, 0, 0],
    uv: [number, number] = [0, 0],
    jointIndices: [number, number, number, number] = [0, 0, 0, 0],
    jointWeights: [number, number, number, number] = [0, 0, 0, 0],
  ) {
    this.position = position;
    this.normal = normal;
    this.uv = uv;
    this.jointIndices = jointIndices;
    this.jointWeights = jointWeights;
  }

  static get vertexSize(): number {
    return (4 + 4 + 2 + 4 + 4) * 4;
  }

  toArray(): number[] {
    return [
      ...this.position,
      ...this.normal,
      ...this.uv,
      ...this.jointIndices,
      ...this.jointWeights,
    ];
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
        {
          shaderLocation: 3,
          offset: 40,
          format: "float32x4",
        },
        {
          shaderLocation: 4,
          offset: 56,
          format: "float32x4",
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
    @location(3) joint_indices: vec4<f32>,
    @location(4) joint_weights: vec4<f32>,
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
