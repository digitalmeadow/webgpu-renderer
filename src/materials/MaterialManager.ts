import { MaterialBase, MaterialType } from "./MaterialBase";
import { MaterialPBR } from "./MaterialPBR";
import { MaterialBasic } from "./MaterialBasic";
import { MaterialCustom } from "./MaterialCustom";
import { Camera } from "../camera";
import { Vertex } from "../geometries";
import { getInstanceBufferLayout } from "../scene/InstanceGroup";
import { Texture, CubeTexture, CubeRenderTarget } from "../textures";
import { generate2DMipmaps } from "../textures/MipmapGenerator";
import geometryPassShader from "../renderer/passes/GeometryPass.wgsl?raw";
import forwardPassShader from "../renderer/passes/ForwardPass.wgsl?raw";
import { TextureSettings } from "../renderer/Renderer";

enum TextureType {
  COLOR = "color", // albedo, emissive - needs sRGB→linear conversion
  DATA = "data", // normal, roughness, metalness - preserve raw data
}

interface ResolvedTextureSettings {
  mipmapEnabled: boolean;
  maxMipLevels: number | undefined;
  mipmapFilter: "nearest" | "linear";
}

export class MaterialManager {
  private device: GPUDevice;
  private textureCache: Map<Texture, GPUTexture> = new Map();
  private cubeTextureCache: Map<string, CubeTexture> = new Map();
  private nearestSampler: GPUSampler;
  private linearSampler: GPUSampler;
  private bindGroupCache: Map<MaterialBase, GPUBindGroup> = new Map();
  public readonly materialBindGroupLayout: GPUBindGroupLayout;
  private placeholderNormalTexture: GPUTexture;
  private placeholderMetalRoughnessTexture: GPUTexture;
  private placeholderAlbedoTexture: GPUTexture;
  private placeholderEmissiveTexture: GPUTexture;
  private placeholderEnvTexture: GPUTexture;
  private placeholderEnvView: GPUTextureView;
  private placeholderEnvSampler: GPUSampler;
  public readonly fallbackBindGroup: GPUBindGroup;
  private textureSettings: ResolvedTextureSettings;

  // Environment texture array management
  private environmentTextures: Array<CubeTexture | CubeRenderTarget | null> =
    []; // Index 0 reserved for global skybox
  private environmentTextureMap: Map<CubeTexture | CubeRenderTarget, number> =
    new Map(); // Maps texture to ID

  private customPipelineCache: Map<MaterialCustom, GPURenderPipeline> =
    new Map();
  private hookPipelineCache: Map<
    MaterialPBR | MaterialBasic,
    GPURenderPipeline
  > = new Map();
  private hookInstancedPipelineCache: Map<
    MaterialPBR | MaterialBasic,
    GPURenderPipeline
  > = new Map();

  private baseGeometryShader: string;
  private baseForwardShader: string;

