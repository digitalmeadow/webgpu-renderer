import { Light, LightType } from "./Light";
import { vec3, vec4, mat4, Vec3, Mat4 } from "wgpu-matrix";

export const SHADOW_MAP_CASCADES_COUNT = 3;
export const SHADOW_CASCADE_SPLITS = [0.0, 0.33, 0.66, 1.0];
export const LIGHT_VIEW_OFFSET = 25.0;
export const MAX_LIGHT_DIRECTIONAL_COUNT = 2;

export class DirectionalLight extends Light {
  public direction: Vec3 = vec3.fromValues(-0.5, -1, 0);

  public viewMatrices: Mat4[] = [];
  public projectionMatrices: Mat4[] = [];
  public viewProjectionMatrices: Mat4[] = [];
  public cascadeSplits: number[] = [...SHADOW_CASCADE_SPLITS];
  public normalizedCascadeSplits: number[] = [...SHADOW_CASCADE_SPLITS];
  public activeViewProjectionIndex: number = 0;

  public shadowBuffer: GPUBuffer | null = null;
  public shadowBindGroup: GPUBindGroup | null = null;
  public shadowBindGroupLayout: GPUBindGroupLayout | null = null;
  private _device: GPUDevice | null = null;

  private static defaultShadowBindGroupLayout: GPUBindGroupLayout | null = null;

  constructor(name: string) {
    super(name, LightType.Directional);

    for (let i = 0; i < SHADOW_MAP_CASCADES_COUNT; i++) {
      this.viewMatrices.push(mat4.create());
      this.projectionMatrices.push(mat4.create());
      this.viewProjectionMatrices.push(mat4.create());
    }
  }

