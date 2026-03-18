import { Mesh } from "../../mesh";
import { MaterialManager } from "../../materials";
import { LightManager } from "../../lights/LightManager";
import { SceneUniforms } from "../../uniforms";
import { Camera } from "../../camera";
import { Vertex } from "../../geometries";
import shader from "./ForwardPass.wgsl?raw";

export class ForwardPass {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private materialBindGroupLayout: GPUBindGroupLayout;
  private materialManager: MaterialManager;
  private meshBindGroupLayout: GPUBindGroupLayout;
  private globalBindGroupLayout: GPUBindGroupLayout;
  private lightManager: LightManager;
  private sceneUniforms: SceneUniforms;

  constructor(
    device: GPUDevice,
    materialManager: MaterialManager,
    meshBindGroupLayout: GPUBindGroupLayout,
    lightManager: LightManager,
    sceneUniforms: SceneUniforms,
  ) {
    this.device = device;
    this.materialManager = materialManager;
    this.materialBindGroupLayout = materialManager.materialBindGroupLayout;
    this.meshBindGroupLayout = meshBindGroupLayout;
    this.lightManager = lightManager;
    this.sceneUniforms = sceneUniforms;

    const shaderModule = device.createShaderModule({
      code: shader,
    });

    const cameraBindGroupLayout = device.createBindGroupLayout({
      label: "Forward Pass Camera Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.globalBindGroupLayout = device.createBindGroupLayout({
      label: "Forward Pass Global Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "comparison" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "depth", viewDimension: "2d-array" },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 5,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "depth", viewDimension: "2d-array" },
        },
      ],
    });

    this.pipeline = device.createRenderPipeline({
      label: "Forward Pass Pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          cameraBindGroupLayout,
          this.meshBindGroupLayout,
          this.globalBindGroupLayout,
          this.materialBindGroupLayout,
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
          {
            format: navigator.gpu.getPreferredCanvasFormat(),
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
  }

  render(
    encoder: GPUCommandEncoder,
    meshes: Mesh[],
    camera: Camera,
    outputView: GPUTextureView,
    depthView: GPUTextureView,
  ): void {
    const globalBindGroup = this.device.createBindGroup({
      label: "Forward Pass Global Bind Group",
      layout: this.globalBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.sceneUniforms.buffer },
        },
        {
          binding: 1,
          resource: this.lightManager.shadowSampler,
        },
        {
          binding: 2,
          resource: { buffer: this.lightManager.lightBuffer },
        },
        {
          binding: 3,
          resource: this.lightManager.shadowTextureView || this.lightManager.dummyShadowTextureView,
        },
        {
          binding: 4,
          resource: { buffer: this.lightManager.spotLightBuffer },
        },
        {
          binding: 5,
          resource: this.lightManager.spotShadowTextureView || this.lightManager.dummyShadowTextureView,
        },
      ],
    });

    const passEncoder = encoder.beginRenderPass({
      label: "Forward Pass",
      colorAttachments: [
        {
          view: outputView,
          loadOp: "load",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthView,
        depthReadOnly: true,
      },
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, camera.uniforms.bindGroup);
    passEncoder.setBindGroup(2, globalBindGroup);

    for (const mesh of meshes) {
      if (!mesh.material) {
        continue;
      }

      mesh.uniforms.update(this.device, mesh.transform.getWorldMatrix());

      const meshBindGroup = this.device.createBindGroup({
        layout: this.meshBindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: { buffer: mesh.uniforms.buffer },
          },
        ],
      });
      passEncoder.setBindGroup(1, meshBindGroup);

      const materialBindGroup = this.materialManager.getBindGroup(
        mesh.material,
      );
      if (!materialBindGroup) {
        continue;
      }

      passEncoder.setBindGroup(3, materialBindGroup);
      passEncoder.setVertexBuffer(0, mesh.geometry.vertexBuffer);
      passEncoder.setIndexBuffer(mesh.geometry.indexBuffer, "uint32");
      passEncoder.drawIndexed(mesh.geometry.indexCount);
    }

    passEncoder.end();
  }
}
