export class GeometryBuffer {
  albedoTexture: GPUTexture;
  albedoView: GPUTextureView;
  normalTexture: GPUTexture;
  normalView: GPUTextureView;
  metalRoughnessTexture: GPUTexture;
  metalRoughnessView: GPUTextureView;
  depthTexture: GPUTexture;
  depthView: GPUTextureView;
  sampler: GPUSampler;
  bindGroupLayout: GPUBindGroupLayout;
  bindGroup: GPUBindGroup;

  constructor(device: GPUDevice, width: number, height: number) {
    this.albedoTexture = device.createTexture({
      label: "G-Buffer Albedo Texture",
      size: [width, height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.albedoView = this.albedoTexture.createView();

    this.normalTexture = device.createTexture({
      label: "G-Buffer Normal Texture",
      size: [width, height],
      format: "rgba16float",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.normalView = this.normalTexture.createView();

    this.metalRoughnessTexture = device.createTexture({
      label: "G-Buffer Metal/Roughness Texture",
      size: [width, height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.metalRoughnessView = this.metalRoughnessTexture.createView();

    this.depthTexture = device.createTexture({
      label: "G-Buffer Depth Texture",
      size: [width, height],
      format: "depth32float",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
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
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "depth", viewDimension: "2d" },
        },
      ],
    });

    this.bindGroup = device.createBindGroup({
      label: "G-Buffer Bind Group",
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: this.sampler,
        },
        {
          binding: 1,
          resource: this.albedoView,
        },
        {
          binding: 2,
          resource: this.normalView,
        },
        {
          binding: 3,
          resource: this.metalRoughnessView,
        },
        {
          binding: 4,
          resource: this.depthView,
        },
      ],
    });
  }

  resize(device: GPUDevice, width: number, height: number): void {
    this.albedoTexture.destroy();
    this.normalTexture.destroy();
    this.metalRoughnessTexture.destroy();
    this.depthTexture.destroy();

    this.albedoTexture = device.createTexture({
      label: "G-Buffer Albedo Texture",
      size: [width, height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.albedoView = this.albedoTexture.createView();

    this.normalTexture = device.createTexture({
      label: "G-Buffer Normal Texture",
      size: [width, height],
      format: "rgba16float",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.normalView = this.normalTexture.createView();

    this.metalRoughnessTexture = device.createTexture({
      label: "G-Buffer Metal/Roughness Texture",
      size: [width, height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.metalRoughnessView = this.metalRoughnessTexture.createView();

    this.depthTexture = device.createTexture({
      label: "G-Buffer Depth Texture",
      size: [width, height],
      format: "depth32float",
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.depthView = this.depthTexture.createView();

    this.bindGroup = device.createBindGroup({
      label: "G-Buffer Bind Group",
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: this.sampler,
        },
        {
          binding: 1,
          resource: this.albedoView,
        },
        {
          binding: 2,
          resource: this.normalView,
        },
        {
          binding: 3,
          resource: this.metalRoughnessView,
        },
        {
          binding: 4,
          resource: this.depthView,
        },
      ],
    });
  }
}
