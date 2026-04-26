import { Vec3 } from "../math";
import { GpuFloats, floatByteSize, alignVec4 } from "../utils";
import { CubeTexture, CubeRenderTarget } from "../textures";

const FOG_COLOR_BASE_DEFAULT = new Vec3(72 / 255, 73 / 255, 75 / 255);
const FOG_COLOR_SUN_DEFAULT = new Vec3(252 / 255, 199 / 255, 122 / 255);
const FOG_EXTINCTION_DEFAULT = new Vec3(0.001, 0.001, 0.001);
const FOG_INSCATTERING_DEFAULT = new Vec3(0.0015, 0.0015, 0.0015);

const OFFSET_AMBIENT_LIGHT_COLOR = 0;
const OFFSET_IBL_INTENSITY = OFFSET_AMBIENT_LIGHT_COLOR + GpuFloats.vec3; // w of first vec4
const OFFSET_FOG_COLOR_BASE = OFFSET_AMBIENT_LIGHT_COLOR + GpuFloats.vec4;
const OFFSET_FOG_COLOR_SUN = OFFSET_FOG_COLOR_BASE + GpuFloats.vec4;
const OFFSET_FOG_EXTINCTION = OFFSET_FOG_COLOR_SUN + GpuFloats.vec4;
const OFFSET_FOG_INSCATTERING = OFFSET_FOG_EXTINCTION + GpuFloats.vec4;
const OFFSET_FOG_SUN_EXPONENT = OFFSET_FOG_INSCATTERING + GpuFloats.vec3; // w of last fog vec4
const OFFSET_FOG_ENABLED = OFFSET_FOG_INSCATTERING + GpuFloats.vec4; // u32

const FLOAT_COUNT = alignVec4(OFFSET_FOG_ENABLED + GpuFloats.f32); // = 24
const BUFFER_SIZE = floatByteSize(FLOAT_COUNT); // = 96

let _layout: GPUBindGroupLayout | null = null;

export function createSceneBindGroupLayout(
  device: GPUDevice,
): GPUBindGroupLayout {
  if (!_layout) {
    _layout = device.createBindGroupLayout({
      label: "Scene Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { viewDimension: "cube" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { viewDimension: "cube" },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
      ],
    });
  }
  return _layout;
}

export class SceneUniforms {
  public buffer: GPUBuffer;
  public bindGroup: GPUBindGroup;
  public bindGroupLayout: GPUBindGroupLayout;

  public ambientLightColor: Vec3 = new Vec3(0.25, 0.25, 0.25);
  public iblIntensity: number = 1.0;
  public fogColorBase: Vec3 = FOG_COLOR_BASE_DEFAULT;
  public fogColorSun: Vec3 = FOG_COLOR_SUN_DEFAULT;
  public fogExtinction: Vec3 = FOG_EXTINCTION_DEFAULT;
  public fogInscattering: Vec3 = FOG_INSCATTERING_DEFAULT;
  public fogSunExponent: number = 12.0;
  public fogEnabled: boolean = true;

  private device: GPUDevice;
  private uniformData = new Float32Array(FLOAT_COUNT);
  // u32 view — fogEnabled must not be written as float32
  private u32Data = new Uint32Array(1);
  private skyboxTexture: CubeTexture | null = null;
  private placeholderTextureView: GPUTextureView;
  private placeholderSampler: GPUSampler;
  private environmentTextures: Array<CubeTexture | CubeRenderTarget | null> =
    [];
  private probeBindGroup: GPUBindGroup | null = null;

