import shader from "./ShadowPass.wgsl?raw";
import { Mesh } from "../../mesh";
import { DirectionalLight, SHADOW_MAP_CASCADES_COUNT } from "../../lights";
import { Vertex } from "../../geometries";
import { frustumPlanesFromMatrix, aabbInFrustum } from "../../math";

const SHADOW_MAP_SIZE = 2048;

export class ShadowPass {
  private device: GPUDevice;
  private maxDirectionalLights: number;
  private pipeline: GPURenderPipeline;
  private meshBindGroupLayout: GPUBindGroupLayout;
  private shadowTexture: GPUTexture;
  private shadowTextureView: GPUTextureView;
  private shadowTextureViews: GPUTextureView[] = [];

  constructor(device: GPUDevice, maxDirectionalLights: number = 1) {
    this.device = device;
    this.maxDirectionalLights = maxDirectionalLights;

    const totalLayers = SHADOW_MAP_CASCADES_COUNT * maxDirectionalLights;

    this.shadowTexture = this.device.createTexture({
      label: "Shadow Pass Directional Texture",
      size: {
        width: SHADOW_MAP_SIZE,
        height: SHADOW_MAP_SIZE,
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
        depthBias: 5000, // unsure why this has to be so large?
        depthBiasSlopeScale: 1.5,
        depthBiasClamp: 0,
      },
    });
  }

  public render(
    encoder: GPUCommandEncoder,
    directionalLights: DirectionalLight[],
    meshes: Mesh[],
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
        // CRITICAL: Update the buffer BEFORE recording the render pass
        light.setActiveCascadeIndex(cascadeIndex);

        const frustumPlanes = frustumPlanesFromMatrix(
          light.viewProjectionMatrices[cascadeIndex],
        );

        const visibleMeshes = meshes.filter((mesh) => {
          mesh.updateWorldAABB();
          return aabbInFrustum(mesh.geometry.aabb, frustumPlanes);
        });

        // Create a dedicated encoder for this cascade
        // This ensures the writeBuffer executes before we record the render pass
        const cascadeEncoder = this.device.createCommandEncoder({
          label: `Shadow Pass Encoder Light ${lightIndex} Cascade ${cascadeIndex}`,
        });

        const textureLayerIndex =
          lightIndex * SHADOW_MAP_CASCADES_COUNT + cascadeIndex;
        const passEncoder = cascadeEncoder.beginRenderPass({
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

        for (const mesh of visibleMeshes) {
          // Update mesh world matrix for shadow pass
          // TODO: We probably don't need this since it's called in the GeoPass
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

        passEncoder.end();

        // Submit immediately to ensure this cascade's buffer write has executed
        this.device.queue.submit([cascadeEncoder.finish()]);
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
