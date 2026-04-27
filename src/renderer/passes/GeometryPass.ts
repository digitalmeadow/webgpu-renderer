import shader from "./GeometryPass.wgsl?raw";
import { Mesh } from "../../mesh";
import { Vertex } from "../../geometries";
import { Camera } from "../../camera";
import { GeometryBuffer } from "../GeometryBuffer";
import { MaterialManager } from "../../materials";
import {
  MaterialPBR,
  MaterialBasic,
  MaterialCustom,
  MaterialType,
} from "../../materials";
import { InstanceGroupManager, getInstanceBufferLayout } from "../../scene";
import { createCameraBindGroupLayout } from "../../camera/CameraUniforms";

export class GeometryPass {
  private pipeline: GPURenderPipeline;
  public cameraBindGroupLayout: GPUBindGroupLayout;
  private instanceGroupManager: InstanceGroupManager =
    new InstanceGroupManager();

  constructor(
    device: GPUDevice,
    _geometryBuffer: GeometryBuffer,
    materialManager: MaterialManager,
  ) {
    const shaderModule = device.createShaderModule({
      code: shader,
    });

    this.cameraBindGroupLayout = createCameraBindGroupLayout(device);

    this.pipeline = device.createRenderPipeline({
      label: "Geometry Pass Pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          this.cameraBindGroupLayout,
          materialManager.materialBindGroupLayout,
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
          { format: "rgba8unorm-srgb" }, // Albedo — linear in, sRGB stored, auto-decoded on sample
          { format: "rgba16float" }, // Normal
          { format: "rgba8unorm" }, // Metal/Roughness
          { format: "rgba16float" }, // Emissive (HDR)
        ],
      },
      primitive: {
        topology: "triangle-list",
        frontFace: "cw",
        cullMode: "back",
      },
      depthStencil: {
        format: "depth32float",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });
  }

  // Self-contained convenience wrapper used by ReflectionProbePass (opens and
  // closes its own render pass). The main render loop uses draw() instead so
  // GBufferPasses can share the same open pass.
  render(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    geometryBuffer: GeometryBuffer,
    meshes: Mesh[],
    camera: Camera,
    materialManager: MaterialManager,
    // External manager lets callers (e.g. ReflectionProbePass) own buffer lifetime.
    // When provided, beginFrame() is skipped — caller is responsible for cleanup.
    groupManager?: InstanceGroupManager,
  ): void {
    const passEncoder = geometryBuffer.beginRenderPass(encoder);
    this.draw(
      device,
      passEncoder,
      meshes,
      camera,
      materialManager,
      groupManager,
    );
    passEncoder.end();
  }

  draw(
    device: GPUDevice,
    passEncoder: GPURenderPassEncoder,
    meshes: Mesh[],
    camera: Camera,
    materialManager: MaterialManager,
    // External manager lets callers (e.g. ReflectionProbePass) own buffer lifetime.
    // When provided, beginFrame() is skipped — caller is responsible for cleanup.
    groupManager?: InstanceGroupManager,
  ): void {
    const activeManager = groupManager ?? this.instanceGroupManager;
    if (!groupManager) {
      activeManager.beginFrame();
    }
    const instanceGroups = activeManager.buildGroups(
      device,
      meshes,
      camera.transform.getWorldPosition(),
    );

    passEncoder.setBindGroup(0, camera.uniforms.bindGroup);

    let currentPipeline: GPURenderPipeline | null = null;

    for (const group of instanceGroups) {
      if (!group.instanceBuffer || group.instanceCount === 0) continue;

      let pipelineToUse: GPURenderPipeline | null = null;

      if (group.material.type === MaterialType.Custom) {
        const mat = group.material as MaterialCustom;
        if (!mat.passes.geometry) continue;
        pipelineToUse = materialManager.getCustomPipeline(
          mat,
          "geometry",
          this.cameraBindGroupLayout,
        );
        if (!pipelineToUse) continue;

        if (pipelineToUse !== currentPipeline) {
          passEncoder.setPipeline(pipelineToUse);
          currentPipeline = pipelineToUse;
        }

        // Custom materials own their bind group at group 1
        passEncoder.setBindGroup(1, mat.bindGroup);
        passEncoder.setVertexBuffer(0, group.geometry.vertexBuffer);
        passEncoder.setVertexBuffer(1, group.instanceBuffer);
        passEncoder.setIndexBuffer(group.geometry.indexBuffer, "uint32");
        passEncoder.drawIndexed(group.geometry.indexCount, group.instanceCount);
        continue;
      } else if (
        (group.material.type === MaterialType.Basic ||
          group.material.type === MaterialType.PBR) &&
        (group.material as MaterialBasic | MaterialPBR).hasHooks
      ) {
        // Hook materials use their own instanced pipeline (2 bind groups + instance buffer)
        pipelineToUse = materialManager.getGeometryInstancedHookPipeline(
          group.material as MaterialPBR | MaterialBasic,
          this.cameraBindGroupLayout,
        );
      } else {
        pipelineToUse = this.pipeline;
      }

      if (!pipelineToUse) continue;

      if (pipelineToUse !== currentPipeline) {
        passEncoder.setPipeline(pipelineToUse);
        currentPipeline = pipelineToUse;
      }

      const materialBindGroup = materialManager.getBindGroup(group.material);
      if (!materialBindGroup) continue;

      passEncoder.setBindGroup(1, materialBindGroup);

      passEncoder.setVertexBuffer(0, group.geometry.vertexBuffer);
      passEncoder.setVertexBuffer(1, group.instanceBuffer);
      passEncoder.setIndexBuffer(group.geometry.indexBuffer, "uint32");
      passEncoder.drawIndexed(group.geometry.indexCount, group.instanceCount);
    }
  }
}
