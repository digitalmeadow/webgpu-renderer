import { Vec3, Mat4 } from "../math";
import { Light } from ".";
import { EntityType } from "../scene/Entity";

export const SPOT_SHADOW_MAP_SIZE = 1024;

// Module-level cache — layout descriptor is identical for all instances
let _shadowBindGroupLayout: GPUBindGroupLayout | null = null;

export function getSpotLightShadowBindGroupLayout(
  device: GPUDevice,
): GPUBindGroupLayout {
  if (!_shadowBindGroupLayout) {
    _shadowBindGroupLayout = device.createBindGroupLayout({
      label: "SpotLight Shadow BindGroup Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });
  }
  return _shadowBindGroupLayout;
}

export class SpotLight extends Light {
  readonly type = EntityType.LightSpot;
  public direction: Vec3 = new Vec3(0, -1, 0);
  public fov: number = 45;
  public penumbra: number = 0.0;
  public aspectRatio: number = 1.0;
  public radius: number = 0.0;
  public near: number = 0.1;
  public far: number = 50;
  public lightIndex: number = 0;

  // Occlusion configuration
  public occlusionEnabled: boolean = false;
  public occlusionResolution: number = 512;

  public viewMatrix: Mat4 = Mat4.create();
  public projectionMatrix: Mat4 = Mat4.create();
  public viewProjectionMatrix: Mat4 = Mat4.create();

  public shadowBuffer: GPUBuffer | null = null;
  public shadowBindGroup: GPUBindGroup | null = null;

  private _device: GPUDevice | null = null;

  constructor(name: string) {
    super(name);
  }

  public initShadowResources(device: GPUDevice): void {
    this._device = device;

    this.shadowBuffer = device.createBuffer({
      label: "SpotLight Shadow Buffer",
      size: 288,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.shadowBindGroup = device.createBindGroup({
      label: "SpotLight Shadow BindGroup",
      layout: getSpotLightShadowBindGroupLayout(device),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.shadowBuffer },
        },
      ],
    });
  }

  public updateShadowMatrix(): void {
    if (!this.shadowBuffer || !this._device) {
      return;
    }

    const position = this.transform.getWorldPosition();
    const forward = this.transform.getWorldForward();

    let up: Vec3;
    if (Math.abs(forward.y) > 0.99) {
      up = Vec3.create(1, 0, 0);
    } else {
      up = Vec3.create(0, 1, 0);
    }

    this.viewMatrix = Mat4.lookAt(
      position,
      Vec3.add(position, forward, Vec3.create()),
      up,
    );

    const aspect = this.aspectRatio;
    this.projectionMatrix = Mat4.perspective(
      (this.fov * Math.PI) / 180,
      aspect,
      this.near,
      this.far,
    );

    Mat4.multiply(
      this.projectionMatrix,
      this.viewMatrix,
      this.viewProjectionMatrix,
    );

    this.updateShadowBuffer();
  }

  private updateShadowBuffer(): void {
    if (!this.shadowBuffer || !this._device) return;

    const data = new Float32Array(72); // 288 bytes = 72 floats

    // mat4 view_matrix (64 bytes = 16 floats) at index 0
    data.set(this.viewMatrix.data, 0);
    // mat4 projection_matrix (64 bytes = 16 floats) at index 16
    data.set(this.projectionMatrix.data, 16);
    // mat4 view_projection_matrix (64 bytes = 16 floats) at index 32
    data.set(this.viewProjectionMatrix.data, 32);

    // vec4 position (4 floats) at index 48
    const position = this.transform.getWorldPosition();
    data.set(position.data, 48);

    // vec4 near_far (4 floats) at index 52
    const nearFar = new Float32Array([this.near, this.far, 0, 0]);
    data.set(nearFar, 52);

    // vec4 color_intensity (4 floats) at index 56
    const colorIntensity = new Float32Array([
      ...this.color.data,
      this.intensity,
    ]);
    data.set(colorIntensity, 56);

    // vec4 forward (4 floats) at index 60
    const forward = this.transform.getWorldForward();
    data.set(forward.data, 60);

    // vec4 fov_penumbra (4 floats) at index 64
    const fovPenumbra = new Float32Array([this.fov, this.penumbra, 0, 0]);
    data.set(fovPenumbra, 64);

    // vec4 aspect_radius (4 floats) at index 68
    const aspectRadius = new Float32Array([
      this.aspectRatio,
      this.radius,
      0,
      0,
    ]);
    data.set(aspectRadius, 68);

    this._device.queue.writeBuffer(this.shadowBuffer, 0, data);
  }

  public getShadowBindGroup(): GPUBindGroup | null {
    return this.shadowBindGroup;
  }
}
