import geometryShader from "./shaders/geometry.wgsl?raw";
import { Mesh, Vertex } from "./Mesh";
import { Camera } from "./Camera";
import { GeometryBuffer } from "./GeometryBuffer";

export class GeometryPass {
  private pipeline: GPURenderPipeline;

  constructor(device: GPUDevice, geometryBuffer: GeometryBuffer) {
    const shaderModule = device.createShaderModule({
      code: geometryShader,
    });

    const cameraBindGroupLayout = device.createBindGroupLayout({
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

    const bindGroupLayouts: GPUBindGroupLayout[] = [
      cameraBindGroupLayout,
      meshBindGroupLayout,
    ];

    this.pipeline = device.createRenderPipeline({
      label: "Geometry Pass Pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: bindGroupLayouts,
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
          {
            format: "rgba32float",
          },
          {
            format: "rgba32float",
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "back",
      },
      depthStencil: {
        format: "depth24plus",
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
  ): void {
    const passEncoder = encoder.beginRenderPass({
      label: "Geometry Pass",
      colorAttachments: [
        {
          view: geometryBuffer.positionView,
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
      passEncoder.setVertexBuffer(0, mesh.vertexBuffer);
      passEncoder.setIndexBuffer(mesh.indexBuffer, "uint32");
      passEncoder.drawIndexed(mesh.indexCount);
    }

    passEncoder.end();
  }
}
