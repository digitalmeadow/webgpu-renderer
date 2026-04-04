import { ParticleEmitter } from "../../particles/ParticleEmitter";
import { Camera } from "../../camera";
import { VertexParticle } from "../../particles";
import { ParticleInstanceGPU } from "../../particles";
import { Texture } from "../../textures";
import shader from "./ParticlesPass.wgsl?raw";

export class ParticlesPass {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private sampler: GPUSampler;
  private cameraBindGroupLayout: GPUBindGroupLayout;

  private meshBindGroupLayout: GPUBindGroupLayout;
  private particlesPassBindGroupLayout: GPUBindGroupLayout;

  private textureCache: Map<Texture, GPUTexture> = new Map();
  private placeholderTextureView: GPUTextureView;

  constructor(device: GPUDevice, cameraBindGroupLayout: GPUBindGroupLayout) {
    this.device = device;
    this.cameraBindGroupLayout = cameraBindGroupLayout;

    const shaderModule = device.createShaderModule({
      code: shader,
    });

    this.meshBindGroupLayout = device.createBindGroupLayout({
      label: "MeshParticle Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: "float",
            viewDimension: "2d",
          },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: "float",
            viewDimension: "2d",
          },
        },
      ],
    });

    this.particlesPassBindGroupLayout = device.createBindGroupLayout({
      label: "Particles Pass Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
      ],
    });

    this.sampler = device.createSampler({
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      addressModeW: "clamp-to-edge",
      magFilter: "nearest",
      minFilter: "nearest",
      mipmapFilter: "nearest",
    });

    this.pipeline = device.createRenderPipeline({
      label: "Particles Pass Pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          this.cameraBindGroupLayout,
          this.meshBindGroupLayout,
          this.particlesPassBindGroupLayout,
        ],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [
          VertexParticle.getBufferLayout(),
          ParticleInstanceGPU.getBufferLayout(),
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [
          {
            format: "rgba16float",
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "none",
      },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: "less-equal",
        format: "depth32float",
      },
    });

    this.placeholderTextureView = this.createPlaceholderTextureView();
  }

  render(
    encoder: GPUCommandEncoder,
    camera: Camera,
    emitters: ParticleEmitter[],
    swapChainView: GPUTextureView,
    depthTextureView: GPUTextureView,
  ): void {
    if (emitters.length === 0) {
      return;
    }

    const passEncoder = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: swapChainView,
          loadOp: "load",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthTextureView,
        depthReadOnly: true,
      },
    });

    passEncoder.setPipeline(this.pipeline);

    passEncoder.setBindGroup(0, camera.uniforms.bindGroup);

    for (const emitter of emitters) {
      if (emitter.aliveCount === 0) {
        continue;
      }

      const particlesPassBindGroup = this.device.createBindGroup({
        label: "Particles Pass Bind Group",
        layout: this.particlesPassBindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: this.sampler,
          },
        ],
      });
      passEncoder.setBindGroup(2, particlesPassBindGroup);

      const meshBindGroup = this.device.createBindGroup({
        label: "MeshParticle Bind Group",
        layout: this.meshBindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: { buffer: emitter.meshUniformsBuffer },
          },
          {
            binding: 1,
            resource: { buffer: emitter.materialUniformsBuffer },
          },
          {
            binding: 2,
            resource: this.getTextureView(emitter.material.spriteTexture),
          },
          {
            binding: 3,
            resource: this.getTextureView(emitter.material.gradientMapTexture),
          },
        ],
      });
      passEncoder.setBindGroup(1, meshBindGroup);

      passEncoder.setVertexBuffer(0, emitter.vertexBuffer);
      passEncoder.setVertexBuffer(1, emitter.instanceBuffer);
      passEncoder.setIndexBuffer(emitter.indexBuffer, "uint32");

      passEncoder.drawIndexed(emitter.indexCount, emitter.aliveCount);
    }

    passEncoder.end();
  }

  private getTextureView(texture: Texture | null): GPUTextureView {
    if (!texture) {
      return this.placeholderTextureView;
    }

    if (!this.textureCache.has(texture)) {
      if (!texture.bitmap) {
        return this.placeholderTextureView;
      }

      const gpuTexture = this.device.createTexture({
        size: [texture.bitmap.width, texture.bitmap.height],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });

      this.device.queue.copyExternalImageToTexture(
        { source: texture.bitmap },
        { texture: gpuTexture },
        { width: texture.bitmap.width, height: texture.bitmap.height },
      );

      this.textureCache.set(texture, gpuTexture);
    }

    return this.textureCache.get(texture)!.createView();
  }

  private createPlaceholderTextureView(): GPUTextureView {
    const texture = this.device.createTexture({
      label: "Placeholder Particle Texture",
      size: { width: 1, height: 1, depthOrArrayLayers: 1 },
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const pixel = new Uint8Array([255, 255, 255, 255]);
    this.device.queue.writeTexture(
      { texture },
      pixel,
      { bytesPerRow: 4 },
      { width: 1, height: 1 },
    );

    return texture.createView();
  }
}
