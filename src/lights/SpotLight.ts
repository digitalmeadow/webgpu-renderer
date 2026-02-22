import { Light, LightType } from "./Light";
import { Vec3, Mat4 } from "../math";

export const MAX_LIGHT_SPOT_COUNT = 4;

export class SpotLight extends Light {
  public direction: Vec3 = new Vec3(0, -1, 0);
  public position: Vec3 = new Vec3(0, 5, 0);
  public angleInner: number = Math.PI / 8;
  public angleOuter: number = Math.PI / 6;

  public viewMatrix: Mat4 = Mat4.create();
  public projectionMatrix: Mat4 = Mat4.create();
  public viewProjectionMatrix: Mat4 = Mat4.create();

  public shadowBuffer: GPUBuffer | null = null;
  public shadowBindGroup: GPUBindGroup | null = null;
  public shadowBindGroupLayout: GPUBindGroupLayout | null = null;
  private _device: GPUDevice | null = null;

  private static defaultShadowBindGroupLayout: GPUBindGroupLayout | null = null;

  constructor(name: string) {
    super(name, LightType.Spot);
  }

  public initShadowResources(device: GPUDevice): void {
    this._device = device;

    this.shadowBuffer = device.createBuffer({
      label: "SpotLight Shadow Buffer",
      size: 144, // 64 for mat4, 16 for pos, 16 for dir, 16 for color, 4 for inner, 4 for outer, 20 bytes padding
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

  public static getShadowBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
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

  public updateMatrices(): void {
    this.position = this.transform.translation;
    this.direction = this.transform.getForward();

    const target = new Vec3(
      this.position.x + this.direction.x,
      this.position.y + this.direction.y,
      this.position.z + this.direction.z,
    );
    this.viewMatrix = Mat4.lookAt(this.position, target, new Vec3(0, 1, 0));
    this.projectionMatrix = Mat4.perspective(this.angleOuter * 2, 1, 0.1, 100);
    Mat4.multiply(this.projectionMatrix, this.viewMatrix, this.viewProjectionMatrix);
  }

  public updateShadowUniforms(): void {
    if (!this.shadowBuffer || !this._device) {
      return;
    }

    this.updateMatrices();

    const data = new Float32Array(36);
    data.set(this.viewProjectionMatrix.data, 0);
    data.set([this.position.x, this.position.y, this.position.z, 0], 16);
    data.set([this.direction.x, this.direction.y, this.direction.z, 0], 20);
    data.set([this.color.x, this.color.y, this.color.z, this.intensity], 24);
    data.set([this.angleInner], 28);
    data.set([this.angleOuter], 29);
    this._device.queue.writeBuffer(this.shadowBuffer, 0, data);
  }

  public getShadowBindGroup(): GPUBindGroup | null {
    return this.shadowBindGroup;
  }
}
