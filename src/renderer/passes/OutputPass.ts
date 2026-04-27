import shader from "./OutputPass.wgsl?raw";

const _layouts = new Map<GPUSamplerBindingType, GPUBindGroupLayout>();

export function createOutputPassBindGroupLayout(
  device: GPUDevice,
  samplerType: GPUSamplerBindingType,
): GPUBindGroupLayout {
  const cached = _layouts.get(samplerType);
  if (cached) return cached;

  const layout = device.createBindGroupLayout({
    label: "Output Pass Bind Group Layout",
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: samplerType },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: "float", viewDimension: "2d" },
      },
    ],
  });

  _layouts.set(samplerType, layout);
  return layout;
}

export class OutputPass {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private bindGroupLayout: GPUBindGroupLayout;
  private sampler: GPUSampler;
  private bindGroup: GPUBindGroup | null = null;
  private lastInputView: GPUTextureView | null = null;

  constructor(
    device: GPUDevice,
    format: GPUTextureFormat,
    filterMode: "nearest" | "linear" = "nearest",
  ) {
    this.device = device;

    const samplerType: GPUSamplerBindingType =
      filterMode === "linear" ? "filtering" : "non-filtering";

    this.sampler = device.createSampler({
      label: "Output Pass Sampler",
      magFilter: filterMode,
      minFilter: filterMode,
    });

    this.bindGroupLayout = createOutputPassBindGroupLayout(device, samplerType);

    const shaderModule = device.createShaderModule({
      label: "Output Pass Shader",
      code: shader,
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
        targets: [{ format }],
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
    if (this.bindGroup === null || this.lastInputView !== inputView) {
      this.bindGroup = this.device.createBindGroup({
        label: "Output Pass Bind Group",
        layout: this.bindGroupLayout,
        entries: [
          { binding: 0, resource: this.sampler },
          { binding: 1, resource: inputView },
        ],
      });
      this.lastInputView = inputView;
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
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }
}
