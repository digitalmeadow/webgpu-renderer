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
      size: 112,
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
    // Light positioned above the scene looking down at origin
    // Scene: floor at Y=0 (20x20), cube at Y=1, camera at (0, 5, 10)
    const up = new Vec3(0, 1, 0);

    // Light directly above the scene, looking at origin
    // This ensures the shadow frustum captures the cube and floor
    const lightPos = new Vec3(0, 15, 5);
    const left = -15;
    const right = 15;
    const bottom = -15;
    const top = 15;
    const near = -20;
    const far = 20;

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

    // Debug: What position does the cube at (0,1,0) transform to in NDC?
    // Apply shadow matrix to cube position (0, 1, 0)
    const m = this.shadowMatrix.data;
    const cubeWorld = [0, 1, 0, 1] as [number, number, number, number];
    const cubeNDC = [
        m[0]*cubeWorld[0] + m[4]*cubeWorld[1] + m[8]*cubeWorld[2] + m[12]*cubeWorld[3],
        m[1]*cubeWorld[0] + m[5]*cubeWorld[1] + m[9]*cubeWorld[2] + m[13]*cubeWorld[3],
        m[2]*cubeWorld[0] + m[6]*cubeWorld[1] + m[10]*cubeWorld[2] + m[14]*cubeWorld[3],
        m[3]*cubeWorld[0] + m[7]*cubeWorld[1] + m[11]*cubeWorld[2] + m[15]*cubeWorld[3],
    ];

    // Also test floor center (0, 0, 0)
    const floorWorld = [0, 0, 0, 1] as [number, number, number, number];
    const floorNDC = [
        m[0]*floorWorld[0] + m[4]*floorWorld[1] + m[8]*floorWorld[2] + m[12]*floorWorld[3],
        m[1]*floorWorld[0] + m[5]*floorWorld[1] + m[9]*floorWorld[2] + m[13]*floorWorld[3],
        m[2]*floorWorld[0] + m[6]*floorWorld[1] + m[10]*floorWorld[2] + m[14]*floorWorld[3],
        m[3]*floorWorld[0] + m[7]*floorWorld[1] + m[11]*floorWorld[2] + m[15]*floorWorld[3],
    ];

    console.log("[DirectionalLight] Shadow frustum check:", {
      lightPos: [lightPos.x, lightPos.y, lightPos.z],
      ortho: { left, right, bottom, top, near, far },
      cubeNDC: cubeNDC,
      floorNDC: floorNDC,
      shadowMatrix: Array.from(this.shadowMatrix.data),
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

    // Buffer layout must match LightingPass.wgsl ShadowLightUniforms struct:
    // - offset 0: lightViewProjMatrix (16 floats, bytes 0-63)
    // - offset 64: lightPos (4 floats, bytes 64-79)  
    // - offset 80: direction (4 floats, bytes 80-95)
    // - offset 96: color_intensity (4 floats, bytes 96-111)
    const data = new Float32Array(112 / 4); // 112 bytes total

    // lightViewProjMatrix at offset 0 (indices 0-15)
    data.set(this.shadowMatrix.data, 0);

    // lightPos at offset 64 (indices 16-19)
    data[16] = lightPos.x;
    data[17] = lightPos.y;
    data[18] = lightPos.z;
    data[19] = 1.0;

    // direction at offset 80 (indices 20-23)
    data[20] = this.direction.x;
    data[21] = this.direction.y;
    data[22] = this.direction.z;
    data[23] = 0.0;

    // color_intensity at offset 96 (indices 24-27)
    data[24] = this.color.x;
    data[25] = this.color.y;
    data[26] = this.color.z;
    data[27] = this.intensity;

    console.log("[DirectionalLight] Writing shadow buffer (corrected layout):", {
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
