import { Mesh } from "../../scene";
import { LightManager } from "../LightManager";
import { MaterialManager } from "../../materials";
import { MaterialPBR, MaterialBasic, MaterialCustom } from "../../materials";
import { Camera } from "../../camera";
import { Vertex } from "../../geometries";
import { SceneUniforms } from "../../uniforms";
import shader from "./ForwardPass.wgsl?raw";

export class ForwardPass {
  private pipeline: GPURenderPipeline;

  constructor(
    private device: GPUDevice,
    private camera: Camera,
    private sceneUniforms: SceneUniforms,
    private lightManager: LightManager,
    private materialManager: MaterialManager,
    private meshBindGroupLayout: GPUBindGroupLayout,
    private globalBindGroupLayout: GPUBindGroupLayout,
    private globalBindGroup: GPUBindGroup,
  ) {
    const shaderModule = this.device.createShaderModule({
      code: shader,
    });

    this.pipeline = this.device.createRenderPipeline({
      label: "Forward Pass Pipeline",
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          this.camera.uniforms.bindGroupLayout,
          this.meshBindGroupLayout,
          this.globalBindGroupLayout,
          this.materialManager.materialBindGroupLayout,
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
    swapChainView: GPUTextureView,
    depthTextureView: GPUTextureView,
  ) {
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

    let currentPipeline: GPURenderPipeline | null = null;

    for (const mesh of meshes) {
      if (!mesh.material) {
        continue;
      }

      let pipelineToUse: GPURenderPipeline | null = null;
      
      if (mesh.material instanceof MaterialCustom) {
        pipelineToUse = this.materialManager.getCustomPipeline(
          mesh.material,
          this.camera,
          this.meshBindGroupLayout,
        );
      } else if (mesh.material instanceof MaterialBasic || 
                 (mesh.material instanceof MaterialPBR && mesh.material.hooks.albedo)) {
        pipelineToUse = this.materialManager.getHookPipeline(
          mesh.material,
          this.camera,
          this.meshBindGroupLayout,
          "forward",
        );
      } else {
        pipelineToUse = this.pipeline;
      }

      if (!pipelineToUse) continue;

      if (pipelineToUse !== currentPipeline) {
        passEncoder.setPipeline(pipelineToUse);
        currentPipeline = pipelineToUse;
      }

      mesh.uniforms.update(this.device, mesh.transform.getWorldMatrix());

      const meshBindGroup = this.device.createBindGroup({
        layout: this.meshBindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: {
              buffer: mesh.uniforms.buffer,
            },
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

      passEncoder.setBindGroup(0, this.camera.uniforms.bindGroup);
      passEncoder.setBindGroup(2, this.globalBindGroup);
      passEncoder.setBindGroup(3, materialBindGroup);
      passEncoder.setVertexBuffer(0, mesh.geometry.vertexBuffer);
      passEncoder.setIndexBuffer(mesh.geometry.indexBuffer, "uint32");
      passEncoder.drawIndexed(mesh.geometry.indexCount);
    }
    passEncoder.end();
  }
}
