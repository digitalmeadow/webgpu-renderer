import shader from "./LightingPass.wgsl?raw";
import { GeometryBuffer } from "../GeometryBuffer";
import { Camera } from "../../camera";

export class LightingPass {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  outputTexture: GPUTexture;
  outputView: GPUTextureView;

  constructor(
    device: GPUDevice,
    geometryBuffer: GeometryBuffer,
    cameraBindGroupLayout: GPUBindGroupLayout,
    lightingBindGroupLayout: GPUBindGroupLayout,
    sceneBindGroupLayout: GPUBindGroupLayout,
    width: number,
    height: number,
  ) {
    this.device = device;

    const shaderModule = device.createShaderModule({
      code: shader,
    });

    this.outputTexture = device.createTexture({
      label: "Lighting Pass Output Texture",
      size: [width, height],
      format: "rgba16float",
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
        label: "Lighting Pass Pipeline Layout",
        bindGroupLayouts: [
          geometryBuffer.bindGroupLayout,
          cameraBindGroupLayout,
          lightingBindGroupLayout,
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
            format: "rgba16float",
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
    });
  }

  resize(width: number, height: number): void {
    this.outputTexture.destroy();
    this.outputTexture = this.device.createTexture({
      label: "Lighting Pass Output Texture",
      size: [width, height],
      format: "rgba16float",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
    });
    this.outputView = this.outputTexture.createView();
  }

  destroy(): void {
    this.outputTexture.destroy();
  }

  render(
    encoder: GPUCommandEncoder,
    geometryBuffer: GeometryBuffer,
    camera: Camera,
    lightingBindGroup: GPUBindGroup,
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
    passEncoder.setBindGroup(2, lightingBindGroup);
    passEncoder.setBindGroup(3, sceneBindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }
}
