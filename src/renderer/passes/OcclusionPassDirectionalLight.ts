import shader from "./OcclusionPassDirectionalLight.wgsl?raw";
import { Mesh } from "../../mesh";
import {
  DirectionalLight,
  getDirectionalLightShadowBindGroupLayout,
} from "../../lights";
import { Vertex } from "../../geometries";
import { MaterialManager } from "../../materials";
import {
  InstanceGroup,
  InstanceGroupManager,
  getInstanceBufferLayout,
} from "../../scene";

export class OcclusionPassDirectionalLight {
  private device: GPUDevice;
  private materialManager: MaterialManager;
  private maxDirectionalLights: number;
  private defaultOcclusionResolution: number;
  private pipeline!: GPURenderPipeline;
  private transparentPipeline!: GPURenderPipeline;
  private occlusionTexture!: GPUTexture;
  private occlusionTextureView!: GPUTextureView;
  private occlusionTextureViews: GPUTextureView[] = [];
  private instanceGroupManager: InstanceGroupManager =
    new InstanceGroupManager();

  constructor(
    device: GPUDevice,
    materialManager: MaterialManager,
    maxDirectionalLights: number = 1,
    defaultOcclusionResolution: number = 512,
  ) {
    this.device = device;
    this.materialManager = materialManager;
    this.maxDirectionalLights = maxDirectionalLights;
    this.defaultOcclusionResolution = defaultOcclusionResolution;

    this.createOcclusionResources();
    this.createPipelines();
  }

  private createOcclusionResources(): void {
    if (this.occlusionTexture) {
      this.occlusionTexture.destroy();
    }
    this.occlusionTextureViews = [];

    this.occlusionTexture = this.device.createTexture({
      label: "Occlusion Pass Directional Texture",
      size: {
        width: this.defaultOcclusionResolution,
        height: this.defaultOcclusionResolution,
        depthOrArrayLayers: this.maxDirectionalLights,
      },
      format: "depth32float",
      usage:
        GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.occlusionTextureView = this.occlusionTexture.createView({
      label: "Occlusion Directional Texture Array View",
      dimension: "2d-array",
    });

    for (
      let lightIndex = 0;
      lightIndex < this.maxDirectionalLights;
      lightIndex++
    ) {
      const view = this.occlusionTexture.createView({
        label: `Occlusion Directional Texture View Light ${lightIndex}`,
        baseArrayLayer: lightIndex,
        arrayLayerCount: 1,
      });
      this.occlusionTextureViews.push(view);
    }
  }

  private createPipelines(): void {
    const shaderModule = this.device.createShaderModule({ code: shader });

    // Opaque pipeline: NO fragment shader - uses hardware depth write
    this.pipeline = this.device.createRenderPipeline({
      label: "Occlusion Pass Directional Pipeline",
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          getDirectionalLightShadowBindGroupLayout(this.device),
        ],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [Vertex.getBufferLayout(), getInstanceBufferLayout()],
      },
      primitive: {
        topology: "triangle-list",
        frontFace: "cw",
        cullMode: "back",
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less-equal",
        format: "depth32float",
        depthBias: 5000,
        depthBiasSlopeScale: 1.5,
      },
    });

    // Transparent pipeline: HAS fragment shader for alpha testing
    this.transparentPipeline = this.device.createRenderPipeline({
      label: "Occlusion Pass Directional Transparent Pipeline",
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          getDirectionalLightShadowBindGroupLayout(this.device),
          this.materialManager.materialBindGroupLayout,
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
        targets: [],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "none",
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less-equal",
        format: "depth32float",
        depthBias: 5000,
        depthBiasSlopeScale: 1.5,
      },
    });
  }

  public resize(occlusionResolution: number): void {
    this.defaultOcclusionResolution = occlusionResolution;
    this.createOcclusionResources();
  }

  private drawMaskedGroups(
    passEncoder: GPURenderPassEncoder,
    groups: InstanceGroup[],
  ): void {
    for (const group of groups) {
      if (!group.instanceBuffer || group.instanceCount === 0) continue;
      const materialBindGroup = this.materialManager.getBindGroup(
        group.material,
      );
      if (!materialBindGroup) continue;
      passEncoder.setBindGroup(1, materialBindGroup);
      passEncoder.setVertexBuffer(0, group.geometry.vertexBuffer);
      passEncoder.setVertexBuffer(1, group.instanceBuffer);
      passEncoder.setIndexBuffer(group.geometry.indexBuffer, "uint32");
      passEncoder.drawIndexed(group.geometry.indexCount, group.instanceCount);
    }
  }

  public render(
    encoder: GPUCommandEncoder,
    directionalLights: DirectionalLight[],
    opaqueMeshes: Mesh[],
    alphaTestMeshes: Mesh[] = [],
    transparentMeshes: Mesh[] = [],
  ): void {
    this.instanceGroupManager.beginFrame();
    const opaqueGroups = this.instanceGroupManager.buildGroups(
      this.device,
      opaqueMeshes,
    );
    const alphaTestGroups = this.instanceGroupManager.buildGroups(
      this.device,
      alphaTestMeshes,
    );
    const transparentGroups = this.instanceGroupManager.buildGroups(
      this.device,
      transparentMeshes,
    );

    for (
      let lightIndex = 0;
      lightIndex < directionalLights.length;
      lightIndex++
    ) {
      const light = directionalLights[lightIndex];

      const passEncoder = encoder.beginRenderPass({
        label: `Occlusion Pass Light ${lightIndex}`,
        colorAttachments: [],
        depthStencilAttachment: {
          view: this.occlusionTextureViews[lightIndex],
          depthClearValue: 1.0,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });

      // Render opaque meshes (no fragment shader)
      passEncoder.setPipeline(this.pipeline);
      passEncoder.setBindGroup(0, light.occlusionBindGroup);

      for (const group of opaqueGroups) {
        if (!group.instanceBuffer || group.instanceCount === 0) continue;

        passEncoder.setVertexBuffer(0, group.geometry.vertexBuffer);
        passEncoder.setVertexBuffer(1, group.instanceBuffer);
        passEncoder.setIndexBuffer(group.geometry.indexBuffer, "uint32");
        passEncoder.drawIndexed(group.geometry.indexCount, group.instanceCount);
      }

      // Render alpha-tested meshes (with fragment shader for alpha discard)
      if (alphaTestGroups.length > 0) {
        passEncoder.setPipeline(this.transparentPipeline);
        passEncoder.setBindGroup(0, light.occlusionBindGroup);
        this.drawMaskedGroups(passEncoder, alphaTestGroups);
      }

      // Render transparent meshes (with fragment shader for alpha discard)
      if (transparentGroups.length > 0) {
        passEncoder.setPipeline(this.transparentPipeline);
        passEncoder.setBindGroup(0, light.occlusionBindGroup);
        this.drawMaskedGroups(passEncoder, transparentGroups);
      }

      passEncoder.end();
    }
  }

  public getOcclusionTextureView(lightIndex: number): GPUTextureView | null {
    if (lightIndex < 0 || lightIndex >= this.occlusionTextureViews.length) {
      return null;
    }
    return this.occlusionTextureViews[lightIndex];
  }

  public getOcclusionTextureArrayView(): GPUTextureView {
    return this.occlusionTextureView;
  }
}
