import { Vec3, Mat4 } from "../math";
import { Light } from ".";
import { EntityType } from "../scene/Entity";

export const SHADOW_MAP_CASCADES_COUNT = 3;
export const DEFAULT_SHADOW_CASCADE_SPLITS = [0.0, 0.33, 0.66, 1.0];
export const OFFSET = 0;
export const SHADOW_XY_PADDING = 0;

export class DirectionalLight extends Light {
  readonly type = EntityType.LightDirectional;
  public direction: Vec3 = new Vec3(0, -1, -0.5);
  public lightIndex: number = 0;

  public viewProjectionMatrices: Mat4[] = [];
  public cascadeSplits: number[] = [...DEFAULT_SHADOW_CASCADE_SPLITS];
  public cascadeActualDepths: number[] = [];

  public shadowBuffer: GPUBuffer | null = null;
  public shadowBindGroup: GPUBindGroup | null = null;
  private shadowBindGroupLayout: GPUBindGroupLayout | null = null;

  private _device: GPUDevice | null = null;

  private static defaultShadowBindGroupLayout: GPUBindGroupLayout | null = null;

  constructor(name: string) {
    super(name);

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

    const lightDir = Vec3.normalize(this.direction);

    const upCandidate = Vec3.create(0, 1, 0);
    const dot = Math.abs(Vec3.dot(lightDir, upCandidate));
    const up = dot > 0.9 ? Vec3.create(1, 0, 0) : upCandidate;

    const forward = Vec3.normalize(cameraDirection.copy());
    const right = Vec3.normalize(Vec3.cross(forward, Vec3.create(0, 1, 0)));
    const cameraUp = Vec3.cross(right, forward);

    const actualSplits: number[] = [cameraNear];

    for (
      let cascadeIndex = 0;
      cascadeIndex < SHADOW_MAP_CASCADES_COUNT;
      cascadeIndex++
    ) {
      const splitNear = this.lerp(
        cameraNear,
        cameraFar,
        this.cascadeSplits[cascadeIndex],
      );
      const splitFar = this.lerp(
        cameraNear,
        cameraFar,
        this.cascadeSplits[cascadeIndex + 1],
      );
      actualSplits.push(splitFar);

      const cascadeMid = (splitNear + splitFar) / 2;

      const center = Vec3.create();
      Vec3.copy(cameraPosition, center);
      Vec3.addScaled(center, forward, cascadeMid, center);

      const halfHeight = (splitFar - splitNear) * Math.tan(cameraFov / 2);
      const halfWidth = halfHeight * cameraAspect;

      const corners: Vec3[] = [];
      const halfHeights = [halfHeight, -halfHeight];
      const halfWidths = [-halfWidth, halfWidth];

      for (const h of halfHeights) {
        for (const w of halfWidths) {
          const corner = Vec3.create();
          Vec3.copy(center, corner);
          Vec3.addScaled(corner, right, w, corner);
          Vec3.addScaled(corner, cameraUp, h, corner);
          Vec3.addScaled(corner, forward, 0, corner);
          corners.push(corner);
        }
      }

      const min = Vec3.create(Infinity, Infinity, Infinity);
      const max = Vec3.create(-Infinity, -Infinity, -Infinity);

      for (const corner of corners) {
        min.data[0] = Math.min(min.data[0], corner.x);
        min.data[1] = Math.min(min.data[1], corner.y);
        min.data[2] = Math.min(min.data[2], corner.z);
        max.data[0] = Math.max(max.data[0], corner.x);
        max.data[1] = Math.max(max.data[1], corner.y);
        max.data[2] = Math.max(max.data[2], corner.z);
      }

      min.x -= SHADOW_XY_PADDING;
      min.y -= SHADOW_XY_PADDING;
      max.x += SHADOW_XY_PADDING;
      max.y += SHADOW_XY_PADDING;

      const eyeDistance = max.z - min.z + OFFSET;
      const eye = Vec3.create();
      Vec3.copy(center, eye);
      Vec3.addScaled(eye, lightDir, -eyeDistance, eye);

      const viewMatrix = Mat4.lookAt(eye, center, up);

      let viewMin = Vec3.create(Infinity, Infinity, Infinity);
      let viewMax = Vec3.create(-Infinity, -Infinity, -Infinity);
      for (const corner of corners) {
        const lc = Vec3.transformMat4(corner, viewMatrix);
        viewMin.data[0] = Math.min(viewMin.data[0], lc.x);
        viewMin.data[1] = Math.min(viewMin.data[1], lc.y);
        viewMin.data[2] = Math.min(viewMin.data[2], lc.z);
        viewMax.data[0] = Math.max(viewMax.data[0], lc.x);
        viewMax.data[1] = Math.max(viewMax.data[1], lc.y);
        viewMax.data[2] = Math.max(viewMax.data[2], lc.z);
      }

      const width = viewMax.x - viewMin.x;
      const height = viewMax.y - viewMin.y;
      const maxDim = Math.max(width, height);
      const halfDim = maxDim / 2;
      const centerX = (viewMin.x + viewMax.x) / 2;
      const centerY = (viewMin.y + viewMax.y) / 2;

      const projMatrix = Mat4.ortho(
        centerX - halfDim,
        centerX + halfDim,
        centerY - halfDim,
        centerY + halfDim,
        -viewMax.z,
        -viewMin.z,
      );

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
