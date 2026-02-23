import { Light, LightType } from "./Light";
import { Vec3, Vec4, Mat4 } from "../math";

export const SHADOW_MAP_CASCADES_COUNT = 3;
export const SHADOW_CASCADE_SPLITS = [0.0, 0.33, 0.66, 1.0];
export const LIGHT_VIEW_OFFSET = 25.0;
export const MAX_LIGHT_DIRECTIONAL_COUNT = 2;

export class DirectionalLight extends Light {
  public direction: Vec3 = new Vec3(-0.5, -1, 0);

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
      this.viewMatrices.push(Mat4.create());
      this.projectionMatrices.push(Mat4.create());
      this.viewProjectionMatrices.push(Mat4.create());
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
    const viewProjectionMatrix = Mat4.create();
    Mat4.multiply(projectionMatrix, viewMatrix, viewProjectionMatrix);



    const viewProjectionInverse = Mat4.invert(viewProjectionMatrix);
    if (!viewProjectionInverse) {
      console.error(
        "[DirectionalLight] Failed to invert view-projection matrix",
      );
      return [];
    }



    const ndcCorners = [
      [-1, -1, 0],
      [1, -1, 0],
      [1, 1, 0],
      [-1, 1, 0],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ];

    const corners: Vec3[] = [];

    for (let i = 0; i < ndcCorners.length; i++) {
      const ndc = ndcCorners[i];
      
      // Transform NDC to world space using inverse VP matrix
      // world = VP_inverse * NDC (column-major matrix-vector multiply)
      const x = ndc[0];
      const y = ndc[1];
      const z = ndc[2];
      const w = 1.0;
      
      const inv = viewProjectionInverse.data;
      
      // Column-major matrix-vector multiply
      // out[0] = inv[0]*x + inv[4]*y + inv[8]*z + inv[12]*w
      // out[1] = inv[1]*x + inv[5]*y + inv[9]*z + inv[13]*w
      // out[2] = inv[2]*x + inv[6]*y + inv[10]*z + inv[14]*w
      // out[3] = inv[3]*x + inv[7]*y + inv[11]*z + inv[15]*w
      const transformedX = inv[0] * x + inv[4] * y + inv[8] * z + inv[12] * w;
      const transformedY = inv[1] * x + inv[5] * y + inv[9] * z + inv[13] * w;
      const transformedZ = inv[2] * x + inv[6] * y + inv[10] * z + inv[14] * w;
      const transformedW = inv[3] * x + inv[7] * y + inv[11] * z + inv[15] * w;
      
      // Perspective divide
      const worldX = transformedX / transformedW;
      const worldY = transformedY / transformedW;
      const worldZ = transformedZ / transformedW;
      
      if (i === 0 || i === 4 || i === 7) {
        console.log(`[computeFrustumCorners] NDC[${i}]=(${x},${y},${z}) -> world(${worldX.toFixed(2)}, ${worldY.toFixed(2)}, ${worldZ.toFixed(2)})`);
      }
      
      corners.push(new Vec3(worldX, worldY, worldZ));
    }

