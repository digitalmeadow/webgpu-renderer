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
  private lightSceneBindGroupLayout: GPUBindGroupLayout;
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

    this.lightSceneBindGroupLayout = device.createBindGroupLayout({
      label: "Forward Pass Light Scene Bind Group Layout",
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
        {
          binding: 6,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { viewDimension: "cube" },
        },
        {
          binding: 7,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
      ],
    });

    this.pipeline = device.createRenderPipeline({
      label: "Forward Pass Pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          cameraBindGroupLayout,
          this.meshBindGroupLayout,
          this.lightSceneBindGroupLayout,
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
  }

  render(
    encoder: GPUCommandEncoder,
    meshes: Mesh[],
    camera: Camera,
    outputView: GPUTextureView,
    depthView: GPUTextureView,
  ): void {
    const skyboxTexture = this.sceneUniforms.getSkyboxTexture();
    const skyboxTextureView = skyboxTexture?.gpuTextureView;
    const skyboxSampler = skyboxTexture?.gpuSampler;

    const lightSceneBindGroup = this.device.createBindGroup({
      label: "Forward Pass Light Scene Bind Group",
      layout: this.lightSceneBindGroupLayout,
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
          resource:
            this.lightManager.shadowTextureView ||
            this.lightManager.dummyShadowTextureView,
        },
        {
          binding: 4,
          resource: { buffer: this.lightManager.spotLightBuffer },
        },
        {
          binding: 5,
          resource:
            this.lightManager.spotShadowTextureView ||
            this.lightManager.dummyShadowTextureView,
        },
        {
          binding: 6,
          resource:
            skyboxTextureView || this.sceneUniforms.getPlaceholderTextureView(),
        },
        {
          binding: 7,
          resource: skyboxSampler || this.sceneUniforms.getPlaceholderSampler(),
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
    passEncoder.setBindGroup(2, lightSceneBindGroup);

    for (const mesh of meshes) {
      if (!mesh.material) {
        continue;
      }

      const billboardAxis =
        mesh.billboard === "x"
          ? 1
          : mesh.billboard === "y"
            ? 2
            : mesh.billboard === "z"
              ? 3
              : 0;
      mesh.uniforms.update(
        this.device,
        mesh.transform.getWorldMatrix(),
        billboardAxis,
      );

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
