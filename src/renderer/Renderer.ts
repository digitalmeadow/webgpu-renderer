import { ParticlesPass } from "./passes/ParticlesPass";
import { GBufferPass } from "./passes/GBufferPass";
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
import { MaterialType } from "../materials/MaterialBase";
import { MaterialPBR } from "../materials/MaterialPBR";
import { ParticleEmitter } from "../particles";
import { Mesh } from "../mesh";
import { LightManager } from "../lights/LightManager";
import { SceneUniforms } from "../uniforms";
import { Light, DirectionalLight, SpotLight } from "../lights";
import { frustumPlanesFromMatrix, aabbInFrustum } from "../math";
import { CubeTexture } from "../textures/CubeTexture";
import { ReflectionProbe } from "../scene/ReflectionProbe";
import { createCameraBindGroupLayout } from "../camera/CameraUniforms";

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
  alphaMode?: GPUCanvasAlphaMode;
  occlusionMapSize?: number;
}

const DEFAULT_MAX_DIRECTIONAL_LIGHTS = 1;
const DEFAULT_MAX_SPOT_LIGHTS = 1;
const MAX_SHADOW_MAP_SIZE = 2048;
const SHADOW_MAP_SIZE_RATIO = 2;
const DEFAULT_OCCLUSION_MAP_SIZE = 512;

const DEFAULT_TEXTURE_SETTINGS: ResolvedTextureSettings = {
  mipmapEnabled: true,
  maxMipLevels: undefined,
  mipmapFilter: "linear",
};

export class Renderer {
  private canvas: HTMLCanvasElement;
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private format: GPUTextureFormat;
  private alphaMode: GPUCanvasAlphaMode;
  private maxDirectionalLights: number;
  private maxSpotLights: number;
  private occlusionMapSize: number;
  private targetRenderWidth: number;
  private targetRenderHeight: number;
  private devicePixelRatio: number;
  private antiAliasingScale: number;
  private textureSettings: ResolvedTextureSettings;
  private cameras: Set<Camera> = new Set();

  public frustumCulling: boolean = true;
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
  private gBufferPasses: GBufferPass[] = [];
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

  // Scene collection cache
  private cachedMeshes: Mesh[] = [];
  private cachedLights: Light[] = [];
  private cachedEmitters: ParticleEmitter[] = [];
  private cachedReflectionProbes: ReflectionProbe[] = [];
  private lastSceneVersion: number = -1;

  private constructor(
    canvas: HTMLCanvasElement,
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    options: RendererOptions,
  ) {
    this.canvas = canvas;
    this.device = device;
    this.context = context;
    this.format = format;
    this.alphaMode = options.alphaMode ?? "premultiplied";
    this.maxDirectionalLights =
      options.maxDirectionalLights ?? DEFAULT_MAX_DIRECTIONAL_LIGHTS;
    this.maxSpotLights = options.maxSpotLights ?? DEFAULT_MAX_SPOT_LIGHTS;
    this.occlusionMapSize =
      options.occlusionMapSize ?? DEFAULT_OCCLUSION_MAP_SIZE;
    this.targetRenderWidth = options.renderWidth ?? 0;
    this.targetRenderHeight = options.renderHeight ?? 0;
    this.devicePixelRatio = options.devicePixelRatio ?? 1;
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

    // Compute render resolution
    const dpr = this.devicePixelRatio;
    const rect = this.canvas.getBoundingClientRect();
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

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: this.alphaMode,
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

    this.geometryBuffer = new GeometryBuffer(
      this.device,
      this.renderWidth,
      this.renderHeight,
    );
    this.cameraBindGroupLayout = createCameraBindGroupLayout(this.device);

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

    this.outputPass = new OutputPass(this.device, this.format);

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
      this.occlusionMapSize,
    );

    this.occlusionPassSpotLight = new OcclusionPassSpotLight(
      this.device,
      this.materialManager,
      this.maxSpotLights,
      this.occlusionMapSize,
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

    this.resize(rect.width, rect.height);
  }

  static async create(
    canvas: HTMLCanvasElement,
    options: RendererOptions = {},
  ): Promise<Renderer> {
    if (!navigator.gpu) {
      throw new Error("WebGPU not supported");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No WebGPU adapter found");
    }

    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    if (!context) {
      throw new Error("Could not get WebGPU context");
    }

    const format = navigator.gpu.getPreferredCanvasFormat();

    return new Renderer(canvas, device, context, format, options);
  }

