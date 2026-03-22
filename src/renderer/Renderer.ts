import { ParticlesPass } from "./passes/ParticlesPass";
import { World, EntityType } from "../scene";
import { Camera } from "../camera";
import { Time } from "../time";
import { GeometryBuffer } from "./GeometryBuffer";
import { GeometryPass } from "./passes/GeometryPass";
import { LightingPass } from "./passes/LightingPass";
import { OutputPass } from "./passes/OutputPass";
import { ForwardPass } from "./passes/ForwardPass";
import { ShadowPassDirectionalLight } from "./passes/ShadowPassDirectionalLight";
import { ShadowPassSpotLight } from "./passes/ShadowPassSpotLight";
import { SkyboxPass } from "./passes/SkyboxPass";
import { MaterialManager } from "../materials";
import { ParticleEmitter } from "../particles";
import { Mesh } from "../mesh";
import { LightManager } from "../lights/LightManager";
import { SceneUniforms } from "../uniforms";
import { Light, DirectionalLight, SpotLight } from "../lights";
import { frustumPlanesFromMatrix, aabbInFrustum } from "../math";
import { CubeTexture } from "../textures/CubeTexture";

export interface RendererOptions {
  maxDirectionalLights?: number;
  maxSpotLights?: number;
}

const DEFAULT_MAX_DIRECTIONAL_LIGHTS = 1;
const DEFAULT_MAX_SPOT_LIGHTS = 1;

export class Renderer {
  private canvas: HTMLCanvasElement;
  private device: GPUDevice;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat;
  private maxDirectionalLights: number;
  private maxSpotLights: number;
  private cameras: Set<Camera> = new Set();

  public frustumCulling: boolean = false;
  public skyboxTexture: CubeTexture | null = null;

  private geometryBuffer: GeometryBuffer;
  private geometryPass: GeometryPass;
  private lightingPass: LightingPass;
  private outputPass: OutputPass;
  private shadowPassDirectionalLight: ShadowPassDirectionalLight;
  private shadowPassSpotLight: ShadowPassSpotLight;
  private particlesPass: ParticlesPass;
  private forwardPass: ForwardPass;
  private skyboxPass: SkyboxPass;
  private materialManager: MaterialManager;
  private lightManager: LightManager;
  private sceneUniforms: SceneUniforms;
  private cameraBindGroupLayout: GPUBindGroupLayout;

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    this.canvas = canvas;
    this.maxDirectionalLights =
      options.maxDirectionalLights ?? DEFAULT_MAX_DIRECTIONAL_LIGHTS;
    this.maxSpotLights = options.maxSpotLights ?? DEFAULT_MAX_SPOT_LIGHTS;
    this.device = null as unknown as GPUDevice;
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.geometryBuffer = null as unknown as GeometryBuffer;
    this.geometryPass = null as unknown as GeometryPass;
    this.lightingPass = null as unknown as LightingPass;
    this.outputPass = null as unknown as OutputPass;
    this.shadowPassDirectionalLight =
      null as unknown as ShadowPassDirectionalLight;
    this.shadowPassSpotLight = null as unknown as ShadowPassSpotLight;
    this.particlesPass = null as unknown as ParticlesPass;
    this.forwardPass = null as unknown as ForwardPass;
    this.skyboxPass = null as unknown as SkyboxPass;
    this.materialManager = null as unknown as MaterialManager;
    this.lightManager = null as unknown as LightManager;
    this.sceneUniforms = null as unknown as SceneUniforms;
    this.cameraBindGroupLayout = null as unknown as GPUBindGroupLayout;
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
    this.lightManager = new LightManager(
      this.device,
      this.maxDirectionalLights,
      this.maxSpotLights,
    );
    this.sceneUniforms = new SceneUniforms(this.device);

    this.setup();

