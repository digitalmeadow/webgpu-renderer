import shader from "./ShadowPassDirectionalLight.wgsl?raw";
import { Mesh } from "../../mesh";
import { DirectionalLight, SHADOW_MAP_CASCADES_COUNT } from "../../lights";
import { Vertex } from "../../geometries";
import { frustumPlanesFromMatrix, aabbInFrustum } from "../../math";
import { MaterialManager } from "../../materials";

export class ShadowPassDirectionalLight {
  private device: GPUDevice;
  private materialManager: MaterialManager;
  private maxDirectionalLights: number;
  private shadowMapSize: number;
  private pipeline!: GPURenderPipeline;
  private transparentPipeline!: GPURenderPipeline;
  private meshBindGroupLayout!: GPUBindGroupLayout;
  private shadowTexture!: GPUTexture;
  private shadowTextureView!: GPUTextureView;
  private shadowTextureViews: GPUTextureView[] = [];

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
    this.meshBindGroupLayout = this.device.createBindGroupLayout({
      label: "Shadow Pass Mesh Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });

    const shaderModule = this.device.createShaderModule({ code: shader });

    this.pipeline = this.device.createRenderPipeline({
      label: "Shadow Pass Pipeline",
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          DirectionalLight.getShadowBindGroupLayout(this.device),
          this.meshBindGroupLayout,
        ],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [Vertex.getBufferLayout()],
      },
      primitive: {
        topology: "triangle-list",
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
      label: "Shadow Pass Transparent Pipeline",
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          DirectionalLight.getShadowBindGroupLayout(this.device),
          this.meshBindGroupLayout,
          this.materialManager.materialBindGroupLayout,
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
  ): void {
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

        // const visibleOpaqueMeshes = opaqueMeshes.filter((mesh) => {
        //   mesh.updateWorldAABB();
        //   return aabbInFrustum(mesh.geometry.aabb, frustumPlanes);
        // });
        //
        // const visibleAlphaTestMeshes = alphaTestMeshes.filter((mesh) => {
        //   mesh.updateWorldAABB();
        //   return aabbInFrustum(mesh.geometry.aabb, frustumPlanes);
        // });
        //
        // const visibleTransparentMeshes = transparentMeshes.filter((mesh) => {
        //   mesh.updateWorldAABB();
        //   return aabbInFrustum(mesh.geometry.aabb, frustumPlanes);
        // });
        // For debugginbg disable frustum culling to ensure all meshes are rendered in the shadow map
        const visibleOpaqueMeshes = opaqueMeshes;
        const visibleAlphaTestMeshes = alphaTestMeshes;
        const visibleTransparentMeshes = transparentMeshes;

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

        passEncoder.setPipeline(this.pipeline);

        for (const mesh of visibleOpaqueMeshes) {
          mesh.uniforms.update(this.device, mesh.transform.getWorldMatrix());

          const meshBindGroup = this.device.createBindGroup({
            label: "Shadow Pass Mesh Bind Group",
            layout: this.meshBindGroupLayout,
            entries: [
              {
                binding: 0,
                resource: { buffer: mesh.uniforms.buffer },
              },
            ],
          });

          passEncoder.setBindGroup(0, light.shadowBindGroup);
          passEncoder.setBindGroup(1, meshBindGroup);
          passEncoder.setVertexBuffer(0, mesh.geometry.vertexBuffer);
          passEncoder.setIndexBuffer(mesh.geometry.indexBuffer, "uint32");
          passEncoder.drawIndexed(mesh.geometry.indexCount);
        }

        if (visibleAlphaTestMeshes.length > 0) {
          passEncoder.setPipeline(this.transparentPipeline);

          for (const mesh of visibleAlphaTestMeshes) {
            mesh.uniforms.update(this.device, mesh.transform.getWorldMatrix());

            const meshBindGroup = this.device.createBindGroup({
              label: "Shadow Pass AlphaTest Mesh Bind Group",
              layout: this.meshBindGroupLayout,
              entries: [
                {
                  binding: 0,
                  resource: { buffer: mesh.uniforms.buffer },
                },
              ],
            });

            const materialBindGroup = mesh.material
              ? this.materialManager.getBindGroup(mesh.material)
              : null;

            passEncoder.setBindGroup(0, light.shadowBindGroup);
            passEncoder.setBindGroup(1, meshBindGroup);
            if (materialBindGroup) {
              passEncoder.setBindGroup(2, materialBindGroup);
            }
            passEncoder.setVertexBuffer(0, mesh.geometry.vertexBuffer);
            passEncoder.setIndexBuffer(mesh.geometry.indexBuffer, "uint32");
            passEncoder.drawIndexed(mesh.geometry.indexCount);
          }
        }

        if (visibleTransparentMeshes.length > 0) {
          passEncoder.setPipeline(this.transparentPipeline);

          for (const mesh of visibleTransparentMeshes) {
            mesh.uniforms.update(this.device, mesh.transform.getWorldMatrix());

            const meshBindGroup = this.device.createBindGroup({
              label: "Shadow Pass Transparent Mesh Bind Group",
              layout: this.meshBindGroupLayout,
              entries: [
                {
                  binding: 0,
                  resource: { buffer: mesh.uniforms.buffer },
                },
              ],
            });

            const materialBindGroup = mesh.material
              ? this.materialManager.getBindGroup(mesh.material)
              : null;

            passEncoder.setBindGroup(0, light.shadowBindGroup);
            passEncoder.setBindGroup(1, meshBindGroup);
            if (materialBindGroup) {
              passEncoder.setBindGroup(2, materialBindGroup);
            }
            passEncoder.setVertexBuffer(0, mesh.geometry.vertexBuffer);
            passEncoder.setIndexBuffer(mesh.geometry.indexBuffer, "uint32");
            passEncoder.drawIndexed(mesh.geometry.indexCount);
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
