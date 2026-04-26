import { GpuFloats, floatByteSize } from "../utils";

const OFFSET_POSITION = 0;
const OFFSET_UV = OFFSET_POSITION + GpuFloats.vec4;

export const VERTEX_PARTICLE_FLOAT_COUNT = OFFSET_UV + GpuFloats.vec2;
export const VERTEX_PARTICLE_BYTE_SIZE = floatByteSize(VERTEX_PARTICLE_FLOAT_COUNT);

// Pre-computed quad vertices: position (vec4), uv (vec2)
export const PARTICLE_QUAD_VERTEX_DATA = new Float32Array([
  // v0: bottom-left
  -0.5, -0.5, 0.0, 1.0, 0, 0,
  // v1: bottom-right
  0.5, -0.5, 0.0, 1.0, 1, 0,
  // v2: top-right
  0.5, 0.5, 0.0, 1.0, 1, 1,
  // v3: top-left
  -0.5, 0.5, 0.0, 1.0, 0, 1,
]);

export const PARTICLE_QUAD_INDEX_DATA = new Uint32Array([0, 1, 2, 0, 2, 3]);

export function getParticleVertexBufferLayout(): GPUVertexBufferLayout {
  return {
    arrayStride: VERTEX_PARTICLE_BYTE_SIZE,
    stepMode: "vertex",
    attributes: [
      {
        shaderLocation: 0,
        offset: floatByteSize(OFFSET_POSITION),
        format: "float32x4",
      },
      { shaderLocation: 1, offset: floatByteSize(OFFSET_UV), format: "float32x2" },
    ],
  };
}
