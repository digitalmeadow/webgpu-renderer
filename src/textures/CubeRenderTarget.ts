import { generateCubeMipmaps } from "./MipmapGenerator";

export class CubeRenderTarget {
  readonly isRenderTarget = true as const;
  public gpuTexture: GPUTexture;
  public gpuTextureView: GPUTextureView;
  public gpuSampler: GPUSampler;
  public faceViews: GPUTextureView[][]; // [face][mip]
  public mipLevelCount: number;
  public resolution: number;
  public depthTexture: GPUTexture;
  public depthTextureView: GPUTextureView;

  private device: GPUDevice;

  constructor(device: GPUDevice, resolution: number, mipLevels: number = 4) {
    this.device = device;
    this.resolution = resolution;
    this.mipLevelCount = mipLevels;

    this.gpuTexture = device.createTexture({
      label: `CubeRenderTarget ${resolution}x${resolution}`,
      size: { width: resolution, height: resolution, depthOrArrayLayers: 6 },
      mipLevelCount: mipLevels,
      sampleCount: 1,
      dimension: "2d",
      format: "rgba16float",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.faceViews = [];
    for (let face = 0; face < 6; face++) {
      this.faceViews.push([]);
      for (let mip = 0; mip < mipLevels; mip++) {
        this.faceViews[face].push(
          this.gpuTexture.createView({
            label: `CubeRenderTarget Face ${face} Mip ${mip}`,
            dimension: "2d",
            baseArrayLayer: face,
            arrayLayerCount: 1,
            baseMipLevel: mip,
            mipLevelCount: 1,
          }),
        );
      }
    }

    this.gpuTextureView = this.gpuTexture.createView({
      label: `CubeRenderTarget View`,
      dimension: "cube",
    });

    this.gpuSampler = device.createSampler({
      label: `CubeRenderTarget Sampler`,
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      addressModeW: "clamp-to-edge",
    });

    this.depthTexture = device.createTexture({
      label: `CubeRenderTarget Depth ${resolution}x${resolution}`,
      size: { width: resolution, height: resolution },
      format: "depth32float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.depthTextureView = this.depthTexture.createView({
      label: `CubeRenderTarget Depth View`,
    });
  }

  getFaceView(faceIndex: number): GPUTextureView {
    if (faceIndex < 0 || faceIndex >= 6) {
      throw new Error(`Invalid face index: ${faceIndex}. Must be 0-5.`);
    }
    return this.faceViews[faceIndex][0];
  }

  generateMipmaps(encoder: GPUCommandEncoder): void {
    generateCubeMipmaps(
      encoder,
      this.device,
      this.gpuTexture,
      this.resolution,
      this.mipLevelCount,
      "rgba16float",
    );
  }

  destroy(): void {
    this.gpuTexture.destroy();
    this.depthTexture.destroy();
    (this as any).gpuTexture = null;
    (this as any).depthTexture = null;
    (this as any).gpuTextureView = null;
    (this as any).depthTextureView = null;
    this.faceViews = [];
  }
}
