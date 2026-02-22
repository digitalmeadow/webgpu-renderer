import shader from "./OutputPass.wgsl?raw";

export class OutputPass {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private debugPipeline: GPURenderPipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  private debugBindGroupLayout: GPUBindGroupLayout;
  private sampler: GPUSampler;

  constructor(device: GPUDevice) {
    this.device = device;
    const shaderModule = device.createShaderModule({
      code: shader,
    });

    this.sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });

    // Main output pass layout (sampler + float texture)
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
      ],
    });

    // Debug depth texture layout (depth texture only, no sampler needed)
    this.debugBindGroupLayout = device.createBindGroupLayout({
      label: "Output Pass Debug Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "depth", viewDimension: "2d" },
        },
      ],
    });

    // Main pipeline for color textures
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

    // Debug pipeline for depth textures (writes depth as color)
    this.debugPipeline = device.createRenderPipeline({
      label: "Output Pass Debug Pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.debugBindGroupLayout],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main_debug_depth",
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
  ): void {
    const bindGroup = this.device.createBindGroup({
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
      ],
    });

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
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }

  renderDebugDepth(
    encoder: GPUCommandEncoder,
    depthView: GPUTextureView,
    outputView: GPUTextureView,
  ): void {
    const debugBindGroup = this.device.createBindGroup({
      layout: this.debugBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: depthView,
        },
      ],
    });

    const passEncoder = encoder.beginRenderPass({
      label: "Output Pass Debug Depth",
      colorAttachments: [
        {
          view: outputView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    passEncoder.setPipeline(this.debugPipeline);
    passEncoder.setBindGroup(0, debugBindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }
}
