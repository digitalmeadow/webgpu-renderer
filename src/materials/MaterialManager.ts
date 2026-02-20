import { MaterialBase } from "./MaterialBase";
import { MaterialPBR } from "./MaterialPBR";
import { MaterialBasic } from "./MaterialBasic";
import { MaterialCustom } from "./MaterialCustom";
import { Camera } from "../camera";
import { Vertex } from "../geometries";
import { Texture } from "../textures";
import geometryPassShader from "../renderer/passes/GeometryPass.wgsl?raw";
import forwardPassShader from "../renderer/passes/ForwardPass.wgsl?raw";

export class MaterialManager {
  private device: GPUDevice;
  private textureCache: Map<Texture, GPUTexture> = new Map();
  private defaultSampler: GPUSampler;
  private bindGroupCache: Map<MaterialBase, GPUBindGroup> = new Map();
  public readonly materialBindGroupLayout: GPUBindGroupLayout;
  private placeholderNormalTexture: GPUTexture;
  private placeholderMetalRoughnessTexture: GPUTexture;

  private customPipelineCache: Map<MaterialCustom, GPURenderPipeline> = new Map();
  private hookPipelineCache: Map<MaterialPBR | MaterialBasic, GPURenderPipeline> = new Map();

  private baseGeometryShader: string;
  private baseForwardShader: string;

  constructor(device: GPUDevice) {
    this.device = device;

    this.defaultSampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });

    this.placeholderNormalTexture = this.createPlaceholderTexture([
      0, 0, 255, 255,
    ]);
    this.placeholderMetalRoughnessTexture = this.createPlaceholderTexture([
      0, 255, 0, 255,
    ]);

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

    const baseShader = pass === "geometry" ? this.baseGeometryShader : this.baseForwardShader;
    let shader = baseShader;

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
  ): GPURenderPipeline | null {
    if (this.customPipelineCache.has(material)) {
      return this.customPipelineCache.get(material)!;
    }

    const pass = material.renderPass;
    const customShader = material.passes[pass];

    if (!customShader) {
      console.warn(`MaterialCustom "${material.name}" has no shader for pass: ${pass}`);
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
    if (material instanceof MaterialPBR) {
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

  getBindGroup(material: MaterialBase): GPUBindGroup | null {
    if (this.bindGroupCache.has(material)) {
      return this.bindGroupCache.get(material)!;
    }

    if (material instanceof MaterialPBR) {
      if (!material.albedoTexture) return null;
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
    } else if (material instanceof MaterialBasic) {
      material.uniforms.update(material);

      const bindGroup = this.device.createBindGroup({
        layout: this.materialBindGroupLayout,
        entries: [
          { binding: 0, resource: this.defaultSampler },
          { binding: 1, resource: this.placeholderNormalTexture.createView() },
          { binding: 2, resource: this.placeholderNormalTexture.createView() },
          { binding: 3, resource: this.placeholderMetalRoughnessTexture.createView() },
          { binding: 4, resource: { buffer: material.uniforms.buffer } },
        ],
      });

      this.bindGroupCache.set(material, bindGroup);
      return bindGroup;
    } else if (material instanceof MaterialCustom) {
      material.uniforms.update(material);

      const bindGroup = this.device.createBindGroup({
        layout: this.materialBindGroupLayout,
        entries: [
          { binding: 0, resource: this.defaultSampler },
          { binding: 1, resource: this.placeholderNormalTexture.createView() },
          { binding: 2, resource: this.placeholderNormalTexture.createView() },
          { binding: 3, resource: this.placeholderMetalRoughnessTexture.createView() },
          { binding: 4, resource: { buffer: material.uniforms.buffer } },
        ],
      });

      this.bindGroupCache.set(material, bindGroup);
      return bindGroup;
    }

    return null;
  }
}
