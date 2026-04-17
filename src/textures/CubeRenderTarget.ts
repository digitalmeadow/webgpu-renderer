/**
 * CubeRenderTarget - A cube texture that can be rendered to at runtime
 * Used for reflection probes and dynamic environment maps
 */
export class CubeRenderTarget {
  public gpuTexture: GPUTexture;
  public gpuTextureView: GPUTextureView; // Cube view for sampling
  public gpuSampler: GPUSampler;
  public faceViews: GPUTextureView[]; // 6 individual face views for rendering
  public mipLevelCount: number;
  public resolution: number;
  public depthTexture: GPUTexture;
  public depthTextureView: GPUTextureView;

  private device: GPUDevice;

  /**
   * Create a cube render target
   * @param device GPU device
   * @param resolution Resolution of each cube face (e.g., 256 = 256x256)
   * @param mipLevels Number of mip levels (default 4, matching CubeTexture)
   */
  constructor(device: GPUDevice, resolution: number, mipLevels: number = 4) {
    this.device = device;
    this.resolution = resolution;
    this.mipLevelCount = mipLevels;
    this.faceViews = [];

    // Create the cube texture with render attachment usage
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

    // Create individual face views for rendering
    for (let face = 0; face < 6; face++) {
      this.faceViews.push(
        this.gpuTexture.createView({
          label: `CubeRenderTarget Face ${face}`,
          dimension: "2d",
          baseArrayLayer: face,
          arrayLayerCount: 1,
          baseMipLevel: 0,
          mipLevelCount: 1,
        }),
      );
    }

    // Create cube view for sampling
    this.gpuTextureView = this.gpuTexture.createView({
      label: `CubeRenderTarget View`,
      dimension: "cube",
    });

    // Create sampler with mipmap support
    this.gpuSampler = device.createSampler({
      label: `CubeRenderTarget Sampler`,
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      addressModeW: "clamp-to-edge",
    });

    // Create shared depth texture for all faces
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

  /**
   * Get the render target view for a specific cube face
   * @param faceIndex Face index (0-5): +X, -X, +Y, -Y, +Z, -Z
   */
  getFaceView(faceIndex: number): GPUTextureView {
    if (faceIndex < 0 || faceIndex >= 6) {
      throw new Error(`Invalid face index: ${faceIndex}. Must be 0-5.`);
    }
    return this.faceViews[faceIndex];
  }

  /**
   * Generate mipmaps for the cube texture
   * This should be called after rendering to all 6 faces
   */
  generateMipmaps(encoder: GPUCommandEncoder): void {
    // For each mip level (starting from 1)
    for (let mipLevel = 1; mipLevel < this.mipLevelCount; mipLevel++) {
      const mipSize = Math.max(1, this.resolution >> mipLevel);
      const prevMipSize = Math.max(1, this.resolution >> (mipLevel - 1));

      // For each face
      for (let face = 0; face < 6; face++) {
        // Copy from previous mip level to current mip level
        // Note: WebGPU doesn't have built-in mipmap generation for cube textures
        // We need to use a compute shader or manual blitting
        // For now, we'll use copyTextureToTexture with manual downsampling

        // Create source view (previous mip level)
        const srcView = this.gpuTexture.createView({
          dimension: "2d",
          baseArrayLayer: face,
          arrayLayerCount: 1,
          baseMipLevel: mipLevel - 1,
          mipLevelCount: 1,
        });

        // Create destination view (current mip level)
        const dstView = this.gpuTexture.createView({
          dimension: "2d",
          baseArrayLayer: face,
          arrayLayerCount: 1,
          baseMipLevel: mipLevel,
          mipLevelCount: 1,
        });

        // TODO: Implement proper mipmap generation using a blit shader
        // For now, mipmaps will need to be generated using a separate pass
        // or we can skip mipmapping for the initial implementation
      }
    }

    // Note: Proper implementation would use a compute shader or render pass
    // to downsample each mip level. For the initial version, we can render
    // at full resolution and accept that mipmaps won't be perfect.
  }

  /**
   * Destroy GPU resources
   */
  destroy(): void {
    this.gpuTexture.destroy();
    this.depthTexture.destroy();
  }
}
