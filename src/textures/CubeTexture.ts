const FACE_ORDER = ["px", "nx", "py", "ny", "pz", "nz"];
const MIP_LEVELS = 4;

interface LoadedMipLevel {
  face: number;
  mipLevel: number;
  bitmap: ImageBitmap;
}

export class CubeTexture {
  private device: GPUDevice;
  folderPath: string;
  extension: string;
  loaded: boolean = false;
  gpuTexture: GPUTexture | null = null;
  gpuTextureView: GPUTextureView | null = null;
  gpuSampler: GPUSampler | null = null;

  static readonly mipLevelCount = MIP_LEVELS;

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
    const loadPromises: Promise<LoadedMipLevel>[] = [];

    for (let mipLevel = 0; mipLevel < MIP_LEVELS; mipLevel++) {
      for (let faceIndex = 0; faceIndex < FACE_ORDER.length; faceIndex++) {
        const face = FACE_ORDER[faceIndex];
        const filename = `${face}${mipLevel}${this.extension}`;
        const url = `${this.folderPath}/${filename}`;

        loadPromises.push(
          (async () => {
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`Failed to load cubemap face: ${url}`);
            }
            const blob = await response.blob();
            const bitmap = await createImageBitmap(blob);
            return { face: faceIndex, mipLevel, bitmap };
          })(),
        );
      }
    }

    const loadedMips = await Promise.all(loadPromises);
    this.createGpuResources(loadedMips);
    this.loaded = true;
  }

  private createGpuResources(loadedMips: LoadedMipLevel[]): void {
    if (loadedMips.length !== 24) {
      throw new Error(
        `CubeTexture requires ${24} images (6 faces × ${MIP_LEVELS} mip levels), got ${loadedMips.length}`,
      );
    }

    const baseWidth = loadedMips.find((m) => m.mipLevel === 0 && m.face === 0)!
      .bitmap.width;
    const baseHeight = loadedMips.find((m) => m.mipLevel === 0 && m.face === 0)!
      .bitmap.height;

    this.gpuTexture = this.device.createTexture({
      label: `CubeTexture: ${this.folderPath}`,
      size: { width: baseWidth, height: baseHeight, depthOrArrayLayers: 6 },
      mipLevelCount: MIP_LEVELS,
      sampleCount: 1,
      dimension: "2d",
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
      viewFormats: [],
    });

    for (let mipLevel = 0; mipLevel < MIP_LEVELS; mipLevel++) {
      for (let faceIndex = 0; faceIndex < FACE_ORDER.length; faceIndex++) {
        const loadedMip = loadedMips.find(
          (m) => m.mipLevel === mipLevel && m.face === faceIndex,
        )!;

        this.device.queue.copyExternalImageToTexture(
          { source: loadedMip.bitmap },
          {
            texture: this.gpuTexture,
            origin: { x: 0, y: 0, z: faceIndex },
            mipLevel,
          },
          { width: loadedMip.bitmap.width, height: loadedMip.bitmap.height },
        );
      }
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
