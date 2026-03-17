import { Vec3, Mat4 } from "../math";
import { Light, LightType } from ".";

export const SHADOW_MAP_CASCADES_COUNT = 3;
export const SHADOW_CASCADE_SPLITS = [0.0, 0.33, 0.66, 1.0];
export const OFFSET = 10;
export const SHADOW_XY_PADDING = 0;

export class DirectionalLight extends Light {
  public direction: Vec3 = new Vec3(0, -1, -0.5);
  public lightIndex: number = 0;

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

  public updateCascadeMatrices(
    cameraPosition: Vec3,
    cameraDirection: Vec3,
    cameraNear: number,
    cameraFar: number,
    cameraFov: number,
    cameraAspect: number,
  ): void {
    if (!this.shadowBuffer || !this._device) {
      return;
    }

    // Light direction represents the direction light rays travel (towards objects)
    // For a downward light (0,-1,0), we want the camera positioned ABOVE looking DOWN
    const lightDir = Vec3.normalize(this.direction);

    // Up vector: avoid gimbal lock if light is nearly vertical
    const upCandidate = Vec3.create(0, 1, 0);
    const dot = Math.abs(Vec3.dot(lightDir, upCandidate));
    const up = dot > 0.9 ? Vec3.create(1, 0, 0) : upCandidate;

    // Compute full camera frustum corners in world space
    const frustumCorners: Vec3[] = this.computeFallbackFrustumCorners(
      cameraPosition,
      cameraDirection,
      cameraNear,
      cameraFar,
      cameraFov,
      cameraAspect,
    );

    const actualSplits: number[] = [cameraNear];

    for (
      let cascadeIndex = 0;
      cascadeIndex < SHADOW_MAP_CASCADES_COUNT;
      cascadeIndex++
    ) {
      // Compute near/far split distances
      const splitNear = this.lerp(
        cameraNear,
        cameraFar,
        SHADOW_CASCADE_SPLITS[cascadeIndex],
      );
      const splitFar = this.lerp(
        cameraNear,
        cameraFar,
        SHADOW_CASCADE_SPLITS[cascadeIndex + 1],
      );
      actualSplits.push(splitFar);

      const tNear = (splitNear - cameraNear) / (cameraFar - cameraNear);
      const tFar = (splitFar - cameraNear) / (cameraFar - cameraNear);

      // Interpolate frustum corners for this cascade
      const splitCorners: Vec3[] = [];
      for (let i = 0; i < 4; i++) {
        const nearCorner = frustumCorners[i];
        const farCorner = frustumCorners[i + 4];
        splitCorners.push(Vec3.lerp(nearCorner, farCorner, tNear));
        splitCorners.push(Vec3.lerp(nearCorner, farCorner, tFar));
      }

      // Compute cascade frustum center
      const center = Vec3.zero();
      for (const c of splitCorners) Vec3.add(center, c, center);
      Vec3.scale(center, 1 / splitCorners.length, center);

      // Calculate minimum eye distance to ensure all corners have negative Z in view space
      // For each corner: d > dot(corner - center, -lightDir)
      const negLightDir = Vec3.scale(lightDir, -1, Vec3.create());
      let dMin = -Infinity;
      for (const corner of splitCorners) {
        const offset = Vec3.sub(corner, center, Vec3.create());
        const projection = Vec3.dot(offset, negLightDir);
        dMin = Math.max(dMin, projection);
      }
      // Add a large Z-extrusion buffer to capture casters outside the visible frustum slice.
      const eyeDistance = dMin + OFFSET;

      // Position eye along light direction from center
      const eye = Vec3.sub(
        center,
        Vec3.scale(lightDir, eyeDistance, Vec3.create()),
      );
      const viewMatrix = Mat4.lookAt(eye, center, up);

      // Compute tight AABB from cascade corners only (no extrusion)
      let min = Vec3.create(Infinity, Infinity, Infinity);
      let max = Vec3.create(-Infinity, -Infinity, -Infinity);
      for (const corner of splitCorners) {
        const lc = Vec3.transformMat4(corner, viewMatrix);
        min.data[0] = Math.min(min.data[0], lc.x);
        min.data[1] = Math.min(min.data[1], lc.y);
        min.data[2] = Math.min(min.data[2], lc.z);
        max.data[0] = Math.max(max.data[0], lc.x);
        max.data[1] = Math.max(max.data[1], lc.y);
        max.data[2] = Math.max(max.data[2], lc.z);
      }

      // Add lateral padding to ensure objects moving within the camera frustum are still captured
      min.x -= SHADOW_XY_PADDING;
      min.y -= SHADOW_XY_PADDING;
      max.x += SHADOW_XY_PADDING;
      max.y += SHADOW_XY_PADDING;

      const projMatrix = Mat4.ortho(
        min.x,
        max.x,
        min.y,
        max.y,
        -max.z, // near distance (positive)
        -min.z, // far distance (positive)
      );

      // Multiply in correct order: projection * view
      Mat4.multiply(
        projMatrix,
        viewMatrix,
        this.viewProjectionMatrices[cascadeIndex],
      );
    }

    this.cascadeActualDepths = actualSplits;
    this.updateShadowBuffer();
  }

