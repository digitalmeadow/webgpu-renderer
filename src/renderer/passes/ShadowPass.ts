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

  constructor(device: GPUDevice) {
    this.device = device;

    this.shadowTexture = this.device.createTexture({
      label: "Shadow Pass Directional Texture",
      size: {
        width: SHADOW_MAP_SIZE,
        height: SHADOW_MAP_SIZE,
        depthOrArrayLayers: 1,
      },
      format: "depth32float",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.shadowTextureView = this.shadowTexture.createView({
      label: "Shadow Directional Texture View",
      dimension: "2d",
    });

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
        depthCompare: "less",
        format: "depth32float",
        depthBias: 4,
        depthBiasSlopeScale: 2.0,
        depthBiasClamp: 0.0,
      },
    });
  }

  public render(
    encoder: GPUCommandEncoder,
    light: DirectionalLight,
    meshes: Mesh[],
  ): void {
    console.log('[ShadowPass] render called with', { meshCount: meshes.length });

    const frustumPlanes = frustumPlanesFromMatrix(light.shadowMatrix);
    const visibleMeshes = meshes.filter((mesh) => {
      mesh.updateWorldAABB();
      return true;
    });

    console.log('[ShadowPass] visible meshes:', visibleMeshes.length);

    const passEncoder = encoder.beginRenderPass({
      label: "Shadow Pass",
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.shadowTextureView,
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    passEncoder.setPipeline(this.pipeline);
    
    for (const mesh of visibleMeshes) {
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
  }

  public getShadowTextureView(): GPUTextureView {
    return this.shadowTextureView;
  }
}
