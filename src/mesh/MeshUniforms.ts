import { Mat4 } from "../math";
import { MAX_JOINTS } from "../skinning";

export class MeshUniforms {
  buffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  bindGroupLayout: GPUBindGroupLayout;
  modelMatrix: Mat4;
  jointMatrices: Float32Array;
  applySkinning: boolean;

  private jointMatricesData: Float32Array;
  private applySkinningValue: Uint32Array;

  constructor(device: GPUDevice) {
    this.modelMatrix = Mat4.create();
    this.jointMatrices = new Float32Array(MAX_JOINTS * 16);
    this.applySkinning = false;

    this.jointMatricesData = new Float32Array(MAX_JOINTS * 16);
    this.applySkinningValue = new Uint32Array([0]);

    const bufferSize = 64 + MAX_JOINTS * 64 + 16;

    this.buffer = device.createBuffer({
      label: "Mesh Uniforms Buffer",
      size: bufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      label: "Mesh Uniforms Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.bindGroup = device.createBindGroup({
      label: "Mesh Uniforms Bind Group",
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.buffer },
        },
      ],
    });
  }

  update(device: GPUDevice, modelMatrix: Mat4): void {
    device.queue.writeBuffer(this.buffer, 0, modelMatrix.data as any);
  }

  updateJointMatrices(device: GPUDevice, matrices: Mat4[]): void {
    const count = Math.min(matrices.length, MAX_JOINTS);
    for (let i = 0; i < count; i++) {
      this.jointMatricesData.set(matrices[i].data, i * 16);
    }
    device.queue.writeBuffer(
      this.buffer,
      64,
      this.jointMatricesData.subarray(0, count * 16) as any,
    );
  }

  setApplySkinning(device: GPUDevice, value: boolean): void {
    this.applySkinning = value;
    this.applySkinningValue[0] = value ? 1 : 0;
    device.queue.writeBuffer(
      this.buffer,
      64 + MAX_JOINTS * 64,
      this.applySkinningValue.buffer,
    );
  }
}
