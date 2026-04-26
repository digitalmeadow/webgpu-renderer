import shader from "./SkyboxPass.wgsl?raw";
import { CubeTexture } from "../../textures/CubeTexture";
import { GeometryBuffer } from "../GeometryBuffer";

let _skyboxBindGroupLayout: GPUBindGroupLayout | null = null;

export function createSkyboxBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
  if (!_skyboxBindGroupLayout) {
    _skyboxBindGroupLayout = device.createBindGroupLayout({
      label: "Skybox Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { viewDimension: "cube", sampleType: "float" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
      ],
    });
  }
  return _skyboxBindGroupLayout;
}

export class SkyboxPass {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private sampler: GPUSampler;
  private skyboxTexture: CubeTexture | null = null;
  private skyboxBindGroup: GPUBindGroup | null = null;
  private geometryBuffer: GeometryBuffer;

  constructor(
    device: GPUDevice,
    cameraBindGroupLayout: GPUBindGroupLayout,
    geometryBuffer: GeometryBuffer,
    skyboxFilter: "nearest" | "linear" = "linear",
  ) {
    this.device = device;
    this.geometryBuffer = geometryBuffer;

    this.sampler = device.createSampler({
      label: "Skybox Sampler",
      magFilter: skyboxFilter,
      minFilter: skyboxFilter,
      mipmapFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      addressModeW: "clamp-to-edge",
    });

    const shaderModule = device.createShaderModule({
      code: shader,
    });

    this.pipeline = device.createRenderPipeline({
      label: "Skybox Pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          cameraBindGroupLayout,
          createSkyboxBindGroupLayout(device),
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
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: false,
        depthCompare: "less-equal",
      },
    });
  }

  setSkyboxTexture(texture: CubeTexture | null): void {
    this.skyboxTexture = texture;
    this.skyboxBindGroup = null;
  }

  render(
    encoder: GPUCommandEncoder,
    cameraBindGroup: GPUBindGroup,
    outputView: GPUTextureView,
  ): void {
    if (!this.skyboxTexture || !this.skyboxTexture.gpuTexture) {
      return;
    }

    if (!this.skyboxBindGroup) {
      this.skyboxBindGroup = this.device.createBindGroup({
        label: "Skybox Bind Group",
        layout: createSkyboxBindGroupLayout(this.device),
        entries: [
          {
            binding: 0,
            resource: this.skyboxTexture.gpuTextureView!,
          },
          {
            binding: 1,
            resource: this.sampler,
          },
        ],
      });
    }

    const passEncoder = encoder.beginRenderPass({
      label: "Skybox Pass",
      colorAttachments: [
        {
          view: outputView,
          loadOp: "load",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: this.geometryBuffer.depthView,
        depthLoadOp: "load",
        depthStoreOp: "store",
      },
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, cameraBindGroup);
    passEncoder.setBindGroup(1, this.skyboxBindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }

  destroy(): void {
    this.skyboxBindGroup = null;
  }
}
