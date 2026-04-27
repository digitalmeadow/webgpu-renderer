import { Vec3, Mat4 } from "../math";
import { Light } from ".";
import { EntityType } from "../scene/Entity";

export const SHADOW_MAP_CASCADES_COUNT = 3;
export const DEFAULT_SHADOW_CASCADE_SPLITS = [0.0, 0.33, 0.66, 1.0];

// Module-level cache — layout descriptor is identical for all instances
let _shadowBindGroupLayout: GPUBindGroupLayout | null = null;

export function getDirectionalLightShadowBindGroupLayout(
  device: GPUDevice,
): GPUBindGroupLayout {
  if (!_shadowBindGroupLayout) {
    _shadowBindGroupLayout = device.createBindGroupLayout({
      label: "DirectionalLight Shadow BindGroup Layout",
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

  // Occlusion configuration
  public occlusionEnabled: boolean = false;
  public occlusionResolution: number = 512;
  public occlusionWorldSize: number = 200.0; // Orthographic bounds in world units (deprecated - use frustum-based)
  public occlusionFrustumPercentage: number = 0.2; // Percentage of camera frustum depth to cover (0.0-1.0)
  public occlusionSmoothness: number = 0.01; // Smoothness range for occlusion gradient (in depth space)

  // Occlusion matrix (will overwrite view_projection_matrices[0] during occlusion pass)
  public occlusionViewProjectionMatrix: Mat4 = Mat4.create();

  // Per-cascade shadow buffers — each has its cascade index baked in as a u32 at
  // byte offset 240 so that all writeBuffer calls for a frame complete before the
  // command encoder is submitted (no more setActiveCascadeIndex race).
  public shadowBuffers: GPUBuffer[] = [];
  public shadowBindGroups: GPUBindGroup[] = [];

  // Legacy aliases kept for LightManager's `!light.shadowBuffer` guard.
  public shadowBuffer: GPUBuffer | null = null;
  public shadowBindGroup: GPUBindGroup | null = null;

  // Dedicated buffer for the occlusion pass so it is never overwritten by
  // updateShadowBuffer() before the encoder is submitted.
  public occlusionBuffer: GPUBuffer | null = null;
  public occlusionBindGroup: GPUBindGroup | null = null;

  private _device: GPUDevice | null = null;

  constructor(name: string) {
    super(name);

    for (let i = 0; i < SHADOW_MAP_CASCADES_COUNT; i++) {
      this.viewProjectionMatrices.push(Mat4.create());
    }
  }

  public initShadowResources(device: GPUDevice): void {
    this._device = device;

    this.shadowBuffers = [];
    this.shadowBindGroups = [];

    // One buffer + bind-group per cascade, each pre-baked with its cascade index.
    for (let cascadeIndex = 0; cascadeIndex < SHADOW_MAP_CASCADES_COUNT; cascadeIndex++) {
      const buf = device.createBuffer({
        label: `DirectionalLight Shadow Buffer Cascade ${cascadeIndex}`,
        size: 256,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      const bg = device.createBindGroup({
        label: `DirectionalLight Shadow BindGroup Cascade ${cascadeIndex}`,
        layout: getDirectionalLightShadowBindGroupLayout(device),
        entries: [{ binding: 0, resource: { buffer: buf } }],
      });
      this.shadowBuffers.push(buf);
      this.shadowBindGroups.push(bg);
    }

    // Keep legacy aliases so LightManager's `!light.shadowBuffer` guard still works.
    this.shadowBuffer = this.shadowBuffers[0];
    this.shadowBindGroup = this.shadowBindGroups[0];

    // Dedicated buffer for the occlusion pass — completely separate from the
    // cascade buffers so occlusion matrix writes are never overwritten.
    this.occlusionBuffer = device.createBuffer({
      label: "DirectionalLight Occlusion Buffer",
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.occlusionBindGroup = device.createBindGroup({
      label: "DirectionalLight Occlusion BindGroup",
      layout: getDirectionalLightShadowBindGroupLayout(device),
      entries: [{ binding: 0, resource: { buffer: this.occlusionBuffer } }],
    });
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

    // Camera's local coordinate system (LH: right = worldUp × forward, up = forward × right)
    const forward = Vec3.normalize(cameraDirection.copy());
    const tempRight = Vec3.cross(Vec3.create(0, 1, 0), forward);
    const len = Vec3.len(tempRight);
    const right =
      len > 0.0001
        ? Vec3.normalize(tempRight)
        : Vec3.normalize(Vec3.cross(Vec3.create(1, 0, 0), forward));
    const cameraUp = Vec3.cross(forward, right);

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
      Vec3.addScaled(tempEye, lightDir, -eyeDistance, tempEye);
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
      Vec3.addScaled(eye, lightDir, -eyeDistance, eye);
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

  /**
   * @deprecated Use updateOcclusionMatrixFromFrustum instead for better frustum coverage
   */
  public updateOcclusionMatrix(
    cameraPosition: Vec3,
    cameraDirection: Vec3,
  ): void {
    if (!this.occlusionBuffer || !this._device) {
      return;
    }

    const lightDir = Vec3.normalize(this.direction);

    // Light's up vector
    const upCandidate = Vec3.create(0, 1, 0);
    const dot = Math.abs(Vec3.dot(lightDir, upCandidate));
    const up = dot > 0.9 ? Vec3.create(1, 0, 0) : upCandidate;

    // Center on camera position
    const center = Vec3.copy(cameraPosition, Vec3.create());

    // Eye position: push back along light direction
    const eyeDistance = this.occlusionWorldSize;
    const eye = Vec3.create();
    Vec3.copy(center, eye);
    Vec3.addScaled(eye, lightDir, -eyeDistance, eye);

    // Create view matrix
    const viewMatrix = Mat4.lookAt(eye, center, up);

    // Orthographic projection: square area centered on camera
    const halfSize = this.occlusionWorldSize / 2;
    const projMatrix = Mat4.ortho(
      -halfSize, // left
      halfSize, // right
      -halfSize, // bottom
      halfSize, // top
      0.1, // near
      this.occlusionWorldSize * 2, // far (cover full depth range)
    );

    // Store as view-projection matrix
    Mat4.multiply(projMatrix, viewMatrix, this.occlusionViewProjectionMatrix);

    // Write to the dedicated occlusion buffer (not the cascade shadow buffers).
    // The OcclusionPassDirectionalLight WGSL hardcodes view_projection_matrices[0],
    // so we only need to populate matrix[0] plus the direction for billboard support.
    const data = new Float32Array(64); // 256 bytes — full buffer
    data.set(this.occlusionViewProjectionMatrix.data, 0); // matrix[0]
    data.set(this.direction.data, 52); // direction field
    // active_view_projection_index = 0 at byte 240 (already zero from initialization)
    this._device.queue.writeBuffer(this.occlusionBuffer!, 0, data);
  }

  /**
   * Update occlusion matrix to cover a percentage of the camera frustum.
   * This provides much better coverage than the fixed world-space box approach.
   * Uses the same frustum-fitting logic as shadow cascades.
   */
  public updateOcclusionMatrixFromFrustum(
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

    // Camera's local coordinate system
    const forward = Vec3.normalize(cameraDirection.copy());
    const tempRight = Vec3.cross(forward, Vec3.create(0, 1, 0));
    const len = Vec3.len(tempRight);
    const right =
      len > 0.0001
        ? Vec3.normalize(tempRight)
        : Vec3.normalize(Vec3.cross(forward, Vec3.create(1, 0, 0)));
    const cameraUp = Vec3.cross(right, forward);

    const tanHalfFov = Math.tan(cameraFov / 2);

    // Calculate frustum extent based on percentage of camera far plane
    const occlusionNear = cameraNear;
    const occlusionFar =
      cameraNear + (cameraFar - cameraNear) * this.occlusionFrustumPercentage;

    // Compute frustum corners at both occlusionNear and occlusionFar (8 corners total)
    const halfHeightFar = occlusionFar * tanHalfFov;
    const halfWidthFar = halfHeightFar * cameraAspect;

    const halfHeightNear = occlusionNear * tanHalfFov;
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

    // Build 4 corners at occlusionNear
    addCornersAtDistance(occlusionNear, halfWidthNear, halfHeightNear);
    // Build 4 corners at occlusionFar
    addCornersAtDistance(occlusionFar, halfWidthFar, halfHeightFar);

    // Compute center as midpoint of the frustum slice
    const midDist = (occlusionNear + occlusionFar) / 2;
    const center = Vec3.create();
    Vec3.copy(cameraPosition, center);
    Vec3.addScaled(center, forward, midDist, center);

    // Create view matrix (no texel snapping needed for occlusion)
    const eyeDistance = Math.max(occlusionFar - occlusionNear, 100); // Ensure enough depth
    const eye = Vec3.create();
    Vec3.copy(center, eye);
    Vec3.addScaled(eye, lightDir, -eyeDistance, eye);
    const viewMatrix = Mat4.lookAt(eye, center, up);

    // Transform corners to light space to get AABB
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

    // Calculate orthographic projection bounds from light-space AABB
    const width = viewMax.x - viewMin.x;
    const height = viewMax.y - viewMin.y;
    const maxDim = Math.max(width, height);
    const halfDim = maxDim / 2;

    const centerX = (viewMin.x + viewMax.x) / 2;
    const centerY = (viewMin.y + viewMax.y) / 2;
    const orthoMinX = centerX - halfDim;
    const orthoMaxX = centerX + halfDim;
    const orthoMinY = centerY - halfDim;
    const orthoMaxY = centerY + halfDim;

    // Use light-space AABB Z extent for ortho bounds
    const viewZMin = viewMin.z;
    const viewZMax = viewMax.z;
    let orthoNear = viewZMin - 100; // Add padding to ensure coverage
    let orthoFar = viewZMax + 100;

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

    // Store as view-projection matrix
    Mat4.multiply(projMatrix, viewMatrix, this.occlusionViewProjectionMatrix);

    // Write to the dedicated occlusion buffer (not the cascade shadow buffers).
    // The OcclusionPassDirectionalLight WGSL hardcodes view_projection_matrices[0],
    // so we only need to populate matrix[0] plus the direction for billboard support.
    const data = new Float32Array(64); // 256 bytes — full buffer
    data.set(this.occlusionViewProjectionMatrix.data, 0); // matrix[0]
    data.set(this.direction.data, 52); // direction field
    // active_view_projection_index = 0 at byte 240 (already zero from initialization)
    this._device.queue.writeBuffer(this.occlusionBuffer!, 0, data);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  public updateShadowBuffer(): void {
    if (!this._device || this.shadowBuffers.length === 0) return;

    // Write once per cascade buffer with the cascade index baked in as a u32.
    // This avoids the writeBuffer-ordering race: all writes happen together here,
    // before the command encoder is created, so each buffer permanently holds the
    // correct active_view_projection_index for its cascade.
    for (let cascadeIndex = 0; cascadeIndex < SHADOW_MAP_CASCADES_COUNT; cascadeIndex++) {
      const buf = this.shadowBuffers[cascadeIndex];
      if (!buf) continue;

      const data = new Float32Array(64); // 256 bytes

      // view_projection_matrices (3 matrices, offsets 0–47)
      for (let i = 0; i < SHADOW_MAP_CASCADES_COUNT; i++) {
        data.set(this.viewProjectionMatrices[i].data, i * 16);
      }

      // cascade_splits (offset 48)
      data.set(this.cascadeActualDepths.slice(0, 4), 48);

      // direction (offset 52)
      data.set(this.direction.data, 52);

      // color.rgb + intensity (offset 56)
      data.set([...this.color.data, this.intensity], 56);

      // active_view_projection_index at byte 240 — must be a u32, not float.
      // Use a Uint32Array view into the same ArrayBuffer to write the correct bits.
      new Uint32Array(data.buffer, 240, 1)[0] = cascadeIndex;

      this._device.queue.writeBuffer(buf, 0, data);
    }
  }

  /** @deprecated No longer needed — cascade index is baked into per-cascade buffers. */
  public setActiveCascadeIndex(_index: number): void {
    // No-op: the active_view_projection_index is now pre-baked into each
    // cascade's own GPU buffer inside updateShadowBuffer(), eliminating the
    // writeBuffer-ordering race that caused all cascades to use index 2.
  }

  public getShadowBindGroup(): GPUBindGroup | null {
    return this.shadowBindGroup;
  }
}
