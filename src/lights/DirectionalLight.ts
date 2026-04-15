import { Vec3, Mat4 } from "../math";
import { Light } from ".";
import { EntityType } from "../scene/Entity";

export const SHADOW_MAP_CASCADES_COUNT = 3;
export const DEFAULT_SHADOW_CASCADE_SPLITS = [0.0, 0.33, 0.66, 1.0];

export class DirectionalLight extends Light {
  readonly type = EntityType.LightDirectional;
  public direction: Vec3 = new Vec3(0, -1, -0.5);
  public lightIndex: number = 0;

  // Shadow configuration
  public offsetNear: number = 0.0; // World-space units to push near plane back (toward light)
  public cascadeOverlap: number = 0.0; // Percentage factor (0.0-1.0+) for XY overlap between cascades
  public cascadeBlendWidth: number = 0.1; // Blend zone size as fraction of cascade range (0.1 = 10%)

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

    // Light's up vector: avoid gimbal lock if light is nearly vertical
    const upCandidate = Vec3.create(0, 1, 0);
    const dot = Math.abs(Vec3.dot(lightDir, upCandidate));
    const up = dot > 0.9 ? Vec3.create(1, 0, 0) : upCandidate;

    // Camera's local coordinate system (use temp cross to avoid collapse)
    const forward = Vec3.normalize(cameraDirection.copy());
    const tempRight = Vec3.cross(forward, Vec3.create(0, 1, 0));
    const len = Vec3.len(tempRight);
    const right =
      len > 0.0001
        ? Vec3.normalize(tempRight)
        : Vec3.normalize(Vec3.cross(forward, Vec3.create(1, 0, 0)));
    const cameraUp = Vec3.cross(right, forward);

    const tanHalfFov = Math.tan(cameraFov / 2);

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

      // Compute frustum corners at both splitNear and splitFar (8 corners total)
      // This ensures proper depth extent even when camera aligns with light direction
      const halfHeightFar = splitFar * tanHalfFov;
      const halfWidthFar = halfHeightFar * cameraAspect;

      // Use splitNear for near plane extent (smaller frustum for closer cascade)
      const halfHeightNear = splitNear * tanHalfFov;
      const halfWidthNear = halfHeightNear * cameraAspect;

      const corners: Vec3[] = [];

      // Helper to compute corners at a given distance
      const addCornersAtDistance = (
        dist: number,
        halfW: number,
        halfH: number,
      ) => {
        const halfHeights = [halfH, -halfH];
        const halfWidths = [-halfW, halfW];
        for (const h of halfHeights) {
          for (const w of halfWidths) {
            const corner = Vec3.create();
            Vec3.copy(cameraPosition, corner);
            Vec3.addScaled(corner, forward, dist, corner);
            Vec3.addScaled(corner, right, w, corner);
            Vec3.addScaled(corner, cameraUp, h, corner);
            corners.push(corner);
          }
        }
      };

      // Build 4 corners at splitNear
      addCornersAtDistance(splitNear, halfWidthNear, halfHeightNear);
      // Build 4 corners at splitFar
      addCornersAtDistance(splitFar, halfWidthFar, halfHeightFar);

      // Compute center as midpoint of the frustum slice
      const midDist = (splitNear + splitFar) / 2;
      const center = Vec3.create();
      Vec3.copy(cameraPosition, center);
      Vec3.addScaled(center, forward, midDist, center);

      // === TWO-PASS APPROACH FOR TEXEL SNAPPING ===
      // Pass 1: Create temporary view matrix to calculate actual light-space bounds
      // Pass 2: Calculate correct texel size and snap world-space center before final view matrix

      const shadowMapSize = 2048;

      // Compute AABB of all 8 corners in world space
      let min = Vec3.create(Infinity, Infinity, Infinity);
      let max = Vec3.create(-Infinity, -Infinity, -Infinity);
      for (const corner of corners) {
        min.data[0] = Math.min(min.data[0], corner.x);
        min.data[1] = Math.min(min.data[1], corner.y);
        min.data[2] = Math.min(min.data[2], corner.z);
        max.data[0] = Math.max(max.data[0], corner.x);
        max.data[1] = Math.max(max.data[1], corner.y);
        max.data[2] = Math.max(max.data[2], corner.z);
      }

      // Build orthonormal basis for the light direction (used for snapping)
      const lightRight = Vec3.create();
      const lightUp = Vec3.create();
      Vec3.cross(up, lightDir, lightRight);
      Vec3.normalize(lightRight, lightRight);
      Vec3.cross(lightDir, lightRight, lightUp);
      Vec3.normalize(lightUp, lightUp);

