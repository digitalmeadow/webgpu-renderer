import { Light, LightType } from "./Light";
import { Vec3, Mat4 } from "../math";

export const SHADOW_MAP_CASCADES_COUNT = 3;
export const SHADOW_CASCADE_SPLITS = [0.0, 0.2, 0.5, 1.0];
const LIGHT_VIEW_OFFSET = 50.0;

export class DirectionalLight extends Light {
  public direction: Vec3 = new Vec3(0, -1, 0);
  
  public viewProjectionMatrices: Mat4[] = [];
  public cascadeSplits: number[] = [...SHADOW_CASCADE_SPLITS];
  public cascadeActualDepths: number[] = [];
  
  public shadowBuffer: GPUBuffer | null = null;
  public shadowBindGroup: GPUBindGroup | null = null;
  private shadowBindGroupLayout: GPUBindGroupLayout | null = null;
  private _device: GPUDevice | null = null;

  private static defaultShadowBindGroupLayout: GPUBindGroupLayout | null = null;

  constructor(name: string) {
    super(name, LightType.Directional);
    
    for (let i = 0; i < SHADOW_MAP_CASCADES_COUNT; i++) {
      this.viewProjectionMatrices.push(Mat4.create());
    }
  }

  public initShadowResources(device: GPUDevice): void {
    this._device = device;
    
    this.shadowBuffer = device.createBuffer({
      label: "DirectionalLight Shadow Buffer",
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.shadowBindGroupLayout = device.createBindGroupLayout({
      label: "DirectionalLight Shadow BindGroup Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    if (!DirectionalLight.defaultShadowBindGroupLayout) {
      DirectionalLight.defaultShadowBindGroupLayout = this.shadowBindGroupLayout;
    }

    this.shadowBindGroup = device.createBindGroup({
      label: "DirectionalLight Shadow BindGroup",
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
    if (!DirectionalLight.defaultShadowBindGroupLayout) {
      const layout = device.createBindGroupLayout({
        label: "DirectionalLight Shadow BindGroup Layout",
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" },
          },
        ],
      });
      DirectionalLight.defaultShadowBindGroupLayout = layout;
    }
    return DirectionalLight.defaultShadowBindGroupLayout;
  }

  public updateCascadeMatrices(
    cameraPosition: Vec3,
    cameraDirection: Vec3,
    cameraNear: number,
    cameraFar: number,
  ): void {
    if (!this.shadowBuffer) return;

    const lightDir = this.direction;
    const up = new Vec3(0, 1, 0);

    const actualSplits: number[] = [cameraNear];

    for (let i = 0; i < SHADOW_MAP_CASCADES_COUNT; i++) {
      const splitNear = this.lerp(cameraNear, cameraFar, SHADOW_CASCADE_SPLITS[i]);
      const splitFar = this.lerp(cameraNear, cameraFar, SHADOW_CASCADE_SPLITS[i + 1]);
      
      actualSplits.push(splitFar);

      const center = new Vec3(
        cameraPosition.data[0] + cameraDirection.data[0] * (splitNear + splitFar) * 0.5,
        cameraPosition.data[1] + cameraDirection.data[1] * (splitNear + splitFar) * 0.5,
        cameraPosition.data[2] + cameraDirection.data[2] * (splitNear + splitFar) * 0.5,
      );

      const eye = new Vec3(
        center.data[0] - lightDir.data[0] * LIGHT_VIEW_OFFSET,
        center.data[1] - lightDir.data[1] * LIGHT_VIEW_OFFSET,
        center.data[2] - lightDir.data[2] * LIGHT_VIEW_OFFSET,
      );

      const viewMatrix = Mat4.lookAt(eye, center, up);
      
      const frustumRadius = (splitFar - splitNear) * 0.5;
      const orthoSize = frustumRadius + LIGHT_VIEW_OFFSET;
      
      const projectionMatrix = Mat4.ortho(
        -orthoSize,
        orthoSize,
        -orthoSize,
        orthoSize,
        -frustumRadius - LIGHT_VIEW_OFFSET,
        frustumRadius,
      );

      Mat4.multiply(projectionMatrix, viewMatrix, this.viewProjectionMatrices[i]);
    }

    this.cascadeActualDepths = actualSplits;
    this.updateShadowBuffer();
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private updateShadowBuffer(): void {
    if (!this.shadowBuffer || !this._device) return;

    const matrices: number[] = [];
    for (const matrix of this.viewProjectionMatrices) {
      matrices.push(...matrix.data);
    }

    const data = new Float32Array(64);
    data.set(matrices, 0);
    
    if (this.cascadeActualDepths.length >= 4) {
      data.set(this.cascadeActualDepths.slice(0, 4), 48);
    } else {
      data.set(this.cascadeSplits, 48);
    }
    
    data.set(this.direction.data, 52);
    data[56] = this.intensity;

    this._device.queue.writeBuffer(this.shadowBuffer, 0, data);
  }

  public setActiveCascadeIndex(index: number): void {
    if (!this.shadowBuffer || !this._device) return;
    const indexData = new Uint32Array([index]);
    this._device.queue.writeBuffer(this.shadowBuffer, 240, indexData); // offset 240 = 60 * 4 bytes
  }

  public getShadowBindGroup(): GPUBindGroup | null {
    return this.shadowBindGroup;
  }
}
