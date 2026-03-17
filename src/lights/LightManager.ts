import { Camera } from "../camera";
import { DirectionalLight, SHADOW_MAP_CASCADES_COUNT } from ".";
import { Vec3 } from "../math";
import { SceneUniforms } from "../uniforms";

const LIGHT_SIZE = 256;
const LIGHT_FLOAT_COUNT = LIGHT_SIZE / 4;
const CASCADE_SPLITS_OFFSET = 48;
const DIRECTION_OFFSET = 52;
const COLOR_OFFSET = 56;
const LIGHT_COUNT_OFFSET = 4 * LIGHT_SIZE; // Byte offset where light_count is stored (must match shader)

const MAX_DIRECTIONAL_LIGHTS = 4; // Must match MAX_DIRECTIONAL_LIGHTS in LightingPass.wgsl
const DEFAULT_MAX_DIRECTIONAL_LIGHTS = 1;

export class LightManager {
  private device: GPUDevice;
  private maxDirectionalLights: number;
  public lightBuffer: GPUBuffer;
  public uniformsBuffer: GPUBuffer;
  public lightBindGroupLayout: GPUBindGroupLayout;
  public lightBindGroup: GPUBindGroup;

  public shadowSampler: GPUSampler;
  public shadowTextureView: GPUTextureView | null = null;
  public shadowTextureViewArray: GPUTextureView[] | null = null;

  public lightingBindGroupLayout: GPUBindGroupLayout;
  public lightingBindGroup: GPUBindGroup;

  public sceneLightBindGroupLayout: GPUBindGroupLayout;
  public sceneLightBindGroup: GPUBindGroup | null = null;

  private dummyShadowBuffer: GPUBuffer;
  private dummyShadowTexture: GPUTexture;
  private dummyShadowTextureView: GPUTextureView;
  private dummyShadowTextureViewArray: GPUTextureView[];

  constructor(
    device: GPUDevice,
    maxDirectionalLights: number = DEFAULT_MAX_DIRECTIONAL_LIGHTS,
  ) {
    this.device = device;
    this.maxDirectionalLights = maxDirectionalLights;

    const bufferSize = LIGHT_SIZE * MAX_DIRECTIONAL_LIGHTS + 4 + 12; // Must match shader's LightDirectionalUniformsArray

    this.lightBuffer = this.device.createBuffer({
      size: bufferSize,
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
      size: LIGHT_SIZE * MAX_DIRECTIONAL_LIGHTS + 4 + 12, // Must match LightDirectionalUniformsArray size in shader
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

    this.dummyShadowTextureViewArray = [];
    for (
      let i = 0;
      i < this.maxDirectionalLights * SHADOW_MAP_CASCADES_COUNT;
      i++
    ) {
      const view = this.dummyShadowTexture.createView({
        label: `Dummy Shadow Texture View Array ${i}`,
        baseArrayLayer: 0,
        arrayLayerCount: 1,
      });
      this.dummyShadowTextureViewArray.push(view);
    }

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

  public setShadowTexture(
    view: GPUTextureView | null,
    viewArray: GPUTextureView[] | null = null,
  ): void {
    this.shadowTextureView = view;
    this.shadowTextureViewArray = viewArray;
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
    const activeLights = directionalLights.slice(0, this.maxDirectionalLights);
    const hasAnyShadowedLight = activeLights.some(
      (light) => light.shadowBuffer && this.shadowTextureView,
    );

    this.lightingBindGroup = this.device.createBindGroup({
      label: hasAnyShadowedLight
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
            buffer: this.lightBuffer,
          },
        },
        {
          binding: 2,
          resource:
            hasAnyShadowedLight && this.shadowTextureView
              ? this.shadowTextureView
              : this.dummyShadowTextureView,
        },
      ],
    });
  }

  public update(directionalLights: DirectionalLight[], camera: Camera): void {
    const activeLights = directionalLights.slice(0, this.maxDirectionalLights);

    if (activeLights.length > 0) {
      const cameraDirection = new Vec3(
        camera.target.data[0] - camera.position.data[0],
        camera.target.data[1] - camera.position.data[1],
        camera.target.data[2] - camera.position.data[2],
      );

      for (let i = 0; i < this.maxDirectionalLights; i++) {
        const light = activeLights[i];

        if (light) {
          if (!light.shadowBuffer) {
            light.initShadowResources(this.device);
          }

          light.lightIndex = i;
          light.direction = light.transform.getForward();

          light.updateCascadeMatrices(
            camera.position,
            cameraDirection,
            camera.near,
            camera.far,
            camera.fov,
            camera.aspect,
          );

          const lightData = this.createLightData(light, i);
          this.device.queue.writeBuffer(
            this.lightBuffer,
            i * LIGHT_SIZE,
            lightData as any,
          );
        } else {
          const fallbackData = this.createSingleFallbackLightData(i);
          this.device.queue.writeBuffer(
            this.lightBuffer,
            i * LIGHT_SIZE,
            fallbackData as any,
          );
        }
      }

      const lightCountData = new Uint32Array([activeLights.length]);
      this.device.queue.writeBuffer(
        this.lightBuffer,
        LIGHT_COUNT_OFFSET,
        lightCountData,
      );

      return;
    }

    const fallbackData = this.createFallbackLightData();
    this.device.queue.writeBuffer(this.lightBuffer, 0, fallbackData as any);

    const zeroLightCount = new Uint32Array([0]);
    this.device.queue.writeBuffer(
      this.lightBuffer,
      LIGHT_COUNT_OFFSET,
      zeroLightCount,
    );
  }

  private createFallbackLightData(): Float32Array {
    const totalSize = LIGHT_FLOAT_COUNT * MAX_DIRECTIONAL_LIGHTS;
    const lightData = new Float32Array(totalSize);

    for (let i = 0; i < MAX_DIRECTIONAL_LIGHTS; i++) {
      const offset = i * LIGHT_FLOAT_COUNT;
      lightData[DIRECTION_OFFSET + 1] = -1.0;
      lightData[COLOR_OFFSET] = 1.0;
      lightData[COLOR_OFFSET + 1] = 1.0;
      lightData[COLOR_OFFSET + 2] = 1.0;
      lightData[COLOR_OFFSET + 3] = 0.0;
    }

    return lightData;
  }

  private createSingleFallbackLightData(lightIndex: number): Float32Array {
    const lightData = new Float32Array(LIGHT_FLOAT_COUNT);
    lightData[DIRECTION_OFFSET + 1] = -1.0;
    lightData[COLOR_OFFSET] = 1.0;
    lightData[COLOR_OFFSET + 1] = 1.0;
    lightData[COLOR_OFFSET + 2] = 1.0;
    lightData[COLOR_OFFSET + 3] = 0.0;
    return lightData;
  }

  private createLightData(
    light: DirectionalLight,
    lightIndex: number,
  ): Float32Array {
    const lightData = this.createSingleFallbackLightData(lightIndex);

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
