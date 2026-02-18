import geometryShader from "./shaders/geometry.wgsl?raw";
import { Mesh, Vertex } from "./Mesh";
import { Camera } from "./Camera";
import { GeometryBuffer } from "./GeometryBuffer";
import { MaterialManager } from "./MaterialManager";

export class GeometryPass {
  private pipeline: GPURenderPipeline;
  public cameraBindGroupLayout: GPUBindGroupLayout;

  constructor(
    device: GPUDevice,
    geometryBuffer: GeometryBuffer,
    materialManager: MaterialManager,
  ) {
    const shaderModule = device.createShaderModule({
      code: geometryShader,
    });

    this.cameraBindGroupLayout = device.createBindGroupLayout({
      label: "Camera Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    const meshBindGroupLayout = device.createBindGroupLayout({
      label: "Mesh Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.pipeline = device.createRenderPipeline({
      label: "Geometry Pass Pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          this.cameraBindGroupLayout,
          meshBindGroupLayout,
          materialManager.materialBindGroupLayout,
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
        targets: [
          { format: "rgba8unorm" }, // Albedo
          { format: "rgba16float" }, // Normal
          { format: "rgba8unorm" }, // Metal/Roughness
        ],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "back",
      },
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });
  }

  render(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    geometryBuffer: GeometryBuffer,
    meshes: Mesh[],
    camera: Camera,
    materialManager: MaterialManager,
  ): void {
    const passEncoder = encoder.beginRenderPass({
      label: "Geometry Pass",
      colorAttachments: [
        {
          view: geometryBuffer.albedoView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
        {
          view: geometryBuffer.normalView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
        {
          view: geometryBuffer.metalRoughnessView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: geometryBuffer.depthView,
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, camera.uniforms.bindGroup);

    for (const mesh of meshes) {
      if (!mesh.uniforms) continue;

      mesh.uniforms.update(device, mesh.transform.getWorldMatrix());
      passEncoder.setBindGroup(1, mesh.uniforms.bindGroup);

      if (mesh.material) {
        const materialBindGroup = materialManager.getBindGroup(mesh.material);
        if (materialBindGroup) {
          passEncoder.setBindGroup(2, materialBindGroup);
        }
      }

      passEncoder.setVertexBuffer(0, mesh.vertexBuffer);
      passEncoder.setIndexBuffer(mesh.indexBuffer, "uint32");
      passEncoder.drawIndexed(mesh.indexCount);
    }

    passEncoder.end();
  }
}
