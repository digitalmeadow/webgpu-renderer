import outputShader from "./shaders/output.wgsl?raw";
import { GeometryBuffer } from "./GeometryBuffer";

export class OutputPass {
  private pipeline: GPURenderPipeline;

  constructor(device: GPUDevice, geometryBuffer: GeometryBuffer) {
    const shaderModule = device.createShaderModule({
      code: outputShader,
    });

    this.pipeline = device.createRenderPipeline({
      label: "Output Pass Pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [geometryBuffer.bindGroupLayout],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [
          {
            format: navigator.gpu.getPreferredCanvasFormat(),
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
    });
  }

  render(
    encoder: GPUCommandEncoder,
    geometryBuffer: GeometryBuffer,
    textureView: GPUTextureView,
  ): void {
    const passEncoder = encoder.beginRenderPass({
      label: "Output Pass",
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, geometryBuffer.bindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }
}
