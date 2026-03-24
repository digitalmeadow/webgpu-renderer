import { MaterialBase, MaterialType } from "./MaterialBase";
import { MaterialPBR } from "./MaterialPBR";
import { MaterialBasic } from "./MaterialBasic";
import { MaterialCustom } from "./MaterialCustom";
import { Camera } from "../camera";
import { Vertex } from "../geometries";
import { Texture, CubeTexture } from "../textures";
import geometryPassShader from "../renderer/passes/GeometryPass.wgsl?raw";
import forwardPassShader from "../renderer/passes/ForwardPass.wgsl?raw";

export class MaterialManager {
  private device: GPUDevice;
  private textureCache: Map<Texture, GPUTexture> = new Map();
  private cubeTextureCache: Map<string, CubeTexture> = new Map();
  private defaultSampler: GPUSampler;
  private bindGroupCache: Map<MaterialBase, GPUBindGroup> = new Map();
  public readonly materialBindGroupLayout: GPUBindGroupLayout;
  private placeholderNormalTexture: GPUTexture;
  private placeholderMetalRoughnessTexture: GPUTexture;
  private placeholderAlbedoTexture: GPUTexture;
  private placeholderEmissiveTexture: GPUTexture;
  private placeholderEnvTexture: GPUTexture;
  private placeholderEnvView: GPUTextureView;
  private placeholderEnvSampler: GPUSampler;

  private customPipelineCache: Map<MaterialCustom, GPURenderPipeline> =
    new Map();
  private hookPipelineCache: Map<
    MaterialPBR | MaterialBasic,
    GPURenderPipeline
  > = new Map();

  private baseGeometryShader: string;
  private baseForwardShader: string;

  constructor(device: GPUDevice) {
    this.device = device;

    this.defaultSampler = device.createSampler({
      magFilter: "nearest",
      minFilter: "nearest",
      mipmapFilter: "linear",
      addressModeU: "repeat",
      addressModeV: "repeat",
    });

    this.placeholderNormalTexture = this.createPlaceholderTexture([
      0, 0, 255, 255,
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
      format: "rgba8unorm",
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
                format: navigator.gpu.getPreferredCanvasFormat(),
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
                format: navigator.gpu.getPreferredCanvasFormat(),
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
      const textures = [
        pbrMaterial.albedoTexture,
        pbrMaterial.normalTexture,
        pbrMaterial.metalnessRoughnessTexture,
        pbrMaterial.emissiveTexture,
      ];
      for (const texture of textures) {
        if (texture && !this.textureCache.has(texture)) {
          await texture.load();
          this.createTextureResources(texture);
        }
      }
      if (
        pbrMaterial.environmentTexture &&
        !pbrMaterial.environmentTexture.loaded
      ) {
        await pbrMaterial.environmentTexture.load();
      }
      this.bindGroupCache.delete(material);
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
      if (!pbrMaterial.albedoTexture) return null;
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
          { binding: 0, resource: this.defaultSampler },
          { binding: 1, resource: albedoView },
          { binding: 2, resource: normalView },
          { binding: 3, resource: metalRoughnessView },
          { binding: 4, resource: { buffer: pbrMaterial.uniforms.buffer } },
          { binding: 5, resource: envView },
          { binding: 6, resource: envSampler },
          { binding: 7, resource: emissiveView },
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
          { binding: 0, resource: this.defaultSampler },
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
          { binding: 0, resource: this.defaultSampler },
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
        ],
      });

      this.bindGroupCache.set(material, bindGroup);
      return bindGroup;
    }

    return null;
  }
}
