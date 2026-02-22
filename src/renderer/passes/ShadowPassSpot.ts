import shader from "./ShadowPassSpot.wgsl?raw";
import { Mesh } from "../../scene";
import { SpotLight, MAX_LIGHT_SPOT_COUNT } from "../../lights";
import { Vertex } from "../../geometries";
import { ContextBuffer } from "../../uniforms";

const SHADOW_MAP_SIZE = 1024;

export class ShadowPassSpot {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private meshBindGroupLayout: GPUBindGroupLayout;
  private shadowTexture: GPUTexture;
  private shadowTextureViews: GPUTextureView[];
  private shadowTextureArrayView: GPUTextureView;
  private contextBuffer: ContextBuffer;

  constructor(device: GPUDevice, contextBuffer: ContextBuffer) {
    this.device = device;
    this.contextBuffer = contextBuffer;

    this.shadowTexture = this.device.createTexture({
      label: "Shadow Pass Spot Texture",
      size: {
        width: SHADOW_MAP_SIZE,
        height: SHADOW_MAP_SIZE,
        depthOrArrayLayers: MAX_LIGHT_SPOT_COUNT,
      },
      format: "depth32float",
      usage:
        GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.shadowTextureViews = [];
    for (let i = 0; i < MAX_LIGHT_SPOT_COUNT; i++) {
      this.shadowTextureViews.push(
        this.shadowTexture.createView({
          label: `Shadow Spot Texture View ${i}`,
          dimension: "2d",
          baseArrayLayer: i,
          arrayLayerCount: 1,
        }),
      );
    }

    this.shadowTextureArrayView = this.shadowTexture.createView({
      label: "Shadow Spot Texture Array View",
      dimension: "2d-array",
    });

    this.meshBindGroupLayout = this.device.createBindGroupLayout({
      label: "Shadow Pass Spot Mesh Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });

    const shaderModule = this.device.createShaderModule({ code: shader });

    const lightBindGroupLayout = this.device.createBindGroupLayout({
      label: "Light Spot Uniform Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.pipeline = this.device.createRenderPipeline({
      label: "Shadow Pass Spot Pipeline",
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          this.contextBuffer.bindGroupLayout,
          lightBindGroupLayout,
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
        depthBias: 8,
        depthBiasSlopeScale: 3.0,
        depthBiasClamp: 0.0,
      },
    });
  }

  public render(
    encoder: GPUCommandEncoder,
    lights: SpotLight[],
    meshes: Mesh[],
  ): void {
    for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      if (!light.shadowBindGroup) {
        continue;
      }

      const passEncoder = encoder.beginRenderPass({
        label: `Shadow Pass Spot ${i}`,
        colorAttachments: [],
        depthStencilAttachment: {
          view: this.shadowTextureViews[i],
          depthClearValue: 1.0,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });

      passEncoder.setPipeline(this.pipeline);

      passEncoder.setBindGroup(0, this.contextBuffer.bindGroup);
      passEncoder.setBindGroup(1, light.shadowBindGroup);

      for (const mesh of meshes) {
        mesh.uniforms.update(this.device, mesh.transform.getWorldMatrix());

        const meshBindGroup = this.device.createBindGroup({
          label: "Shadow Pass Spot Mesh Bind Group",
          layout: this.meshBindGroupLayout,
          entries: [
            {
              binding: 0,
              resource: { buffer: mesh.uniforms.buffer },
            },
          ],
        });

        passEncoder.setBindGroup(2, meshBindGroup);
        passEncoder.setVertexBuffer(0, mesh.geometry.vertexBuffer);
        passEncoder.setIndexBuffer(mesh.geometry.indexBuffer, "uint32");
        passEncoder.drawIndexed(mesh.geometry.indexCount);
      }

      passEncoder.end();
    }
  }

  public getShadowTextureView(): GPUTextureView {
    return this.shadowTextureArrayView;
  }

  public resize(device: GPUDevice, width: number, height: number): void {
    this.shadowTexture.destroy();

    this.shadowTexture = this.device.createTexture({
      label: "Shadow Pass Spot Texture",
      size: {
        width: SHADOW_MAP_SIZE,
        height: SHADOW_MAP_SIZE,
        depthOrArrayLayers: MAX_LIGHT_SPOT_COUNT,
      },
      format: "depth32float",
      usage:
        GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.shadowTextureViews = [];
    for (let i = 0; i < MAX_LIGHT_SPOT_COUNT; i++) {
      this.shadowTextureViews.push(
        this.shadowTexture.createView({
          label: `Shadow Spot Texture View ${i}`,
          dimension: "2d",
          baseArrayLayer: i,
          arrayLayerCount: 1,
        }),
      );
    }

    this.shadowTextureArrayView = this.shadowTexture.createView({
      label: "Shadow Spot Texture Array View",
      dimension: "2d-array",
    });
  }

  destroy(): void {
    this.shadowTexture.destroy();
  }
}
