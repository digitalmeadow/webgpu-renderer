import { Camera } from "../camera";
import { DirectionalLight, SHADOW_MAP_CASCADES_COUNT } from ".";
import { Vec3 } from "../math";
import { SceneUniforms } from "../uniforms";

const LIGHT_SIZE = 256; // Must match LightDirectionalUniforms in LightingPass.wgsl
const LIGHT_FLOAT_COUNT = LIGHT_SIZE / 4;
const CASCADE_SPLITS_OFFSET = 48;
const DIRECTION_OFFSET = 52;
const COLOR_OFFSET = 56;

export class LightManager {
  private device: GPUDevice;
  public lightBuffer: GPUBuffer;
  public uniformsBuffer: GPUBuffer;
  public lightBindGroupLayout: GPUBindGroupLayout;
  public lightBindGroup: GPUBindGroup;

  public shadowSampler: GPUSampler;
  public shadowTextureView: GPUTextureView | null = null;

  public lightingBindGroupLayout: GPUBindGroupLayout;
  public lightingBindGroup: GPUBindGroup;

  public sceneLightBindGroupLayout: GPUBindGroupLayout;
  public sceneLightBindGroup: GPUBindGroup | null = null;

  private dummyShadowBuffer: GPUBuffer;
  private dummyShadowTexture: GPUTexture;
  private dummyShadowTextureView: GPUTextureView;

  constructor(device: GPUDevice) {
    this.device = device;

    this.lightBuffer = this.device.createBuffer({
      size: LIGHT_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.uniformsBuffer = this.lightBuffer;

    this.lightBindGroupLayout = this.device.createBindGroupLayout({
      label: "Light Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.lightBindGroup = this.device.createBindGroup({
      label: "Light Bind Group",
      layout: this.lightBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.lightBuffer,
          },
        },
      ],
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

    // Create dummy resources for fallback when no shadows
    this.dummyShadowBuffer = this.device.createBuffer({
      size: 256, // Must match LightDirectionalUniforms size in LightingPass.wgsl
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.dummyShadowTexture = this.device.createTexture({
      label: "Dummy Shadow Texture",
      size: { width: 1, height: 1, depthOrArrayLayers: 1 },
      format: "depth32float",
      usage:
        GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.dummyShadowTextureView = this.dummyShadowTexture.createView({
      label: "Dummy Shadow Texture View",
      dimension: "2d-array",
    });

    const fallbackLightData = this.createFallbackLightData();
    this.device.queue.writeBuffer(
      this.lightBuffer,
      0,
      fallbackLightData as any,
    );
    this.device.queue.writeBuffer(
      this.dummyShadowBuffer,
      0,
      fallbackLightData as any,
    );

    this.lightingBindGroupLayout = this.device.createBindGroupLayout({
      label: "Lighting Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "comparison" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: "depth",
            viewDimension: "2d-array",
          },
        },
      ],
    });

    // Always create a default lighting bind group (works without lights)
    this.lightingBindGroup = this.device.createBindGroup({
      label: "Default Lighting Bind Group",
      layout: this.lightingBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: this.shadowSampler,
        },
        {
          binding: 1,
          resource: { buffer: this.dummyShadowBuffer },
        },
        {
          binding: 2,
          resource: this.dummyShadowTextureView,
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
  }

  public setShadowTexture(view: GPUTextureView | null): void {
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

  public updateLightingBindGroup(directionalLights: DirectionalLight[]): void {
    const light = directionalLights[0];
    const useShadowedLight = Boolean(
      light && light.shadowBuffer && this.shadowTextureView,
    );

    this.lightingBindGroup = this.device.createBindGroup({
      label: useShadowedLight
        ? "Lighting Bind Group"
        : "Default Lighting Bind Group",
      layout: this.lightingBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: this.shadowSampler,
        },
        {
          binding: 1,
          resource: {
            buffer: useShadowedLight
              ? light.shadowBuffer!
              : this.dummyShadowBuffer,
          },
        },
        {
          binding: 2,
          resource: useShadowedLight
            ? this.shadowTextureView!
            : this.dummyShadowTextureView,
        },
      ],
    });
  }

  public update(directionalLights: DirectionalLight[], camera: Camera): void {
    if (directionalLights.length > 0) {
      const light = directionalLights[0];

      if (!light.shadowBuffer) {
        light.initShadowResources(this.device);
      }

      // Get camera if available
      const cameraDirection = new Vec3(
        camera.target.data[0] - camera.position.data[0],
        camera.target.data[1] - camera.position.data[1],
        camera.target.data[2] - camera.position.data[2],
      );

      light.direction = light.transform.getForward();

      light.updateCascadeMatrices(
        camera.position,
        cameraDirection,
        camera.near,
        camera.far,
      );

      this.device.queue.writeBuffer(
        this.lightBuffer,
        0,
        this.createLightData(light) as any,
      );

      return;
    }

    this.device.queue.writeBuffer(
      this.lightBuffer,
      0,
      this.createFallbackLightData() as any,
    );
  }

  private createFallbackLightData(): Float32Array {
    const lightData = new Float32Array(LIGHT_FLOAT_COUNT);
    lightData[DIRECTION_OFFSET + 1] = -1.0;
    lightData[COLOR_OFFSET] = 1.0;
    lightData[COLOR_OFFSET + 1] = 1.0;
    lightData[COLOR_OFFSET + 2] = 1.0;
    lightData[COLOR_OFFSET + 3] = 0.0;
    return lightData;
  }

  private createLightData(light: DirectionalLight): Float32Array {
    const lightData = this.createFallbackLightData();

    for (let i = 0; i < SHADOW_MAP_CASCADES_COUNT; i++) {
      lightData.set(light.viewProjectionMatrices[i].data, i * 16);
    }

    if (light.cascadeActualDepths.length > 0) {
      lightData.set(
        light.cascadeActualDepths.slice(0, 4),
        CASCADE_SPLITS_OFFSET,
      );
    }

    lightData.set(light.direction.data, DIRECTION_OFFSET);
    lightData.set([...light.color.data, light.intensity], COLOR_OFFSET);

    return lightData;
  }
}
