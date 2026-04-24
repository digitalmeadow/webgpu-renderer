import { GpuFloats, byteSize } from "../utils";

const OFFSET_POSITION = 0;
const OFFSET_NORMAL   = OFFSET_POSITION + GpuFloats.vec4;
const OFFSET_UV       = OFFSET_NORMAL   + GpuFloats.vec4;

export const VERTEX_PARTICLE_FLOAT_COUNT = OFFSET_UV + GpuFloats.vec2;
export const VERTEX_PARTICLE_BYTE_SIZE   = byteSize(VERTEX_PARTICLE_FLOAT_COUNT);

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

  toArray(): number[] {
    return [...this.position, ...this.normal, ...this.uv];
  }

  static getBufferLayout(): GPUVertexBufferLayout {
    return {
      arrayStride: VERTEX_PARTICLE_BYTE_SIZE,
      stepMode: "vertex",
      attributes: [
        { shaderLocation: 0, offset: byteSize(OFFSET_POSITION), format: "float32x4" },
        { shaderLocation: 1, offset: byteSize(OFFSET_NORMAL),   format: "float32x4" },
        { shaderLocation: 2, offset: byteSize(OFFSET_UV),       format: "float32x2" },
      ],
    };
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
