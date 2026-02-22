import { Light, DirectionalLight } from "../lights";
import { Vec3 } from "../math";
import { SceneUniforms } from "../uniforms";

const MAX_LIGHT_DIRECTIONAL_COUNT = 2;
const MAX_LIGHT_SPOT_COUNT = 8;
const LIGHT_BUFFER_SIZE = 256;

export class LightManager {
  private device: GPUDevice;
  public lightBuffer: GPUBuffer;
  
  public shadowSampler: GPUSampler;
  public shadowTexture: GPUTexture;
  public shadowTextureView: GPUTextureView | null = null;
  
  public lightingBindGroupLayout: GPUBindGroupLayout;
  public lightingBindGroup: GPUBindGroup | null = null;
  
  public sceneLightBindGroupLayout: GPUBindGroupLayout;
  public sceneLightBindGroup: GPUBindGroup | null = null;

  constructor(device: GPUDevice) {
    this.device = device;

    this.lightBuffer = this.device.createBuffer({
      size: MAX_LIGHT_DIRECTIONAL_COUNT * LIGHT_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.shadowTexture = this.device.createTexture({
      label: "Shadow Texture (Fallback)",
      size: { width: 2048, height: 2048, depthOrArrayLayers: 1 },
      format: "depth32float",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.shadowSampler = this.device.createSampler({
      label: "Shadow Comparison Sampler",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      addressModeW: "clamp-to-edge",
      magFilter: "nearest",
      minFilter: "nearest",
      mipmapFilter: "linear",
      compare: "less-equal",
    });

    this.lightingBindGroupLayout = this.device.createBindGroupLayout({
      label: "Lighting Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: "depth",
            viewDimension: "2d-array",
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.sceneLightBindGroupLayout = this.device.createBindGroupLayout({
      label: "Scene + Light Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.sceneLightBindGroup = this.device.createBindGroup({
      label: "Scene + Light Bind Group (Fallback)",
      layout: this.sceneLightBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.lightBuffer },
        },
        {
          binding: 1,
          resource: { buffer: this.lightBuffer },
        },
      ],
    });

    this.lightingBindGroup = null;
  }

  public setShadowTexture(view: GPUTextureView): void {
    this.shadowTextureView = view;
  }

  public updateSceneLightBindGroup(sceneUniforms: SceneUniforms): void {
    this.sceneLightBindGroup = this.device.createBindGroup({
      label: "Scene + Light Bind Group",
      layout: this.sceneLightBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: sceneUniforms.buffer },
        },
        {
          binding: 1,
          resource: { buffer: this.lightBuffer },
        },
      ],
    });
  }

  public updateLightingBindGroup(directionalLights: DirectionalLight[], commandEncoder?: GPUCommandEncoder): void {
    if (!this.shadowTextureView || directionalLights.length === 0) return;

    const encoder = commandEncoder ?? this.device.createCommandEncoder();
    
    for (let i = 0; i < directionalLights.length; i++) {
      const light = directionalLights[i];
      if (light.shadowBuffer) {
        encoder.copyBufferToBuffer(
          light.shadowBuffer,
          0,
          this.lightBuffer,
          i * LIGHT_BUFFER_SIZE,
          LIGHT_BUFFER_SIZE,
        );
      }
    }

    if (!commandEncoder) {
      this.device.queue.submit([encoder.finish()]);
    }

    this.lightingBindGroup = this.device.createBindGroup({
      label: "Lighting Bind Group",
      layout: this.lightingBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.lightBuffer },
        },
        {
          binding: 1,
          resource: this.shadowTextureView,
        },
        {
          binding: 2,
          resource: { buffer: this.lightBuffer },
        },
      ],
    });
  }

  public update(lights: Light[], cameras: any[] = []) {
    const directionalLights = lights.filter(
      (l) => l instanceof DirectionalLight,
    ) as DirectionalLight[];

    console.log('[LightManager] update called with', { 
      totalLights: lights.length, 
      directionalLights: directionalLights.length 
    });

    if (directionalLights.length === 0) {
      console.warn('[LightManager] No directional lights found!');
      return;
    }

    const light = directionalLights[0];
    
    if (!light.shadowBuffer) {
      console.log('[LightManager] Initializing shadow resources');
      light.initShadowResources(this.device);
    }

    const camera = cameras.length > 0 ? cameras[0] : null;
    if (camera) {
      console.log('[LightManager] Calling updateCascadeMatrices');
      light.updateCascadeMatrices(
        camera.position,
        camera.target,
        camera.near,
        camera.far,
        camera.viewMatrix,
        camera.projectionMatrix,
      );
      
      light.updateShadowUniforms();
    }
  }

  public getDirectionalLights(): DirectionalLight[] {
    return [];
  }
}
