import { Mesh } from "../../mesh";
import { MaterialManager, MaterialBasic, MaterialPBR, MaterialCustom, MaterialType } from "../../materials";
import { LightManager } from "../../lights/LightManager";
import { SceneUniforms } from "../../uniforms";
import { Camera } from "../../camera";
import { Vertex } from "../../geometries";
import { Vec3 } from "../../math";
import shader from "./ForwardPass.wgsl?raw";
import { InstanceGroupManager, getInstanceBufferLayout } from "../../scene";
import { createCameraBindGroupLayout } from "../../camera/CameraUniforms";

export class ForwardPass {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private materialBindGroupLayout: GPUBindGroupLayout;
  private materialManager: MaterialManager;
  public readonly lightSceneBindGroupLayout: GPUBindGroupLayout;
  public readonly cameraBindGroupLayout: GPUBindGroupLayout;
  private lightManager: LightManager;
  private sceneUniforms: SceneUniforms;
  private sortEnabled: boolean;
  private instanceGroupManager: InstanceGroupManager =
    new InstanceGroupManager();

  private lightSceneBindGroup: GPUBindGroup | null = null;
  private lastShadowTextureView: GPUTextureView | null = null;
  private lastSpotShadowTextureView: GPUTextureView | null = null;
  private lastSkyboxTextureView: GPUTextureView | null = null;
  private lastSkyboxSampler: GPUSampler | null = null;

  constructor(
    device: GPUDevice,
    materialManager: MaterialManager,
    lightManager: LightManager,
    sceneUniforms: SceneUniforms,
    sortEnabled: boolean = true,
  ) {
    this.device = device;
    this.materialManager = materialManager;
    this.materialBindGroupLayout = materialManager.materialBindGroupLayout;
    this.lightManager = lightManager;
    this.sceneUniforms = sceneUniforms;
    this.sortEnabled = sortEnabled;

    const shaderModule = device.createShaderModule({
      code: shader,
    });

    this.cameraBindGroupLayout = createCameraBindGroupLayout(device);

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
          this.cameraBindGroupLayout,
          this.lightSceneBindGroupLayout,
          this.materialBindGroupLayout,
        ],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [Vertex.getBufferLayout(), getInstanceBufferLayout()],
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
    this.instanceGroupManager.beginFrame();
    const instanceGroups = this.instanceGroupManager.buildGroups(
      this.device,
      meshes,
      camera.transform.getWorldPosition(),
    );

    const skyboxTexture = this.sceneUniforms.getSkyboxTexture();
    const skyboxTextureView = skyboxTexture?.gpuTextureView ?? null;
    const skyboxSampler = skyboxTexture?.gpuSampler ?? null;
    const shadowView = this.lightManager.shadowTextureView ?? null;
    const spotShadowView = this.lightManager.spotShadowTextureView ?? null;

    if (
      this.lightSceneBindGroup === null ||
      this.lastShadowTextureView !== shadowView ||
      this.lastSpotShadowTextureView !== spotShadowView ||
      this.lastSkyboxTextureView !== skyboxTextureView ||
      this.lastSkyboxSampler !== skyboxSampler
    ) {
      this.lightSceneBindGroup = this.device.createBindGroup({
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
            resource: shadowView || this.lightManager.dummyShadowTextureView,
          },
          {
            binding: 4,
            resource: { buffer: this.lightManager.spotLightBuffer },
          },
          {
            binding: 5,
            resource: spotShadowView || this.lightManager.dummyShadowTextureView,
          },
          {
            binding: 6,
            resource: skyboxTextureView || this.sceneUniforms.getPlaceholderTextureView(),
          },
          {
            binding: 7,
            resource: skyboxSampler || this.sceneUniforms.getPlaceholderSampler(),
          },
        ],
      });
      this.lastShadowTextureView = shadowView;
      this.lastSpotShadowTextureView = spotShadowView;
      this.lastSkyboxTextureView = skyboxTextureView;
      this.lastSkyboxSampler = skyboxSampler;
    }

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

    passEncoder.setBindGroup(0, camera.uniforms.bindGroup);

    // Optionally sort instance groups by distance for transparency
    if (this.sortEnabled) {
      const cameraPos = camera.transform.getWorldPosition();
      instanceGroups.sort((a, b) => {
        const distA =
          a.meshes.length > 0
            ? Vec3.distanceSquared(a.meshes[0].transform.getWorldPosition(), cameraPos)
            : 0;
        const distB =
          b.meshes.length > 0
            ? Vec3.distanceSquared(b.meshes[0].transform.getWorldPosition(), cameraPos)
            : 0;
        return distB - distA;
      });
    }

    let currentPipeline: GPURenderPipeline | null = null;
    // Tracks whether lightScene is currently bound at group 1
    let lightSceneAtGroup1 = false;

    // Render each instance group
    for (const group of instanceGroups) {
      if (!group.instanceBuffer || group.instanceCount === 0) continue;

      if (group.material.type === MaterialType.Custom) {
        const mat = group.material as MaterialCustom;
        if (!mat.passes.forward) continue;
        const pipeline = this.materialManager.getCustomPipeline(
          mat, "forward", this.cameraBindGroupLayout,
        );
        if (!pipeline) continue;

        if (pipeline !== currentPipeline) {
          passEncoder.setPipeline(pipeline);
          currentPipeline = pipeline;
        }
        // Custom material owns group 1
        passEncoder.setBindGroup(1, mat.bindGroup);
        lightSceneAtGroup1 = false;
        passEncoder.setVertexBuffer(0, group.geometry.vertexBuffer);
        passEncoder.setVertexBuffer(1, group.instanceBuffer);
        passEncoder.setIndexBuffer(group.geometry.indexBuffer, "uint32");
        passEncoder.drawIndexed(group.geometry.indexCount, group.instanceCount);
        continue;
      }

      // Hook or default material — lightScene at group 1, material at group 2
      let pipeline: GPURenderPipeline;
      if (
        (group.material.type === MaterialType.Basic || group.material.type === MaterialType.PBR) &&
        (group.material as MaterialBasic | MaterialPBR).hasHooks
      ) {
        pipeline = this.materialManager.getForwardInstancedHookPipeline(
          group.material as MaterialBasic | MaterialPBR,
          this.cameraBindGroupLayout,
          this.lightSceneBindGroupLayout,
        ) ?? this.pipeline;
      } else {
        pipeline = this.pipeline;
      }

      if (pipeline !== currentPipeline) {
        passEncoder.setPipeline(pipeline);
        currentPipeline = pipeline;
      }

      // Re-bind lightScene if a custom material displaced it
      if (!lightSceneAtGroup1) {
        passEncoder.setBindGroup(1, this.lightSceneBindGroup!);
        lightSceneAtGroup1 = true;
      }

      const materialBindGroup = this.materialManager.getBindGroup(group.material);
      if (!materialBindGroup) continue;

      passEncoder.setBindGroup(2, materialBindGroup);
      passEncoder.setVertexBuffer(0, group.geometry.vertexBuffer);
      passEncoder.setVertexBuffer(1, group.instanceBuffer);
      passEncoder.setIndexBuffer(group.geometry.indexBuffer, "uint32");
      passEncoder.drawIndexed(group.geometry.indexCount, group.instanceCount);
    }

    passEncoder.end();
  }
}
