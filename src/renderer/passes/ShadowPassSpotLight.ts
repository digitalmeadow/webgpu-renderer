import shader from "./ShadowPassSpotLight.wgsl?raw";
import { Mesh } from "../../mesh";
import { SpotLight, getSpotLightShadowBindGroupLayout } from "../../lights";
import { Vertex } from "../../geometries";
import { MaterialManager } from "../../materials";
import { frustumPlanesFromMatrix, aabbInFrustum, Vec3 } from "../../math";
import { InstanceGroupManager, getInstanceBufferLayout } from "../../scene";
import { Camera } from "../../camera";

export class ShadowPassSpotLight {
  private device: GPUDevice;
  private materialManager: MaterialManager;
  private maxSpotLights: number;
  private shadowMapSize: number;
  private pipeline!: GPURenderPipeline;
  private transparentPipeline!: GPURenderPipeline;
  private shadowTexture!: GPUTexture;
  private shadowTextureView!: GPUTextureView;
  private shadowTextureViews: GPUTextureView[] = [];
  private instanceGroupManager: InstanceGroupManager =
    new InstanceGroupManager();

  constructor(
    device: GPUDevice,
    materialManager: MaterialManager,
    maxSpotLights: number = 1,
    shadowMapSize: number = 1024,
  ) {
    this.device = device;
    this.materialManager = materialManager;
    this.maxSpotLights = maxSpotLights;
    this.shadowMapSize = shadowMapSize;

    this.createShadowResources();
    this.createPipelines();
  }

  private createShadowResources(): void {
    if (this.shadowTexture) {
      this.shadowTexture.destroy();
    }
    this.shadowTextureViews = [];

    this.shadowTexture = this.device.createTexture({
      label: "Shadow Pass SpotLight Texture",
      size: {
        width: this.shadowMapSize,
        height: this.shadowMapSize,
        depthOrArrayLayers: this.maxSpotLights,
      },
      format: "depth32float",
      usage:
        GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.shadowTextureView = this.shadowTexture.createView({
      label: "Shadow SpotLight Texture Array View",
      dimension: "2d-array",
    });

    for (let i = 0; i < this.maxSpotLights; i++) {
      const view = this.shadowTexture.createView({
        label: `Shadow SpotLight Texture View ${i}`,
        baseArrayLayer: i,
        arrayLayerCount: 1,
      });
      this.shadowTextureViews.push(view);
    }
  }

  private createPipelines(): void {
    const shaderModule = this.device.createShaderModule({ code: shader });

    this.pipeline = this.device.createRenderPipeline({
      label: "Shadow Pass SpotLight Pipeline",
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
        depthBias: 5000,
        depthBiasSlopeScale: 1.5,
        depthBiasClamp: 0,
      },
    });

    this.transparentPipeline = this.device.createRenderPipeline({
      label: "Shadow Pass SpotLight Transparent Pipeline",
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
        depthBias: 5000,
        depthBiasSlopeScale: 1.5,
        depthBiasClamp: 0,
      },
    });
  }

  public resize(shadowMapSize: number): void {
    this.shadowMapSize = shadowMapSize;
    this.createShadowResources();
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

      const frustumPlanes = frustumPlanesFromMatrix(light.viewProjectionMatrix);

      // Filter visible meshes
      const visibleOpaqueMeshes = opaqueMeshes.filter((mesh) => {
        mesh.updateWorldAABB();
        return aabbInFrustum(mesh.worldAABB, frustumPlanes);
      });

      const visibleAlphaTestMeshes = alphaTestMeshes.filter((mesh) => {
        mesh.updateWorldAABB();
        return aabbInFrustum(mesh.worldAABB, frustumPlanes);
      });

      const visibleTransparentMeshes = transparentMeshes.filter((mesh) => {
        mesh.updateWorldAABB();
        return aabbInFrustum(mesh.worldAABB, frustumPlanes);
      });

      // Build instance groups
      const opaqueGroups = this.instanceGroupManager.buildGroups(
        device,
        visibleOpaqueMeshes,
        camera.transform.getWorldPosition(),
      );
      const alphaTestGroups = this.instanceGroupManager.buildGroups(
        device,
        visibleAlphaTestMeshes,
        camera.transform.getWorldPosition(),
      );
      const transparentGroups = this.instanceGroupManager.buildGroups(
        device,
        visibleTransparentMeshes,
        camera.transform.getWorldPosition(),
      );

      const encoder = device.createCommandEncoder({
        label: `Shadow Pass SpotLight Encoder Light ${lightIndex}`,
      });

      const passEncoder = encoder.beginRenderPass({
        label: `Shadow Pass SpotLight Light ${lightIndex}`,
        colorAttachments: [],
        depthStencilAttachment: {
          view: this.shadowTextureViews[lightIndex],
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

  public getShadowTextureView(): GPUTextureView {
    return this.shadowTextureView;
  }

  public getShadowTextureViews(): GPUTextureView[] {
    return this.shadowTextureViews;
  }
}
