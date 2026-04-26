import { Mesh } from "../mesh";
import { Geometry } from "../geometries";
import { MaterialBase } from "../materials";
import { GpuFloats, byteSize, alignVec4 } from "../utils";

// Model matrix split into vec4 since WebGPU vertex attributes can't be mat4 — they must be 4 separate vec4 attributes
const OFFSET_MATRIX_ROW0 = 0;
const OFFSET_MATRIX_ROW1 = OFFSET_MATRIX_ROW0 + GpuFloats.vec4;
const OFFSET_MATRIX_ROW2 = OFFSET_MATRIX_ROW1 + GpuFloats.vec4;
const OFFSET_MATRIX_ROW3 = OFFSET_MATRIX_ROW2 + GpuFloats.vec4;

// Exported for InstanceGroupManager writes and getInstanceBufferLayout
export const OFFSET_MATRIX = OFFSET_MATRIX_ROW0;
export const OFFSET_BILLBOARD = OFFSET_MATRIX + GpuFloats.mat4; // uint32, same word size as f32
export const OFFSET_CUSTOM_DATA0 = OFFSET_BILLBOARD + 1;
export const OFFSET_CUSTOM_DATA1 = OFFSET_CUSTOM_DATA0 + GpuFloats.vec4;

export const FLOAT_COUNT = alignVec4(OFFSET_CUSTOM_DATA1 + GpuFloats.vec4);
export const INSTANCE_STRIDE = byteSize(FLOAT_COUNT);

export function getInstanceBufferLayout(): GPUVertexBufferLayout {
  return {
    arrayStride: INSTANCE_STRIDE,
    stepMode: "instance",
    attributes: [
      {
        shaderLocation: 6,
        offset: byteSize(OFFSET_MATRIX_ROW0),
        format: "float32x4",
      },
      {
        shaderLocation: 7,
        offset: byteSize(OFFSET_MATRIX_ROW1),
        format: "float32x4",
      },
      {
        shaderLocation: 8,
        offset: byteSize(OFFSET_MATRIX_ROW2),
        format: "float32x4",
      },
      {
        shaderLocation: 9,
        offset: byteSize(OFFSET_MATRIX_ROW3),
        format: "float32x4",
      },
      {
        shaderLocation: 10,
        offset: byteSize(OFFSET_BILLBOARD),
        format: "uint32",
      },
      {
        shaderLocation: 11,
        offset: byteSize(OFFSET_CUSTOM_DATA0),
        format: "float32x4",
      },
      {
        shaderLocation: 12,
        offset: byteSize(OFFSET_CUSTOM_DATA1),
        format: "float32x4",
      },
    ],
  };
}

export class InstanceGroup {
  id: string;
  meshes: Mesh[] = [];
  geometry: Geometry;
  material: MaterialBase;
  instanceBuffer: GPUBuffer | null = null;
  instanceBufferData: Float32Array<ArrayBuffer> | null = null;
  instanceCount: number = 0;
  sortByDepth: boolean = false;

  constructor(id: string, geometry: Geometry, material: MaterialBase) {
    this.id = id;
    this.geometry = geometry;
    this.material = material;
  }

  addMesh(mesh: Mesh): void {
    this.meshes.push(mesh);
  }

  destroy(): void {
    this.instanceBuffer?.destroy();
  }
}
