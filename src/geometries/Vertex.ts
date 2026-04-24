import { GpuFloats, byteSize } from "../utils";

const OFFSET_POSITION  = 0;
const OFFSET_NORMAL    = OFFSET_POSITION  + GpuFloats.vec4;
const OFFSET_TANGENT   = OFFSET_NORMAL    + GpuFloats.vec4;
const OFFSET_UV        = OFFSET_TANGENT   + GpuFloats.vec4;
const OFFSET_JOINT_IDX = OFFSET_UV        + GpuFloats.vec2;
const OFFSET_JOINT_WGT = OFFSET_JOINT_IDX + GpuFloats.vec4;

export const VERTEX_FLOAT_COUNT = OFFSET_JOINT_WGT + GpuFloats.vec4;
export const VERTEX_BYTE_SIZE   = byteSize(VERTEX_FLOAT_COUNT);

export class Vertex {
  public position: [number, number, number, number];
  public normal: [number, number, number, number];
  public tangent: [number, number, number, number];
  public uv: [number, number];
  public jointIndices: [number, number, number, number];
  public jointWeights: [number, number, number, number];

  constructor(
    position: [number, number, number, number] = [0, 0, 0, 1],
    normal: [number, number, number, number] = [0, 0, 0, 0],
    tangent: [number, number, number, number] = [1, 0, 0, 1],
    uv: [number, number] = [0, 0],
    jointIndices: [number, number, number, number] = [0, 0, 0, 0],
    jointWeights: [number, number, number, number] = [0, 0, 0, 0],
  ) {
    this.position = position;
    this.normal = normal;
    this.tangent = tangent;
    this.uv = uv;
    this.jointIndices = jointIndices;
    this.jointWeights = jointWeights;
  }

  toArray(): number[] {
    return [
      ...this.position,
      ...this.normal,
      ...this.tangent,
      ...this.uv,
      ...this.jointIndices,
      ...this.jointWeights,
    ];
  }

  static getBufferLayout(): GPUVertexBufferLayout {
    return {
      arrayStride: VERTEX_BYTE_SIZE,
      stepMode: "vertex",
      attributes: [
        { shaderLocation: 0, offset: byteSize(OFFSET_POSITION),  format: "float32x4" },
        { shaderLocation: 1, offset: byteSize(OFFSET_NORMAL),    format: "float32x4" },
        { shaderLocation: 5, offset: byteSize(OFFSET_TANGENT),   format: "float32x4" },
        { shaderLocation: 2, offset: byteSize(OFFSET_UV),        format: "float32x2" },
        { shaderLocation: 3, offset: byteSize(OFFSET_JOINT_IDX), format: "float32x4" },
        { shaderLocation: 4, offset: byteSize(OFFSET_JOINT_WGT), format: "float32x4" },
      ],
    };
  }
}
