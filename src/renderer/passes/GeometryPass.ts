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
    geometryBuffer: GeometryBuffer,
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
          { format: "rgba8unorm" }, // Albedo
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

  render(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    geometryBuffer: GeometryBuffer,
    opaqueMeshes: Mesh[],
    alphaTestMeshes: Mesh[],
    camera: Camera,
    materialManager: MaterialManager,
  ): void {
    // Build instance groups for all meshes
    const allMeshes = [...opaqueMeshes, ...alphaTestMeshes];
    const instanceGroups = this.instanceGroupManager.buildGroups(
      device,
      allMeshes,
      camera.transform.getWorldPosition(),
    );

    const passEncoder = encoder.beginRenderPass({
      label: "Geometry Pass",
      colorAttachments: [
        {
          view: geometryBuffer.albedoView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
        {
          view: geometryBuffer.normalView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
        {
          view: geometryBuffer.metalRoughnessView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
        {
          view: geometryBuffer.emissiveView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: geometryBuffer.depthView,
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    passEncoder.setBindGroup(0, camera.uniforms.bindGroup);

    let currentPipeline: GPURenderPipeline | null = null;

    // Render each instance group
    for (const group of instanceGroups) {
      if (!group.instanceBuffer || group.instanceCount === 0) continue;

      let pipelineToUse: GPURenderPipeline | null = null;

      // Check if material needs custom pipeline
      if (group.material.type === MaterialType.Custom) {
        // Custom materials need special handling - skip for now
        // TODO: Support custom pipelines with instancing
        pipelineToUse = null;
      } else if (
        group.material.type === MaterialType.Basic ||
        (group.material.type === MaterialType.PBR &&
          (group.material as any).hooks?.albedo)
      ) {
        // Hook/basic materials use their own instanced pipeline (2 bind groups + instance buffer)
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

      // Material bind group moved to group 1 (was group 2)
      const materialBindGroup = materialManager.getBindGroup(group.material);
      if (!materialBindGroup) {
        continue;
      }

      passEncoder.setBindGroup(1, materialBindGroup);

      // Set vertex and instance buffers
      passEncoder.setVertexBuffer(0, group.geometry.vertexBuffer);
      passEncoder.setVertexBuffer(1, group.instanceBuffer);
      passEncoder.setIndexBuffer(group.geometry.indexBuffer, "uint32");

      // Draw all instances in one call
      passEncoder.drawIndexed(group.geometry.indexCount, group.instanceCount);
    }

    passEncoder.end();
  }
}
