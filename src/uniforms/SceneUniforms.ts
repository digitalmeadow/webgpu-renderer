import { Vec3 } from "../math";
import { Uniforms } from "./Uniforms";
import { CubeTexture } from "../textures";

export class SceneUniforms extends Uniforms {
  private _ambientLightColor: Vec3;
  private _iblIntensity: number;
  public buffer: GPUBuffer;
  private _skyboxTexture: CubeTexture | null = null;
  private _placeholderTextureView: GPUTextureView;
  private _placeholderSampler: GPUSampler;

  constructor(
    device: GPUDevice,
    ambientLightColor: Vec3 = new Vec3(0.25, 0.25, 0.25),
    iblIntensity: number = 1.0,
  ) {
    super(device);
    this._ambientLightColor = ambientLightColor;
    this._iblIntensity = iblIntensity;

    // Create placeholder cube texture for when no skybox is set
    const placeholderTexture = device.createTexture({
      label: "Placeholder Cube Texture",
      size: { width: 1, height: 1, depthOrArrayLayers: 6 },
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING,
    });
    this._placeholderTextureView = placeholderTexture.createView({
      dimension: "cube",
    });
    this._placeholderSampler = device.createSampler({
      label: "Placeholder Sampler",
      minFilter: "linear",
      magFilter: "linear",
    });

    this.buffer = this.device.createBuffer({
      label: "Scene Uniforms Buffer",
      size: 32, // vec3<f32> (12) + float (4) + padding (16) = 32 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroupLayout = this.device.createBindGroupLayout({
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

    this.bindGroup = this.device.createBindGroup({
      label: "Scene Uniforms Bind Group",
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.buffer } },
        { binding: 1, resource: this._placeholderTextureView },
        { binding: 2, resource: this._placeholderSampler },
      ],
    });

    // Initially no skybox - updateBindGroup will be called when skybox is set
    // For now, we need at least placeholder bindings for 1 and 2
    // Since no skybox, we'll call updateBindGroup with null to create empty entries
    this.updateBindGroup();

    this.update();
  }

  update(): void {
    this.device.queue.writeBuffer(
      this.buffer,
      0,
      // Layout: ambient_light_color (vec4<f32> = 16 bytes) + ibl_intensity (f32 = 4 bytes) + padding (12 bytes)
      new Float32Array([
        this._ambientLightColor.x,
        this._ambientLightColor.y,
        this._ambientLightColor.z,
        0.0, // padding for vec4 alignment
        this._iblIntensity,
        0.0, // padding
        0.0, // padding
        0.0, // padding
      ]),
    );
  }

  updateBindGroup(): void {
    const skyboxView = this._skyboxTexture?.gpuTextureView;
    const skyboxSampler = this._skyboxTexture?.gpuSampler;

    // Always include all 3 bindings - use fallback placeholder if no skybox
    const entries: GPUBindGroupEntry[] = [
      {
        binding: 0,
        resource: {
          buffer: this.buffer,
        },
      },
      {
        binding: 1,
        resource: skyboxView ?? this._placeholderTextureView!,
      },
      {
        binding: 2,
        resource: skyboxSampler ?? this._placeholderSampler!,
      },
    ];

    this.bindGroup = this.device.createBindGroup({
      label: "Scene Uniforms Bind Group",
      layout: this.bindGroupLayout,
      entries,
    });
  }

  get ambientLightColor(): Vec3 {
    return this._ambientLightColor;
  }

  set ambientLightColor(value: Vec3) {
    this._ambientLightColor = value;
    this.update();
  }

  get iblIntensity(): number {
    return this._iblIntensity;
  }

  set iblIntensity(value: number) {
    this._iblIntensity = value;
    this.update();
  }

  get skyboxTexture(): CubeTexture | null {
    return this._skyboxTexture;
  }

  set skyboxTexture(value: CubeTexture | null) {
    this._skyboxTexture = value;
    this.updateBindGroup();
  }
}
