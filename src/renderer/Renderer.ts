import { ParticlesPass } from "./passes/ParticlesPass";
import { World } from "../scene";
import { Camera } from "../camera";
import { Time } from "../time";
import { GeometryBuffer } from "./GeometryBuffer";
import { GeometryPass } from "./passes/GeometryPass";
import { LightingPass } from "./passes/LightingPass";
import { OutputPass } from "./passes/OutputPass";
import { ShadowPass } from "./passes/ShadowPass";
import { MaterialManager } from "../materials";
import { Mesh, ParticleEmitter } from "../scene";

import { LightManager } from "./LightManager";
import { SceneUniforms } from "../uniforms";
import { Light, DirectionalLight, LightType } from "../lights";
import { frustumPlanesFromMatrix, aabbInFrustum } from "../math";

export class Renderer {
  private canvas: HTMLCanvasElement;
  private device: GPUDevice;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat;

  public frustumCulling: boolean = false;

  private geometryBuffer: GeometryBuffer;
  private geometryPass: GeometryPass;
  private lightingPass: LightingPass;
  private outputPass: OutputPass;
  private shadowPass: ShadowPass;
  private particlesPass: ParticlesPass;
  private materialManager: MaterialManager;
  private lightManager: LightManager;
  private sceneUniforms: SceneUniforms;
  private camera: Camera | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.device = null as unknown as GPUDevice;
    // this.context = null as unknown as GPUCanvasContext;
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.geometryBuffer = null as unknown as GeometryBuffer;
    this.geometryPass = null as unknown as GeometryPass;
    this.lightingPass = null as unknown as LightingPass;
    this.outputPass = null as unknown as OutputPass;
    this.shadowPass = null as unknown as ShadowPass;
    this.particlesPass = null as unknown as ParticlesPass;
    this.materialManager = null as unknown as MaterialManager;
    this.lightManager = null as unknown as LightManager;
    this.sceneUniforms = null as unknown as SceneUniforms;
    this.resize(canvas.width, canvas.height);
  }

  async init(): Promise<void> {
    if (!navigator.gpu) {
      throw new Error("WebGPU not supported");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No WebGPU adapter found");
    }

    this.device = await adapter.requestDevice();
    this.context = this.canvas.getContext("webgpu");
    if (!this.context) {
      throw new Error("Could not get WebGPU context");
    }

    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "premultiplied",
    });

    this.materialManager = new MaterialManager(this.device);
    this.lightManager = new LightManager(this.device);
    this.sceneUniforms = new SceneUniforms(this.device);

    const rect = this.canvas.getBoundingClientRect();
    this.resize(rect.width, rect.height);
  }

  resize(width: number, height: number): void {
    if (!this.device || !this.context) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);

    if (this.canvas.width === w && this.canvas.height === h) return;

    this.canvas.width = Math.max(
      1,
      Math.min(w, this.device.limits.maxTextureDimension2D),
    );
    this.canvas.height = Math.max(
      1,
      Math.min(h, this.device.limits.maxTextureDimension2D),
    );

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "premultiplied",
    });

    if (!this.geometryBuffer) {
      this.geometryBuffer = new GeometryBuffer(
        this.device,
        this.canvas.width,
        this.canvas.height,
      );

      this.camera = new Camera(this.device);

      this.geometryPass = new GeometryPass(
        this.device,
        this.geometryBuffer,
        this.materialManager,
      );

      this.lightingPass = new LightingPass(
        this.device,
        this.geometryBuffer,
        this.camera,
        this.lightManager.lightingBindGroupLayout,
        this.sceneUniforms.bindGroupLayout,
        this.canvas.width,
        this.canvas.height,
      );

      this.outputPass = new OutputPass(this.device);

      this.shadowPass = new ShadowPass(this.device);

      this.particlesPass = new ParticlesPass(this.device, this.camera);
    } else {
      this.geometryBuffer.resize(
        this.device,
        this.canvas.width,
        this.canvas.height,
      );

      this.lightingPass.resize(
        this.device,
        this.canvas.width,
        this.canvas.height,
      );
    }
  }

  render(world: World, camera: Camera, time: Time): void {
    if (
      !this.device ||
      !this.context ||
      !this.geometryBuffer ||
      !this.geometryPass ||
      !this.lightingPass ||
      !this.outputPass
    ) {
      return;
    }

    const meshes = this.collectVisibleMeshes(world, camera);
    const opaqueMeshes = meshes.filter(
      (m) => m.material?.renderPass === "geometry",
    );
    // const transparentMeshes = meshes.filter(
    //   (m) => m.material?.renderPass === "forward",
    // );

    // if (!this.forwardPass && transparentMeshes.length > 0) {
    //   // Create Global Bind Group (Scene + Light)
    //   // We need to combine Scene and Light into a single bind group to stay within the 4 bind group limit.
    //   const globalBindGroupLayout = this.device.createBindGroupLayout({
    //     label: "Global Bind Group Layout (Scene + Light)",
    //     entries: [
    //       {
    //         binding: 0,
    //         visibility: GPUShaderStage.FRAGMENT,
    //         buffer: { type: "uniform" },
    //       },
    //       {
    //         binding: 1,
    //         visibility: GPUShaderStage.FRAGMENT,
    //         buffer: { type: "uniform" },
    //       },
    //     ],
    //   });

    //   const globalBindGroup = this.device.createBindGroup({
    //     label: "Global Bind Group (Scene + Light)",
    //     layout: globalBindGroupLayout,
    //     entries: [
    //       {
    //         binding: 0,
    //         resource: { buffer: this.sceneUniforms.buffer },
    //       },
    //       {
    //         binding: 1,
    //         resource: { buffer: this.lightManager.uniformsBuffer },
    //       },
    //     ],
    //   });

    //   this.forwardPass = new ForwardPass(
    //     this.device,
    //     camera,
    //     this.sceneUniforms,
    //     this.lightManager,
    //     this.materialManager,
    //     this.geometryPass.meshBindGroupLayout,
    //     globalBindGroupLayout,
    //     globalBindGroup,
    //   );
    // }

    world.update(time.delta);
    camera.update(this.device);

    const lights = this.collectLights(world);
    this.sceneUniforms.ambientLightColor = world.ambientLightColor;
    this.sceneUniforms.update();

    const commandEncoder = this.device.createCommandEncoder();

    // Collect directional lights using lightType property check instead of instanceof
    const directionalLights = lights.filter(
      (light) => light.type === LightType.Directional,
    ) as DirectionalLight[];
    this.lightManager.update(directionalLights, camera);

    // Geometry Pass
    this.geometryPass.render(
      this.device,
      commandEncoder,
      this.geometryBuffer,
      opaqueMeshes,
      camera,
      this.materialManager,
    );

    // Shadow Pass
    if (directionalLights.length > 0) {
      this.shadowPass.render(commandEncoder, directionalLights, opaqueMeshes);

      // Set shadow texture and update lighting bind group
      this.lightManager.setShadowTexture(
        this.shadowPass.getShadowTextureView(),
      );
      this.lightManager.updateLightingBindGroup(directionalLights);
    }

    // Lighting Pass
    this.lightingPass.render(
      commandEncoder,
      this.geometryBuffer,
      camera,
      this.lightManager.lightingBindGroup || this.lightManager.lightBindGroup,
      this.sceneUniforms.bindGroup,
    );

    // Particles Pass
    const emitters = this.collectParticleEmitters(world);
    for (const emitter of emitters) {
      emitter.update(time.delta);
    }
    if (this.particlesPass && emitters.length > 0) {
      this.particlesPass.render(
        commandEncoder,
        camera,
        emitters,
        this.lightingPass.outputView,
        this.geometryBuffer.depthView,
      );
    }

    // // Forward Pass (transparency) - must run BEFORE Output Pass
    // if (this.forwardPass && transparentMeshes.length > 0) {
    //   this.forwardPass.render(
    //     commandEncoder,
    //     transparentMeshes,
    //     this.lightingPass.outputView,
    //     this.geometryBuffer.depthView,
    //   );
    // }

    // Output Pass
    const swapChainView = this.context.getCurrentTexture().createView();
    this.outputPass.render(
      commandEncoder,
      this.lightingPass.outputView,
      swapChainView,
    );

    this.device.queue.submit([commandEncoder.finish()]);
  }

  public getDevice(): GPUDevice {
    return this.device;
  }

  public getMaterialManager(): MaterialManager {
    return this.materialManager;
  }

  private collectMeshes(world: World): Mesh[] {
    const meshes: Mesh[] = [];
    for (const scene of world.scenes) {
      for (const entity of scene.entities) {
        if (entity.type === "mesh") {
          meshes.push(entity as Mesh);
        }
      }
    }
    return meshes;
  }

  private collectVisibleMeshes(world: World, camera: Camera): Mesh[] {
    const allMeshes = this.collectMeshes(world);

    if (!this.frustumCulling) {
      return allMeshes;
    }

    // Update world AABBs for all meshes first
    for (const mesh of allMeshes) {
      mesh.updateWorldAABB();
    }

    // Get camera frustum planes
    const cameraViewProjection = camera.viewProjectionMatrix;
    const frustumPlanes = frustumPlanesFromMatrix(cameraViewProjection);

    // Filter meshes by frustum culling
    const visibleMeshes: Mesh[] = [];
    for (const mesh of allMeshes) {
      if (aabbInFrustum(mesh.geometry.aabb, frustumPlanes)) {
        visibleMeshes.push(mesh);
      }
    }

    return visibleMeshes;
  }

  private collectLights(world: World): Light[] {
    const lights: Light[] = [];
    for (const scene of world.scenes) {
      lights.push(...scene.lights);
    }
    return lights;
  }

  private collectParticleEmitters(world: World): ParticleEmitter[] {
    const emitters: ParticleEmitter[] = [];
    for (const scene of world.scenes) {
      for (const entity of scene.entities) {
        if (entity.type === "particleEmitter") {
          emitters.push(entity as ParticleEmitter);
        }
      }
    }
    return emitters;
  }
}
