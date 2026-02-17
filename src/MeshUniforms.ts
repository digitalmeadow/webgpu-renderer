import { Mat4 } from "./math/mat4";

export class MeshUniforms {
  buffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  bindGroupLayout: GPUBindGroupLayout;
  modelMatrix: Mat4;

  constructor(device: GPUDevice) {
    this.modelMatrix = Mat4.create();

    this.buffer = device.createBuffer({
      label: "Mesh Uniforms Buffer",
      size: 64,
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
}
