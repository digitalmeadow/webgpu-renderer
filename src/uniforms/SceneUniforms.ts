import { Vec3 } from "../math";
import { CubeTexture, CubeRenderTarget } from "../textures";

const FOG_COLOR_BASE_DEFAULT = new Vec3(72 / 255, 73 / 255, 75 / 255);
const FOG_COLOR_SUN_DEFAULT = new Vec3(252 / 255, 199 / 255, 122 / 255);
const FOG_EXTINCTION_DEFAULT = new Vec3(0.001, 0.001, 0.001);
const FOG_INSCATTERING_DEFAULT = new Vec3(0.0015, 0.0015, 0.0015);

export function createSceneBindGroupLayout(
  device: GPUDevice,
): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    label: "Scene Uniforms Bind Group Layout",
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
  private environmentTextures: Array<CubeTexture | CubeRenderTarget | null> =
    []; // Environment texture array for per-material environments
  private probeBindGroup: GPUBindGroup | null = null; // Cached bind group for probe rendering

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

    this.bindGroupLayout = createSceneBindGroupLayout(device);

    this.bindGroup = device.createBindGroup({
      label: "Scene Uniforms Bind Group",
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.buffer } },
        { binding: 1, resource: this.placeholderTextureView },
        { binding: 2, resource: this.placeholderSampler },
        { binding: 3, resource: this.placeholderTextureView },
        { binding: 4, resource: this.placeholderSampler },
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

    // Get environment texture 1 (first custom environment map)
    const env1 =
      this.environmentTextures.length > 1 ? this.environmentTextures[1] : null;
    const env1View = env1?.gpuTextureView;
    const env1Sampler = env1?.gpuSampler;

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
      {
        binding: 3,
        resource: env1View ?? this.placeholderTextureView!,
      },
      {
        binding: 4,
        resource: env1Sampler ?? this.placeholderSampler!,
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

  /**
   * Creates a bind group for reflection probe rendering that excludes custom environment textures
   * to prevent texture usage conflicts. Only includes the global skybox at bindings 1-2 and 3-4.
   *
   * This ensures that when a probe renders the scene to its cube texture, that same cube texture
   * isn't simultaneously bound as a texture binding (which would cause a WebGPU synchronization error).
   */
  private createProbeRenderingBindGroup(): GPUBindGroup {
    // Use the global skybox texture for both binding slots (1-2 and 3-4)
    // This ensures probes only reflect the skybox, not other custom environments
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
        { binding: 3, resource: skyboxView }, // Use skybox instead of custom env to avoid conflicts
        { binding: 4, resource: skyboxSampler },
      ],
    });
  }

  /**
   * Gets the bind group for reflection probe rendering.
   * This bind group only includes the skybox (not custom environment textures) to prevent
   * texture usage synchronization errors when the probe's cube texture is being rendered to.
   */
  getProbeBindGroup(): GPUBindGroup {
    if (!this.probeBindGroup) {
      this.probeBindGroup = this.createProbeRenderingBindGroup();
    }
    return this.probeBindGroup;
  }
}
