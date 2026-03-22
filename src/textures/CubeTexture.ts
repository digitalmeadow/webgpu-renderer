const FACE_ORDER = ["px", "nx", "py", "ny", "pz", "nz"];

export class CubeTexture {
  private device: GPUDevice;
  folderPath: string;
  extension: string;
  images: ImageBitmap[] = [];
  loaded: boolean = false;
  gpuTexture: GPUTexture | null = null;
  gpuTextureView: GPUTextureView | null = null;
  gpuSampler: GPUSampler | null = null;

  constructor(
    device: GPUDevice,
    folderPath: string,
    extension: string = ".png",
  ) {
    this.device = device;
    this.folderPath = folderPath.replace(/\/$/, "");
    this.extension = extension;
  }

  async load(): Promise<void> {
    const loadPromises = FACE_ORDER.map(async (face) => {
      const url = `${this.folderPath}/${face}${this.extension}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load cubemap face: ${url}`);
      }
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      return bitmap;
    });

    this.images = await Promise.all(loadPromises);
    this.createGpuResources();
    this.loaded = true;
  }

  private createGpuResources(): void {
    if (this.images.length !== 6 || !this.images[0]) {
      throw new Error("CubeTexture requires 6 loaded images");
    }

    const width = this.images[0].width;
    const height = this.images[0].height;

    this.gpuTexture = this.device.createTexture({
      label: `CubeTexture: ${this.folderPath}`,
      size: { width, height, depthOrArrayLayers: 6 },
      mipLevelCount: 1,
      sampleCount: 1,
      dimension: "2d",
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
      viewFormats: [],
    });

    for (let i = 0; i < this.images.length; i++) {
      this.device.queue.copyExternalImageToTexture(
        { source: this.images[i] },
        {
          texture: this.gpuTexture,
          origin: { x: 0, y: 0, z: i },
        },
        { width, height },
      );
    }

    this.gpuTextureView = this.gpuTexture.createView({
      label: `CubeTextureView: ${this.folderPath}`,
      dimension: "cube",
    });

    this.gpuSampler = this.device.createSampler({
      label: `CubeTextureSampler: ${this.folderPath}`,
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      addressModeW: "clamp-to-edge",
    });
  }
}
