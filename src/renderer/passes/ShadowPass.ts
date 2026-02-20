import shader from "./ShadowPass.wgsl?raw";
import { Mesh } from "../../scene";
import { DirectionalLight, SHADOW_MAP_CASCADES_COUNT } from "../../lights";
import { Vertex } from "../../geometries";
import { frustumPlanesFromMatrix, aabbInFrustum } from "../../math";

const SHADOW_MAP_SIZE = 2048;

export class ShadowPass {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private meshBindGroupLayout: GPUBindGroupLayout;
  private shadowTexture: GPUTexture;
  private shadowTextureView: GPUTextureView;
  private shadowTextureViews: GPUTextureView[] = [];

  constructor(device: GPUDevice) {
    this.device = device;

    this.shadowTexture = this.device.createTexture({
      label: "Shadow Pass Directional Texture",
      size: {
        width: SHADOW_MAP_SIZE,
        height: SHADOW_MAP_SIZE,
        depthOrArrayLayers: SHADOW_MAP_CASCADES_COUNT,
      },
      format: "depth32float",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.shadowTextureView = this.shadowTexture.createView({
      label: "Shadow Directional Texture Array View",
      dimension: "2d-array",
    });

    for (let i = 0; i < SHADOW_MAP_CASCADES_COUNT; i++) {
      const view = this.shadowTexture.createView({
        label: `Shadow Directional Texture View ${i}`,
        baseArrayLayer: i,
        arrayLayerCount: 1,
      });
      this.shadowTextureViews.push(view);
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
        cullMode: "front",
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: "less-equal",
        format: "depth32float",
        depthBias: 4,
        depthBiasSlopeScale: 2.0,
        depthBiasClamp: 0.0,
      },
    });
  }

  public render(
    encoder: GPUCommandEncoder,
    directionalLights: DirectionalLight[],
    meshes: Mesh[],
  ): void {
    for (let lightIndex = 0; lightIndex < directionalLights.length; lightIndex++) {
      const light = directionalLights[lightIndex];
      
      for (let cascadeIndex = 0; cascadeIndex < SHADOW_MAP_CASCADES_COUNT; cascadeIndex++) {
        light.setActiveCascadeIndex(cascadeIndex);
        
        const frustumPlanes = frustumPlanesFromMatrix(light.viewProjectionMatrices[cascadeIndex]);
        const visibleMeshes = meshes.filter((mesh) => {
          mesh.updateWorldAABB();
          return aabbInFrustum(mesh.geometry.aabb, frustumPlanes);
        });

        const passEncoder = encoder.beginRenderPass({
          label: `Shadow Pass Light ${lightIndex} Cascade ${cascadeIndex}`,
          colorAttachments: [],
          depthStencilAttachment: {
            view: this.shadowTextureViews[cascadeIndex],
            depthClearValue: 1.0,
            depthLoadOp: "clear",
            depthStoreOp: "store",
          },
        });

        passEncoder.setPipeline(this.pipeline);
        
        for (const mesh of visibleMeshes) {
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
      }
    }
  }

  public getShadowTextureView(): GPUTextureView {
    return this.shadowTextureView;
  }
}
