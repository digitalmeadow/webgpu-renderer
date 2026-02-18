import lightingShader from "./shaders/lighting.wgsl?raw";
import { GeometryBuffer } from "./GeometryBuffer";
import { Camera } from "./Camera";

export class LightingPass {
  private pipeline: GPURenderPipeline;
  outputTexture: GPUTexture;
  outputView: GPUTextureView;

  constructor(
    device: GPUDevice,
    geometryBuffer: GeometryBuffer,
    cameraBindGroupLayout: GPUBindGroupLayout,
    lightBindGroupLayout: GPUBindGroupLayout,
    sceneBindGroupLayout: GPUBindGroupLayout,
    width: number,
    height: number,
  ) {
    const shaderModule = device.createShaderModule({
      code: lightingShader,
    });

    this.outputTexture = device.createTexture({
      label: "Lighting Pass Output Texture",
      size: [width, height],
      format: navigator.gpu.getPreferredCanvasFormat(),
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
    });
    this.outputView = this.outputTexture.createView();

    this.pipeline = device.createRenderPipeline({
      label: "Lighting Pass Pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          geometryBuffer.bindGroupLayout,
          cameraBindGroupLayout,
          lightBindGroupLayout,
          sceneBindGroupLayout,
        ],
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

  resize(device: GPUDevice, width: number, height: number): void {
    this.outputTexture.destroy();
    this.outputTexture = device.createTexture({
      label: "Lighting Pass Output Texture",
      size: [width, height],
      format: navigator.gpu.getPreferredCanvasFormat(),
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
    });
    this.outputView = this.outputTexture.createView();
  }

  render(
    encoder: GPUCommandEncoder,
    geometryBuffer: GeometryBuffer,
    camera: Camera,
    lightBindGroup: GPUBindGroup,
    sceneBindGroup: GPUBindGroup,
  ): void {
    const passEncoder = encoder.beginRenderPass({
      label: "Lighting Pass",
      colorAttachments: [
        {
          view: this.outputView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, geometryBuffer.bindGroup);
    passEncoder.setBindGroup(1, camera.uniforms.bindGroup);
    passEncoder.setBindGroup(2, lightBindGroup);
    passEncoder.setBindGroup(3, sceneBindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }
}
