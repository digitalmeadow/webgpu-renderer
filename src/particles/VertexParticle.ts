export class VertexParticle {
  public position: [number, number, number, number];
  public normal: [number, number, number, number];
  public uv: [number, number];

  constructor(
    position: [number, number, number, number] = [0, 0, 0, 1],
    normal: [number, number, number, number] = [0, 0, 1, 0],
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
      arrayStride: VertexParticle.vertexSize,
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
struct VertexParticleInput {
    @location(0) position: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) uv_coords: vec2<f32>,
};
`;
  }

  static createQuad(): VertexParticle[] {
    return [
      new VertexParticle([-0.5, -0.5, 0.0, 1.0], [0, 0, 1, 0], [0, 0]),
      new VertexParticle([0.5, -0.5, 0.0, 1.0], [0, 0, 1, 0], [1, 0]),
      new VertexParticle([0.5, 0.5, 0.0, 1.0], [0, 0, 1, 0], [1, 1]),
      new VertexParticle([-0.5, 0.5, 0.0, 1.0], [0, 0, 1, 0], [0, 1]),
    ];
  }

  static getIndexArray(): Uint32Array {
    return new Uint32Array([0, 1, 2, 0, 2, 3]);
  }
}