  public initShadowResources(device: GPUDevice): void {
    this._device = device;

    this.shadowBuffer = device.createBuffer({
      label: "DirectionalLight Shadow Buffer",
      size: 256,
      usage:
        GPUBufferUsage.UNIFORM |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.COPY_SRC,
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

  public computeFrustumCorners(
    viewMatrix: Mat4,
    projectionMatrix: Mat4,
  ): Vec3[] {
    const viewProjectionMatrix = mat4.create();
    mat4.multiply(projectionMatrix, viewMatrix, viewProjectionMatrix);

    const viewProjectionInverse = mat4.create();
    const invertible = mat4.invert(viewProjectionMatrix, viewProjectionInverse);
    if (!invertible) {
      console.error(
        "[DirectionalLight] Failed to invert view-projection matrix",
      );
      return [];
    }

    // WebGPU NDC: z ranges from 0 (near) to 1 (far)
    const ndcCorners = [
      [-1, -1, 0], // near bottom-left
      [1, -1, 0], // near bottom-right
      [1, 1, 0], // near top-right
      [-1, 1, 0], // near top-left
      [-1, -1, 1], // far bottom-left
      [1, -1, 1], // far bottom-right
      [1, 1, 1], // far top-right
      [-1, 1, 1], // far top-left
    ];

    const corners: Vec3[] = [];

    for (let i = 0; i < ndcCorners.length; i++) {
      const ndc = ndcCorners[i];

      const x = ndc[0];
      const y = ndc[1];
      const z = ndc[2];
      const w = 1.0;

      const inv = viewProjectionInverse;

      const transformedX = inv[0] * x + inv[4] * y + inv[8] * z + inv[12] * w;
      const transformedY = inv[1] * x + inv[5] * y + inv[9] * z + inv[13] * w;
      const transformedZ = inv[2] * x + inv[6] * y + inv[10] * z + inv[14] * w;
      const transformedW = inv[3] * x + inv[7] * y + inv[11] * z + inv[15] * w;

      const worldX = transformedX / transformedW;
      const worldY = transformedY / transformedW;
      const worldZ = transformedZ / transformedW;

      corners.push(vec3.fromValues(worldX, worldY, worldZ));
    }

    return corners;
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
    return vec3.fromValues(
      this.lerp(a[0], b[0], t),
      this.lerp(a[1], b[1], t),
      this.lerp(a[2], b[2], t),
    );
  }

  private validateMatrix(m: Mat4, name: string): boolean {
    let hasNaN = false;
    let hasInf = false;
    for (let i = 0; i < 16; i++) {
      if (isNaN(m[i])) hasNaN = true;
      if (!isFinite(m[i])) hasInf = true;
    }
    if (hasNaN || hasInf) {
      console.error(
        `[DirectionalLight] INVALID MATRIX ${name}: NaN=${hasNaN}, Inf=${hasInf}`,
      );
      console.error(`[DirectionalLight]   matrix:`, m);
      return false;
    }
    return true;
  }

  private formatMatrix(m: Mat4): string {
    const rows = [
      `[${m[0].toFixed(3)}, ${m[4].toFixed(3)}, ${m[8].toFixed(3)}, ${m[12].toFixed(3)}]`,
      `[${m[1].toFixed(3)}, ${m[5].toFixed(3)}, ${m[9].toFixed(3)}, ${m[13].toFixed(3)}]`,
      `[${m[2].toFixed(3)}, ${m[6].toFixed(3)}, ${m[10].toFixed(3)}, ${m[14].toFixed(3)}]`,
      `[${m[3].toFixed(3)}, ${m[7].toFixed(3)}, ${m[11].toFixed(3)}, ${m[15].toFixed(3)}]`,
    ];
    return `\n    ${rows[0]}\n    ${rows[1]}\n    ${rows[2]}\n    ${rows[3]}`;
  }

  public updateCascadeMatrices(
    cameraPosition: Vec3,
    cameraDirection: Vec3,
    cameraNear: number,
    cameraFar: number,
    cameraViewMatrix: Mat4,
    cameraProjectionMatrix: Mat4,
  ): void {
    if (!this.shadowBuffer) {
      return;
    }

    // Light direction should point FROM light TOWARD scene
    // The transform's forward points FROM origin TOWARD the light, so we negate it
    const forward = this.transform.getForward();
    this.direction = vec3.fromValues(-forward[0], -forward[1], -forward[2]);

    console.log(`[DirectionalLight] === UPDATE CASCADE MATRICES ===`);
    console.log(
      `[DirectionalLight] Light direction (forward): [${forward[0].toFixed(3)}, ${forward[1].toFixed(3)}, ${forward[2].toFixed(3)}]`,
    );
    console.log(
      `[DirectionalLight] Light position: [${this.transform.translation[0].toFixed(3)}, ${this.transform.translation[1].toFixed(3)}, ${this.transform.translation[2].toFixed(3)}]`,
    );
    console.log(
      `[DirectionalLight] Camera position: [${cameraPosition[0].toFixed(3)}, ${cameraPosition[1].toFixed(3)}, ${cameraPosition[2].toFixed(3)}]`,
    );
    console.log(
      `[DirectionalLight] Camera near: ${cameraNear}, far: ${cameraFar}`,
    );

    const frustumCorners = this.computeFrustumCorners(
      cameraViewMatrix,
      cameraProjectionMatrix,
    );
    if (frustumCorners.length === 0) {
      console.error(`[DirectionalLight] FAILED: No frustum corners computed!`);
      return;
    }

    console.log(`[DirectionalLight] Frustum corners:`);
    for (let i = 0; i < frustumCorners.length; i++) {
      const c = frustumCorners[i];
      console.log(
        `[DirectionalLight]   corner[${i}]: [${c[0].toFixed(2)}, ${c[1].toFixed(2)}, ${c[2].toFixed(2)}]`,
      );
    }

    this.updateCascadeSplits(cameraNear, cameraFar);
    console.log(
      `[DirectionalLight] Cascade splits: ${this.cascadeSplits.join(", ")}`,
    );
    this.updateViewProjectionMatrices(frustumCorners);
  }

  private updateCascadeSplits(cameraNear: number, cameraFar: number): void {
    for (let i = 0; i < SHADOW_MAP_CASCADES_COUNT + 1; i++) {
      const t = SHADOW_CASCADE_SPLITS[i];
      this.cascadeSplits[i] = cameraNear + (cameraFar - cameraNear) * t;
      this.normalizedCascadeSplits[i] = SHADOW_CASCADE_SPLITS[i];
    }
  }

  private updateViewProjectionMatrices(frustumCorners: Vec3[]): void {
    const splitRange =
      this.cascadeSplits[SHADOW_MAP_CASCADES_COUNT] - this.cascadeSplits[0];

    for (
      let cascadeIndex = 0;
      cascadeIndex < SHADOW_MAP_CASCADES_COUNT;
      cascadeIndex++
    ) {
      const splitNear = this.cascadeSplits[cascadeIndex];
      const splitFar = this.cascadeSplits[cascadeIndex + 1];

      const tNear = (splitNear - this.cascadeSplits[0]) / splitRange;
      const tFar = (splitFar - this.cascadeSplits[0]) / splitRange;

      const splitCorners: Vec3[] = [];
      for (let i = 0; i < 4; i++) {
        const nearCorner = frustumCorners[i];
        const farCorner = frustumCorners[i + 4];
        splitCorners.push(this.lerpVec3(nearCorner, farCorner, tNear));
      }
      for (let i = 0; i < 4; i++) {
        const nearCorner = frustumCorners[i];
        const farCorner = frustumCorners[i + 4];
        splitCorners.push(this.lerpVec3(nearCorner, farCorner, tFar));
      }

      this.updateCascadeMatrixFromCorners(cascadeIndex, splitCorners);
    }
  }

  private updateCascadeMatrixFromCorners(
    cascadeIndex: number,
    splitCorners: Vec3[],
  ): void {
    console.log(`[DirectionalLight] === CASCADE ${cascadeIndex} ===`);

    let centerX = 0,
      centerY = 0,
      centerZ = 0;
    for (const corner of splitCorners) {
      centerX += corner[0];
      centerY += corner[1];
      centerZ += corner[2];
    }
    centerX /= 8;
    centerY /= 8;
    centerZ /= 8;
    const centerPoint = vec3.fromValues(centerX, centerY, centerZ);
    console.log(
      `[DirectionalLight]   centerPoint: [${centerX.toFixed(2)}, ${centerY.toFixed(2)}, ${centerZ.toFixed(2)}]`,
    );

    let maxRadius = 0;
    for (const corner of splitCorners) {
      const dx = corner[0] - centerX;
      const dy = corner[1] - centerY;
      const dz = corner[2] - centerZ;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > maxRadius) {
        maxRadius = dist;
      }
    }
    console.log(
      `[DirectionalLight]   maxRadius: ${maxRadius.toFixed(2)}, LIGHT_VIEW_OFFSET: ${LIGHT_VIEW_OFFSET}`,
    );

    const eye = vec3.fromValues(
      centerX + this.direction[0] * (maxRadius + LIGHT_VIEW_OFFSET),
      centerY + this.direction[1] * (maxRadius + LIGHT_VIEW_OFFSET),
      centerZ + this.direction[2] * (maxRadius + LIGHT_VIEW_OFFSET),
    );
    const target = centerPoint;
    const up = vec3.fromValues(0, 1, 0);

    console.log(
      `[DirectionalLight]   eye: [${eye[0].toFixed(2)}, ${eye[1].toFixed(2)}, ${eye[2].toFixed(2)}]`,
    );
    console.log(
      `[DirectionalLight]   target: [${target[0].toFixed(2)}, ${target[1].toFixed(2)}, ${target[2].toFixed(2)}]`,
    );
    console.log(
      `[DirectionalLight]   direction: [${this.direction[0].toFixed(3)}, ${this.direction[1].toFixed(3)}, ${this.direction[2].toFixed(3)}]`,
    );

    const viewMatrix = mat4.create();
    mat4.lookAt(eye, target, up, viewMatrix);
    console.log(
      `[DirectionalLight]   viewMatrix:\n${this.formatMatrix(viewMatrix)}`,
    );

    const extrudedCorners: Vec3[] = [];
    for (const corner of splitCorners) {
      extrudedCorners.push(
        vec3.fromValues(
          corner[0] + this.direction[0] * LIGHT_VIEW_OFFSET,
          corner[1] + this.direction[1] * LIGHT_VIEW_OFFSET,
          corner[2] + this.direction[2] * LIGHT_VIEW_OFFSET,
        ),
      );
    }

    const allCorners = [...splitCorners, ...extrudedCorners];

    const lightSpaceCorners: Vec3[] = [];
    for (const corner of allCorners) {
      const transformed = vec3.create();
      vec3.transformMat4(corner, viewMatrix, transformed);
      lightSpaceCorners.push(transformed);
    }

    console.log(`[DirectionalLight]   Light space corners:`);
    for (let i = 0; i < lightSpaceCorners.length; i++) {
      const c = lightSpaceCorners[i];
      console.log(
        `[DirectionalLight]     corner[${i}]: [${c[0].toFixed(2)}, ${c[1].toFixed(2)}, ${c[2].toFixed(2)}]`,
      );
    }

    let minX = lightSpaceCorners[0][0],
      maxX = lightSpaceCorners[0][0];
    let minY = lightSpaceCorners[0][1],
      maxY = lightSpaceCorners[0][1];
    let minZ = lightSpaceCorners[0][2],
      maxZ = lightSpaceCorners[0][2];

    for (let i = 1; i < lightSpaceCorners.length; i++) {
      const c = lightSpaceCorners[i];
      if (c[0] < minX) minX = c[0];
      if (c[0] > maxX) maxX = c[0];
      if (c[1] < minY) minY = c[1];
      if (c[1] > maxY) maxY = c[1];
      if (c[2] < minZ) minZ = c[2];
      if (c[2] > maxZ) maxZ = c[2];
    }

    console.log(
      `[DirectionalLight]   Ortho bounds: X[${minX.toFixed(2)}, ${maxX.toFixed(2)}] Y[${minY.toFixed(2)}, ${maxY.toFixed(2)}] Z[${minZ.toFixed(2)}, ${maxZ.toFixed(2)}]`,
    );
    console.log(
      `[DirectionalLight]   NOTE: wgpu-matrix ortho expects near < far for proper Z!`,
    );

    // wgpu-matrix ortho expects near/far as distances along negative Z axis
    // The AABB Z values are already negative (e.g., -92.6 to -29.5)
    // near should be more negative (-92.6), far should be less negative (-29.5)
    const projectionMatrix = mat4.create();
    mat4.ortho(minX, maxX, minY, maxY, maxZ, minZ, projectionMatrix);

    this.viewMatrices[cascadeIndex] = viewMatrix;
    this.projectionMatrices[cascadeIndex] = projectionMatrix;

    const viewProjection = mat4.create();
    mat4.multiply(projectionMatrix, viewMatrix, viewProjection);
    this.viewProjectionMatrices[cascadeIndex] = viewProjection;

    // Debug: validate matrices
    this.validateMatrix(viewMatrix, `viewMatrix[${cascadeIndex}]`);
    this.validateMatrix(projectionMatrix, `projectionMatrix[${cascadeIndex}]`);
    this.validateMatrix(viewProjection, `viewProjection[${cascadeIndex}]`);

    // Debug: log matrices
    console.log(
      `[DirectionalLight]   viewMatrix:`,
      this.formatMatrix(viewMatrix),
    );
    console.log(
      `[DirectionalLight]   projectionMatrix:`,
      this.formatMatrix(projectionMatrix),
    );
    console.log(
      `[DirectionalLight]   viewProjectionMatrix:`,
      this.formatMatrix(viewProjection),
    );
  }

  public updateShadowUniforms(): void {
    if (!this.shadowBuffer || !this._device) {
      return;
    }

    console.log(`[DirectionalLight] === UPDATE SHADOW UNIFORMS ===`);

    const data = new Float32Array(64);

    for (
      let cascadeIndex = 0;
      cascadeIndex < SHADOW_MAP_CASCADES_COUNT;
      cascadeIndex++
    ) {
      const matrix = this.viewProjectionMatrices[cascadeIndex];
      console.log(
        `[DirectionalLight]   cascade[${cascadeIndex}] VP matrix:`,
        this.formatMatrix(matrix),
      );
      for (let i = 0; i < 16; i++) {
        data[cascadeIndex * 16 + i] = matrix[i];
      }
    }

    this._device.queue.writeBuffer(this.shadowBuffer, 0, data);

    const splitsData = new Float32Array(4);
    for (let i = 0; i < 4; i++) {
      splitsData[i] = this.cascadeSplits[i];
    }
    console.log(
      `[DirectionalLight]   cascade splits: [${splitsData.join(", ")}]`,
    );
    this._device.queue.writeBuffer(this.shadowBuffer, 192, splitsData);

    const directionData = new Float32Array([
      this.direction[0],
      this.direction[1],
      this.direction[2],
      0.0,
    ]);
    console.log(
      `[DirectionalLight]   direction: [${directionData[0].toFixed(3)}, ${directionData[1].toFixed(3)}, ${directionData[2].toFixed(3)}]`,
    );
    this._device.queue.writeBuffer(this.shadowBuffer, 208, directionData);

    const colorData = new Float32Array([
      this.color[0],
      this.color[1],
      this.color[2],
      this.intensity,
    ]);
    console.log(
      `[DirectionalLight]   color: [${colorData[0].toFixed(2)}, ${colorData[1].toFixed(2)}, ${colorData[2].toFixed(2)}], intensity: ${colorData[3].toFixed(2)}`,
    );
    this._device.queue.writeBuffer(this.shadowBuffer, 224, colorData);

    const indexData = new Uint32Array([this.activeViewProjectionIndex]);
    console.log(
      `[DirectionalLight]   activeViewProjectionIndex: ${indexData[0]}`,
    );
    this._device.queue.writeBuffer(this.shadowBuffer, 240, indexData);
  }

  public setActiveViewProjectionIndex(index: number): void {
    this.activeViewProjectionIndex = index;
    if (this.shadowBuffer && this._device) {
      const indexData = new Uint32Array([index]);
      this._device.queue.writeBuffer(this.shadowBuffer, 240, indexData);
    }
  }

  public getShadowBindGroup(): GPUBindGroup | null {
    return this.shadowBindGroup;
  }
}
