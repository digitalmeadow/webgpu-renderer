import { MaterialBase, MaterialType } from "./MaterialBase";
import { MaterialPBR } from "./MaterialPBR";
import { MaterialBasic } from "./MaterialBasic";
import { MaterialCustom } from "./MaterialCustom";
import { BUFFER_SIZE } from "./MaterialUniforms";
import { ShaderHooks } from "./ShaderHooks";
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
  private bindGroupCache = new WeakMap<MaterialBase, GPUBindGroup>();
  private bindGroupEnvTextureCache = new WeakMap<
    MaterialBase,
    CubeTexture | CubeRenderTarget | null
  >();
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

  // Index 0 reserved for global skybox, set via setGlobalSkybox()
  private environmentTextures: Array<CubeTexture | CubeRenderTarget | null> = [
    null,
  ];
  private environmentTextureMap: Map<CubeTexture | CubeRenderTarget, number> =
    new Map();
  public environmentTexturesNeedsUpdate: boolean = false;

  private customPipelineCache = new Map<
    MaterialCustom,
    Partial<Record<"geometry" | "forward", GPURenderPipeline>>
  >();
  private hookInstancedPipelineCache: Map<
    MaterialPBR | MaterialBasic,
    GPURenderPipeline
  > = new Map();
  private hookForwardInstancedPipelineCache: Map<
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
          texture: { viewDimension: "cube", sampleType: "float" },
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
        { binding: 7, resource: this.placeholderEmissiveTexture.createView() },
        { binding: 8, resource: this.linearSampler },
      ],
    });
  }

  private createFallbackUniformBuffer(): GPUBuffer {
    return this.device.createBuffer({
      label: "Fallback Uniform Buffer",
      size: BUFFER_SIZE,
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

  private applyShaderHooks(shader: string, hooks: ShaderHooks): string {
    if (hooks.uniforms) {
      shader = shader.replace(
        "//--HOOK_PLACEHOLDER_UNIFORMS--//",
        hooks.uniforms,
      );
    }
    if (hooks.albedo) {
      const albedoFunctionRegex =
        /fn\s+get_albedo_color\s*\([^)]*\)\s*->\s*vec4<f32>\s*\{[^}]*}/;
      shader = shader.replace(albedoFunctionRegex, hooks.albedo);
    }
    if (hooks.albedo_logic) {
      const modifyAlbedoRegex =
        /fn\s+modify_albedo\s*\([^)]*\)\s*->\s*vec4<f32>\s*\{[^}]*}/;
      shader = shader.replace(modifyAlbedoRegex, hooks.albedo_logic);
    }
    if (hooks.vertex_post_process) {
      const vertexPostProcessRegex =
        /fn\s+vertex_post_process\s*\([^)]*\)\s*->\s*vec3<f32>\s*\{[^}]*}/;
      shader = shader.replace(
        vertexPostProcessRegex,
        hooks.vertex_post_process,
      );
    }
    return shader;
  }

  getGeometryInstancedHookPipeline(
    material: MaterialPBR | MaterialBasic,
    cameraBindGroupLayout: GPUBindGroupLayout,
  ): GPURenderPipeline | null {
    if (this.hookInstancedPipelineCache.has(material)) {
      return this.hookInstancedPipelineCache.get(material)!;
    }

    const shader = this.applyShaderHooks(
      this.baseGeometryShader,
      material.hooks,
    );

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

  getForwardInstancedHookPipeline(
    material: MaterialPBR | MaterialBasic,
    cameraBindGroupLayout: GPUBindGroupLayout,
    lightSceneBindGroupLayout: GPUBindGroupLayout,
  ): GPURenderPipeline | null {
    if (this.hookForwardInstancedPipelineCache.has(material)) {
      return this.hookForwardInstancedPipelineCache.get(material)!;
    }

    const shader = this.applyShaderHooks(
      this.baseForwardShader,
      material.hooks,
    );

    const shaderModule = this.device.createShaderModule({
      label: `Forward Instanced Hook Shader: ${material.name}`,
      code: shader,
    });

    const pipeline = this.device.createRenderPipeline({
      label: `Forward Instanced Hook Pipeline: ${material.name}`,
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          cameraBindGroupLayout,
          lightSceneBindGroupLayout,
          this.materialBindGroupLayout,
        ],
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
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: false,
        depthCompare: "less-equal",
      },
    });

    this.hookForwardInstancedPipelineCache.set(material, pipeline);
    return pipeline;
  }

  getCustomPipeline(
    material: MaterialCustom,
    pass: "geometry" | "forward",
    cameraBindGroupLayout: GPUBindGroupLayout,
  ): GPURenderPipeline | null {
    const cached = this.customPipelineCache.get(material);
    if (cached?.[pass]) return cached[pass]!;

    const customShader = material.passes[pass];
    if (!customShader) {
      console.warn(
        `MaterialCustom "${material.name}" has no shader for pass: ${pass}`,
      );
      return null;
    }

    const shaderModule = this.device.createShaderModule({ code: customShader });
    const isOpaque = pass === "geometry";

    const pipeline = this.device.createRenderPipeline({
      label: `Custom Material Pipeline: ${material.name} (${pass})`,
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [cameraBindGroupLayout, material.bindGroupLayout],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [Vertex.getBufferLayout(), getInstanceBufferLayout()],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: isOpaque
          ? [
              { format: "rgba8unorm" }, // Albedo
              { format: "rgba16float" }, // Normal
              { format: "rgba8unorm" }, // Metal/Roughness
              { format: "rgba16float" }, // Emissive (HDR)
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

    const entry = this.customPipelineCache.get(material) ?? {};
    entry[pass] = pipeline;
    this.customPipelineCache.set(material, entry);
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
        if (pbrMaterial.albedoTexture.url.startsWith("blob:")) {
          URL.revokeObjectURL(pbrMaterial.albedoTexture.url);
        }
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
        if (pbrMaterial.normalTexture.url.startsWith("blob:")) {
          URL.revokeObjectURL(pbrMaterial.normalTexture.url);
        }
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
        if (pbrMaterial.metalnessRoughnessTexture.url.startsWith("blob:")) {
          URL.revokeObjectURL(pbrMaterial.metalnessRoughnessTexture.url);
        }
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
        if (pbrMaterial.emissiveTexture.url.startsWith("blob:")) {
          URL.revokeObjectURL(pbrMaterial.emissiveTexture.url);
        }
      }

      if (pbrMaterial.environmentTexture) {
        // CubeRenderTarget doesn't need loading (it's already a GPU resource)
        if (
          "loaded" in pbrMaterial.environmentTexture &&
          !pbrMaterial.environmentTexture.loaded
        ) {
          await pbrMaterial.environmentTexture.load();
        }
      }
      this.bindGroupCache.delete(material);
      this.bindGroupEnvTextureCache.delete(material);
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

    // COLOR (albedo, emissive): rgba8unorm-srgb — WebGPU converts sRGB→linear on sample
    // DATA (normal, roughness, metalness): rgba8unorm — preserves raw data values
    const format =
      textureType === TextureType.COLOR ? "rgba8unorm-srgb" : "rgba8unorm";

    const gpuTexture = this.device.createTexture({
      size: [width, height],
      format,
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
      const encoder = this.device.createCommandEncoder({
        label: `2D Mipmap Encoder: ${width}x${height} ${format}`,
      });
      generate2DMipmaps(
        encoder,
        this.device,
        gpuTexture,
        width,
        height,
        mipLevelCount,
        format,
      );
      this.device.queue.submit([encoder.finish()]);
    }

    this.textureCache.set(texture, gpuTexture);
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
      if (material.type === MaterialType.PBR) {
        const pbrMat = material as MaterialPBR;
        if (
          pbrMat.environmentTexture !==
          this.bindGroupEnvTextureCache.get(material)
        ) {
          // env texture changed — evict and rebuild
          this.bindGroupCache.delete(material);
        } else {
          return this.bindGroupCache.get(material)!;
        }
      } else {
        return this.bindGroupCache.get(material)!;
      }
    }

    if (material.type === MaterialType.PBR) {
      const pbrMaterial = material as MaterialPBR;
      // Use placeholder albedo when none is set (still need a per-material bind group for correct environmentTextureId)
      const albedoView = pbrMaterial.albedoTexture
        ? (this.textureCache.get(pbrMaterial.albedoTexture)?.createView() ??
          null)
        : this.placeholderAlbedoTexture.createView();
      if (!albedoView) return null; // null only when albedoTexture is set but not yet loaded

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

      const envTextureId = this.getOrAssignEnvironmentTextureId(
        pbrMaterial.environmentTexture,
      );
      pbrMaterial.environmentTextureId = envTextureId;
      pbrMaterial.uniforms.update(pbrMaterial);

      const envView =
        pbrMaterial.environmentTexture?.gpuTextureView ??
        this.placeholderEnvView;
      const envSampler =
        pbrMaterial.environmentTexture?.gpuSampler ??
        this.placeholderEnvSampler;

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
      this.bindGroupEnvTextureCache.set(
        material,
        pbrMaterial.environmentTexture,
      );
      return bindGroup;
    } else if (material.type === MaterialType.Basic) {
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
    }

    return this.fallbackBindGroup;
  }

  // ID 0 is reserved for global skybox. Returns 0 when no custom env is set.
  private getOrAssignEnvironmentTextureId(
    envTexture: CubeTexture | CubeRenderTarget | null,
  ): number {
    if (!envTexture) return 0;

    const existingId = this.environmentTextureMap.get(envTexture);
    if (existingId !== undefined) return existingId;

    const newId = this.environmentTextures.length;
    this.environmentTextures.push(envTexture);
    this.environmentTextureMap.set(envTexture, newId);
    this.environmentTexturesNeedsUpdate = true;

    return newId;
  }

  getEnvironmentTextures(): Array<CubeTexture | CubeRenderTarget | null> {
    return this.environmentTextures;
  }

  getEnvironmentTextureArray(): Array<GPUTextureView | null> {
    return this.environmentTextures.map((tex) => tex?.gpuTextureView ?? null);
  }

  getEnvironmentSamplerArray(): Array<GPUSampler | null> {
    return this.environmentTextures.map((tex) => tex?.gpuSampler ?? null);
  }

  setGlobalSkybox(skybox: CubeTexture | CubeRenderTarget | null): void {
    this.environmentTextures[0] = skybox;
  }
}
