import { Mat4 } from "../math";
import { MAX_JOINTS } from "../skinning";
import { GpuFloats, floatByteSize, alignVec4 } from "../utils";

const OFFSET_MODEL_MATRIX = 0;
const OFFSET_JOINT_MATRICES = OFFSET_MODEL_MATRIX + GpuFloats.mat4;
const OFFSET_APPLY_SKINNING =
  OFFSET_JOINT_MATRICES + GpuFloats.mat4 * MAX_JOINTS;
const OFFSET_BILLBOARD_AXIS = OFFSET_APPLY_SKINNING + 1; // packed in same vec4

const FLOAT_COUNT = alignVec4(OFFSET_BILLBOARD_AXIS + 1);
const BUFFER_SIZE = floatByteSize(FLOAT_COUNT);

let _meshBindGroupLayout: GPUBindGroupLayout | null = null;

export function createMeshBindGroupLayout(
  device: GPUDevice,
): GPUBindGroupLayout {
  if (!_meshBindGroupLayout) {
    _meshBindGroupLayout = device.createBindGroupLayout({
      label: "Mesh Uniforms Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });
  }
  return _meshBindGroupLayout;
}

export class MeshUniforms {
  readonly buffer: GPUBuffer;
  readonly bindGroup: GPUBindGroup;
  readonly bindGroupLayout: GPUBindGroupLayout;

  private uniformData = new Float32Array(FLOAT_COUNT);
  // Separate typed array for the u32 fields — Float32Array can't represent them faithfully
  private skinningData = new Uint32Array(2);

  constructor(device: GPUDevice, name: string) {
    this.buffer = device.createBuffer({
      label: `Mesh Uniforms Buffer: ${name}`,
      size: BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroupLayout = createMeshBindGroupLayout(device);

    this.bindGroup = device.createBindGroup({
      label: `Mesh Uniforms Bind Group: ${name}`,
      layout: this.bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.buffer } }],
    });
  }

  update(
    device: GPUDevice,
    modelMatrix: Mat4,
    billboardAxis: number = 0,
  ): void {
    this.uniformData.set(modelMatrix.data, OFFSET_MODEL_MATRIX);
    device.queue.writeBuffer(
      this.buffer,
      0,
      this.uniformData,
      OFFSET_MODEL_MATRIX,
      GpuFloats.mat4,
    );

    // applySkinning and billboardAxis are u32; write as raw bytes at their offsets
    this.skinningData[0] = this.skinningData[0]; // preserve applySkinning
    this.skinningData[1] = billboardAxis;
    device.queue.writeBuffer(
      this.buffer,
      floatByteSize(OFFSET_APPLY_SKINNING),
      this.skinningData,
    );
  }

  updateJointMatrices(
    device: GPUDevice,
    matrices: Mat4[],
    count: number,
  ): void {
    const n = Math.min(count, MAX_JOINTS);
    for (let i = 0; i < n; i++) {
      this.uniformData.set(
        matrices[i].data,
        OFFSET_JOINT_MATRICES + i * GpuFloats.mat4,
      );
    }
    device.queue.writeBuffer(
      this.buffer,
      floatByteSize(OFFSET_JOINT_MATRICES),
      this.uniformData,
      OFFSET_JOINT_MATRICES,
      n * GpuFloats.mat4,
    );
  }

  setApplySkinning(device: GPUDevice, value: boolean): void {
    this.skinningData[0] = value ? 1 : 0;
    device.queue.writeBuffer(
      this.buffer,
      floatByteSize(OFFSET_APPLY_SKINNING),
      this.skinningData,
    );
  }
}