    return corners;
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
    return new Vec3(
      this.lerp(a.x, b.x, t),
      this.lerp(a.y, b.y, t),
      this.lerp(a.z, b.z, t),
    );
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
      console.warn(
        "[DirectionalLight] No shadow buffer, skipping cascade matrix update",
      );
      return;
    }

    this.direction = this.transform.getForward();

    // Compute camera frustum corners for cascade splits
    const frustumCorners = this.computeFrustumCorners(
      cameraViewMatrix,
      cameraProjectionMatrix,
    );
    if (frustumCorners.length === 0) {
      console.warn("[DirectionalLight] Failed to compute frustum corners");
      return;
    }



    this.updateCascadeSplits(cameraNear, cameraFar);
    this.updateViewProjectionMatrices(frustumCorners);
    
    console.log("[DirectionalLight] Final cascade matrices:");
    for (let i = 0; i < SHADOW_MAP_CASCADES_COUNT; i++) {
      const vp = this.viewProjectionMatrices[i];
      console.log(`  Cascade ${i} VP (row-major):`);
      for (let r = 0; r < 4; r++) {
        console.log(`    Row ${r}:`, Array.from(vp.data.slice(r*4, r*4+4)).map(v => v.toFixed(4)));
      }
    }
  }

  private updateCascadeSplits(cameraNear: number, cameraFar: number): void {
    for (let i = 0; i < SHADOW_MAP_CASCADES_COUNT + 1; i++) {
      const t = (SHADOW_CASCADE_SPLITS[i] - 0.0) / 1.0;
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

      console.log(`[DirectionalLight] Cascade ${cascadeIndex}: splitNear=${splitNear.toFixed(1)}, splitFar=${splitFar.toFixed(1)}`);
      
      this.updateCascadeMatrixFromCorners(cascadeIndex, splitCorners);
    }
  }

  private updateCascadeMatrixFromCorners(
    cascadeIndex: number,
    splitCorners: Vec3[],
  ): void {
    // Compute center of split frustum
    let centerX = 0, centerY = 0, centerZ = 0;
    for (const corner of splitCorners) {
      centerX += corner.x;
      centerY += corner.y;
      centerZ += corner.z;
    }
    centerX /= 8;
    centerY /= 8;
    centerZ /= 8;
    const centerPoint = new Vec3(centerX, centerY, centerZ);

    // Compute max radius from center
    let maxRadius = 0;
    for (const corner of splitCorners) {
      const dx = corner.x - centerX;
      const dy = corner.y - centerY;
      const dz = corner.z - centerZ;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > maxRadius) {
        maxRadius = dist;
      }
    }

    // Eye position: along light direction, distance = radius to see entire cascade
    const eye = new Vec3(
      centerX - this.direction.x * (maxRadius + LIGHT_VIEW_OFFSET),
      centerY - this.direction.y * (maxRadius + LIGHT_VIEW_OFFSET),
      centerZ - this.direction.z * (maxRadius + LIGHT_VIEW_OFFSET),
    );
    const target = centerPoint;
    const up = new Vec3(0, 1, 0);

    const viewMatrix = Mat4.lookAt(eye, target, up);

    // Extrude corners along the negative light direction to ensure all potential shadow casters are included.
    const extrudedCorners: Vec3[] = [];
    for (const corner of splitCorners) {
      extrudedCorners.push(new Vec3(
        corner.x - this.direction.x * LIGHT_VIEW_OFFSET,
        corner.y - this.direction.y * LIGHT_VIEW_OFFSET,
        corner.z - this.direction.z * LIGHT_VIEW_OFFSET
      ));
    }

    const allCorners = [...splitCorners, ...extrudedCorners];

    // Transform all corners into light space.
    const lightSpaceCorners: Vec3[] = [];
    for (const corner of allCorners) {
      const transformed = Mat4.transformVec3(viewMatrix, corner, new Vec3());
      lightSpaceCorners.push(transformed);
    }

    // Compute orthographic bounds in light space
    let minX = lightSpaceCorners[0].x, maxX = lightSpaceCorners[0].x;
    let minY = lightSpaceCorners[0].y, maxY = lightSpaceCorners[0].y;
    let minZ = lightSpaceCorners[0].z, maxZ = lightSpaceCorners[0].z;

    for (let i = 1; i < lightSpaceCorners.length; i++) {
      const c = lightSpaceCorners[i];
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
      if (c.z < minZ) minZ = c.z;
      if (c.z > maxZ) maxZ = c.z;
    }

    console.log(`[DirectionalLight] Cascade ${cascadeIndex}: ortho X[${minX.toFixed(1)}, ${maxX.toFixed(1)}], Y[${minY.toFixed(1)}, ${maxY.toFixed(1)}], Z[${minZ.toFixed(1)}, ${maxZ.toFixed(1)}]`);

    console.log(`[DirectionalLight] Cascade ${cascadeIndex}: eye=(${eye.x.toFixed(1)}, ${eye.y.toFixed(1)}, ${eye.z.toFixed(1)}), target=(${centerPoint.x.toFixed(1)}, ${centerPoint.y.toFixed(1)}, ${centerPoint.z.toFixed(1)})`);
    console.log(`[DirectionalLight] Cascade ${cascadeIndex}: direction=(${this.direction.x.toFixed(2)}, ${this.direction.y.toFixed(2)}, ${this.direction.z.toFixed(2)})`);

    const projectionMatrix = Mat4.ortho(minX, maxX, minY, maxY, minZ, maxZ);

    this.viewMatrices[cascadeIndex] = viewMatrix;
    this.projectionMatrices[cascadeIndex] = projectionMatrix;

    const viewProjection = Mat4.create();
    Mat4.multiply(projectionMatrix, viewMatrix, viewProjection);
    this.viewProjectionMatrices[cascadeIndex] = viewProjection;
  }

  public updateShadowUniforms(): void {
    if (!this.shadowBuffer || !this._device) {
      console.warn(
        "[DirectionalLight] No shadow buffer or device, skipping buffer update",
      );
      return;
    }

    const data = new Float32Array(64);

    for (
      let cascadeIndex = 0;
      cascadeIndex < SHADOW_MAP_CASCADES_COUNT;
      cascadeIndex++
    ) {
      const matrix = this.viewProjectionMatrices[cascadeIndex];
      for (let i = 0; i < 16; i++) {
        data[cascadeIndex * 16 + i] = matrix.data[i];
      }
    }

    this._device.queue.writeBuffer(this.shadowBuffer, 0, data);

    const splitsData = new Float32Array(4);
    for (let i = 0; i < 4; i++) {
      splitsData[i] = this.cascadeSplits[i];
    }
    this._device.queue.writeBuffer(this.shadowBuffer, 192, splitsData);

    const directionData = new Float32Array([
      this.direction.x,
      this.direction.y,
      this.direction.z,
      0.0,
    ]);
    this._device.queue.writeBuffer(this.shadowBuffer, 208, directionData);

    const colorData = new Float32Array([
      this.color.x,
      this.color.y,
      this.color.z,
      this.intensity,
    ]);
    this._device.queue.writeBuffer(this.shadowBuffer, 224, colorData);

    const indexData = new Uint32Array([this.activeViewProjectionIndex]);
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
