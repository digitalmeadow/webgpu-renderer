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

    console.log(`[ShadowCascade] ===== FRAME START =====`);
    console.log(
      `[ShadowCascade] Camera: pos=(${cameraPosition.x.toFixed(2)}, ${cameraPosition.y.toFixed(2)}, ${cameraPosition.z.toFixed(2)})`,
    );
    console.log(
      `[ShadowCascade] Camera: dir=(${cameraDirection.x.toFixed(2)}, ${cameraDirection.y.toFixed(2)}, ${cameraDirection.z.toFixed(2)})`,
    );
    console.log(
      `[ShadowCascade] Camera: near=${cameraNear}, far=${cameraFar}, fov=${((cameraFov * 180) / Math.PI).toFixed(1)}deg, aspect=${cameraAspect.toFixed(2)}`,
    );
    console.log(
      `[ShadowCascade] Light dir: (${this.direction.x.toFixed(3)}, ${this.direction.y.toFixed(3)}, ${this.direction.z.toFixed(3)})`,
    );
    console.log(
      `[ShadowCascade] Splits: ${this.cascadeSplits.map((s) => s.toFixed(4)).join(", ")}`,
    );

    const lightDir = Vec3.normalize(this.direction);
    console.log(
      `[ShadowCascade] Light dir (normalized): (${lightDir.x.toFixed(3)}, ${lightDir.y.toFixed(3)}, ${lightDir.z.toFixed(3)})`,
    );

    // Validate camera direction is normalized
    const dirLength = Vec3.len(cameraDirection);
    if (Math.abs(dirLength - 1.0) > 0.01) {
      console.warn(
        `[ShadowCascade] Camera direction not normalized! Length: ${dirLength.toFixed(3)} (expected 1.000)`,
      );
    } else {
      console.log(
        `[ShadowCascade] Camera direction validated: length=${dirLength.toFixed(6)}`,
      );
    }

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

      console.log(`[ShadowCascade] === Cascade ${cascadeIndex} ===`);
      console.log(
        `[ShadowCascade]   splitNear=${splitNear.toFixed(2)}, splitFar=${splitFar.toFixed(2)}`,
      );
      console.log(
        `[ShadowCascade]   halfWidthNear=${halfWidthNear.toFixed(2)}, halfHeightNear=${halfHeightNear.toFixed(2)}`,
      );
      console.log(
        `[ShadowCascade]   halfWidthFar=${halfWidthFar.toFixed(2)}, halfHeightFar=${halfHeightFar.toFixed(2)}`,
      );
      console.log(`[ShadowCascade]   corners (8 total):`);
      for (let ci = 0; ci < corners.length; ci++) {
        console.log(
          `[ShadowCascade]     corner[${ci}]: (${corners[ci].x.toFixed(2)}, ${corners[ci].y.toFixed(2)}, ${corners[ci].z.toFixed(2)})`,
        );
      }

      // Compute center as midpoint of the frustum slice
      const midDist = (splitNear + splitFar) / 2;
      const center = Vec3.create();
      Vec3.copy(cameraPosition, center);
      Vec3.addScaled(center, forward, midDist, center);

      console.log(
        `[ShadowCascade]   midDist=${midDist.toFixed(2)}, center=(${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`,
      );

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

      console.log(
        `[ShadowCascade]   world AABB: min=(${min.x.toFixed(2)}, ${min.y.toFixed(2)}, ${min.z.toFixed(2)}), max=(${max.x.toFixed(2)}, ${max.y.toFixed(2)}, ${max.z.toFixed(2)})`,
      );
      console.log(
        `[ShadowCascade]   world AABB size: (${(max.x - min.x).toFixed(2)}, ${(max.y - min.y).toFixed(2)}, ${(max.z - min.z).toFixed(2)})`,
      );

      // Position shadow camera to look down the light direction
      // Mat4.lookAt() builds a view matrix where the Z-axis points FROM center TO eye (backward)
      // So to make the camera look along lightDir, we position the eye at center + eyeDistance * lightDir
      // This way, the -Z axis (forward) will point along -lightDir (the direction light travels)
      const eyeDistance = max.z - min.z;
      const eye = Vec3.create();
      Vec3.copy(center, eye);
      Vec3.addScaled(eye, lightDir, eyeDistance, eye); // eye = center + eyeDistance * lightDir

      console.log(
        `[ShadowCascade]   eyeDistance=${eyeDistance.toFixed(2)}, eye=(${eye.x.toFixed(2)}, ${eye.y.toFixed(2)}, ${eye.z.toFixed(2)})`,
      );
      console.log(
        `[ShadowCascade]   lightDir = (${lightDir.x.toFixed(3)}, ${lightDir.y.toFixed(3)}, ${lightDir.z.toFixed(3)})`,
      );
      console.log(
        `[ShadowCascade]   up = (${up.x.toFixed(3)}, ${up.y.toFixed(3)}, ${up.z.toFixed(3)})`,
      );

      // Create view matrix first
      const viewMatrix = Mat4.lookAt(eye, center, up);

      // Transform all 8 corners to light-space and compute AABB
      // Using 8 corners ensures proper depth even when camera aligns with light
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

      console.log(
        `[ShadowCascade]   light-space AABB: viewMin=(${viewMin.x.toFixed(2)}, ${viewMin.y.toFixed(2)}, ${viewMin.z.toFixed(2)}), viewMax=(${viewMax.x.toFixed(2)}, ${viewMax.y.toFixed(2)}, ${viewMax.z.toFixed(2)})`,
      );

      // Use light-space AABB for ortho bounds (consistent with view matrix)
      const width = viewMax.x - viewMin.x;
      const height = viewMax.y - viewMin.y;
      const maxDim = Math.max(width, height);
      // Apply cascadeOverlap to expand XY bounds (prevents edge gaps, captures shadow casters outside frustum)
      const halfDim = (maxDim / 2) * (1.0 + this.cascadeOverlap);
      const centerX = (viewMin.x + viewMax.x) / 2;
      const centerY = (viewMin.y + viewMax.y) / 2;

      console.log(
        `[ShadowCascade]   width=${width.toFixed(2)}, height=${height.toFixed(2)}, maxDim=${maxDim.toFixed(2)}, halfDim=${halfDim.toFixed(2)}`,
      );
      console.log(
        `[ShadowCascade]   cascadeOverlap=${this.cascadeOverlap.toFixed(2)} (applied to halfDim)`,
      );
      console.log(
        `[ShadowCascade]   centerX=${centerX.toFixed(2)}, centerY=${centerY.toFixed(2)}`,
      );

      // Use light-space AABB Z extent for ortho bounds
      // The ortho matrix maps: z_ndc = (z - near) / (far - near)
      // We want: scene at viewZMin -> z_ndc = 0, scene at viewZMax -> z_ndc = 1
      // So we need: near = viewZMin, far = viewZMax
      const viewZMin = viewMin.z;
      const viewZMax = viewMax.z;

      // Ensure orthoNear < orthoFar for correct depth direction
      // viewZMin should be closest to eye (most negative), viewZMax furthest (least negative)
      // Apply offsetNear to push near plane backward (captures geometry behind mountains, etc.)
      let orthoNear = viewZMin - this.offsetNear;
      let orthoFar = viewZMax;

      // If somehow reversed (shouldn't happen with proper eye placement), swap them
      if (orthoNear >= orthoFar) {
        const temp = orthoNear;
        orthoNear = orthoFar;
        orthoFar = temp;
      }

      console.log(
        `[ShadowCascade]   ORTHO: near=${orthoNear.toFixed(2)}, far=${orthoFar.toFixed(2)}, depth=${(orthoFar - orthoNear).toFixed(2)}`,
      );
      console.log(
        `[ShadowCascade]   offsetNear=${this.offsetNear.toFixed(2)} (applied to orthoNear)`,
      );

      const projMatrix = Mat4.ortho(
        centerX - halfDim,
        centerX + halfDim,
        centerY - halfDim,
        centerY + halfDim,
        orthoNear,
        orthoFar,
      );

      console.log(
        `[ShadowCascade]   viewMatrix: eye=(${eye.x.toFixed(2)}, ${eye.y.toFixed(2)}, ${eye.z.toFixed(2)}), target=(${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`,
      );

      const preDet = Mat4.determinant(projMatrix);
      console.log(
        `[ShadowCascade]   projMatrix determinant: ${preDet.toFixed(6)}`,
      );

      // Create temporary VP - multiply in correct order: V * P
      // This applies view first (world -> view), then projection (view -> clip)
      const tempVP = Mat4.create();
      Mat4.multiply(viewMatrix, projMatrix, tempVP);
      const preMulVPDet = Mat4.determinant(tempVP);
      console.log(
        `[ShadowCascade]   VP pre-copy determinant: ${preMulVPDet.toFixed(6)}`,
      );

      if (Math.abs(preMulVPDet) < 0.000001) {
        console.warn(
          `[ShadowCascade]   WARNING: VP matrix has near-zero determinant (degenerate)!`,
        );
      }

      // Correct order: P * V (projection then view, matching Camera.ts pattern)
      Mat4.multiply(
        projMatrix,
        viewMatrix,
        this.viewProjectionMatrices[cascadeIndex],
      );

      const vpDet = Mat4.determinant(this.viewProjectionMatrices[cascadeIndex]);
      console.log(
        `[ShadowCascade]   VP[${cascadeIndex}] determinant: ${vpDet.toFixed(6)}`,
      );

      if (Math.abs(vpDet) < 0.000001) {
        console.warn(
          `[ShadowCascade]   WARNING: Final VP matrix has near-zero determinant (degenerate)! This will cause shadow issues!`,
        );
      }
      // Log first few values of VP matrix
      const vpData = this.viewProjectionMatrices[cascadeIndex].data;
      console.log(
        `[ShadowCascade]   VP[${cascadeIndex}] first 8 values: ${vpData[0].toFixed(4)}, ${vpData[1].toFixed(4)}, ${vpData[2].toFixed(4)}, ${vpData[3].toFixed(4)}, ${vpData[4].toFixed(4)}, ${vpData[5].toFixed(4)}, ${vpData[6].toFixed(4)}, ${vpData[7].toFixed(4)}`,
      );
    }

    this.cascadeActualDepths = actualSplits;
    console.log(`[ShadowCascade] ===== FRAME END =====`);
    console.log(
      `[ShadowCascade] Uploading to buffer: cascadeActualDepths=${actualSplits.map((v) => v.toFixed(2)).join(", ")}`,
    );
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