  constructor(device: GPUDevice, textureSettings?: TextureSettings) {
    this.device = device;
    this.textureSettings = {
      mipmapEnabled: textureSettings?.mipmapEnabled ?? true,
      maxMipLevels: textureSettings?.maxMipLevels,
      mipmapFilter: textureSettings?.mipmapFilter ?? "linear",
    };

    // Nearest sampler for pixelated albedo textures
    this.nearestSampler = device.createSampler({
      magFilter: "nearest",
      minFilter: "nearest",
      mipmapFilter: "nearest",
      addressModeU: "repeat",
      addressModeV: "repeat",
    });

    // Linear sampler for smooth data textures (normals, roughness, etc.)
    this.linearSampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "repeat",
      addressModeV: "repeat",
    });

    this.placeholderNormalTexture = this.createPlaceholderTexture([
      128,
      128,
      255,
      255, // (0.5, 0.5, 1.0) = neutral normal in tangent space, points +Z
    ]);
    this.placeholderMetalRoughnessTexture = this.createPlaceholderTexture([
      0, 255, 0, 255,
    ]);
    this.placeholderAlbedoTexture = this.createPlaceholderTexture([
      255, 255, 255, 255,
    ]);
    this.placeholderEmissiveTexture = this.createPlaceholderTexture([
      0, 0, 0, 0,
    ]);

    this.placeholderEnvTexture = device.createTexture({
      label: "Placeholder Cube Texture",
      size: { width: 8, height: 8, depthOrArrayLayers: 6 },
      mipLevelCount: 4,
      sampleCount: 1,
      dimension: "2d",
      format: "rgba8unorm-srgb",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.placeholderEnvView = this.placeholderEnvTexture.createView({
      label: "Placeholder Cube Texture View",
      dimension: "cube",
    });
    this.placeholderEnvSampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      addressModeW: "clamp-to-edge",
    });

    this.baseGeometryShader = geometryPassShader;
    this.baseForwardShader = forwardPassShader;

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
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 5,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            viewDimension: "cube",
            sampleType: "float",
          },
        },
        {
          binding: 6,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
        {
          binding: 7,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" },
        },
        {
          binding: 8,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
      ],
    });

    this.fallbackBindGroup = device.createBindGroup({
      label: "Fallback Material Bind Group",
      layout: this.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: this.nearestSampler },
        { binding: 1, resource: this.placeholderAlbedoTexture.createView() },
        { binding: 2, resource: this.placeholderNormalTexture.createView() },
        {
          binding: 3,
          resource: this.placeholderMetalRoughnessTexture.createView(),
        },
        {
          binding: 4,
          resource: { buffer: this.createFallbackUniformBuffer() },
        },
        { binding: 5, resource: this.placeholderEnvView },
        { binding: 6, resource: this.placeholderEnvSampler },
        {
          binding: 7,
          resource: this.placeholderEmissiveTexture.createView(),
        },
        { binding: 8, resource: this.linearSampler },
      ],
    });
  }

  private createFallbackUniformBuffer(): GPUBuffer {
    return this.device.createBuffer({
      label: "Fallback Uniform Buffer",
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
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

  getHookPipeline(
    material: MaterialPBR | MaterialBasic,
    camera: Camera,
    meshBindGroupLayout: GPUBindGroupLayout,
    pass: "geometry" | "forward",
  ): GPURenderPipeline | null {
    const cacheKey = material as MaterialPBR | MaterialBasic;
    if (this.hookPipelineCache.has(cacheKey)) {
      return this.hookPipelineCache.get(cacheKey)!;
    }

    const baseShader =
      pass === "geometry" ? this.baseGeometryShader : this.baseForwardShader;
    let shader = baseShader;

    const materialHooks = material.hooks || {};

    if (materialHooks.albedo) {
      const albedoFunctionRegex =
        /fn\s+get_albedo_color\s*\([^)]*\)\s*->\s*vec4<f32>\s*\{[^}]*}/;
      shader = shader.replace(albedoFunctionRegex, materialHooks.albedo);
    }
    if (materialHooks.uniforms) {
      shader = shader.replace(
        "//--HOOK_PLACEHOLDER_UNIFORMS--//",
        materialHooks.uniforms,
      );
    }

    const shaderModule = this.device.createShaderModule({
      code: shader,
    });

    const isOpaque = pass === "geometry";

    const pipeline = this.device.createRenderPipeline({
      label: `Hook Material Pipeline: ${material.name} (${pass})`,
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          camera.uniforms.bindGroupLayout,
          meshBindGroupLayout,
          this.materialBindGroupLayout,
        ],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [Vertex.getBufferLayout()],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: isOpaque
          ? [
              { format: "rgba8unorm" },
              { format: "rgba16float" },
              { format: "rgba8unorm" },
            ]
          : [
              {
                format: "rgba16float",
                blend: {
                  color: {
                    srcFactor: "src-alpha",
                    dstFactor: "one-minus-src-alpha",
                    operation: "add",
                  },
                  alpha: {
                    srcFactor: "one",
                    dstFactor: "one-minus-src-alpha",
                    operation: "add",
                  },
                },
              },
            ],
      },
      primitive: {
        topology: "triangle-list",
        frontFace: "cw",
        cullMode: material.doubleSided ? "none" : "back",
      },
      depthStencil: isOpaque
        ? {
            format: "depth32float",
            depthWriteEnabled: true,
            depthCompare: "less",
          }
        : {
            format: "depth32float",
            depthWriteEnabled: false,
            depthCompare: "less-equal",
          },
    });

    this.hookPipelineCache.set(cacheKey, pipeline);
    return pipeline;
  }

  /**
   * Creates a render pipeline for hook/basic materials that is compatible with
   * the instanced GeometryPass: 2 bind groups [camera, material] and includes
   * the instance buffer in the vertex layout. Writes all 4 G-buffer targets.
   */
  getGeometryInstancedHookPipeline(
    material: MaterialPBR | MaterialBasic,
    cameraBindGroupLayout: GPUBindGroupLayout,
  ): GPURenderPipeline | null {
    if (this.hookInstancedPipelineCache.has(material)) {
      return this.hookInstancedPipelineCache.get(material)!;
    }

    let shader = this.baseGeometryShader;
    const materialHooks = (material as any).hooks || {};

    if (materialHooks.albedo) {
      const albedoFunctionRegex =
        /fn\s+get_albedo_color\s*\([^)]*\)\s*->\s*vec4<f32>\s*\{[^}]*}/;
      shader = shader.replace(albedoFunctionRegex, materialHooks.albedo);
    }
    if (materialHooks.uniforms) {
      shader = shader.replace(
        "//--HOOK_PLACEHOLDER_UNIFORMS--//",
        materialHooks.uniforms,
      );
    }

    const shaderModule = this.device.createShaderModule({
      label: `Instanced Hook Shader: ${material.name}`,
      code: shader,
    });

    const pipeline = this.device.createRenderPipeline({
      label: `Instanced Hook Pipeline: ${material.name}`,
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [cameraBindGroupLayout, this.materialBindGroupLayout],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [Vertex.getBufferLayout(), getInstanceBufferLayout()],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [
          { format: "rgba8unorm" }, // Albedo
          { format: "rgba16float" }, // Normal
          { format: "rgba8unorm" }, // Metal/Roughness
          { format: "rgba16float" }, // Emissive (HDR)
        ],
      },
      primitive: {
        topology: "triangle-list",
        frontFace: "cw",
        cullMode: material.doubleSided ? "none" : "back",
      },
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });

    this.hookInstancedPipelineCache.set(material, pipeline);
    return pipeline;
  }

  getCustomPipeline(
    material: MaterialCustom,
    camera: Camera,
    meshBindGroupLayout: GPUBindGroupLayout,
    pass: "geometry" | "forward",
  ): GPURenderPipeline | null {
    if (this.customPipelineCache.has(material)) {
      return this.customPipelineCache.get(material)!;
    }

    const customShader = material.passes[pass];

    if (!customShader) {
      console.warn(
        `MaterialCustom "${material.name}" has no shader for pass: ${pass}`,
      );
      return null;
    }

    const shaderModule = this.device.createShaderModule({
      code: customShader,
    });

    const isOpaque = pass === "geometry";

    const pipeline = this.device.createRenderPipeline({
      label: `Custom Material Pipeline: ${material.name}`,
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          camera.uniforms.bindGroupLayout,
          meshBindGroupLayout,
          this.materialBindGroupLayout,
        ],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [Vertex.getBufferLayout()],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: isOpaque
          ? [
              { format: "rgba8unorm" },
              { format: "rgba16float" },
              { format: "rgba8unorm" },
            ]
          : [
              {
                format: "rgba16float",
                blend: {
                  color: {
                    srcFactor: "src-alpha",
                    dstFactor: "one-minus-src-alpha",
                    operation: "add",
                  },
                  alpha: {
                    srcFactor: "one",
                    dstFactor: "one-minus-src-alpha",
                    operation: "add",
                  },
                },
              },
            ],
      },
      primitive: {
        topology: "triangle-list",
        frontFace: "cw",
        cullMode: material.doubleSided ? "none" : "back",
      },
      depthStencil: isOpaque
        ? {
            format: "depth32float",
            depthWriteEnabled: true,
            depthCompare: "less",
          }
        : {
            format: "depth32float",
            depthWriteEnabled: false,
            depthCompare: "less-equal",
          },
    });

    this.customPipelineCache.set(material, pipeline);
    return pipeline;
  }

  async loadMaterial(material: MaterialBase): Promise<void> {
    if (material.type === MaterialType.PBR) {
      const pbrMaterial = material as MaterialPBR;

      // Load albedo texture (COLOR type - needs sRGB→linear)
      if (
        pbrMaterial.albedoTexture &&
        !this.textureCache.has(pbrMaterial.albedoTexture)
      ) {
        await pbrMaterial.albedoTexture.load();
        this.createTextureResources(
          pbrMaterial.albedoTexture,
          TextureType.COLOR,
        );
      }

      // Load normal texture (DATA type - preserve raw tangent-space vectors)
      if (
        pbrMaterial.normalTexture &&
        !this.textureCache.has(pbrMaterial.normalTexture)
      ) {
        await pbrMaterial.normalTexture.load();
        this.createTextureResources(
          pbrMaterial.normalTexture,
          TextureType.DATA,
        );
      }

      // Load metalness/roughness texture (DATA type - preserve raw data values)
      if (
        pbrMaterial.metalnessRoughnessTexture &&
        !this.textureCache.has(pbrMaterial.metalnessRoughnessTexture)
      ) {
        await pbrMaterial.metalnessRoughnessTexture.load();
        this.createTextureResources(
          pbrMaterial.metalnessRoughnessTexture,
          TextureType.DATA,
        );
      }

      // Load emissive texture (COLOR type - needs sRGB→linear for HDR)
      if (
        pbrMaterial.emissiveTexture &&
        !this.textureCache.has(pbrMaterial.emissiveTexture)
      ) {
        await pbrMaterial.emissiveTexture.load();
        this.createTextureResources(
          pbrMaterial.emissiveTexture,
          TextureType.COLOR,
        );
      }

      if (pbrMaterial.environmentTexture) {
        // CubeRenderTarget doesn't need loading (it's already a GPU resource)
        // Only load CubeTexture
        if (
          "loaded" in pbrMaterial.environmentTexture &&
          !pbrMaterial.environmentTexture.loaded
        ) {
          await pbrMaterial.environmentTexture.load();
        }
      }
      this.bindGroupCache.delete(material);
    }
  }

  private createTextureResources(
    texture: Texture,
    textureType: TextureType,
  ): void {
    if (!texture.bitmap) return;

    const width = texture.bitmap.width;
    const height = texture.bitmap.height;

    let mipLevelCount = 1;
    if (this.textureSettings.mipmapEnabled) {
      const fullMips = Math.floor(Math.log2(Math.max(width, height))) + 1;
      mipLevelCount = this.textureSettings.maxMipLevels
        ? Math.min(this.textureSettings.maxMipLevels, fullMips)
        : fullMips;
    }

    // Use different formats based on texture type:
    // COLOR (albedo, emissive): rgba8unorm - WebGPU converts sRGB→linear
    // DATA (normal, roughness, metalness): rgba8unorm-srgb - preserves raw data
    const format =
      textureType === TextureType.COLOR ? "rgba8unorm-srgb" : "rgba8unorm";

    const gpuTexture = this.device.createTexture({
      size: [width, height],
      format: format,
      mipLevelCount,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.device.queue.copyExternalImageToTexture(
      { source: texture.bitmap },
      { texture: gpuTexture },
      { width, height },
    );

    if (mipLevelCount > 1) {
      this.generateMipmaps(gpuTexture, width, height, mipLevelCount, format);
    }

    this.textureCache.set(texture, gpuTexture);
  }

  private generateMipmaps(
    texture: GPUTexture,
    baseWidth: number,
    baseHeight: number,
    mipLevelCount: number,
    format: GPUTextureFormat,
  ): void {
    generate2DMipmaps(
      this.device,
      texture,
      baseWidth,
      baseHeight,
      mipLevelCount,
      format,
    );
  }

  getOrCreateCubeTexture(
    folderPath: string,
    extension: string = ".png",
  ): CubeTexture {
    const cacheKey = `${folderPath}:${extension}`;
    if (this.cubeTextureCache.has(cacheKey)) {
      return this.cubeTextureCache.get(cacheKey)!;
    }
    const cubeTexture = new CubeTexture(this.device, folderPath, extension);
    this.cubeTextureCache.set(cacheKey, cubeTexture);
    return cubeTexture;
  }

  getBindGroup(material: MaterialBase): GPUBindGroup | null {
    if (this.bindGroupCache.has(material)) {
      return this.bindGroupCache.get(material)!;
    }

    let resolvedMaterialType = material.type;
    if (resolvedMaterialType === MaterialType.Base) {
      if ("albedoTexture" in material || "normalTexture" in material) {
        resolvedMaterialType = MaterialType.PBR;
      } else if ("color" in material) {
        resolvedMaterialType = MaterialType.Basic;
      } else if ("passes" in material) {
        resolvedMaterialType = MaterialType.Custom;
      }
    }

    if (resolvedMaterialType === MaterialType.PBR) {
      const pbrMaterial = material as MaterialPBR;
      if (!pbrMaterial.albedoTexture) return this.fallbackBindGroup;
      const albedoView = this.textureCache
        .get(pbrMaterial.albedoTexture)
        ?.createView();
      if (!albedoView) return null;

      const normalTexture =
        pbrMaterial.normalTexture &&
        this.textureCache.get(pbrMaterial.normalTexture);
      const normalView = normalTexture
        ? normalTexture.createView()
        : this.placeholderNormalTexture.createView();

      const metalRoughnessTexture =
        pbrMaterial.metalnessRoughnessTexture &&
        this.textureCache.get(pbrMaterial.metalnessRoughnessTexture);
      const metalRoughnessView = metalRoughnessTexture
        ? metalRoughnessTexture.createView()
        : this.placeholderMetalRoughnessTexture.createView();

      // Assign environment texture ID
      const envTextureId = this.getOrAssignEnvironmentTextureId(
        pbrMaterial.environmentTexture,
      );
      pbrMaterial.environmentTextureId = envTextureId;

      (window as any).DEBUG_MATERIAL = pbrMaterial;
      (window as any).DEBUG_UNIFORMS = pbrMaterial.uniforms;
      pbrMaterial.uniforms.update(pbrMaterial);

      const envView =
        pbrMaterial.environmentTexture?.gpuTextureView ??
        this.placeholderEnvView;
      const envSampler =
        pbrMaterial.environmentTexture?.gpuSampler ??
        this.placeholderEnvSampler;

      const usingCustomEnv = !!pbrMaterial.environmentTexture;

      const emissiveTexture =
        pbrMaterial.emissiveTexture &&
        this.textureCache.get(pbrMaterial.emissiveTexture);
      const emissiveView = emissiveTexture
        ? emissiveTexture.createView()
        : this.placeholderEmissiveTexture.createView();

      const bindGroup = this.device.createBindGroup({
        layout: this.materialBindGroupLayout,
        entries: [
          { binding: 0, resource: this.nearestSampler },
          { binding: 1, resource: albedoView },
          { binding: 2, resource: normalView },
          { binding: 3, resource: metalRoughnessView },
          { binding: 4, resource: { buffer: pbrMaterial.uniforms.buffer } },
          { binding: 5, resource: envView },
          { binding: 6, resource: envSampler },
          { binding: 7, resource: emissiveView },
          { binding: 8, resource: this.linearSampler },
        ],
      });

      this.bindGroupCache.set(material, bindGroup);
      return bindGroup;
    } else if (resolvedMaterialType === MaterialType.Basic) {
      const basicMaterial = material as MaterialBasic;
      basicMaterial.uniforms.update(basicMaterial);

      const bindGroup = this.device.createBindGroup({
        layout: this.materialBindGroupLayout,
        entries: [
          { binding: 0, resource: this.nearestSampler },
          { binding: 1, resource: this.placeholderAlbedoTexture.createView() },
          { binding: 2, resource: this.placeholderNormalTexture.createView() },
          {
            binding: 3,
            resource: this.placeholderMetalRoughnessTexture.createView(),
          },
          { binding: 4, resource: { buffer: basicMaterial.uniforms.buffer } },
          { binding: 5, resource: this.placeholderEnvView },
          { binding: 6, resource: this.placeholderEnvSampler },
          {
            binding: 7,
            resource: this.placeholderEmissiveTexture.createView(),
          },
          { binding: 8, resource: this.linearSampler },
        ],
      });

      this.bindGroupCache.set(material, bindGroup);
      return bindGroup;
    } else if (resolvedMaterialType === MaterialType.Custom) {
      const customMaterial = material as MaterialCustom;
      customMaterial.uniforms.update(customMaterial);

      const bindGroup = this.device.createBindGroup({
        layout: this.materialBindGroupLayout,
        entries: [
          { binding: 0, resource: this.nearestSampler },
          { binding: 1, resource: this.placeholderAlbedoTexture.createView() },
          { binding: 2, resource: this.placeholderNormalTexture.createView() },
          {
            binding: 3,
            resource: this.placeholderMetalRoughnessTexture.createView(),
          },
          { binding: 4, resource: { buffer: customMaterial.uniforms.buffer } },
          { binding: 5, resource: this.placeholderEnvView },
          { binding: 6, resource: this.placeholderEnvSampler },
          {
            binding: 7,
            resource: this.placeholderEmissiveTexture.createView(),
          },
          { binding: 8, resource: this.linearSampler },
        ],
      });

      this.bindGroupCache.set(material, bindGroup);
      return bindGroup;
    }

    return this.fallbackBindGroup;
  }

  /**
   * Assigns a unique environment texture ID to a material's environment texture.
   * ID 0 is reserved for the global skybox.
   * Returns the assigned ID.
   */
  private getOrAssignEnvironmentTextureId(
    envTexture: CubeTexture | CubeRenderTarget | null,
  ): number {
    if (!envTexture) {
      return 0; // Use global skybox
    }

    // Check if this texture already has an ID
    const existingId = this.environmentTextureMap.get(envTexture);
    if (existingId !== undefined) {
      return existingId;
    }

    // Assign a new ID (starting from 1, since 0 is global skybox)
    const newId = this.environmentTextures.length;
    this.environmentTextures.push(envTexture);
    this.environmentTextureMap.set(envTexture, newId);

    return newId;
  }

  /**
   * Returns the array of environment textures for use in the lighting pass.
   * Index 0 is reserved for global skybox (set externally).
   */
  getEnvironmentTextures(): Array<CubeTexture | CubeRenderTarget | null> {
    return this.environmentTextures;
  }

  /**
   * Returns the array of environment texture views for use in the lighting pass.
   * Index 0 is reserved for global skybox (set externally).
   */
  getEnvironmentTextureArray(): Array<GPUTextureView | null> {
    return this.environmentTextures.map((tex) => {
      if (!tex) return null;
      return tex.gpuTextureView ?? null;
    });
  }

  /**
   * Returns the array of environment samplers for use in the lighting pass.
   */
  getEnvironmentSamplerArray(): Array<GPUSampler | null> {
    return this.environmentTextures.map((tex) => {
      if (!tex) return null;
      return tex.gpuSampler ?? null;
    });
  }

  /**
   * Sets the global skybox texture at index 0 of the environment array.
   */
  setGlobalSkybox(skybox: CubeTexture | CubeRenderTarget | null): void {
    if (this.environmentTextures.length === 0) {
      this.environmentTextures.push(skybox);
    } else {
      this.environmentTextures[0] = skybox;
    }
  }
}
