import { Mesh } from "../mesh";
import { Geometry } from "../geometries";
import { MaterialBase } from "../materials";

export const INSTANCE_STRIDE = 112; // 64 (mat4) + 4 (u32) + 32 (2x vec4) + 12 (padding)

export function getInstanceBufferLayout(): GPUVertexBufferLayout {
  return {
    arrayStride: INSTANCE_STRIDE,
    stepMode: "instance",
    attributes: [
      // Model matrix row 0
      {
        shaderLocation: 6,
        offset: 0,
        format: "float32x4",
      },
      // Model matrix row 1
      {
        shaderLocation: 7,
        offset: 16,
        format: "float32x4",
      },
      // Model matrix row 2
      {
        shaderLocation: 8,
        offset: 32,
        format: "float32x4",
      },
      // Model matrix row 3
      {
        shaderLocation: 9,
        offset: 48,
        format: "float32x4",
      },
      // Billboard axis
      {
        shaderLocation: 10,
        offset: 64,
        format: "uint32",
      },
      // Custom data 0
      {
        shaderLocation: 11,
        offset: 68,
        format: "float32x4",
      },
      // Custom data 1
      {
        shaderLocation: 12,
        offset: 84,
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
  instanceBufferData: ArrayBuffer;
  instanceCount: number = 0;

  constructor(id: string, geometry: Geometry, material: MaterialBase) {
    this.id = id;
    this.geometry = geometry;
    this.material = material;
    this.instanceBufferData = new ArrayBuffer(0);
  }

  addMesh(mesh: Mesh): void {
    this.meshes.push(mesh);
  }

  destroy(): void {
    this.instanceBuffer?.destroy();
  }
}
