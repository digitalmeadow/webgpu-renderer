import { GpuFloats, floatByteSize } from "../utils";

// Instance buffer layout (per particle):
const OFFSET_POSITION = 0;
const OFFSET_SCALE = OFFSET_POSITION + GpuFloats.vec3;
const OFFSET_ROTATION = OFFSET_SCALE + GpuFloats.f32;
const OFFSET_ATLAS_REGION = OFFSET_ROTATION + GpuFloats.vec4;
const OFFSET_GRADIENT_MAP = OFFSET_ATLAS_REGION + 1; // u32
const OFFSET_ALPHA = OFFSET_GRADIENT_MAP + 1; // u32
const OFFSET_BILLBOARD = OFFSET_ALPHA + GpuFloats.f32;
const OFFSET_FRAME_LERP = OFFSET_BILLBOARD + 1; // u32

export const PARTICLE_INSTANCE_FLOAT_COUNT = OFFSET_FRAME_LERP + GpuFloats.f32;
export const PARTICLE_INSTANCE_STRIDE = floatByteSize(PARTICLE_INSTANCE_FLOAT_COUNT);

export function getParticleInstanceBufferLayout(): GPUVertexBufferLayout {
  return {
    arrayStride: PARTICLE_INSTANCE_STRIDE,
    stepMode: "instance",
    attributes: [
      {
        shaderLocation: 3,
        offset: floatByteSize(OFFSET_POSITION),
        format: "float32x3",
      },
      {
        shaderLocation: 4,
        offset: floatByteSize(OFFSET_SCALE),
        format: "float32",
      },
      {
        shaderLocation: 5,
        offset: floatByteSize(OFFSET_ROTATION),
        format: "float32x4",
      },
      {
        shaderLocation: 6,
        offset: floatByteSize(OFFSET_ATLAS_REGION),
        format: "uint32",
      },
      {
        shaderLocation: 7,
        offset: floatByteSize(OFFSET_GRADIENT_MAP),
        format: "uint32",
      },
      {
        shaderLocation: 8,
        offset: floatByteSize(OFFSET_ALPHA),
        format: "float32",
      },
      {
        shaderLocation: 9,
        offset: floatByteSize(OFFSET_BILLBOARD),
        format: "uint32",
      },
      {
        shaderLocation: 10,
        offset: floatByteSize(OFFSET_FRAME_LERP),
        format: "float32",
      },
    ],
  };
}