  private computeFallbackFrustumCorners(
    cameraPosition: Vec3,
    cameraDirection: Vec3,
    cameraNear: number,
    cameraFar: number,
    cameraFov: number,
    cameraAspect: number,
  ): Vec3[] {
    const corners: Vec3[] = [];
    const forward = Vec3.normalize(cameraDirection.copy());
    const right = Vec3.normalize(Vec3.cross(forward, Vec3.create(0, 1, 0)));
    const up = Vec3.cross(right, forward);

    const fov = cameraFov;
    const aspect = cameraAspect;
    const nearHeight = 2 * Math.tan(fov / 2) * cameraNear;
    const nearWidth = nearHeight * aspect;
    const farHeight = 2 * Math.tan(fov / 2) * cameraFar;
    const farWidth = farHeight * aspect;

    const nearCenter = Vec3.create(
      cameraPosition.x + forward.x * cameraNear,
      cameraPosition.y + forward.y * cameraNear,
      cameraPosition.z + forward.z * cameraNear,
    );
    const farCenter = Vec3.create(
      cameraPosition.x + forward.x * cameraFar,
      cameraPosition.y + forward.y * cameraFar,
      cameraPosition.z + forward.z * cameraFar,
    );

    const nearOffsets = [
      Vec3.create(-nearWidth / 2, -nearHeight / 2, 0),
      Vec3.create(nearWidth / 2, -nearHeight / 2, 0),
      Vec3.create(-nearWidth / 2, nearHeight / 2, 0),
      Vec3.create(nearWidth / 2, nearHeight / 2, 0),
    ];

    const farOffsets = [
      Vec3.create(-farWidth / 2, -farHeight / 2, 0),
      Vec3.create(farWidth / 2, -farHeight / 2, 0),
      Vec3.create(-farWidth / 2, farHeight / 2, 0),
      Vec3.create(farWidth / 2, farHeight / 2, 0),
    ];

    for (const offset of nearOffsets) {
      const corner = Vec3.create();
      Vec3.copy(nearCenter, corner);
      Vec3.addScaled(corner, right, offset.x, corner);
      Vec3.addScaled(corner, up, offset.y, corner);
      Vec3.addScaled(corner, forward, offset.z, corner);
      corners.push(corner);
    }

    for (const offset of farOffsets) {
      const corner = Vec3.create();
      Vec3.copy(farCenter, corner);
      Vec3.addScaled(corner, right, offset.x, corner);
      Vec3.addScaled(corner, up, offset.y, corner);
      Vec3.addScaled(corner, forward, offset.z, corner);
      corners.push(corner);
    }

    return corners;
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private updateShadowBuffer(): void {
    if (!this.shadowBuffer || !this._device) return;

    const data = new Float32Array(64); // 256 bytes

    // view_projection_matrices (3 matrices)
    for (let i = 0; i < SHADOW_MAP_CASCADES_COUNT; i++) {
      data.set(this.viewProjectionMatrices[i].data, i * 16);
    }

    // cascade_splits
    data.set(this.cascadeActualDepths.slice(0, 4), 48);

    // direction
    data.set(this.direction.data, 52);

    // color.rgb + intensity in alpha to match the lighting shader contract
    data.set([...this.color.data, this.intensity], 56);

    // light_index (stored at offset 240, same as active_view_projection_index)
    data[60] = this.lightIndex;

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
