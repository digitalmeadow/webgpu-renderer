export const CONTEXT_BUFFER_SIZE = 256;

export class ContextBuffer {
  public buffer: GPUBuffer;
  public bindGroup: GPUBindGroup;
  public bindGroupLayout: GPUBindGroupLayout;

  constructor(
    device: GPUDevice,
    renderWidth: number = 1920,
    renderHeight: number = 1080,
  ) {
    this.buffer = device.createBuffer({
      label: "Context Uniforms Buffer",
      size: CONTEXT_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      label: "Context Uniform Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.bindGroup = device.createBindGroup({
      label: "Context Uniform Bind Group",
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.buffer },
        },
      ],
    });

    this.updateSize(device, renderWidth, renderHeight, renderWidth, renderHeight);
  }

  update(device: GPUDevice, timeDuration: number, timeDelta: number): void {
    const data = new Float32Array([timeDuration, timeDelta]);
    device.queue.writeBuffer(this.buffer, 0, data);
  }

  updateSize(device: GPUDevice, screenWidth: number, screenHeight: number, renderWidth: number, renderHeight: number): void {
    const data = new Float32Array([screenWidth, screenHeight, renderWidth, renderHeight]);
    device.queue.writeBuffer(this.buffer, 8, data);
  }
}
