import { BaseMaterial } from "./materials/BaseMaterial";
import { MaterialStandard } from "./materials/MaterialStandard";
import { MaterialCustom } from "./materials/MaterialCustom";
import { Texture } from "./Texture";

export class MaterialManager {
  private device: GPUDevice;
  private textureCache: Map<Texture, GPUTexture> = new Map();
  private defaultSampler: GPUSampler;
  private bindGroupCache: Map<BaseMaterial, GPUBindGroup> = new Map();
  public readonly materialBindGroupLayout: GPUBindGroupLayout;
  private placeholderNormalTexture: GPUTexture;
  private placeholderMetalRoughnessTexture: GPUTexture;

  constructor(device: GPUDevice) {
    this.device = device;

    this.defaultSampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });

    this.placeholderNormalTexture = this.createPlaceholderTexture([
      0, 0, 255, 255,
    ]); // Flat normal map
    this.placeholderMetalRoughnessTexture = this.createPlaceholderTexture([
      0, 255, 0, 255,
    ]); // 0 metal, 1 rough

    this.materialBindGroupLayout = device.createBindGroupLayout({
      label: "Material Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" },
        },
      ],
    });
  }

  private createPlaceholderTexture(pixel: number[]): GPUTexture {
    const texture = this.device.createTexture({
      size: [1, 1],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.device.queue.writeTexture(
      { texture },
      new Uint8Array(pixel),
      { bytesPerRow: 4 },
      { width: 1, height: 1 },
    );
    return texture;
  }

  async loadMaterial(material: BaseMaterial): Promise<void> {
    if (material instanceof MaterialStandard) {
      const textures = [
        material.albedoTexture,
        material.normalTexture,
        material.metalnessRoughnessTexture,
      ];
      for (const texture of textures) {
        if (texture && !this.textureCache.has(texture)) {
          await texture.load();
          this.createTextureResources(texture);
        }
      }
    }
  }

  private createTextureResources(texture: Texture): void {
    if (!texture.bitmap) return;

    const gpuTexture = this.device.createTexture({
      size: [texture.bitmap.width, texture.bitmap.height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.device.queue.copyExternalImageToTexture(
      { source: texture.bitmap },
      { texture: gpuTexture },
      { width: texture.bitmap.width, height: texture.bitmap.height },
    );

    this.textureCache.set(texture, gpuTexture);
  }

  getBindGroup(material: BaseMaterial): GPUBindGroup | null {
    // TODO: CustomMaterial pipeline generation and caching
    if (this.bindGroupCache.has(material)) {
      return this.bindGroupCache.get(material)!;
    }

    if (material instanceof MaterialStandard) {
      if (!material.albedoTexture) return null; // Albedo is required
      const albedoView = this.textureCache
        .get(material.albedoTexture)
        ?.createView();
      if (!albedoView) return null;

      const normalTexture = material.normalTexture
        ? this.textureCache.get(material.normalTexture)
        : this.placeholderNormalTexture;
      const normalView = normalTexture!.createView();

      const metalRoughnessTexture = material.metalnessRoughnessTexture
        ? this.textureCache.get(material.metalnessRoughnessTexture)
        : this.placeholderMetalRoughnessTexture;
      const metalRoughnessView = metalRoughnessTexture!.createView();

      const bindGroup = this.device.createBindGroup({
        layout: this.materialBindGroupLayout,
        entries: [
          { binding: 0, resource: this.defaultSampler },
          { binding: 1, resource: albedoView },
          { binding: 2, resource: normalView },
          { binding: 3, resource: metalRoughnessView },
        ],
      });

      this.bindGroupCache.set(material, bindGroup);
      return bindGroup;
    }

    return null;
  }
}
