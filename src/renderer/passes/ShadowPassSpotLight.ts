import shader from "./ShadowPassSpotLight.wgsl?raw";
import { Mesh } from "../../mesh";
import { SpotLight } from "../../lights";
import { Vertex } from "../../geometries";
import { MaterialManager } from "../../materials";

export class ShadowPassSpotLight {
  private device: GPUDevice;
  private materialManager: MaterialManager;
  private maxSpotLights: number;
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
    this.meshBindGroupLayout = this.device.createBindGroupLayout({
      label: "Shadow Pass SpotLight Mesh Bind Group Layout",
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
      label: "Shadow Pass SpotLight Pipeline",
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          SpotLight.getShadowBindGroupLayout(this.device),
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
        depthBiasClamp: 0,
      },
    });

    this.transparentPipeline = this.device.createRenderPipeline({
      label: "Shadow Pass SpotLight Transparent Pipeline",
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          SpotLight.getShadowBindGroupLayout(this.device),
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
        depthBias: 4,
        depthBiasSlopeScale: 2.0,
        depthBiasClamp: 0,
      },
    });
  }

  public resize(shadowMapSize: number): void {
    this.shadowMapSize = shadowMapSize;
    this.createShadowResources();
  }

  public render(
    encoder: GPUCommandEncoder,
    spotLights: SpotLight[],
    meshes: Mesh[],
    transparentMeshes: Mesh[] = [],
  ): void {
    for (let lightIndex = 0; lightIndex < spotLights.length; lightIndex++) {
      const light = spotLights[lightIndex];

      light.updateShadowMatrix();

      const visibleMeshes = meshes;
      const visibleTransparentMeshes = transparentMeshes;

      const shadowEncoder = this.device.createCommandEncoder({
        label: `Shadow Pass SpotLight Encoder Light ${lightIndex}`,
      });

      const passEncoder = shadowEncoder.beginRenderPass({
        label: `Shadow Pass SpotLight Light ${lightIndex}`,
        colorAttachments: [],
        depthStencilAttachment: {
          view: this.shadowTextureViews[lightIndex],
          depthClearValue: 1.0,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });

      passEncoder.setPipeline(this.pipeline);

      for (const mesh of visibleMeshes) {
        mesh.uniforms.update(this.device, mesh.transform.getWorldMatrix());

        const meshBindGroup = this.device.createBindGroup({
          label: "Shadow Pass SpotLight Mesh Bind Group",
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

      if (visibleTransparentMeshes.length > 0) {
        passEncoder.setPipeline(this.transparentPipeline);

        for (const mesh of visibleTransparentMeshes) {
          mesh.uniforms.update(this.device, mesh.transform.getWorldMatrix());

          const meshBindGroup = this.device.createBindGroup({
            label: "Shadow Pass SpotLight Transparent Mesh Bind Group",
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

      this.device.queue.submit([shadowEncoder.finish()]);
    }
  }

  public getShadowTextureView(): GPUTextureView {
    return this.shadowTextureView;
  }

  public getShadowTextureViews(): GPUTextureView[] {
    return this.shadowTextureViews;
  }
}
