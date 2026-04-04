import { Vec3 } from "../math";
import { CubeTexture } from "../textures";

const FOG_COLOR_BASE_DEFAULT = new Vec3(72 / 255, 73 / 255, 75 / 255);
const FOG_COLOR_SUN_DEFAULT = new Vec3(252 / 255, 199 / 255, 122 / 255);
const FOG_EXTINCTION_DEFAULT = new Vec3(0.001, 0.001, 0.001);
const FOG_INSCATTERING_DEFAULT = new Vec3(0.0015, 0.0015, 0.0015);

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
  private data: Float32Array;
  private dataU32: Uint32Array;
  private skyboxTexture: CubeTexture | null = null;
  private placeholderTextureView: GPUTextureView;
  private placeholderSampler: GPUSampler;

  constructor(device: GPUDevice) {
    this.device = device;

    const bufferSize = 96;
    this.data = new Float32Array(bufferSize / 4);
    this.dataU32 = new Uint32Array(this.data.buffer);

    const placeholderTexture = device.createTexture({
      label: "Placeholder Cube Texture",
      size: { width: 1, height: 1, depthOrArrayLayers: 6 },
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING,
    });
    this.placeholderTextureView = placeholderTexture.createView({
      dimension: "cube",
    });
    this.placeholderSampler = device.createSampler({
      label: "Placeholder Sampler",
      minFilter: "linear",
      magFilter: "linear",
    });

    this.buffer = device.createBuffer({
      label: "Scene Uniforms Buffer",
      size: this.data.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      label: "Scene Uniforms Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {
            type: "uniform",
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            viewDimension: "cube",
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: {
            type: "filtering",
          },
        },
      ],
    });

    this.bindGroup = device.createBindGroup({
      label: "Scene Uniforms Bind Group",
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.buffer } },
        { binding: 1, resource: this.placeholderTextureView },
        { binding: 2, resource: this.placeholderSampler },
      ],
    });

    this.updateBindGroup();
    this.update();
  }

  update(): void {
    // float32 view of the buffer
    this.data.set(
      [
        this.ambientLightColor.x,
        this.ambientLightColor.y,
        this.ambientLightColor.z,
      ],
      0,
    );
    this.data[3] = this.iblIntensity;

    this.data.set(
      [this.fogColorBase.x, this.fogColorBase.y, this.fogColorBase.z],
      4,
    );
    this.data.set(
      [this.fogColorSun.x, this.fogColorSun.y, this.fogColorSun.z],
      8,
    );
    this.data.set(
      [this.fogExtinction.x, this.fogExtinction.y, this.fogExtinction.z],
      12,
    );
    this.data.set(
      [this.fogInscattering.x, this.fogInscattering.y, this.fogInscattering.z],
      16,
    );

    this.data[19] = this.fogSunExponent;
    this.dataU32[20] = this.fogEnabled ? 1 : 0;

    this.device.queue.writeBuffer(this.buffer, 0, this.data.buffer);
  }

  setFogEnabled(value: boolean): void {
    this.fogEnabled = value;
    this.update();
  }

  updateBindGroup(): void {
    const skyboxView = this.skyboxTexture?.gpuTextureView;
    const skyboxSampler = this.skyboxTexture?.gpuSampler;

    const entries: GPUBindGroupEntry[] = [
      {
        binding: 0,
        resource: {
          buffer: this.buffer,
        },
      },
      {
        binding: 1,
        resource: skyboxView ?? this.placeholderTextureView!,
      },
      {
        binding: 2,
        resource: skyboxSampler ?? this.placeholderSampler!,
      },
    ];

    this.bindGroup = this.device.createBindGroup({
      label: "Scene Uniforms Bind Group",
      layout: this.bindGroupLayout,
      entries,
    });
  }

  setSkyboxTexture(texture: CubeTexture | null): void {
    this.skyboxTexture = texture;
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
}
