import shader from "./OutputPass.wgsl?raw";

interface OutputUniforms {
  renderWidth: number;
  renderHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

export class OutputPass {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  private sampler: GPUSampler;
  private uniformsBuffer: GPUBuffer;
  private uniformsBindGroup: GPUBindGroup | null = null;
  private lastRenderWidth: number = 0;
  private lastRenderHeight: number = 0;
  private lastViewportWidth: number = 0;
  private lastViewportHeight: number = 0;

  constructor(device: GPUDevice) {
    this.device = device;
    const shaderModule = device.createShaderModule({
      code: shader,
    });

    this.sampler = device.createSampler({
      magFilter: "nearest",
      minFilter: "nearest",
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      label: "Output Pass Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.uniformsBuffer = device.createBuffer({
      label: "Output Pass Uniforms",
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.pipeline = device.createRenderPipeline({
      label: "Output Pass Pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [
          {
            format: navigator.gpu.getPreferredCanvasFormat(),
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
    });
  }

  render(
    encoder: GPUCommandEncoder,
    inputView: GPUTextureView,
    outputView: GPUTextureView,
    renderWidth: number,
    renderHeight: number,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    if (
      this.uniformsBindGroup === null ||
      this.lastRenderWidth !== renderWidth ||
      this.lastRenderHeight !== renderHeight ||
      this.lastViewportWidth !== viewportWidth ||
      this.lastViewportHeight !== viewportHeight
    ) {
      const uniforms: OutputUniforms = {
        renderWidth,
        renderHeight,
        viewportWidth,
        viewportHeight,
      };
      this.device.queue.writeBuffer(
        this.uniformsBuffer,
        0,
        new Float32Array([
          uniforms.renderWidth,
          uniforms.renderHeight,
          uniforms.viewportWidth,
          uniforms.viewportHeight,
        ]),
      );

      this.uniformsBindGroup = this.device.createBindGroup({
        label: "Output Pass Bind Group",
        layout: this.bindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: this.sampler,
          },
          {
            binding: 1,
            resource: inputView,
          },
          {
            binding: 2,
            resource: { buffer: this.uniformsBuffer },
          },
        ],
      });

      this.lastRenderWidth = renderWidth;
      this.lastRenderHeight = renderHeight;
      this.lastViewportWidth = viewportWidth;
      this.lastViewportHeight = viewportHeight;
    }

    const passEncoder = encoder.beginRenderPass({
      label: "Output Pass",
      colorAttachments: [
        {
          view: outputView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.uniformsBindGroup);
    passEncoder.draw(6);
    passEncoder.end();
  }
}
