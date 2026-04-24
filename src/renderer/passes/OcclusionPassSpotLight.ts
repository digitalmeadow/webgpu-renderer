import shader from "./OcclusionPassSpotLight.wgsl?raw";
import { Mesh } from "../../mesh";
import { SpotLight, getSpotLightShadowBindGroupLayout } from "../../lights";
import { Vertex } from "../../geometries";
import { MaterialManager } from "../../materials";
import { InstanceGroupManager, getInstanceBufferLayout } from "../../scene";
import { Camera } from "../../camera";

export class OcclusionPassSpotLight {
  private device: GPUDevice;
  private materialManager: MaterialManager;
  private maxSpotLights: number;
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
    maxSpotLights: number = 1,
    defaultOcclusionResolution: number = 512,
  ) {
    this.device = device;
    this.materialManager = materialManager;
    this.maxSpotLights = maxSpotLights;
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
      label: "Occlusion Pass SpotLight Texture",
      size: {
        width: this.defaultOcclusionResolution,
        height: this.defaultOcclusionResolution,
        depthOrArrayLayers: this.maxSpotLights,
      },
      format: "depth32float",
      usage:
        GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.occlusionTextureView = this.occlusionTexture.createView({
      label: "Occlusion SpotLight Texture Array View",
      dimension: "2d-array",
    });

    for (let i = 0; i < this.maxSpotLights; i++) {
      const view = this.occlusionTexture.createView({
        label: `Occlusion SpotLight Texture View ${i}`,
        baseArrayLayer: i,
        arrayLayerCount: 1,
      });
      this.occlusionTextureViews.push(view);
    }
  }

  private createPipelines(): void {
    const shaderModule = this.device.createShaderModule({ code: shader });

    this.pipeline = this.device.createRenderPipeline({
      label: "Occlusion Pass SpotLight Pipeline",
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [getSpotLightShadowBindGroupLayout(this.device)],
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
      },
    });

    this.transparentPipeline = this.device.createRenderPipeline({
      label: "Occlusion Pass SpotLight Transparent Pipeline",
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          getSpotLightShadowBindGroupLayout(this.device),
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
      },
    });
  }

  public resize(occlusionResolution: number): void {
    this.defaultOcclusionResolution = occlusionResolution;
    this.createOcclusionResources();
  }

  public render(
    device: GPUDevice,
    spotLights: SpotLight[],
    opaqueMeshes: Mesh[],
    alphaTestMeshes: Mesh[] = [],
    transparentMeshes: Mesh[] = [],
    camera: Camera,
  ): void {
    for (let lightIndex = 0; lightIndex < spotLights.length; lightIndex++) {
      const light = spotLights[lightIndex];

      // Build instance groups
      const opaqueGroups = this.instanceGroupManager.buildGroups(
        device,
        opaqueMeshes,
        camera.transform.getWorldPosition(),
      );
      const alphaTestGroups = this.instanceGroupManager.buildGroups(
        device,
        alphaTestMeshes,
        camera.transform.getWorldPosition(),
      );
      const transparentGroups = this.instanceGroupManager.buildGroups(
        device,
        transparentMeshes,
        camera.transform.getWorldPosition(),
      );

      const encoder = device.createCommandEncoder({
        label: `Occlusion Pass SpotLight Encoder Light ${lightIndex}`,
      });

      const passEncoder = encoder.beginRenderPass({
        label: `Occlusion Pass SpotLight Light ${lightIndex}`,
        colorAttachments: [],
        depthStencilAttachment: {
          view: this.occlusionTextureViews[lightIndex],
          depthClearValue: 1.0,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });

      // Render opaque groups
      passEncoder.setPipeline(this.pipeline);
      passEncoder.setBindGroup(0, light.shadowBindGroup);

      for (const group of opaqueGroups) {
        if (!group.instanceBuffer || group.instanceCount === 0) continue;

        passEncoder.setVertexBuffer(0, group.geometry.vertexBuffer);
        passEncoder.setVertexBuffer(1, group.instanceBuffer);
        passEncoder.setIndexBuffer(group.geometry.indexBuffer, "uint32");
        passEncoder.drawIndexed(group.geometry.indexCount, group.instanceCount);
      }

      // Render alpha-test groups
      if (alphaTestGroups.length > 0) {
        passEncoder.setPipeline(this.transparentPipeline);

        for (const group of alphaTestGroups) {
          if (!group.instanceBuffer || group.instanceCount === 0) continue;

          const materialBindGroup = this.materialManager.getBindGroup(
            group.material,
          );
          if (!materialBindGroup) continue;

          passEncoder.setBindGroup(0, light.shadowBindGroup);
          passEncoder.setBindGroup(1, materialBindGroup);
          passEncoder.setVertexBuffer(0, group.geometry.vertexBuffer);
          passEncoder.setVertexBuffer(1, group.instanceBuffer);
          passEncoder.setIndexBuffer(group.geometry.indexBuffer, "uint32");
          passEncoder.drawIndexed(
            group.geometry.indexCount,
            group.instanceCount,
          );
        }
      }

      // Render transparent groups
      if (transparentGroups.length > 0) {
        passEncoder.setPipeline(this.transparentPipeline);

        for (const group of transparentGroups) {
          if (!group.instanceBuffer || group.instanceCount === 0) continue;

          const materialBindGroup = this.materialManager.getBindGroup(
            group.material,
          );
          if (!materialBindGroup) continue;

          passEncoder.setBindGroup(0, light.shadowBindGroup);
          passEncoder.setBindGroup(1, materialBindGroup);
          passEncoder.setVertexBuffer(0, group.geometry.vertexBuffer);
          passEncoder.setVertexBuffer(1, group.instanceBuffer);
          passEncoder.setIndexBuffer(group.geometry.indexBuffer, "uint32");
          passEncoder.drawIndexed(
            group.geometry.indexCount,
            group.instanceCount,
          );
        }
      }

      passEncoder.end();

      device.queue.submit([encoder.finish()]);
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
