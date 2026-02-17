export class GeometryBuffer {
  positionTexture: GPUTexture;
  positionView: GPUTextureView;
  normalTexture: GPUTexture;
  normalView: GPUTextureView;
  depthTexture: GPUTexture;
  depthView: GPUTextureView;
  sampler: GPUSampler;
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: GPUBindGroup;

  constructor(device: GPUDevice, width: number, height: number) {
    this.positionTexture = device.createTexture({
      label: "G-Buffer Position Texture",
      size: [width, height],
      format: "rgba32float",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.positionView = this.positionTexture.createView();

    this.normalTexture = device.createTexture({
      label: "G-Buffer Normal Texture",
      size: [width, height],
      format: "rgba32float",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.normalView = this.normalTexture.createView();

    this.depthTexture = device.createTexture({
      label: "G-Buffer Depth Texture",
      size: [width, height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthView = this.depthTexture.createView();

    this.sampler = device.createSampler({
      label: "G-Buffer Sampler",
      magFilter: "nearest",
      minFilter: "nearest",
      mipmapFilter: "nearest",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      label: "G-Buffer Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "unfilterable-float" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "unfilterable-float" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "non-filtering" },
        },
      ],
    });

    this.bindGroup = device.createBindGroup({
      label: "G-Buffer Bind Group",
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: this.positionView,
        },
        {
          binding: 1,
          resource: this.normalView,
        },
        {
          binding: 2,
          resource: this.sampler,
        },
      ],
    });
  }

  resize(device: GPUDevice, width: number, height: number): void {
    this.positionTexture.destroy();
    this.normalTexture.destroy();
    this.depthTexture.destroy();

    this.positionTexture = device.createTexture({
      label: "G-Buffer Position Texture",
      size: [width, height],
      format: "rgba32float",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.positionView = this.positionTexture.createView();

    this.normalTexture = device.createTexture({
      label: "G-Buffer Normal Texture",
      size: [width, height],
      format: "rgba32float",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.normalView = this.normalTexture.createView();

    this.depthTexture = device.createTexture({
      label: "G-Buffer Depth Texture",
      size: [width, height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthView = this.depthTexture.createView();

    this.bindGroup = device.createBindGroup({
      label: "G-Buffer Bind Group",
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: this.positionView,
        },
        {
          binding: 1,
          resource: this.normalView,
        },
        {
          binding: 2,
          resource: this.sampler,
        },
      ],
    });
  }
}
