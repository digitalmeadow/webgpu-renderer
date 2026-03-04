import { Light, LightType } from "./Light";
import { Vec3, Mat4 } from "../math";
import { frustumCornersFromInverseViewProjection } from "../math/Frustum";
import { validateCascadeTransformation } from "./frustum-debug";

export const SHADOW_MAP_CASCADES_COUNT = 3;
export const SHADOW_CASCADE_SPLITS = [0.0, 0.2, 0.5, 1.0];

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
    cameraViewProjectionInverse?: Mat4,
  ): void {
    if (!this.shadowBuffer || !this._device) return;

    // Light direction represents the direction light rays travel (towards objects)
    // For a downward light (0,-1,0), we want the camera positioned ABOVE looking DOWN
    const lightDir = Vec3.normalize(this.direction);

    // Up vector: avoid gimbal lock if light is nearly vertical
    const upCandidate = Vec3.create(0, 1, 0);
    const dot = Math.abs(Vec3.dot(lightDir, upCandidate));
    const up = dot > 0.9 ? Vec3.create(1, 0, 0) : upCandidate;

    // Compute full camera frustum corners in world space
    const frustumCorners: Vec3[] = cameraViewProjectionInverse
      ? frustumCornersFromInverseViewProjection(cameraViewProjectionInverse)
      : this.computeFallbackFrustumCorners(
          cameraPosition,
          cameraDirection,
          cameraNear,
          cameraFar,
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

      // Compute radius to enclose all corners
      let radius = 0;
      for (const corner of splitCorners) {
        const dist = Vec3.distance(corner, center);
        if (dist > radius) radius = dist;
      }
      radius = Math.ceil(radius * 16) / 16; // optional stabilization

      // Position eye opposite to light direction
      const eye = Vec3.sub(center, Vec3.scale(lightDir, radius, Vec3.create()));
      const viewMatrix = Mat4.lookAt(eye, center, up);

      validateCascadeTransformation(
        eye,
        center,
        up,
        splitCorners,
        cascadeIndex,
      );

      console.log(
        `Cascade ${cascadeIndex} - Center: (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}), Radius: ${radius.toFixed(2)}`,
      );
      console.log(
        `  Eye: (${eye.x.toFixed(2)}, ${eye.y.toFixed(2)}, ${eye.z.toFixed(2)}), LightDir: (${lightDir.x.toFixed(2)}, ${lightDir.y.toFixed(2)}, ${lightDir.z.toFixed(2)})`,
      );

      // Compute light-space bounds for ortho projection using only cascade corners
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

      // In view space (lookAt), -Z points into the scene. Objects in front have negative Z.
      // The ortho function expects near/far as positive DISTANCES from eye.
      // Convert view-space Z coordinates to distances: distance = -Z
      //   min.z = most negative (farthest) -> far distance = -min.z
      //   max.z = least negative (nearest) -> near distance = -max.z
      console.log(
        `  Bounds - X:[${min.x.toFixed(2)}, ${max.x.toFixed(2)}], Y:[${min.y.toFixed(2)}, ${max.y.toFixed(2)}], Z:[${min.z.toFixed(2)}, ${max.z.toFixed(2)}]`,
      );
      console.log(
        `  Ortho - near: ${(-max.z).toFixed(2)}, far: ${(-min.z).toFixed(2)}`,
      );

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

    // Log cascade dimensions and data for debugging
    for (let i = 0; i < SHADOW_MAP_CASCADES_COUNT; i++) {
      const vp = this.viewProjectionMatrices[i];
      const d = vp.data;
      console.log(
        `Cascade ${i}: Split [${this.cascadeSplits[i].toFixed(
          2,
        )}, ${this.cascadeSplits[i + 1].toFixed(2)}], Actual Depth [${
          this.cascadeActualDepths[i]
        }, ${this.cascadeActualDepths[i + 1]}]`,
      );
      console.log(
        `ViewProjection Matrix (column-major):\n` +
          `[${d[0].toFixed(3)}, ${d[4].toFixed(3)}, ${d[8].toFixed(3)}, ${d[12].toFixed(3)}]\n` +
          `[${d[1].toFixed(3)}, ${d[5].toFixed(3)}, ${d[9].toFixed(3)}, ${d[13].toFixed(3)}]\n` +
          `[${d[2].toFixed(3)}, ${d[6].toFixed(3)}, ${d[10].toFixed(3)}, ${d[14].toFixed(3)}]\n` +
          `[${d[3].toFixed(3)}, ${d[7].toFixed(3)}, ${d[11].toFixed(3)}, ${d[15].toFixed(3)}]`,
      );
    }
  }

  private computeFallbackFrustumCorners(
    cameraPosition: Vec3,
    cameraDirection: Vec3,
    cameraNear: number,
    cameraFar: number,
  ): Vec3[] {
    const corners: Vec3[] = [];
    const forward = Vec3.normalize(cameraDirection.copy());
    const right = Vec3.normalize(Vec3.cross(forward, Vec3.create(0, 1, 0)));
    const up = Vec3.cross(right, forward);

    const fov = Math.PI / 4;
    const aspect = 16 / 9;
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
      Vec3.add(
        Vec3.add(
          nearCenter,
          Vec3.add(
            Vec3.scale(right, offset.x, corner),
            Vec3.scale(up, offset.y),
            corner,
          ),
          corner,
        ),
        Vec3.scale(forward, offset.z, corner),
        corner,
      );
      corners.push(corner);
    }

    for (const offset of farOffsets) {
      const corner = Vec3.create();
      Vec3.add(
        Vec3.add(
          farCenter,
          Vec3.add(
            Vec3.scale(right, offset.x, corner),
            Vec3.scale(up, offset.y),
            corner,
          ),
          corner,
        ),
        Vec3.scale(forward, offset.z, corner),
        corner,
      );
      corners.push(corner);
    }

    return corners;
  }

  private interpolateFrustumCorners(
    corners: Vec3[],
    tNear: number,
    tFar: number,
  ): Vec3[] {
    const result: Vec3[] = [];
    for (let i = 0; i < 4; i++) {
      const nearCorner = corners[i];
      const farCorner = corners[i + 4];
      result.push(Vec3.lerp(nearCorner, farCorner, tNear));
      result.push(Vec3.lerp(nearCorner, farCorner, tFar));
    }
    return result;
  }

  private computeFrustumCenter(corners: Vec3[]): Vec3 {
    let sumX = 0,
      sumY = 0,
      sumZ = 0;
    for (const corner of corners) {
      sumX += corner.x;
      sumY += corner.y;
      sumZ += corner.z;
    }
    return Vec3.create(sumX / 8, sumY / 8, sumZ / 8);
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

    // direction (vec4 - need 4 components, Vec3 only has 3)
    data[52] = this.direction.data[0];
    data[53] = this.direction.data[1];
    data[54] = this.direction.data[2];
    data[55] = 0.0; // W component (unused but required for vec4 alignment)

    // color (just use white for now, or your light color)
    data.set([1, 1, 1, 1], 56);

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
