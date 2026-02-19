import { BaseMaterial } from "./BaseMaterial";
import { MaterialStandard } from "./MaterialStandard";
import { MaterialStandardCustom } from "./MaterialStandardCustom";
import { Camera } from "../camera/Camera";
import { Vertex } from "../geometries/Vertex";
import { Texture } from "../textures/Texture";
import baseGeometryShader from "../renderer/passes/geometry.wgsl?raw";

export class MaterialManager {
  private device: GPUDevice;
  private textureCache: Map<Texture, GPUTexture> = new Map();
  private defaultSampler: GPUSampler;
  private bindGroupCache: Map<BaseMaterial, GPUBindGroup> = new Map();
  public readonly materialBindGroupLayout: GPUBindGroupLayout;
  private placeholderNormalTexture: GPUTexture;
  private placeholderMetalRoughnessTexture: GPUTexture;
  private customPipelineCache: Map<MaterialStandardCustom, GPURenderPipeline> =
    new Map();
  private baseShader: string;

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

    this.baseShader = baseGeometryShader;
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

  getCustomPipeline(
    material: MaterialStandardCustom,
    camera: Camera,
    meshBindGroupLayout: GPUBindGroupLayout,
  ): GPURenderPipeline | null {
    if (this.customPipelineCache.has(material)) {
      return this.customPipelineCache.get(material)!;
    }

    let shader = this.baseShader;
    if (material.hooks.albedo) {
      const albedoFunctionRegex =
        /fn\s+get_albedo_color\s*\([^)]*\)\s*->\s*vec4<f32>\s*\{[^}]*}/;
      shader = shader.replace(albedoFunctionRegex, material.hooks.albedo);
    }
    if (material.hooks.uniforms) {
      shader = shader.replace(
        "//--HOOK_PLACEHOLDER_UNIFORMS--//",
        material.hooks.uniforms,
      );
    }

    const shaderModule = this.device.createShaderModule({
      code: shader,
    });

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
        targets: [
          { format: "rgba8unorm" }, // Albedo
          { format: "rgba16float" }, // Normal
          { format: "rgba8unorm" }, // Metal/Roughness
        ],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "back",
      },
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });

    this.customPipelineCache.set(material, pipeline);
    return pipeline;
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
    } else if (material instanceof MaterialStandardCustom) {
      // Future: Handle textures for custom materials if they have any
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

      material.uniforms.update(material);

      const bindGroup = this.device.createBindGroup({
        layout: this.materialBindGroupLayout,
        entries: [
          { binding: 0, resource: this.defaultSampler },
          { binding: 1, resource: albedoView },
          { binding: 2, resource: normalView },
          { binding: 3, resource: metalRoughnessView },
          { binding: 4, resource: { buffer: material.uniforms.buffer } },
        ],
      });

      this.bindGroupCache.set(material, bindGroup);
      return bindGroup;
    } else if (material instanceof MaterialStandardCustom) {
      material.uniforms.update(material);

      const bindGroup = this.device.createBindGroup({
        layout: this.materialBindGroupLayout,
        entries: [
          { binding: 0, resource: this.defaultSampler },
          // TODO: Add placeholder textures for custom materials
          { binding: 1, resource: this.placeholderNormalTexture.createView() },
          { binding: 2, resource: this.placeholderNormalTexture.createView() },
          {
            binding: 3,
            resource: this.placeholderMetalRoughnessTexture.createView(),
          },
          { binding: 4, resource: { buffer: material.uniforms.buffer } },
        ],
      });

      this.bindGroupCache.set(material, bindGroup);
      return bindGroup;
    }

    return null;
  }
}