  constructor(device: GPUDevice) {
    this.device = device;

    const placeholderTexture = device.createTexture({
      label: "Scene Uniforms Placeholder Cube Texture",
      size: { width: 1, height: 1, depthOrArrayLayers: 6 },
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING,
    });
    this.placeholderTextureView = placeholderTexture.createView({
      dimension: "cube",
    });
    this.placeholderSampler = device.createSampler({
      label: "Scene Uniforms Placeholder Sampler",
      minFilter: "linear",
      magFilter: "linear",
    });

    this.buffer = device.createBuffer({
      label: "Scene Uniforms Buffer",
      size: BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroupLayout = createSceneBindGroupLayout(device);

    // bindGroup is assigned by updateBindGroup()
    this.bindGroup = null!;
    this.updateBindGroup();
    this.update();
  }

  update(): void {
    this.uniformData[OFFSET_AMBIENT_LIGHT_COLOR] = this.ambientLightColor.x;
    this.uniformData[OFFSET_AMBIENT_LIGHT_COLOR + 1] = this.ambientLightColor.y;
    this.uniformData[OFFSET_AMBIENT_LIGHT_COLOR + 2] = this.ambientLightColor.z;
    this.uniformData[OFFSET_IBL_INTENSITY] = this.iblIntensity;

    this.uniformData[OFFSET_FOG_COLOR_BASE] = this.fogColorBase.x;
    this.uniformData[OFFSET_FOG_COLOR_BASE + 1] = this.fogColorBase.y;
    this.uniformData[OFFSET_FOG_COLOR_BASE + 2] = this.fogColorBase.z;

    this.uniformData[OFFSET_FOG_COLOR_SUN] = this.fogColorSun.x;
    this.uniformData[OFFSET_FOG_COLOR_SUN + 1] = this.fogColorSun.y;
    this.uniformData[OFFSET_FOG_COLOR_SUN + 2] = this.fogColorSun.z;

    this.uniformData[OFFSET_FOG_EXTINCTION] = this.fogExtinction.x;
    this.uniformData[OFFSET_FOG_EXTINCTION + 1] = this.fogExtinction.y;
    this.uniformData[OFFSET_FOG_EXTINCTION + 2] = this.fogExtinction.z;

    this.uniformData[OFFSET_FOG_INSCATTERING] = this.fogInscattering.x;
    this.uniformData[OFFSET_FOG_INSCATTERING + 1] = this.fogInscattering.y;
    this.uniformData[OFFSET_FOG_INSCATTERING + 2] = this.fogInscattering.z;

    this.uniformData[OFFSET_FOG_SUN_EXPONENT] = this.fogSunExponent;

    this.device.queue.writeBuffer(this.buffer, 0, this.uniformData);

    this.u32Data[0] = this.fogEnabled ? 1 : 0;
    this.device.queue.writeBuffer(
      this.buffer,
      floatByteSize(OFFSET_FOG_ENABLED),
      this.u32Data,
    );
  }

  updateBindGroup(): void {
    const skyboxView = this.skyboxTexture?.gpuTextureView;
    const skyboxSampler = this.skyboxTexture?.gpuSampler;

    // Index 0 is reserved for the global skybox (set via setSkyboxTexture).
    // Custom environment textures (e.g. reflection probes) start at index 1.
    const env1 =
      this.environmentTextures.length > 1 ? this.environmentTextures[1] : null;
    const env1View = env1?.gpuTextureView;
    const env1Sampler = env1?.gpuSampler;

    this.bindGroup = this.device.createBindGroup({
      label: "Scene Uniforms Bind Group",
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.buffer } },
        { binding: 1, resource: skyboxView ?? this.placeholderTextureView },
        { binding: 2, resource: skyboxSampler ?? this.placeholderSampler },
        { binding: 3, resource: env1View ?? this.placeholderTextureView },
        { binding: 4, resource: env1Sampler ?? this.placeholderSampler },
      ],
    });
  }

  setSkyboxTexture(texture: CubeTexture | null): void {
    this.skyboxTexture = texture;
    this.probeBindGroup = null; // Invalidate cached probe bind group
    this.updateBindGroup();
  }

  setEnvironmentTextures(
    textures: Array<CubeTexture | CubeRenderTarget | null>,
  ): void {
    this.environmentTextures = textures;
    this.updateBindGroup();
  }

  getSkyboxTexture(): CubeTexture | null {
    return this.skyboxTexture;
  }

  getPlaceholderTextureView(): GPUTextureView {
    return this.placeholderTextureView;
  }

  getPlaceholderSampler(): GPUSampler {
    return this.placeholderSampler;
  }

  // During probe rendering, the probe's cubeRenderTarget is the render attachment.
  // If it's also bound as environmentTextures[1], WebGPU throws a sync error.
  // This bind group substitutes the skybox into slot 3–4 to avoid the conflict.
  // Deferred: see TODO.md for a proper fix via a separate EnvironmentBindGroup.
  private createProbeRenderingBindGroup(): GPUBindGroup {
    const skyboxView =
      this.skyboxTexture?.gpuTextureView ?? this.placeholderTextureView;
    const skyboxSampler =
      this.skyboxTexture?.gpuSampler ?? this.placeholderSampler;

    return this.device.createBindGroup({
      label: "Scene Uniforms Bind Group (Probe Rendering)",
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.buffer } },
        { binding: 1, resource: skyboxView },
        { binding: 2, resource: skyboxSampler },
        { binding: 3, resource: skyboxView },
        { binding: 4, resource: skyboxSampler },
      ],
    });
  }

  getProbeBindGroup(): GPUBindGroup {
    if (!this.probeBindGroup) {
      this.probeBindGroup = this.createProbeRenderingBindGroup();
    }
    return this.probeBindGroup;
  }
}