  resize(width: number, height: number): void {
    if (!this.device || !this.context) return;

    const dpr = this.devicePixelRatio;
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
      alphaMode: this.alphaMode,
    });

    for (const camera of this.cameras) {
      camera.resize(this.canvas.width, this.canvas.height);
      camera.update();
    }

    this.recreateRenderTargets();
  }

  public registerCamera(camera: Camera): void {
    this.cameras.add(camera);
    if (this.device) {
      camera.resize(this.canvas.width, this.canvas.height);
      camera.update();
    }
  }

  public unregisterCamera(camera: Camera): void {
    this.cameras.delete(camera);
  }

  public clearCameras(): void {
    this.cameras.clear();
  }

  render(world: World, camera: Camera, time: Time): void {
    camera.update();

    const meshes = this.collectVisibleMeshes(world, camera);

    for (const mesh of meshes) {
      if (mesh.skinData) {
        mesh.updateJointMatrices(this.device);
      }
    }

    // Separate meshes by alpha mode
    // Opaque/mask/dither use GeometryPass (deferred); blend uses ForwardPass
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

    // Transparent PBR meshes with probe render targets need ForwardPass for up-to-date reflections
    const transparentProbeAffectedMeshes = blendMeshes.filter((m) => {
      return (
        m.material?.type === MaterialType.PBR &&
        (m.material as MaterialPBR).environmentTexture?.isRenderTarget === true
      );
    });
    const normalBlendMeshes = blendMeshes.filter((m) => {
      return !(
        m.material?.type === MaterialType.PBR &&
        (m.material as MaterialPBR).environmentTexture?.isRenderTarget === true
      );
    });

    const lights = this.collectLights(world);
    const directionalLights = lights.filter(
      (light) => light.type === EntityType.LightDirectional,
    ) as DirectionalLight[];
    const spotLights = lights.filter(
      (light) => light.type === EntityType.LightSpot,
    ) as SpotLight[];

    this.renderReflectionProbes(world);

    const commandEncoder = this.device.createCommandEncoder();

    // Single G-buffer render pass shared by GeometryPass and all GBufferPasses —
    // avoids per-pass tile flushes on tile-based GPUs (Apple Silicon).
    const gBufferPassEncoder = this.geometryBuffer.beginRenderPass(commandEncoder);

    this.geometryPass.draw(
      this.device,
      gBufferPassEncoder,
      [...opaqueMeshes, ...alphaTestMeshes, ...ditherMeshes],
      camera,
      this.materialManager,
    );

    for (const pass of this.gBufferPasses) {
      pass.render(gBufferPassEncoder, camera, time);
    }

    gBufferPassEncoder.end();

    this.lightManager.update(directionalLights, camera);
    if (spotLights.length > 0) {
      this.lightManager.updateSpotLights(spotLights);
    }

    this.renderShadowAndOcclusion(
      commandEncoder,
      directionalLights,
      spotLights,
      opaqueMeshes,
      [...alphaTestMeshes, ...ditherMeshes],
      blendMeshes,
      camera,
    );

    this.lightManager.updateLightingBindGroup(directionalLights, spotLights);

    if (this.materialManager.environmentTexturesNeedsUpdate) {
      this.sceneUniforms.setEnvironmentTextures(
        this.materialManager.getEnvironmentTextures(),
      );
      this.materialManager.environmentTexturesNeedsUpdate = false;
    }

    // Lighting Pass
    this.lightingPass.render(
      commandEncoder,
      this.geometryBuffer,
      camera,
      this.lightManager.lightingBindGroup,
      this.sceneUniforms.bindGroup,
    );

    // Skybox renders into depth=1 regions
    if (this.skyboxTexture) {
      this.skyboxPass.setSkyboxTexture(this.skyboxTexture);
      this.skyboxPass.render(
        commandEncoder,
        camera.uniforms.bindGroup,
        this.lightingPass.outputView,
      );
    }

    // Forward Pass (transparent meshes)
    const forwardPassMeshes = [
      ...normalBlendMeshes,
      ...transparentProbeAffectedMeshes,
    ];
    if (forwardPassMeshes.length > 0) {
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
      emitter.updateParticles(this.device, time.delta);
    }
    if (emitters.length > 0) {
      this.particlesPass.render(
        commandEncoder,
        camera,
        emitters,
        this.lightingPass.outputView,
        this.geometryBuffer.depthView,
      );
    }

    const lastOutputView = this.renderPostProcessing(camera);

    // Output Pass — blit to swap chain
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

    this.currentFrame++;
  }

  private renderReflectionProbes(world: World): void {
    const reflectionProbes = this.collectReflectionProbes(world);
    const probesToUpdate = reflectionProbes.filter((probe) =>
      probe.shouldUpdate(this.currentFrame),
    );

    for (const probe of probesToUpdate) {
      this.reflectionProbePass.render(probe, world);
      probe.markUpdated(this.currentFrame);
    }
  }

  private renderShadowAndOcclusion(
    _commandEncoder: GPUCommandEncoder,
    directionalLights: DirectionalLight[],
    spotLights: SpotLight[],
    opaqueMeshes: Mesh[],
    alphaMeshes: Mesh[],
    blendMeshes: Mesh[],
    camera: Camera,
  ): void {
    // Shadow Pass - Directional Lights
    if (directionalLights.length > 0) {
      this.shadowPassDirectionalLight.render(
        this.device,
        directionalLights,
        opaqueMeshes,
        alphaMeshes,
        blendMeshes,
        camera,
      );
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
        alphaMeshes,
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
      for (const light of occlusionEnabledDirectionalLights) {
        light.updateOcclusionMatrixFromFrustum(
          camera.transform.getWorldPosition(),
          camera.transform.getWorldForward(),
          camera.near,
          camera.far,
          camera.fov,
          camera.aspect,
        );
      }

      this.occlusionPassDirectionalLight.render(
        this.device,
        occlusionEnabledDirectionalLights,
        opaqueMeshes,
        alphaMeshes,
        blendMeshes,
        camera,
      );

      // Restore shadow matrices overwritten by occlusion pass
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
        alphaMeshes,
        blendMeshes,
        camera,
      );
    }
  }

  private renderPostProcessing(camera: Camera): GPUTextureView {
    let lastOutputView: GPUTextureView = this.lightingPass.outputView;

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

      // Strict A/B ping-pong: pass 0 → B, pass 1 → A, ...
      // lightingPass.outputView is the initial read source and is never written to.
      let readView: GPUTextureView = this.lightingPass.outputView;
      for (let i = 0; i < this.postPasses.length; i++) {
        const writeView =
          i % 2 === 0 ? this.postPassViewB! : this.postPassViewA!;
        this.postPasses[i].render(readView, writeView, postContext);
        readView = writeView;
      }

      lastOutputView = readView;
    }

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

      let readView: GPUTextureView = lastOutputView;
      for (let i = 0; i < this.highResPostPasses.length; i++) {
        const writeView = i % 2 === 0 ? this.highResViewB! : this.highResViewA!;
        this.highResPostPasses[i].render(readView, writeView, highResContext);
        readView = writeView;
      }

      lastOutputView = readView;
    }

    return lastOutputView;
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

  public addGBufferPass(pass: GBufferPass): void {
    this.gBufferPasses.push(pass);
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

    this.postPassTextureA?.destroy();
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

    this.highResTextureA?.destroy();
    this.highResTextureB?.destroy();

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
      this.postPassTextureA = null;
      this.postPassTextureB = null;
      this.createPostPassTextures();
    }

    for (const pass of this.postPasses) {
      pass.resize(this.renderWidth, this.renderHeight);
    }

    if (this.highResTextureA) {
      this.highResTextureA = null;
      this.highResTextureB = null;
      this.createHighResTextures();
    }

    for (const pass of this.highResPostPasses) {
      pass.resize(this.canvas.width, this.canvas.height);
    }

    const shadowMapSize = this.calculateShadowMapSize();
    this.shadowPassDirectionalLight.resize(shadowMapSize);
    this.shadowPassSpotLight.resize(shadowMapSize);
  }

  public destroy(): void {
    this.postPassTextureA?.destroy();
    this.postPassTextureB?.destroy();
    this.highResTextureA?.destroy();
    this.highResTextureB?.destroy();
    this.geometryBuffer.destroy();
  }

  // Update all scene caches atomically when scene version changes
  private updateSceneCaches(world: World): void {
    if (world.sceneVersion !== this.lastSceneVersion) {
      this.cachedMeshes = [];
      this.cachedLights = [];
      this.cachedEmitters = [];
      this.cachedReflectionProbes = [];

      for (const scene of world.scenes) {
        this.cachedLights.push(...scene.lights);

        for (const entity of scene.entities) {
          if (entity.type === EntityType.Mesh) {
            this.cachedMeshes.push(entity as Mesh);
          } else if (entity.type === EntityType.ParticleEmitter) {
            this.cachedEmitters.push(entity as ParticleEmitter);
          } else if (entity.type === EntityType.ReflectionProbe) {
            this.cachedReflectionProbes.push(entity as ReflectionProbe);
          }
        }
      }

      this.lastSceneVersion = world.sceneVersion;
    }
  }

  private collectMeshes(world: World): Mesh[] {
    this.updateSceneCaches(world);
    return this.cachedMeshes;
  }

  private collectVisibleMeshes(world: World, camera: Camera): Mesh[] {
    const allMeshes = this.collectMeshes(world);

    if (!this.frustumCulling) {
      return allMeshes;
    }

    for (const mesh of allMeshes) {
      mesh.updateWorldAABB(); // no-ops if world matrix unchanged
    }

    const cameraViewProjection = camera.viewProjectionMatrix;
    const frustumPlanes = frustumPlanesFromMatrix(cameraViewProjection);

    const visibleMeshes: Mesh[] = [];
    for (const mesh of allMeshes) {
      if (aabbInFrustum(mesh.worldAABB, frustumPlanes)) {
        visibleMeshes.push(mesh);
      }
    }

    return visibleMeshes;
  }

  private collectLights(world: World): Light[] {
    this.updateSceneCaches(world);
    return this.cachedLights;
  }

  private collectParticleEmitters(world: World): ParticleEmitter[] {
    this.updateSceneCaches(world);
    return this.cachedEmitters;
  }

  private collectReflectionProbes(world: World): ReflectionProbe[] {
    this.updateSceneCaches(world);
    return this.cachedReflectionProbes;
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
