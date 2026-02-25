import { Light, LightType } from "./Light";
import { vec3, mat4, Vec3, Mat4 } from 'wgpu-matrix';

export const MAX_LIGHT_SPOT_COUNT = 4;

export class SpotLight extends Light {
  public direction: Vec3 = vec3.fromValues(0, -1, 0);
  public position: Vec3 = vec3.fromValues(0, 5, 0);
  public angleInner: number = Math.PI / 8;
  public angleOuter: number = Math.PI / 6;

  public viewMatrix: Mat4 = mat4.create();
  public projectionMatrix: Mat4 = mat4.create();
  public viewProjectionMatrix: Mat4 = mat4.create();

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
      size: 144,
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

    const target = vec3.fromValues(
      this.position[0] + this.direction[0],
      this.position[1] + this.direction[1],
      this.position[2] + this.direction[2],
    );
    mat4.lookAt(this.position, target, vec3.fromValues(0, 1, 0), this.viewMatrix);
    mat4.perspective(this.angleOuter * 2, 1, 0.1, 100, this.projectionMatrix);
    mat4.multiply(this.projectionMatrix, this.viewMatrix, this.viewProjectionMatrix);
  }

  public updateShadowUniforms(): void {
    if (!this.shadowBuffer || !this._device) {
      return;
    }

    this.updateMatrices();
    
    const data = new Float32Array(36);
    data.set(this.viewProjectionMatrix, 0);
    data.set([this.position[0], this.position[1], this.position[2], 0], 16);
    data.set([this.direction[0], this.direction[1], this.direction[2], 0], 20);
    data.set([this.color[0], this.color[1], this.color[2], this.intensity], 24);
    data.set([this.angleInner], 28);
    data.set([this.angleOuter], 29);
    this._device.queue.writeBuffer(this.shadowBuffer, 0, data);
  }

  public getShadowBindGroup(): GPUBindGroup | null {
    return this.shadowBindGroup;
  }
}
