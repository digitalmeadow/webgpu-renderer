/** Float counts for WGSL primitive types */
export const GpuFloats = {
  f32: 1,
  vec2: 2,
  vec3: 3,
  vec4: 4,
  mat4: 16,
} as const;

/** Float count → byte size */
export function byteSize(floats: number): number {
  return floats * Float32Array.BYTES_PER_ELEMENT;
}

/** Align float count up to the next vec4 boundary (std140) */
export function alignVec4(floats: number): number {
  return Math.ceil(floats / GpuFloats.vec4) * GpuFloats.vec4;
}
