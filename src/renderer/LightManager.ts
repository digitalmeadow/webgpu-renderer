import { Light, DirectionalLight } from "../lights";
import { SHADOW_MAP_CASCADES_COUNT } from "../lights/DirectionalLight";
import { Vec3 } from "../math";
import { SceneUniforms } from "../uniforms";

const MAX_LIGHTS = 1;
const MAX_LIGHT_DIRECTIONAL_COUNT = 2;

const LIGHT_SIZE = 48;

export class LightManager {
  private device: GPUDevice;
  public lightBuffer: GPUBuffer;
  public uniformsBuffer: GPUBuffer;
  public lightBindGroupLayout: GPUBindGroupLayout;
  public lightBindGroup: GPUBindGroup;
  
  public shadowSampler: GPUSampler;
  public shadowTextureView: GPUTextureView | null = null;
  
  public lightingBindGroupLayout: GPUBindGroupLayout;
  public lightingBindGroup: GPUBindGroup | null = null;
  
  public sceneLightBindGroupLayout: GPUBindGroupLayout;
  public sceneLightBindGroup: GPUBindGroup | null = null;

  constructor(device: GPUDevice) {
    this.device = device;

    this.lightBuffer = this.device.createBuffer({
      size: MAX_LIGHTS * LIGHT_SIZE,
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

  public updateLightingBindGroup(directionalLights: DirectionalLight[]): void {
    if (!this.shadowTextureView || directionalLights.length === 0) return;

    const light = directionalLights[0];
    if (!light.shadowBuffer) return;

    this.lightingBindGroup = this.device.createBindGroup({
      label: "Lighting Bind Group",
      layout: this.lightingBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: this.shadowSampler,
        },
        {
          binding: 1,
          resource: { buffer: light.shadowBuffer },
        },
        {
          binding: 2,
          resource: this.shadowTextureView,
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
      
      // Only init shadow resources if we need them (not needed for basic lighting)
      // if (!light.shadowBuffer) {
      //   light.initShadowResources(this.device);
      // }

      // Get camera if available
      const camera = cameras.length > 0 ? cameras[0] : null;
      if (camera) {
        const cameraDirection = new Vec3(
          camera.target.data[0] - camera.position.data[0],
          camera.target.data[1] - camera.position.data[1],
          camera.target.data[2] - camera.position.data[2],
        );
        
        light.direction = light.transform.getForward();
        // Not updating cascade matrices since we're not using shadows
        // light.updateCascadeMatrices(camera.position, cameraDirection, camera.near, camera.far);
      }

      const lightData = new Float32Array(MAX_LIGHTS * (LIGHT_SIZE / 4));
      const u32Data = new Uint32Array(lightData.buffer);

      lightData.set(light.color.data, 0);
      lightData.set(light.transform.getForward().data, 4);
      lightData[8] = light.intensity;
      u32Data[9] = light.type;

      this.device.queue.writeBuffer(this.lightBuffer, 0, lightData);
    }
  }

  public getDirectionalLights(): DirectionalLight[] {
    return [];
  }
}
