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
import { OcclusionPassDirectionalLight } from "./passes/OcclusionPassDirectionalLight";
import { OcclusionPassSpotLight } from "./passes/OcclusionPassSpotLight";
import { SkyboxPass } from "./passes/SkyboxPass";
import { PostPass, PostPassContext } from "./passes/PostPass";
import { ReflectionProbePass } from "./passes/ReflectionProbePass";
import { MaterialManager } from "../materials";
import { ParticleEmitter } from "../particles";
import { Mesh } from "../mesh";
import { LightManager } from "../lights/LightManager";
import { SceneUniforms } from "../uniforms";
import { Light, DirectionalLight, SpotLight } from "../lights";
import { frustumPlanesFromMatrix, aabbInFrustum } from "../math";
import { CubeTexture } from "../textures/CubeTexture";
import { ReflectionProbe } from "../scene/ReflectionProbe";
import { CubeRenderTarget } from "../textures/CubeRenderTarget";

export interface TextureSettings {
  mipmapEnabled?: boolean;
  maxMipLevels?: number | undefined;
  mipmapFilter?: "nearest" | "linear";
}

interface ResolvedTextureSettings {
  mipmapEnabled: boolean;
  maxMipLevels: number | undefined;
  mipmapFilter: "nearest" | "linear";
}

export interface RendererOptions {
  maxDirectionalLights?: number;
  maxSpotLights?: number;
  renderWidth?: number;
  renderHeight?: number;
  devicePixelRatio?: number;
  transparentSortEnabled?: boolean;
  antiAliasingScale?: number;
  textureSettings?: TextureSettings;
}

const DEFAULT_MAX_DIRECTIONAL_LIGHTS = 1;
const DEFAULT_MAX_SPOT_LIGHTS = 1;
const MAX_SHADOW_MAP_SIZE = 2048;
const SHADOW_MAP_SIZE_RATIO = 2;

const DEFAULT_TEXTURE_SETTINGS: ResolvedTextureSettings = {
  mipmapEnabled: true,
  maxMipLevels: undefined,
  mipmapFilter: "linear",
};

export class Renderer {
  private canvas: HTMLCanvasElement;
  private device: GPUDevice;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat;
  private maxDirectionalLights: number;
  private maxSpotLights: number;
  private targetRenderWidth: number;
  private targetRenderHeight: number;
  private devicePixelRatioOption: number;
  private antiAliasingScale: number;
  private textureSettings: ResolvedTextureSettings;
  private cameras: Set<Camera> = new Set();

  public frustumCulling: boolean = false;
  public skyboxTexture: CubeTexture | null = null;
  public transparentSortEnabled: boolean = true;

  public renderWidth: number = 0;
  public renderHeight: number = 0;

