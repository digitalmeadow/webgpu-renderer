import { Light, DirectionalLight, SpotLight } from "../lights";
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
  public directionalShadowTextureView: GPUTextureView | null = null;
  public spotShadowTextureView: GPUTextureView | null = null;
  
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
          binding: 0, // Directional lights uniform buffer
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1, // Directional shadow texture array
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: "depth",
            viewDimension: "2d-array",
          },
        },
        {
          binding: 2, // Spot shadow texture array
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: "depth",
            viewDimension: "2d-array",
          },
        },
        {
          binding: 3, // Scene uniforms buffer (NOT a sampler!)
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.sceneLightBindGroupLayout = this.device.createBindGroupLayout({
      label: "Spot Lights Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.sceneLightBindGroup = this.device.createBindGroup({
      label: "Spot Lights Bind Group (Fallback)",
      layout: this.sceneLightBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.lightBuffer },
        },
      ],
    });

    this.lightingBindGroup = null;
  }

  public setDirectionalShadowTexture(view: GPUTextureView): void {
    this.directionalShadowTextureView = view;
  }

  public setSpotShadowTexture(view: GPUTextureView): void {
    this.spotShadowTextureView = view;
  }

  public updateSceneLightBindGroup(spotLightsBuffer: GPUBuffer): void {
    this.sceneLightBindGroup = this.device.createBindGroup({
      label: "Spot Lights Bind Group",
      layout: this.sceneLightBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: spotLightsBuffer },
        },
      ],
    });
  }

  public updateLightingBindGroup(
    directionalLights: DirectionalLight[],
    spotLights: SpotLight[],
    sceneUniforms: SceneUniforms,
    commandEncoder?: GPUCommandEncoder
  ): void {
    if (!this.directionalShadowTextureView || !this.spotShadowTextureView) return;

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
    
    const spotLightOffset = MAX_LIGHT_DIRECTIONAL_COUNT * LIGHT_BUFFER_SIZE;
    for (let i = 0; i < spotLights.length; i++) {
      const light = spotLights[i];
      if (light.shadowBuffer) {
        encoder.copyBufferToBuffer(
          light.shadowBuffer,
          0,
          this.lightBuffer,
          spotLightOffset + (i * LIGHT_BUFFER_SIZE),
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
          resource: this.directionalShadowTextureView,
        },
        {
          binding: 2,
          resource: this.spotShadowTextureView,
        },
        {
          binding: 3,
          resource: { buffer: sceneUniforms.buffer },
        },
      ],
    });
  }

  public update(lights: Light[], cameras: any[] = []) {
    const directionalLights = lights.filter(
      (l) => l instanceof DirectionalLight,
    ) as DirectionalLight[];

    if (directionalLights.length > 0) {
      const light = directionalLights[0];
      if (!light.shadowBuffer) {
        light.initShadowResources(this.device);
      }
      const camera = cameras.length > 0 ? cameras[0] : null;
      if (camera) {
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
    
    const spotLights = lights.filter(
      (l) => l instanceof SpotLight,
    ) as SpotLight[];

    for(const light of spotLights) {
      if (!light.shadowBuffer) {
        light.initShadowResources(this.device);
      }
      light.updateShadowUniforms();
    }
  }

  public getDirectionalLights(): DirectionalLight[] {
    return [];
  }
}
