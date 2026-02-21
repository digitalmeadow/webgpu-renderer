import { Light, DirectionalLight } from "../lights";
import { Vec3 } from "../math";
import { SceneUniforms } from "../uniforms";

const MAX_LIGHTS = 1;

const LIGHT_SIZE = 48;

export class LightManager {
  private device: GPUDevice;
  public lightBuffer: GPUBuffer;
  public uniformsBuffer: GPUBuffer;
  public lightBindGroupLayout: GPUBindGroupLayout;
  public lightBindGroup: GPUBindGroup;
  
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
      size: MAX_LIGHTS * LIGHT_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.uniformsBuffer = this.lightBuffer;

    this.shadowTexture = this.device.createTexture({
      label: "Shadow Texture (Fallback)",
      size: { width: 2048, height: 2048, depthOrArrayLayers: 1 },
      format: "depth32float",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    
    const fallbackShadowTextureView = this.shadowTexture.createView({
      label: "Fallback Shadow Texture View",
      dimension: "2d",
    });

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
      compare: "less",
    });

    this.lightingBindGroupLayout = this.device.createBindGroupLayout({
      label: "Lighting Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          sampler: { type: "comparison" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: "depth",
            viewDimension: "2d",
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
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
          resource: { buffer: this.uniformsBuffer },
        },
        {
          binding: 1,
          resource: { buffer: this.lightBuffer },
        },
      ],
    });

    this.lightingBindGroup = this.device.createBindGroup({
      label: "Lighting Bind Group (Fallback)",
      layout: this.lightingBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: this.shadowSampler,
        },
        {
          binding: 1,
          resource: fallbackShadowTextureView,
        },
        {
          binding: 2,
          resource: { buffer: this.lightBuffer },
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
          resource: this.shadowTextureView,
        },
        {
          binding: 2,
          resource: { buffer: light.shadowBuffer },
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
    
    console.log('[LightManager] Directional light:', {
      color: [light.color.x, light.color.y, light.color.z],
      intensity: light.intensity,
      direction: [light.direction.x, light.direction.y, light.direction.z],
      hasShadowBuffer: !!light.shadowBuffer,
    });
    
    if (!light.shadowBuffer) {
      console.log('[LightManager] Initializing shadow resources');
      light.initShadowResources(this.device);
    }

    const camera = cameras.length > 0 ? cameras[0] : null;
    if (camera) {
      const cameraDirection = new Vec3(
        camera.target.data[0] - camera.position.data[0],
        camera.target.data[1] - camera.position.data[1],
        camera.target.data[2] - camera.position.data[2],
      );
      
      // Don't overwrite light direction - it's set directly on DirectionalLight
      console.log('[LightManager] Calling updateShadowMatrix');
      light.updateShadowMatrix(camera.position, cameraDirection, camera.near, camera.far);
    }

    const lightData = new Float32Array(MAX_LIGHTS * (LIGHT_SIZE / 4));
    const u32Data = new Uint32Array(lightData.buffer);

    lightData.set(light.color.data, 0);
    lightData.set(light.transform.getForward().data, 4);
    lightData[8] = light.intensity;
    u32Data[9] = light.type;

    console.log('[LightManager] Writing light buffer:', {
      color: [light.color.x, light.color.y, light.color.z],
      intensity: light.intensity,
      direction: [light.transform.getForward().x, light.transform.getForward().y, light.transform.getForward().z],
    });

    this.device.queue.writeBuffer(this.lightBuffer, 0, lightData);
  }

  public getDirectionalLights(): DirectionalLight[] {
    return [];
  }
}