  private geometryBuffer: GeometryBuffer;
  private geometryPass: GeometryPass;
  private lightingPass: LightingPass;
  private outputPass: OutputPass;
  private shadowPassDirectionalLight: ShadowPassDirectionalLight;
  private shadowPassSpotLight: ShadowPassSpotLight;
  private occlusionPassDirectionalLight: OcclusionPassDirectionalLight;
  private occlusionPassSpotLight: OcclusionPassSpotLight;
  private particlesPass: ParticlesPass;
  private forwardPass: ForwardPass;
  private skyboxPass: SkyboxPass;
  private reflectionProbePass: ReflectionProbePass;
  private materialManager: MaterialManager;
  private lightManager: LightManager;
  private sceneUniforms: SceneUniforms;
  private cameraBindGroupLayout: GPUBindGroupLayout;
  private postPasses: PostPass[] = [];
  private postPassTextureA: GPUTexture | null = null;
  private postPassTextureB: GPUTexture | null = null;
  private postPassViewA: GPUTextureView | null = null;
  private postPassViewB: GPUTextureView | null = null;
  private highResPostPasses: PostPass[] = [];
  private highResTextureA: GPUTexture | null = null;
  private highResTextureB: GPUTexture | null = null;
  private highResViewA: GPUTextureView | null = null;
  private highResViewB: GPUTextureView | null = null;
  private currentFrame: number = 0;

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    this.canvas = canvas;
    this.maxDirectionalLights =
      options.maxDirectionalLights ?? DEFAULT_MAX_DIRECTIONAL_LIGHTS;
    this.maxSpotLights = options.maxSpotLights ?? DEFAULT_MAX_SPOT_LIGHTS;
    this.targetRenderWidth = options.renderWidth ?? 0;
    this.targetRenderHeight = options.renderHeight ?? 0;
    this.devicePixelRatioOption = options.devicePixelRatio ?? 1;
    this.transparentSortEnabled = options.transparentSortEnabled ?? true;
    this.antiAliasingScale = options.antiAliasingScale ?? 1;
    this.textureSettings = {
      mipmapEnabled:
        options.textureSettings?.mipmapEnabled ??
        DEFAULT_TEXTURE_SETTINGS.mipmapEnabled,
      maxMipLevels:
        options.textureSettings?.maxMipLevels ??
        DEFAULT_TEXTURE_SETTINGS.maxMipLevels,
      mipmapFilter:
        options.textureSettings?.mipmapFilter ??
        DEFAULT_TEXTURE_SETTINGS.mipmapFilter,
    };
    this.device = null as unknown as GPUDevice;
    this.format = "rgba16float";