      // PASS 1: Create temporary unsnapped view matrix to get light-space bounds
      const eyeDistance = max.z - min.z;
      const tempEye = Vec3.create();
      Vec3.copy(center, tempEye);
      Vec3.addScaled(tempEye, lightDir, eyeDistance, tempEye);
      const tempViewMatrix = Mat4.lookAt(tempEye, center, up);

      // Transform corners to light-space to get actual AABB
      let viewMin = Vec3.create(Infinity, Infinity, Infinity);
      let viewMax = Vec3.create(-Infinity, -Infinity, -Infinity);
      for (const corner of corners) {
        const lc = Vec3.transformMat4(corner, tempViewMatrix);
        viewMin.data[0] = Math.min(viewMin.data[0], lc.x);
        viewMin.data[1] = Math.min(viewMin.data[1], lc.y);
        viewMin.data[2] = Math.min(viewMin.data[2], lc.z);
        viewMax.data[0] = Math.max(viewMax.data[0], lc.x);
        viewMax.data[1] = Math.max(viewMax.data[1], lc.y);
        viewMax.data[2] = Math.max(viewMax.data[2], lc.z);
      }

      // Calculate ACTUAL texel size from light-space bounds
      const width = viewMax.x - viewMin.x;
      const height = viewMax.y - viewMin.y;
      const maxDim = Math.max(width, height);
      const halfDim = (maxDim / 2) * (1.0 + this.cascadeOverlap);
      const actualTexelSize = (halfDim * 2.0) / shadowMapSize;

      // PASS 2: Snap world-space center using CORRECT texel size
      const centerProjectedX = Vec3.dot(center, lightRight);
      const centerProjectedY = Vec3.dot(center, lightUp);

      const snappedProjectedX =
        Math.floor(centerProjectedX / actualTexelSize) * actualTexelSize;
      const snappedProjectedY =
        Math.floor(centerProjectedY / actualTexelSize) * actualTexelSize;

      // Verify snapping is working: delta should always be less than texelSize
      const deltaX = Math.abs(snappedProjectedX - centerProjectedX);
      const deltaY = Math.abs(snappedProjectedY - centerProjectedY);
      if (deltaX >= actualTexelSize || deltaY >= actualTexelSize) {
        console.warn(
          `[Cascade ${cascadeIndex}] WARNING: Snap delta exceeds texelSize! dX=${deltaX.toFixed(4)}, dY=${deltaY.toFixed(4)}, texelSize=${actualTexelSize.toFixed(4)}`,
        );
      }

      // Reconstruct snapped world-space center
      const centerAlongLight = Vec3.dot(center, lightDir);
      const snappedCenter = Vec3.create();
      Vec3.addScaled(
        snappedCenter,
        lightRight,
        snappedProjectedX,
        snappedCenter,
      );
      Vec3.addScaled(snappedCenter, lightUp, snappedProjectedY, snappedCenter);
      Vec3.addScaled(snappedCenter, lightDir, centerAlongLight, snappedCenter);

      // Create FINAL view matrix with snapped center
      const eye = Vec3.create();
      Vec3.copy(snappedCenter, eye);
      Vec3.addScaled(eye, lightDir, eyeDistance, eye);
      const viewMatrix = Mat4.lookAt(eye, snappedCenter, up);

      // Calculate orthographic projection bounds from light-space center
      const centerX = (viewMin.x + viewMax.x) / 2;
      const centerY = (viewMin.y + viewMax.y) / 2;
      const orthoMinX = centerX - halfDim;
      const orthoMaxX = centerX + halfDim;
      const orthoMinY = centerY - halfDim;
      const orthoMaxY = centerY + halfDim;

      // Use light-space AABB Z extent for ortho bounds
      const viewZMin = viewMin.z;
      const viewZMax = viewMax.z;
      let orthoNear = viewZMin - this.offsetNear;
      let orthoFar = viewZMax;

      // Ensure orthoNear < orthoFar
      if (orthoNear >= orthoFar) {
        const temp = orthoNear;
        orthoNear = orthoFar;
        orthoFar = temp;
      }

      const projMatrix = Mat4.ortho(
        orthoMinX,
        orthoMaxX,
        orthoMinY,
        orthoMaxY,
        orthoNear,
        orthoFar,
      );

      // Create VP matrix: P * V
      Mat4.multiply(
        projMatrix,
        viewMatrix,
        this.viewProjectionMatrices[cascadeIndex],
      );
    }

    this.cascadeActualDepths = actualSplits;
    this.updateShadowBuffer();
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
