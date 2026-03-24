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

export class GeometryPass {
  private pipeline: GPURenderPipeline;
  public cameraBindGroupLayout: GPUBindGroupLayout;
  public meshBindGroupLayout: GPUBindGroupLayout;

  constructor(
    device: GPUDevice,
    geometryBuffer: GeometryBuffer,
    materialManager: MaterialManager,
  ) {
    const shaderModule = device.createShaderModule({
      code: shader,
    });

    this.cameraBindGroupLayout = device.createBindGroupLayout({
      label: "Camera Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.meshBindGroupLayout = device.createBindGroupLayout({
      label: "Mesh Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.pipeline = device.createRenderPipeline({
      label: "Geometry Pass Pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          this.cameraBindGroupLayout,
          this.meshBindGroupLayout,
          materialManager.materialBindGroupLayout,
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
          { format: "rgba8unorm" }, // Albedo
          { format: "rgba16float" }, // Normal
          { format: "rgba8unorm" }, // Metal/Roughness
        ],
      },
      primitive: {
        topology: "triangle-list",
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

    const renderMesh = (mesh: Mesh) => {
      if (!mesh.uniforms || !mesh.material) return;

      let pipelineToUse: GPURenderPipeline | null = null;

      if (mesh.material.type === MaterialType.Custom) {
        pipelineToUse = materialManager.getCustomPipeline(
          mesh.material as import("../../materials/MaterialCustom").MaterialCustom,
          camera,
          this.meshBindGroupLayout,
          "geometry",
        );
      } else if (
        mesh.material.type === MaterialType.Basic ||
        (mesh.material.type === MaterialType.PBR &&
          (mesh.material as any).hooks.albedo)
      ) {
        const basicOrPbr =
          mesh.material.type === MaterialType.Basic
            ? (mesh.material as MaterialBasic)
            : (mesh.material as MaterialPBR);
        pipelineToUse = materialManager.getHookPipeline(
          basicOrPbr,
          camera,
          this.meshBindGroupLayout,
          "geometry",
        );
      } else {
        pipelineToUse = this.pipeline;
      }

      if (!pipelineToUse) return;

      if (pipelineToUse !== currentPipeline) {
        passEncoder.setPipeline(pipelineToUse);
        currentPipeline = pipelineToUse;
      }

      mesh.uniforms.update(device, mesh.transform.getWorldMatrix());
      passEncoder.setBindGroup(1, mesh.uniforms.bindGroup);

      const materialBindGroup = materialManager.getBindGroup(mesh.material);
      if (!materialBindGroup) {
        return;
      }
      passEncoder.setBindGroup(2, materialBindGroup);

      passEncoder.setVertexBuffer(0, mesh.geometry.vertexBuffer);
      passEncoder.setIndexBuffer(mesh.geometry.indexBuffer, "uint32");
      passEncoder.drawIndexed(mesh.geometry.indexCount);
    };

    for (const mesh of opaqueMeshes) {
      renderMesh(mesh);
    }

    for (const mesh of alphaTestMeshes) {
      renderMesh(mesh);
    }

    passEncoder.end();
  }
}