    const rect = this.canvas.getBoundingClientRect();
    this.resize(rect.width, rect.height);
  }

  setup(): void {
    this.geometryBuffer = new GeometryBuffer(
      this.device,
      this.canvas.width,
      this.canvas.height,
    );

    this.cameraBindGroupLayout = this.device.createBindGroupLayout({
      label: "Camera Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.geometryPass = new GeometryPass(
      this.device,
      this.geometryBuffer,
      this.materialManager,
    );

    this.lightingPass = new LightingPass(
      this.device,
      this.geometryBuffer,
      this.cameraBindGroupLayout,
      this.lightManager.lightingBindGroupLayout,
      this.sceneUniforms.bindGroupLayout,
      this.canvas.width,
      this.canvas.height,
    );

    this.outputPass = new OutputPass(this.device);

    this.shadowPassDirectionalLight = new ShadowPassDirectionalLight(
      this.device,
      this.maxDirectionalLights,
    );

    this.shadowPassSpotLight = new ShadowPassSpotLight(
      this.device,
      this.maxSpotLights,
    );

    this.particlesPass = new ParticlesPass(
      this.device,
      this.cameraBindGroupLayout,
    );

    this.forwardPass = new ForwardPass(
      this.device,
      this.materialManager,
      this.geometryPass.meshBindGroupLayout,
      this.lightManager,
      this.sceneUniforms,
    );

    this.skyboxPass = new SkyboxPass(
      this.device,
      this.cameraBindGroupLayout,
      this.geometryBuffer,
    );
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

    for (const camera of this.cameras) {
      camera.resize(this.canvas.width, this.canvas.height);
      camera.update(this.device);
    }
  }

  public registerCamera(camera: Camera): void {
    this.cameras.add(camera);
    if (this.device) {
      camera.resize(this.canvas.width, this.canvas.height);
      camera.update(this.device);
    }
  }

  public unregisterCamera(camera: Camera): void {
    this.cameras.delete(camera);
  }

  public clearCameras(): void {
    this.cameras.clear();
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

    this.cameras.add(camera);

    world.update(time.delta);
    camera.update(this.device);

    const meshes = this.collectVisibleMeshes(world, camera);

    for (const mesh of meshes) {
      if (mesh.skinData) {
        mesh.updateJointMatrices();
      }
    }

    const opaqueMeshes = meshes.filter(
      (m) => m.material?.renderPass === "geometry",
    );
    const transparentMeshes = meshes.filter(
      (m) => m.material?.renderPass === "forward",
    );

    const lights = this.collectLights(world);
    this.sceneUniforms.ambientLightColor = world.ambientLightColor;
    this.sceneUniforms.update();

    const commandEncoder = this.device.createCommandEncoder();

    // Geometry Pass
    this.geometryPass.render(
      this.device,
      commandEncoder,
      this.geometryBuffer,
      opaqueMeshes,
      camera,
      this.materialManager,
    );

    const directionalLights = lights.filter(
      (light) => light.type === EntityType.LightDirectional,
    ) as DirectionalLight[];
    this.lightManager.update(directionalLights, camera);

    const spotLights = lights.filter(
      (light) => light.type === EntityType.LightSpot,
    ) as SpotLight[];
    if (spotLights.length > 0) {
      this.lightManager.updateSpotLights(spotLights);
    }

    // Update all world matrices before shadow pass (handles parented lights)
    world.updateWorldMatrices();

    // Shadow Pass - Directional Lights
    if (directionalLights.length > 0) {
      this.shadowPassDirectionalLight.render(
        commandEncoder,
        directionalLights,
        opaqueMeshes,
        transparentMeshes,
      );

      // Set shadow texture and update lighting bind group
      this.lightManager.setShadowTexture(
        this.shadowPassDirectionalLight.getShadowTextureView(),
        this.shadowPassDirectionalLight.getShadowTextureViews(),
      );
    } else {
      this.lightManager.setShadowTexture(null, null);
    }

    // Shadow Pass - Spot Lights
    if (spotLights.length > 0) {
      this.shadowPassSpotLight.render(
        commandEncoder,
        spotLights,
        opaqueMeshes,
        transparentMeshes,
      );

      this.lightManager.setSpotShadowTexture(
        this.shadowPassSpotLight.getShadowTextureView(),
      );
    }

    this.lightManager.updateLightingBindGroup(directionalLights, spotLights);

    // Lighting Pass
    this.lightingPass.render(
      commandEncoder,
      this.geometryBuffer,
      camera,
      this.lightManager.lightingBindGroup,
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

    // Forward Pass (transparency) - must run BEFORE Skybox Pass
    if (this.forwardPass && transparentMeshes.length > 0) {
      this.forwardPass.render(
        commandEncoder,
        transparentMeshes,
        camera,
        this.lightingPass.outputView,
        this.geometryBuffer.depthView,
      );
    }

    // Skybox Pass - renders background where depth = 1
    if (this.skyboxTexture) {
      this.skyboxPass.setSkyboxTexture(this.skyboxTexture);
      this.skyboxPass.render(
        commandEncoder,
        camera.uniforms.bindGroup,
        this.lightingPass.outputView,
      );
    }

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

  public setSkyboxTexture(texture: CubeTexture | null): void {
    this.skyboxTexture = texture;
  }

  private collectMeshes(world: World): Mesh[] {
    const meshes: Mesh[] = [];
    for (const scene of world.scenes) {
      for (const entity of scene.entities) {
        if (entity.type === EntityType.Mesh) {
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
        if (entity.type === EntityType.ParticleEmitter) {
          emitters.push(entity as ParticleEmitter);
        }
      }
    }
    return emitters;
  }
}