    this.geometryBuffer = null as unknown as GeometryBuffer;
    this.geometryPass = null as unknown as GeometryPass;
    this.lightingPass = null as unknown as LightingPass;
    this.outputPass = null as unknown as OutputPass;
    this.shadowPassDirectionalLight =
      null as unknown as ShadowPassDirectionalLight;
    this.shadowPassSpotLight = null as unknown as ShadowPassSpotLight;
    this.occlusionPassDirectionalLight =
      null as unknown as OcclusionPassDirectionalLight;
    this.occlusionPassSpotLight = null as unknown as OcclusionPassSpotLight;
    this.particlesPass = null as unknown as ParticlesPass;
    this.forwardPass = null as unknown as ForwardPass;
    this.skyboxPass = null as unknown as SkyboxPass;
    this.reflectionProbePass = null as unknown as ReflectionProbePass;
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

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "opaque",
    });

    this.materialManager = new MaterialManager(
      this.device,
      this.textureSettings,
    );
    this.lightManager = new LightManager(
      this.device,
      this.maxDirectionalLights,
      this.maxSpotLights,
    );
    this.sceneUniforms = new SceneUniforms(this.device);

    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.devicePixelRatioOption;
    const canvasWidth = Math.round(rect.width * dpr);
    const canvasHeight = Math.round(rect.height * dpr);

    if (this.targetRenderWidth === 0 || this.targetRenderHeight === 0) {
      this.renderWidth = Math.round(canvasWidth * this.antiAliasingScale);
      this.renderHeight = Math.round(canvasHeight * this.antiAliasingScale);
    } else {
      this.renderWidth = Math.round(
        this.targetRenderWidth * this.antiAliasingScale,
      );
      this.renderHeight = Math.round(
        this.targetRenderHeight * this.antiAliasingScale,
      );
    }

    this.setup();

    this.resize(rect.width, rect.height);
  }

  setup(): void {
    this.geometryBuffer = new GeometryBuffer(
      this.device,
      this.renderWidth,
      this.renderHeight,
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
      this.renderWidth,
      this.renderHeight,
    );

    this.outputPass = new OutputPass(this.device);

    const shadowMapSize = this.calculateShadowMapSize();
    this.shadowPassDirectionalLight = new ShadowPassDirectionalLight(
      this.device,
      this.materialManager,
      this.maxDirectionalLights,
      shadowMapSize,
    );

    this.shadowPassSpotLight = new ShadowPassSpotLight(
      this.device,
      this.materialManager,
      this.maxSpotLights,
      shadowMapSize,
    );

    this.occlusionPassDirectionalLight = new OcclusionPassDirectionalLight(
      this.device,
      this.materialManager,
      this.maxDirectionalLights,
      512, // default occlusion resolution
    );

    this.occlusionPassSpotLight = new OcclusionPassSpotLight(
      this.device,
      this.materialManager,
      this.maxSpotLights,
      512,
    );

    this.particlesPass = new ParticlesPass(
      this.device,
      this.cameraBindGroupLayout,
    );

    this.forwardPass = new ForwardPass(
      this.device,
      this.materialManager,
      this.lightManager,
      this.sceneUniforms,
      this.transparentSortEnabled,
    );

    this.skyboxPass = new SkyboxPass(
      this.device,
      this.cameraBindGroupLayout,
      this.geometryBuffer,
    );

    this.reflectionProbePass = new ReflectionProbePass(
      this.device,
      this.geometryPass,
      this.lightingPass,
      this.forwardPass,
      this.materialManager,
      this.lightManager,
      this.sceneUniforms,
      this.cameraBindGroupLayout,
    );
  }

  resize(width: number, height: number): void {
    if (!this.device || !this.context) return;

    const dpr = this.devicePixelRatioOption;
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

    if (this.targetRenderWidth === 0 || this.targetRenderHeight === 0) {
      this.renderWidth = Math.round(this.canvas.width * this.antiAliasingScale);
      this.renderHeight = Math.round(
        this.canvas.height * this.antiAliasingScale,
      );
    } else {
      this.renderWidth = Math.round(
        this.targetRenderWidth * this.antiAliasingScale,
      );
      this.renderHeight = Math.round(
        this.targetRenderHeight * this.antiAliasingScale,
      );
    }

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "premultiplied",
    });

    for (const camera of this.cameras) {
      camera.resize(this.canvas.width, this.canvas.height);
      camera.update(this.device);
    }

    this.recreateRenderTargets();
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

    // Collect and render reflection probes BEFORE main scene rendering
    const reflectionProbes = this.collectReflectionProbes(world);
    const probesToUpdate = reflectionProbes.filter((probe) =>
      probe.shouldUpdate(this.currentFrame),
    );

    for (const probe of probesToUpdate) {
      // Update world matrices to ensure probe position is correct
      world.updateWorldMatrices();

      // Render probe
      this.reflectionProbePass.render(probe, world);

      // Mark probe as updated
      probe.markUpdated(this.currentFrame);
    }

    // Separate meshes by alpha mode
    // Opaque probe-affected meshes can use GeometryPass (proper back-face culling)
    // Transparent probe-affected meshes must use ForwardPass (for blending)
    const opaqueMeshes = meshes.filter(
      (m) => m.material?.alphaMode === "opaque",
    );
    const alphaTestMeshes = meshes.filter(
      (m) => m.material?.alphaMode === "mask",
    );
    const ditherMeshes = meshes.filter(
      (m) => m.material?.alphaMode === "dither",
    );
    const blendMeshes = meshes.filter((m) => m.material?.alphaMode === "blend");

    // Only transparent meshes with probe reflections need ForwardPass
    const transparentProbeAffectedMeshes = [...blendMeshes].filter((m) => {
      if (m.material?.type === "materialPBR") {
        const pbrMaterial = m.material as any;
        return pbrMaterial.environmentTexture instanceof CubeRenderTarget;
      }
      return false;
    });
    const normalBlendMeshes = blendMeshes.filter((m) => {
      if (m.material?.type === "materialPBR") {
        const pbrMaterial = m.material as any;
        return !(pbrMaterial.environmentTexture instanceof CubeRenderTarget);
      }
      return true;
    });

    const lights = this.collectLights(world);

    const commandEncoder = this.device.createCommandEncoder();

    // Geometry Pass (includes opaque, mask, and dither)
    const geometryPassMeshes = [...alphaTestMeshes, ...ditherMeshes];
    this.geometryPass.render(
      this.device,
      commandEncoder,
      this.geometryBuffer,
      opaqueMeshes,
      geometryPassMeshes,
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
        this.device,
        directionalLights,
        opaqueMeshes,
        [...alphaTestMeshes, ...ditherMeshes],
        blendMeshes,
        camera,
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
        this.device,
        spotLights,
        opaqueMeshes,
        [...alphaTestMeshes, ...ditherMeshes],
        blendMeshes,
        camera,
      );

      this.lightManager.setSpotShadowTexture(
        this.shadowPassSpotLight.getShadowTextureView(),
      );
    }

    // Occlusion Pass - Directional Lights
    const occlusionEnabledDirectionalLights = directionalLights.filter(
      (l) => l.occlusionEnabled,
    );
    if (occlusionEnabledDirectionalLights.length > 0) {
      // Update occlusion matrices using frustum-based coverage
      for (const light of occlusionEnabledDirectionalLights) {
        light.updateOcclusionMatrixFromFrustum(
          camera.position,
          camera.getForward(),
          camera.near,
          camera.far,
          camera.fov,
          camera.aspect,
        );
      }

      // Render occlusion depth maps
      this.occlusionPassDirectionalLight.render(
        this.device,
        occlusionEnabledDirectionalLights,
        opaqueMeshes,
        [...alphaTestMeshes, ...ditherMeshes],
        blendMeshes,
        camera,
      );

      // Restore shadow matrices to shadow buffer (occlusion overwrote them)
      for (const light of occlusionEnabledDirectionalLights) {
        light.updateShadowBuffer();
      }
    }

    // Occlusion Pass - Spot Lights
    const occlusionEnabledSpotLights = spotLights.filter(
      (l) => l.occlusionEnabled,
    );
    if (occlusionEnabledSpotLights.length > 0) {
      this.occlusionPassSpotLight.render(
        this.device,
        occlusionEnabledSpotLights,
        opaqueMeshes,
        [...alphaTestMeshes, ...ditherMeshes],
        blendMeshes,
        camera,
      );
    }

    this.lightManager.updateLightingBindGroup(directionalLights, spotLights);

    // Update environment texture array for per-material environment maps
    const envTextures = this.materialManager.getEnvironmentTextures();
    this.sceneUniforms.setEnvironmentTextures(envTextures);

    // Lighting Pass
    this.lightingPass.render(
      commandEncoder,
      this.geometryBuffer,
      camera,
      this.lightManager.lightingBindGroup,
      this.sceneUniforms.bindGroup,
    );

    // Skybox Pass - renders background where depth = 1
    if (this.skyboxTexture) {
      this.skyboxPass.setSkyboxTexture(this.skyboxTexture);
      this.skyboxPass.render(
        commandEncoder,
        camera.uniforms.bindGroup,
        this.lightingPass.outputView,
      );
    }

    // Forward Pass (transparent meshes, including transparent probe-affected meshes)
    const forwardPassMeshes = [
      ...normalBlendMeshes,
      ...transparentProbeAffectedMeshes,
    ];
    if (this.forwardPass && forwardPassMeshes.length > 0) {
      this.forwardPass.render(
        commandEncoder,
        forwardPassMeshes,
        camera,
        this.lightingPass.outputView,
        this.geometryBuffer.depthView,
      );
    }

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

    // Post Passes (Low-Res)
    let lastOutputView = this.lightingPass.outputView;
    if (this.postPasses.length > 0) {
      this.createPostPassTextures();

      const postContext: PostPassContext = {
        geometryBuffer: this.geometryBuffer,
        cameraBindGroup: camera.uniforms.bindGroup,
        lightingBindGroup: this.lightManager.lightingBindGroup,
        sceneBindGroup: this.sceneUniforms.bindGroup,
        width: this.renderWidth,
        height: this.renderHeight,
      };

      // Strict A/B ping-pong: pass 0 → B, pass 1 → A, pass 2 → B, ...
      // lightingPass.outputView is the initial read source and is never written to.
      // readView always points to the texture written by the previous pass.
      let readView: GPUTextureView = this.lightingPass.outputView;

      for (let i = 0; i < this.postPasses.length; i++) {
        const writeView =
          i % 2 === 0 ? this.postPassViewB! : this.postPassViewA!;
        this.postPasses[i].render(readView, writeView, postContext);
        readView = writeView;
      }

      lastOutputView = readView;
    }

    // Post Passes (High-Res - Canvas Resolution)
    if (this.highResPostPasses.length > 0) {
      this.createHighResTextures();

      const highResContext: PostPassContext = {
        geometryBuffer: this.geometryBuffer,
        cameraBindGroup: camera.uniforms.bindGroup,
        lightingBindGroup: this.lightManager.lightingBindGroup,
        sceneBindGroup: this.sceneUniforms.bindGroup,
        width: this.canvas.width,
        height: this.canvas.height,
      };

      // Start with the output from low-res post-processing
      let readView: GPUTextureView = lastOutputView;

      for (let i = 0; i < this.highResPostPasses.length; i++) {
        const writeView = i % 2 === 0 ? this.highResViewB! : this.highResViewA!;
        this.highResPostPasses[i].render(readView, writeView, highResContext);
        readView = writeView;
      }

      lastOutputView = readView;
    }

    // Output Pass
    const swapChainView = this.context.getCurrentTexture().createView();
    this.outputPass.render(
      commandEncoder,
      lastOutputView,
      swapChainView,
      this.renderWidth,
      this.renderHeight,
      this.canvas.width,
      this.canvas.height,
    );

    this.device.queue.submit([commandEncoder.finish()]);

    // Increment frame counter for reflection probe update frequency
    this.currentFrame++;
  }

  public getDevice(): GPUDevice {
    return this.device;
  }

  public getSceneUniforms(): SceneUniforms {
    return this.sceneUniforms;
  }

  public getMaterialManager(): MaterialManager {
    return this.materialManager;
  }

  public getCameraBindGroupLayout(): GPUBindGroupLayout {
    return this.cameraBindGroupLayout;
  }

  public getLightingBindGroupLayout(): GPUBindGroupLayout {
    return this.lightManager.lightingBindGroupLayout;
  }

  public setSkyboxTexture(texture: CubeTexture | null): void {
    this.skyboxTexture = texture;
    this.sceneUniforms.setSkyboxTexture(texture);
    this.reflectionProbePass.setSkyboxTexture(texture);
    // Reserve environment texture ID 0 for the global skybox
    this.materialManager.setGlobalSkybox(texture);
  }

  public addPostPass(pass: PostPass): void {
    this.postPasses.push(pass);
  }

  public addHighResPostPass(pass: PostPass): void {
    this.highResPostPasses.push(pass);
  }

  public clearPostPasses(): void {
    this.postPasses = [];
  }

  public clearHighResPostPasses(): void {
    this.highResPostPasses = [];
  }

  private createPostPassTextures(): void {
    if (
      this.postPassTextureA &&
      this.postPassTextureA.width === this.renderWidth &&
      this.postPassTextureA.height === this.renderHeight &&
      this.postPassTextureA.format === "rgba16float"
    ) {
      return;
    }

    if (this.postPassTextureA) {
      this.postPassTextureA.destroy();
    }
    if (this.postPassTextureB) {
      this.postPassTextureB.destroy();
    }

    const createTexture = (label: string) =>
      this.device.createTexture({
        label,
        size: [this.renderWidth, this.renderHeight],
        format: "rgba16float",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.COPY_DST,
      });

    this.postPassTextureA = createTexture("Post Pass Texture A");
    this.postPassTextureB = createTexture("Post Pass Texture B");
    this.postPassViewA = this.postPassTextureA.createView();
    this.postPassViewB = this.postPassTextureB.createView();
  }

  private createHighResTextures(): void {
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    if (
      this.highResTextureA &&
      this.highResTextureA.width === canvasWidth &&
      this.highResTextureA.height === canvasHeight &&
      this.highResTextureA.format === "rgba16float"
    ) {
      return;
    }

    if (this.highResTextureA) {
      this.highResTextureA.destroy();
    }
    if (this.highResTextureB) {
      this.highResTextureB.destroy();
    }

    const createTexture = (label: string) =>
      this.device.createTexture({
        label,
        size: [canvasWidth, canvasHeight],
        format: "rgba16float",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.COPY_DST,
      });

    this.highResTextureA = createTexture("High Res Post Pass Texture A");
    this.highResTextureB = createTexture("High Res Post Pass Texture B");
    this.highResViewA = this.highResTextureA.createView();
    this.highResViewB = this.highResTextureB.createView();
  }

  public setRenderResolution(width: number, height: number): void {
    this.renderWidth = width;
    this.renderHeight = height;
    this.recreateRenderTargets();
  }

  public getRenderResolution(): { width: number; height: number } {
    return { width: this.renderWidth, height: this.renderHeight };
  }

  public getViewportSize(): { width: number; height: number } {
    return { width: this.canvas.width, height: this.canvas.height };
  }

  private calculateShadowMapSize(): number {
    const minDimension = Math.min(this.renderWidth, this.renderHeight);
    return Math.min(minDimension * SHADOW_MAP_SIZE_RATIO, MAX_SHADOW_MAP_SIZE);
  }

  private recreateRenderTargets(): void {
    this.geometryBuffer.resize(
      this.device,
      this.renderWidth,
      this.renderHeight,
    );
    this.lightingPass.resize(this.device, this.renderWidth, this.renderHeight);

    if (this.postPassTextureA) {
      this.postPassTextureA.destroy();
      this.postPassTextureB?.destroy();

      const createTexture = (label: string) =>
        this.device.createTexture({
          label,
          size: [this.renderWidth, this.renderHeight],
          format: "rgba16float",
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.RENDER_ATTACHMENT |
            GPUTextureUsage.COPY_SRC |
            GPUTextureUsage.COPY_DST,
        });

      this.postPassTextureA = createTexture("Post Pass Texture A");
      this.postPassTextureB = createTexture("Post Pass Texture B");
      this.postPassViewA = this.postPassTextureA.createView();
      this.postPassViewB = this.postPassTextureB.createView();
    }

    for (const pass of this.postPasses) {
      pass.resize(this.renderWidth, this.renderHeight);
    }

    if (this.highResTextureA) {
      this.highResTextureA.destroy();
      this.highResTextureB?.destroy();

      const canvasWidth = this.canvas.width;
      const canvasHeight = this.canvas.height;

      const createTexture = (label: string) =>
        this.device.createTexture({
          label,
          size: [canvasWidth, canvasHeight],
          format: "rgba16float",
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.RENDER_ATTACHMENT |
            GPUTextureUsage.COPY_SRC |
            GPUTextureUsage.COPY_DST,
        });

      this.highResTextureA = createTexture("High Res Post Pass Texture A");
      this.highResTextureB = createTexture("High Res Post Pass Texture B");
      this.highResViewA = this.highResTextureA.createView();
      this.highResViewB = this.highResTextureB.createView();
    }

    for (const pass of this.highResPostPasses) {
      pass.resize(this.canvas.width, this.canvas.height);
    }

    const shadowMapSize = this.calculateShadowMapSize();
    this.shadowPassDirectionalLight.resize(shadowMapSize);
    this.shadowPassSpotLight.resize(shadowMapSize);
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

  private collectReflectionProbes(world: World): ReflectionProbe[] {
    const probes: ReflectionProbe[] = [];
    for (const scene of world.scenes) {
      for (const entity of scene.entities) {
        if (entity.type === EntityType.ReflectionProbe) {
          probes.push(entity as ReflectionProbe);
        }
      }
    }
    return probes;
  }

  public getDirectionalLightOcclusionView(
    lightIndex: number,
  ): GPUTextureView | null {
    return this.occlusionPassDirectionalLight.getOcclusionTextureView(
      lightIndex,
    );
  }

  public getSpotLightOcclusionView(lightIndex: number): GPUTextureView | null {
    return this.occlusionPassSpotLight.getOcclusionTextureView(lightIndex);
  }
}
