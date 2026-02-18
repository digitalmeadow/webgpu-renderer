import { Material } from "./Material";
import { Texture } from "./Texture";

export class MaterialManager {
  private device: GPUDevice;
  private textureCache: Map<Texture, GPUTexture> = new Map();
  private samplerCache: Map<Texture, GPUSampler> = new Map();
  private bindGroupCache: Map<Material, GPUBindGroup> = new Map();
  private bindGroupLayout: GPUBindGroupLayout | null = null;

  constructor(device: GPUDevice) {
    this.device = device;
  }

  setMaterialBindGroupLayout(layout: GPUBindGroupLayout): void {
    this.bindGroupLayout = layout;
  }

  async loadMaterial(material: Material): Promise<void> {
    if (
      material.albedoTexture &&
      !this.textureCache.has(material.albedoTexture)
    ) {
      await material.albedoTexture.load();
      this.createTextureResources(material.albedoTexture);
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

    const sampler = this.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });
    this.samplerCache.set(texture, sampler);
  }

  getBindGroup(material: Material): GPUBindGroup | null {
    if (!this.bindGroupLayout) return null;

    if (!this.bindGroupCache.has(material)) {
      if (!material.albedoTexture) return null;

      const gpuTexture = this.textureCache.get(material.albedoTexture);
      const sampler = this.samplerCache.get(material.albedoTexture);

      if (!gpuTexture || !sampler) return null;

      const bindGroup = this.device.createBindGroup({
        layout: this.bindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: gpuTexture.createView(),
          },
          {
            binding: 1,
            resource: sampler,
          },
        ],
      });

      this.bindGroupCache.set(material, bindGroup);
    }

    return this.bindGroupCache.get(material)!;
  }
}
