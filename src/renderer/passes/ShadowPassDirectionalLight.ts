import shader from "./ShadowPassDirectionalLight.wgsl?raw";
import { Mesh } from "../../mesh";
import { DirectionalLight, SHADOW_MAP_CASCADES_COUNT } from "../../lights";
import { Vertex } from "../../geometries";
import { frustumPlanesFromMatrix, aabbInFrustum, Vec3 } from "../../math";
import { MaterialManager } from "../../materials";
import { InstanceGroupManager, getInstanceBufferLayout } from "../../scene";
import { Camera } from "../../camera";

export class ShadowPassDirectionalLight {
  private device: GPUDevice;
  private materialManager: MaterialManager;
  private maxDirectionalLights: number;
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
    maxDirectionalLights: number = 1,
    shadowMapSize: number = 2048,
  ) {
    this.device = device;
    this.materialManager = materialManager;
    this.maxDirectionalLights = maxDirectionalLights;
    this.shadowMapSize = shadowMapSize;

    this.createShadowResources();
    this.createPipelines();
  }

  private createShadowResources(): void {
    const totalLayers = SHADOW_MAP_CASCADES_COUNT * this.maxDirectionalLights;

    if (this.shadowTexture) {
      this.shadowTexture.destroy();
    }
    this.shadowTextureViews = [];

    this.shadowTexture = this.device.createTexture({
      label: "Shadow Pass Directional Texture",
      size: {
        width: this.shadowMapSize,
        height: this.shadowMapSize,
        depthOrArrayLayers: totalLayers,
      },
      format: "depth32float",
      usage:
        GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.shadowTextureView = this.shadowTexture.createView({
      label: "Shadow Directional Texture Array View",
      dimension: "2d-array",
    });

    for (
      let lightIndex = 0;
      lightIndex < this.maxDirectionalLights;
      lightIndex++
    ) {
      for (
        let cascadeIndex = 0;
        cascadeIndex < SHADOW_MAP_CASCADES_COUNT;
        cascadeIndex++
      ) {
        const layerIndex =
          lightIndex * SHADOW_MAP_CASCADES_COUNT + cascadeIndex;
        const view = this.shadowTexture.createView({
          label: `Shadow Directional Texture View Light ${lightIndex} Cascade ${cascadeIndex}`,
          baseArrayLayer: layerIndex,
          arrayLayerCount: 1,
        });
        this.shadowTextureViews.push(view);
      }
    }
  }

  private createPipelines(): void {
    const shaderModule = this.device.createShaderModule({ code: shader });

    // Opaque pipeline: NO fragment shader - uses hardware depth write
    // This is faster and matches the old working behavior
    this.pipeline = this.device.createRenderPipeline({
      label: "Shadow Pass Pipeline",
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          DirectionalLight.getShadowBindGroupLayout(this.device),
        ],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [Vertex.getBufferLayout(), getInstanceBufferLayout()],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "back",
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less-equal",
        format: "depth32float",
        depthBias: 18000,
        depthBiasSlopeScale: 1.5,
        depthBiasClamp: 0,
      },
    });

    // Transparent pipeline: HAS fragment shader for alpha testing
    this.transparentPipeline = this.device.createRenderPipeline({
      label: "Shadow Pass Transparent Pipeline",
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          DirectionalLight.getShadowBindGroupLayout(this.device),
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
    directionalLights: DirectionalLight[],
    opaqueMeshes: Mesh[],
    alphaTestMeshes: Mesh[] = [],
    transparentMeshes: Mesh[] = [],
    camera: Camera,
  ): void {
    // Build instance groups for all mesh types
    const opaqueGroups = this.instanceGroupManager.buildGroups(
      device,
      opaqueMeshes,
      camera.position,
    );
    const alphaTestGroups = this.instanceGroupManager.buildGroups(
      device,
      alphaTestMeshes,
      camera.position,
    );
    const transparentGroups = this.instanceGroupManager.buildGroups(
      device,
      transparentMeshes,
      camera.position,
    );

    for (
      let lightIndex = 0;
      lightIndex < directionalLights.length;
      lightIndex++
    ) {
      const light = directionalLights[lightIndex];

      for (
        let cascadeIndex = 0;
        cascadeIndex < SHADOW_MAP_CASCADES_COUNT;
        cascadeIndex++
      ) {
        light.setActiveCascadeIndex(cascadeIndex);

        const frustumPlanes = frustumPlanesFromMatrix(
          light.viewProjectionMatrices[cascadeIndex],
        );

        // Disable culling for debugging:
        const visibleOpaqueGroups = opaqueGroups;
        const visibleAlphaTestGroups = alphaTestGroups;
        const visibleTransparentGroups = transparentGroups;

        const textureLayerIndex =
          lightIndex * SHADOW_MAP_CASCADES_COUNT + cascadeIndex;

        const encoder = device.createCommandEncoder({
          label: `Shadow Pass Encoder Light ${lightIndex} Cascade ${cascadeIndex}`,
        });

        const passEncoder = encoder.beginRenderPass({
          label: `Shadow Pass Light ${lightIndex} Cascade ${cascadeIndex}`,
          colorAttachments: [],
          depthStencilAttachment: {
            view: this.shadowTextureViews[textureLayerIndex],
            depthClearValue: 1.0,
            depthLoadOp: "clear",
            depthStoreOp: "store",
          },
        });

        // Render opaque meshes (no fragment shader)
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, light.shadowBindGroup);

        for (const group of visibleOpaqueGroups) {
          if (!group.instanceBuffer || group.instanceCount === 0) continue;

          passEncoder.setVertexBuffer(0, group.geometry.vertexBuffer);
          passEncoder.setVertexBuffer(1, group.instanceBuffer);
          passEncoder.setIndexBuffer(group.geometry.indexBuffer, "uint32");
          passEncoder.drawIndexed(
            group.geometry.indexCount,
            group.instanceCount,
          );
        }

        // Render alpha-tested meshes (with fragment shader for alpha discard)
        if (visibleAlphaTestGroups.length > 0) {
          passEncoder.setPipeline(this.transparentPipeline);

          for (const group of visibleAlphaTestGroups) {
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

        // Render transparent meshes (with fragment shader for alpha discard)
        if (visibleTransparentGroups.length > 0) {
          passEncoder.setPipeline(this.transparentPipeline);

          for (const group of visibleTransparentGroups) {
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
  }

  public getShadowTextureView(): GPUTextureView {
    return this.shadowTextureView;
  }

  public getShadowTextureViews(): GPUTextureView[] {
    return this.shadowTextureViews;
  }
}
