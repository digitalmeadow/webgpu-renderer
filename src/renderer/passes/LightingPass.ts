import shader from "./LightingPass.wgsl?raw";
import { GeometryBuffer } from "../GeometryBuffer";
import { Camera } from "../../camera";
import { SceneUniforms } from "../../uniforms";
import { LightManager } from "../LightManager";

export class LightingPass {
  private pipeline: GPURenderPipeline;
  outputTexture: GPUTexture;
  outputView: GPUTextureView;
  private cameraBindGroupLayout: GPUBindGroupLayout;

  constructor(
    device: GPUDevice,
    geometryBuffer: GeometryBuffer,
    cameraBindGroupLayout: GPUBindGroupLayout,
    lightManager: LightManager,
    width: number,
    height: number,
  ) {
    const shaderModule = device.createShaderModule({
      code: shader,
    });

    this.cameraBindGroupLayout = cameraBindGroupLayout;

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
          this.cameraBindGroupLayout,
          lightManager.lightingBindGroupLayout,
          lightManager.sceneLightBindGroupLayout,
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

  destroy(): void {
    this.outputTexture.destroy();
  }

  render(
    encoder: GPUCommandEncoder,
    geometryBuffer: GeometryBuffer,
    camera: Camera,
    lightManager: LightManager,
  ): void {
    console.log(`[LightingPass] === RENDER LIGHTING PASS ===`);
    console.log(`[LightingPass] geometryBuffer.bindGroup:`, geometryBuffer.bindGroup !== null ? 'OK' : 'NULL');
    console.log(`[LightingPass] camera.uniforms.bindGroup:`, camera.uniforms.bindGroup !== null ? 'OK' : 'NULL');
    console.log(`[LightingPass] lightManager.lightingBindGroup:`, lightManager.lightingBindGroup !== null ? 'OK' : 'NULL');
    console.log(`[LightingPass] lightManager.sceneLightBindGroup:`, lightManager.sceneLightBindGroup !== null ? 'OK' : 'NULL');

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
    passEncoder.setBindGroup(2, lightManager.lightingBindGroup);
    passEncoder.setBindGroup(3, lightManager.sceneLightBindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }
}
