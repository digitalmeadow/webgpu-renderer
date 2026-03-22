import { Vec3, Mat4 } from "../math";
import { Light } from ".";
import { EntityType } from "../scene/Entity";

export const SPOT_SHADOW_MAP_SIZE = 1024;

export class SpotLight extends Light {
  readonly type = EntityType.LightSpot;
  public direction: Vec3 = new Vec3(0, -1, 0);
  public fov: number = 45;
  public prenumbra: number = 0.0;
  public aspectRatio: number = 1.0;
  public radius: number = 0.0;
  public near: number = 0.1;
  public far: number = 50;
  public lightIndex: number = 0;

  public viewMatrix: Mat4 = Mat4.create();
  public projectionMatrix: Mat4 = Mat4.create();
  public viewProjectionMatrix: Mat4 = Mat4.create();

  public shadowBuffer: GPUBuffer | null = null;
  public shadowBindGroup: GPUBindGroup | null = null;
  private shadowBindGroupLayout: GPUBindGroupLayout | null = null;

  private _device: GPUDevice | null = null;

  private static defaultShadowBindGroupLayout: GPUBindGroupLayout | null = null;

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

    this.shadowBindGroupLayout = device.createBindGroupLayout({
      label: "SpotLight Shadow BindGroup Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    if (!SpotLight.defaultShadowBindGroupLayout) {
      SpotLight.defaultShadowBindGroupLayout = this.shadowBindGroupLayout;
    }

    this.shadowBindGroup = device.createBindGroup({
      label: "SpotLight Shadow BindGroup",
      layout: this.shadowBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.shadowBuffer },
        },
      ],
    });
  }

  public static getShadowBindGroupLayout(
    device: GPUDevice,
  ): GPUBindGroupLayout {
    if (!SpotLight.defaultShadowBindGroupLayout) {
      const layout = device.createBindGroupLayout({
        label: "SpotLight Shadow BindGroup Layout",
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" },
          },
        ],
      });
      SpotLight.defaultShadowBindGroupLayout = layout;
    }
    return SpotLight.defaultShadowBindGroupLayout;
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

    const data = new Float32Array(72);

    data.set(this.viewMatrix.data, 0);
    data.set(this.projectionMatrix.data, 16);
    data.set(this.viewProjectionMatrix.data, 32);

    const position = this.transform.getWorldPosition();
    data.set(position.data, 48);

    const nearFar = new Float32Array([this.near, this.far, 0, 0]);
    data.set(nearFar, 52);

    const colorIntensity = new Float32Array([
      ...this.color.data,
      this.intensity,
    ]);
    data.set(colorIntensity, 56);

    const forward = this.transform.getWorldForward();
    data.set(forward.data, 60);

    const fovPrenumbra = new Float32Array([this.fov, this.prenumbra, 0, 0]);
    data.set(fovPrenumbra, 64);

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
