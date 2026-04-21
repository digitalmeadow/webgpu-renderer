import { generateCubeMipmaps, calculateMipLevelCount } from "./MipmapGenerator";

const FACE_ORDER = ["px", "nx", "py", "ny", "pz", "nz"];

interface LoadedFace {
  face: number;
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
  mipLevelCount: number = 0;

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
    // Load base faces only (px.jpg, nx.jpg, py.jpg, ny.jpg, pz.jpg, nz.jpg)
    const loadPromises: Promise<LoadedFace>[] = [];

    for (let faceIndex = 0; faceIndex < FACE_ORDER.length; faceIndex++) {
      const face = FACE_ORDER[faceIndex];
      const filename = `${face}${this.extension}`;
      const url = `${this.folderPath}/${filename}`;

      loadPromises.push(
        (async () => {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(
              `Failed to load cubemap face: ${url} (status: ${response.status})`,
            );
          }
          const blob = await response.blob();
          const bitmap = await createImageBitmap(blob, {
            colorSpaceConversion: "none",
          });
          return { face: faceIndex, bitmap };
        })(),
      );
    }

    const loadedFaces = await Promise.all(loadPromises);
    this.createGpuResources(loadedFaces);
    this.loaded = true;
  }

  private createGpuResources(loadedFaces: LoadedFace[]): void {
    if (loadedFaces.length !== 6) {
      throw new Error(
        `CubeTexture requires 6 base face images, got ${loadedFaces.length}`,
      );
    }

    const baseSize = loadedFaces[0].bitmap.width;
    const baseHeight = loadedFaces[0].bitmap.height;

    // Validate all faces are square and same size
    if (baseSize !== baseHeight) {
      throw new Error(
        `CubeTexture faces must be square, got ${baseSize}x${baseHeight}`,
      );
    }

    for (let i = 1; i < loadedFaces.length; i++) {
      const face = loadedFaces[i];
      if (face.bitmap.width !== baseSize || face.bitmap.height !== baseSize) {
        throw new Error(
          `All cubemap faces must be the same size. Face ${i} is ${face.bitmap.width}x${face.bitmap.height}, expected ${baseSize}x${baseSize}`,
        );
      }
    }

    // Calculate full mip chain
    this.mipLevelCount = calculateMipLevelCount(baseSize);

    // Create GPU texture with full mip chain and RENDER_ATTACHMENT for mipmap generation
    this.gpuTexture = this.device.createTexture({
      label: `CubeTexture: ${this.folderPath}`,
      size: { width: baseSize, height: baseSize, depthOrArrayLayers: 6 },
      mipLevelCount: this.mipLevelCount,
      sampleCount: 1,
      dimension: "2d",
      format: "rgba8unorm-srgb",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
      viewFormats: [],
    });

    // Upload base faces (mip level 0)
    for (let faceIndex = 0; faceIndex < FACE_ORDER.length; faceIndex++) {
      const loadedFace = loadedFaces.find((f) => f.face === faceIndex)!;

      this.device.queue.copyExternalImageToTexture(
        { source: loadedFace.bitmap },
        {
          texture: this.gpuTexture,
          origin: { x: 0, y: 0, z: faceIndex },
          mipLevel: 0,
        },
        { width: loadedFace.bitmap.width, height: loadedFace.bitmap.height },
      );
    }

    // Generate mipmaps on GPU
    generateCubeMipmaps(
      this.device,
      this.gpuTexture,
      baseSize,
      this.mipLevelCount,
      "rgba8unorm-srgb",
    );

    // Create texture view and sampler
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
