/** Float counts for WGSL primitive types */
export const GpuFloats = {
  f32: 1,
  vec2: 2,
  /** Data size — correct for vertex buffers and vec3+f32 packing into a vec4 slot.
   *  For a standalone vec3 in a std140 uniform struct, use vec3Padded instead. */
  vec3: 3,
  /** std140 slot count for a standalone vec3 field — padded to vec4 alignment */
  vec3Padded: 4,
  vec4: 4,
  mat2: 4,
  mat3: 9,
  mat4: 16,
} as const;

/** Int counts for WGSL integer primitive types */
export const GpuInts = {
  u32: 1,
  uvec2: 2,
  uvec3: 3,
  uvec4: 4,
} as const;

/** Float count → byte size */
export function floatByteSize(floats: number): number {
  return floats * Float32Array.BYTES_PER_ELEMENT;
}

/** Int count → byte size */
export function intByteSize(ints: number): number {
  return ints * Uint32Array.BYTES_PER_ELEMENT;
}

/** Align float count up to the next vec4 boundary (std140) */
export function alignVec4(floats: number): number {
  return Math.ceil(floats / GpuFloats.vec4) * GpuFloats.vec4;
}
