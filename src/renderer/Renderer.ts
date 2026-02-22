import { ForwardPass } from "./passes/ForwardPass";
import { World } from "../scene";
import { Camera } from "../camera";
import { Time } from "../time";
import { GeometryBuffer } from "./GeometryBuffer";
import { GeometryPass } from "./passes/GeometryPass";
import { LightingPass } from "./passes/LightingPass";
import { OutputPass } from "./passes/OutputPass";
import { ShadowPassDirectional } from "./passes/ShadowPassDirectional";
import { ShadowPassSpot } from "./passes/ShadowPassSpot";
import { MaterialManager } from "../materials";
import { Mesh } from "../scene";

import { LightManager } from "./LightManager";
import { SceneUniforms, ContextBuffer } from "../uniforms";
import { Light, DirectionalLight, SpotLight } from "../lights";
import { frustumPlanesFromMatrix, aabbInFrustum } from "../math";

export class Renderer {
  private canvas: HTMLCanvasElement;
  private device: GPUDevice;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat;

  public frustumCulling: boolean = true;
  public debugShadowMap: boolean = false;

  private geometryBuffer: GeometryBuffer;
  private geometryPass: GeometryPass;
  private lightingPass: LightingPass;
  private outputPass: OutputPass;
  private shadowPassDirectional: ShadowPassDirectional;
  private shadowPassSpot: ShadowPassSpot;
  private forwardPass: ForwardPass;
  private materialManager: MaterialManager;
  private lightManager: LightManager;
  private sceneUniforms: SceneUniforms;
  private contextBuffer: ContextBuffer;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.device = null as unknown as GPUDevice;
    this.context = null as unknown as GPUCanvasContext;
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.geometryBuffer = null as unknown as GeometryBuffer;
    this.geometryPass = null as unknown as GeometryPass;
    this.lightingPass = null as unknown as LightingPass;
    this.outputPass = null as unknown as OutputPass;
    this.shadowPassDirectional = null as unknown as ShadowPassDirectional;
    this.shadowPassSpot = null as unknown as ShadowPassSpot;
    this.forwardPass = null as unknown as ForwardPass;
    this.materialManager = null as unknown as MaterialManager;
    this.lightManager = null as unknown as LightManager;
    this.sceneUniforms = null as unknown as SceneUniforms;
    this.contextBuffer = null as unknown as ContextBuffer;
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
    this.contextBuffer = new ContextBuffer(this.device);

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

      const camera = new Camera(this.device);

      this.geometryPass = new GeometryPass(
        this.device,
        this.geometryBuffer,
        this.materialManager,
      );

      this.lightingPass = new LightingPass(
        this.device,
        this.geometryBuffer,
        camera,
        this.lightManager,
        this.canvas.width,
        this.canvas.height,
      );

      this.outputPass = new OutputPass(this.device);

      this.shadowPassDirectional = new ShadowPassDirectional(
        this.device,
        this.contextBuffer,
      );
      this.shadowPassSpot = new ShadowPassSpot(this.device, this.contextBuffer);

      this.contextBuffer.updateSize(
        this.device,
        width,
        height,
        this.canvas.width,
        this.canvas.height,
      );
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

      this.shadowPassDirectional.resize(
        this.device,
        this.canvas.width,
        this.canvas.height,
      );
      this.shadowPassSpot.resize(
        this.device,
        this.canvas.width,
        this.canvas.height,
      );

      this.contextBuffer.updateSize(
        this.device,
        width,
        height,
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
    const transparentMeshes = meshes.filter(
      (m) => m.material?.renderPass === "forward",
    );

    if (!this.forwardPass && transparentMeshes.length > 0) {
      this.forwardPass = new ForwardPass(
        this.device,
        camera,
        this.materialManager,
        this.geometryPass.meshBindGroupLayout,
      );
    }

    world.update();
    camera.update(this.device);

    const lights = this.collectLights(world);
    this.sceneUniforms.ambientLightColor = world.ambientLightColor;
    this.sceneUniforms.update();

    const commandEncoder = this.device.createCommandEncoder();

    const directionalLights = lights.filter(
      (l) => l instanceof DirectionalLight,
    ) as DirectionalLight[];

    this.contextBuffer.update(this.device, time.elapsed, time.delta);
    this.lightManager.update(lights, [camera]);

    if (directionalLights.length > 0) {
      this.shadowPassDirectional.render(
        commandEncoder,
        directionalLights[0],
        opaqueMeshes,
      );
    }

    const spotLights = lights.filter(
      (l) => l instanceof SpotLight,
    ) as SpotLight[];
    if (spotLights.length > 0) {
      this.shadowPassSpot.render(commandEncoder, spotLights, opaqueMeshes);
    }

    this.lightManager.setDirectionalShadowTexture(
      this.shadowPassDirectional.getShadowTextureView(),
    );
    this.lightManager.setSpotShadowTexture(
      this.shadowPassSpot.getShadowTextureView(),
    );
    this.lightManager.updateLightingBindGroup(
      directionalLights,
      spotLights,
      this.sceneUniforms,
      commandEncoder,
    );
    this.lightManager.updateSceneLightBindGroup(this.lightManager.lightBuffer);

    this.geometryPass.render(
      this.device,
      commandEncoder,
      this.geometryBuffer,
      opaqueMeshes,
      camera,
      this.materialManager,
    );

    this.lightingPass.render(
      commandEncoder,
      this.geometryBuffer,
      camera,
      this.lightManager,
    );

    if (this.forwardPass && transparentMeshes.length > 0) {
      this.forwardPass.render(
        commandEncoder,
        transparentMeshes,
        this.lightingPass.outputView,
        this.geometryBuffer.depthView,
      );
    }

    const swapChainView = this.context.getCurrentTexture().createView();

    if (this.debugShadowMap) {
      this.outputPass.renderDebugDepth(
        commandEncoder,
        this.shadowPassDirectional.getShadowTextureLayerView(0),
        swapChainView,
      );
    } else {
      this.outputPass.render(
        commandEncoder,
        this.lightingPass.outputView,
        swapChainView,
      );
    }

    this.device.queue.submit([commandEncoder.finish()]);
  }

  public getDevice(): GPUDevice {
    return this.device;
  }

  public getMaterialManager(): MaterialManager {
    return this.materialManager;
  }

  destroy(): void {
    this.geometryBuffer?.destroy();
    this.geometryBuffer = null as unknown as GeometryBuffer;
    this.geometryPass = null as unknown as GeometryPass;
    this.lightingPass = null as unknown as LightingPass;
    this.outputPass = null as unknown as OutputPass;
    this.shadowPassDirectional = null as unknown as ShadowPassDirectional;
    this.shadowPassSpot = null as unknown as ShadowPassSpot;
    this.forwardPass = null as unknown as ForwardPass;
    this.materialManager = null as unknown as MaterialManager;
    this.lightManager = null as unknown as LightManager;
    this.sceneUniforms = null as unknown as SceneUniforms;
    this.contextBuffer = null as unknown as ContextBuffer;
  }

  private collectMeshes(world: World): Mesh[] {
    const meshes: Mesh[] = [];
    for (const scene of world.scenes) {
      for (const entity of scene.entities) {
        if (entity instanceof Mesh) {
          meshes.push(entity);
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

    for (const mesh of allMeshes) {
      mesh.updateWorldAABB();
    }

    const cameraViewProjection = camera.viewProjectionMatrix;
    const frustumPlanes = frustumPlanesFromMatrix(cameraViewProjection);

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
}
