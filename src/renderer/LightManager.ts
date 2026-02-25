import { Light, DirectionalLight, SpotLight } from "../lights";
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
    console.log(`[LightManager] === UPDATE LIGHTING BIND GROUP ===`);
    console.log(`[LightManager] directionalShadowTextureView: ${this.directionalShadowTextureView !== null ? 'OK' : 'NULL'}`);
    console.log(`[LightManager] spotShadowTextureView: ${this.spotShadowTextureView !== null ? 'NULL (this is OK for now)' : 'OK'}`);

    if (!this.directionalShadowTextureView || !this.spotShadowTextureView) {
      console.log(`[LightManager] SKIPPING - missing shadow textures`);
      return;
    }

    const encoder = commandEncoder ?? this.device.createCommandEncoder();

    console.log(`[LightManager] Copying directional lights to shared buffer...`);
    for (let i = 0; i < directionalLights.length; i++) {
      const light = directionalLights[i];
      console.log(`[LightManager]   copying directional[${i}] "${light.name}" from shadowBuffer`);
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
    console.log(`[LightManager] Copying spot lights to shared buffer (offset: ${spotLightOffset})...`);
    for (let i = 0; i < spotLights.length; i++) {
      const light = spotLights[i];
      console.log(`[LightManager]   copying spot[${i}] "${light.name}"`);
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
    console.log(`[LightManager] === UPDATE ===`);
    console.log(`[LightManager] Total lights: ${lights.length}`);

    const directionalLights = lights.filter(
      (l) => l instanceof DirectionalLight,
    ) as DirectionalLight[];

    console.log(`[LightManager] Directional lights: ${directionalLights.length}`);
    for (let i = 0; i < directionalLights.length; i++) {
      const l = directionalLights[i];
      console.log(`[LightManager]   directional[${i}]: "${l.name}", intensity: ${l.intensity}, color: [${l.color[0].toFixed(2)}, ${l.color[1].toFixed(2)}, ${l.color[2].toFixed(2)}]`);
      console.log(`[LightManager]   directional[${i}] direction: [${l.direction[0].toFixed(3)}, ${l.direction[1].toFixed(3)}, ${l.direction[2].toFixed(3)}]`);
      console.log(`[LightManager]   directional[${i}] shadowBuffer: ${l.shadowBuffer !== null ? 'OK' : 'NULL'}`);
    }

    if (directionalLights.length > 0) {
      const light = directionalLights[0];
      if (!light.shadowBuffer) {
        console.log(`[LightManager] Initializing shadow resources for: ${light.name}`);
        light.initShadowResources(this.device);
      }
      const camera = cameras.length > 0 ? cameras[0] : null;
      console.log(`[LightManager] Camera: ${camera !== null ? 'OK' : 'NULL'}`);
      if (camera) {
        console.log(`[LightManager] Calling updateCascadeMatrices...`);
        light.updateCascadeMatrices(
          camera.position,
          camera.target,
          camera.near,
          camera.far,
          camera.viewMatrix,
          camera.projectionMatrix,
        );
        console.log(`[LightManager] Calling updateShadowUniforms...`);
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
