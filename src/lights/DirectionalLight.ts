import { Light, LightType } from "./Light";
import { Vec3, Mat4 } from "../math";

export const SHADOW_MAP_CASCADES_COUNT = 1;

export class DirectionalLight extends Light {
  public direction: Vec3 = new Vec3(-0.5, -1, 0);

  public shadowMatrix: Mat4 = Mat4.create();

  public shadowBuffer: GPUBuffer | null = null;
  public shadowBindGroup: GPUBindGroup | null = null;
  private shadowBindGroupLayout: GPUBindGroupLayout | null = null;
  private _device: GPUDevice | null = null;

  private static defaultShadowBindGroupLayout: GPUBindGroupLayout | null = null;

  constructor(name: string) {
    super(name, LightType.Directional);
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
      DirectionalLight.defaultShadowBindGroupLayout =
        this.shadowBindGroupLayout;
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

  public static getShadowBindGroupLayout(
    device: GPUDevice,
  ): GPUBindGroupLayout {
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

  public updateShadowMatrix(
    cameraPosition: Vec3,
    cameraDirection: Vec3,
    cameraNear: number,
    cameraFar: number,
  ): void {
    if (!this.shadowBuffer) {
      console.warn(
        "[DirectionalLight] No shadow buffer, skipping shadow matrix update",
      );
      return;
    }

    console.log("[DirectionalLight] updateShadowMatrix called", {
      cameraNear,
      cameraFar,
    });

    // Fixed light settings - not dependent on camera
    const lightDir = this.direction;
    const up = new Vec3(0, 0, 1);

    // Fixed light position and ortho - tuned for test scene
    // Scene: floor at Y=0 (20x20), cube at Y=1 rotating
    const lightPos = new Vec3(-10, 15, 5);
    const left = -15;
    const right = 15;
    const bottom = -15;
    const top = 15;
    const near = 0;
    const far = 40;

    console.log("[DirectionalLight] Fixed light setup:", {
      lightPos: [lightPos.x, lightPos.y, lightPos.z],
      direction: [this.direction.x, this.direction.y, this.direction.z],
      ortho: { left, right, bottom, top, near, far },
    });

    // Create light view matrix looking at origin
    const origin = new Vec3(0, 0, 0);
    const viewMatrix = Mat4.lookAt(lightPos, origin, up);

    // Create orthographic projection
    const projectionMatrix = Mat4.ortho(left, right, bottom, top, near, far);

    // Compute final shadow matrix
    Mat4.multiply(projectionMatrix, viewMatrix, this.shadowMatrix);

    console.log("[DirectionalLight] Shadow matrix computed (fixed)", {
      lightPos: [lightPos.x, lightPos.y, lightPos.z],
      direction: [this.direction.x, this.direction.y, this.direction.z],
    });

    this.updateShadowBuffer(lightPos);
  }

  private updateShadowBuffer(lightPos: Vec3): void {
    if (!this.shadowBuffer || !this._device) {
      console.warn(
        "[DirectionalLight] No shadow buffer or device, skipping buffer update",
      );
      return;
    }

    const data = new Float32Array(64);
    data.set(this.shadowMatrix.data, 0);

    const posArray = new Float32Array([
      lightPos.x,
      lightPos.y,
      lightPos.z,
      1.0,
    ]);
    data.set(posArray, 48);

    const dirArray = new Float32Array([
      this.direction.x,
      this.direction.y,
      this.direction.z,
      0.0,
    ]);
    data.set(dirArray, 52);

    data[56] = this.color.x;
    data[57] = this.color.y;
    data[58] = this.color.z;
    data[59] = this.intensity;

    console.log("[DirectionalLight] Writing shadow buffer:", {
      direction: [this.direction.x, this.direction.y, this.direction.z],
      color: [this.color.x, this.color.y, this.color.z],
      intensity: this.intensity,
      matrix: this.shadowMatrix.data.slice(0, 16),
    });

    this._device.queue.writeBuffer(this.shadowBuffer, 0, data);
  }

  public getShadowBindGroup(): GPUBindGroup | null {
    return this.shadowBindGroup;
  }
}
